import { Infer, v } from "convex/values";
import {
  internalAction,
  internalMutation,
  mutation,
  query,
} from "./_generated/server.js";
import { point, primitive } from "./types.js";
import {
  latLngToCells,
  validateLatitude,
  validateLongitude,
} from "./lib/geometry.js";
import { encodeTupleKey } from "./lib/tupleKey.js";
import { increment } from "./counter.js";
import { filterCounterKey } from "./streams/filterKeyRange.js";
import { h3CellCounterKey } from "./streams/h3CellRange.js";
import { internal } from "./_generated/api.js";

const geoDocument = v.object({
  key: v.string(),
  coordinates: point,
  sortKey: v.number(),
  filterKeys: v.record(v.string(), v.union(primitive, v.array(primitive))),
});

export const insert = mutation({
  args: {
    document: geoDocument,
    maxResolution: v.number(),
  },
  handler: async (ctx, args) => {
    validateLongitude(args.document.coordinates.longitude);
    validateLatitude(args.document.coordinates.latitude);

    await remove(ctx, {
      key: args.document.key,
      maxResolution: args.maxResolution,
    });
    const pointId = await ctx.db.insert("points", args.document as any);
    const cells = latLngToCells(args.maxResolution, args.document.coordinates);
    const tupleKey = encodeTupleKey(args.document.sortKey, pointId);
    for (const h3Cell of cells) {
      await ctx.db.insert("pointsbyH3Cell", {
        h3Cell,
        tupleKey,
      });
      await increment(ctx, h3CellCounterKey(h3Cell), 1);
    }
    for (const [filterKey, filterDoc] of Object.entries(
      args.document.filterKeys,
    )) {
      const valueArray = filterDoc instanceof Array ? filterDoc : [filterDoc];
      for (const filterValue of valueArray) {
        await ctx.db.insert("pointsByFilterKey", {
          filterKey,
          filterValue,
          tupleKey,
        });
        await increment(ctx, filterCounterKey(filterKey, filterValue), 1);
      }
    }
  },
});

export const get = query({
  args: {
    key: v.string(),
  },
  returns: v.union(geoDocument, v.null()),
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("points")
      .withIndex("key", (q) => q.eq("key", args.key))
      .first();
    if (!result) {
      return null;
    }
    const { _id, _creationTime, ...document } = result;
    return document;
  },
});

export const remove = mutation({
  args: {
    key: v.string(),
    maxResolution: v.number(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("points")
      .withIndex("key", (q) => q.eq("key", args.key))
      .first();
    if (!existing) {
      return false;
    }
    const cells = latLngToCells(args.maxResolution, existing.coordinates);
    const tupleKey = encodeTupleKey(existing.sortKey, existing._id);
    for (const h3Cell of cells) {
      const existingH3Cell = await ctx.db
        .query("pointsbyH3Cell")
        .withIndex("h3Cell", (q) =>
          q.eq("h3Cell", h3Cell).eq("tupleKey", tupleKey),
        )
        .unique();
      if (!existingH3Cell) {
        throw new Error(
          `Invariant failed: Missing h3Cell ${h3Cell} for point ${existing._id}`,
        );
      }
      await ctx.db.delete(existingH3Cell._id);
      await increment(ctx, h3CellCounterKey(h3Cell), -1);
    }
    for (const [filterKey, filterDoc] of Object.entries(existing.filterKeys)) {
      const valueArray = filterDoc instanceof Array ? filterDoc : [filterDoc];
      for (const filterValue of valueArray) {
        const existingFilterKey = await ctx.db
          .query("pointsByFilterKey")
          .withIndex("filterKey", (q) =>
            q
              .eq("filterKey", filterKey)
              .eq("filterValue", filterValue)
              .eq("tupleKey", tupleKey),
          )
          .unique();
        if (!existingFilterKey) {
          throw new Error(
            `Invariant failed: Missing filterKey ${filterKey}:${filterValue} for point ${existing._id}`,
          );
        }
        await ctx.db.delete(existingFilterKey._id);
        await increment(ctx, filterCounterKey(filterKey, filterValue), -1);
      }
    }
    await ctx.db.delete(existing._id);
    return true;
  },
});

const cursor = v.object({
  table: v.union(v.literal("h3"), v.literal("filter")),
  lowerBound: v.optional(v.string()),
});

export const backfillCounts = internalAction({
  args: {
    cursor: v.union(v.null(), cursor),
    maxRows: v.number(),
    maxPages: v.number(),
  },
  handler: async (ctx, args) => {
    let currentCursor: Infer<typeof cursor> | null = args.cursor ?? {
      table: "h3",
    };
    let i = 0;
    while (currentCursor) {
      currentCursor = await ctx.runMutation(internal.document.backfillPage, {
        cursor: currentCursor,
        maxRows: args.maxRows,
      });
      i += 1;
      if (i >= args.maxPages) {
        await ctx.scheduler.runAfter(0, internal.document.backfillCounts, {
          cursor: currentCursor,
          maxRows: args.maxRows,
          maxPages: args.maxPages,
        });
        return;
      }
      console.log(`Page ${i} @ ${JSON.stringify(currentCursor)}`);
    }
  },
});

export const backfillPage = internalMutation({
  args: {
    cursor,
    maxRows: v.number(),
  },
  returns: v.union(v.null(), cursor),
  handler: async (ctx, args) => {
    if (args.cursor.table === "h3") {
      const points = await ctx.db
        .query("pointsbyH3Cell")
        .withIndex("by_id", (q) =>
          args.cursor.lowerBound
            ? q.gt("_id", args.cursor.lowerBound as any)
            : q,
        )
        .take(args.maxRows);
      if (points.length === 0) {
        return {
          table: "filter" as const,
        };
      }
      for (const h3Key of points) {
        await increment(ctx, h3CellCounterKey(h3Key.h3Cell), 1);
      }
      return {
        table: "h3" as const,
        lowerBound: points[points.length - 1]._id,
      };
    } else if (args.cursor.table === "filter") {
      const points = await ctx.db
        .query("pointsByFilterKey")
        .withIndex("by_id", (q) =>
          args.cursor.lowerBound
            ? q.gt("_id", args.cursor.lowerBound as any)
            : q,
        )
        .take(args.maxRows);
      if (points.length === 0) {
        return null;
      }
      for (const filterKey of points) {
        await increment(
          ctx,
          filterCounterKey(filterKey.filterKey, filterKey.filterValue),
          1,
        );
      }
      return {
        table: "filter" as const,
        lowerBound: points[points.length - 1]._id,
      };
    } else {
      throw new Error("Invariant failed: Unknown table " + args.cursor.table);
    }
  },
});
