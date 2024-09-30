import { Infer, v } from "convex/values";
import {
  internalAction,
  internalMutation,
  mutation,
  query,
} from "./_generated/server.js";
import { Point, point, primitive } from "./types.js";
import { encodeTupleKey } from "./lib/tupleKey.js";
import { increment } from "./counter.js";
import { filterCounterKey } from "./streams/filterKeyRange.js";
import { cellCounterKey } from "./streams/cellRange.js";
import { internal } from "./_generated/api.js";
import { S2Bindings } from "./lib/s2Bindings.js";

const geoDocument = v.object({
  key: v.string(),
  coordinates: point,
  sortKey: v.number(),
  filterKeys: v.record(v.string(), v.union(primitive, v.array(primitive))),
});

function s2Cells(
  s2: S2Bindings,
  point: Point,
  opts: {
    minLevel: number;
    maxLevel: number;
    maxCells: number;
  },
): string[] {
  const leafCellID = s2.cellIDFromPoint(point);
  const cells = [];
  for (let i = opts.minLevel; i <= opts.maxLevel; i++) {
    const parentCellID = s2.cellIDParent(leafCellID, i);
    cells.push(s2.cellIDToken(parentCellID));
  }
  return cells;
}

export const insert = mutation({
  args: {
    document: geoDocument,

    minLevel: v.number(),
    maxLevel: v.number(),
    maxCells: v.number(),
  },
  handler: async (ctx, args) => {
    const s2 = await S2Bindings.load();

    await remove(ctx, {
      key: args.document.key,
      minLevel: args.minLevel,
      maxLevel: args.maxLevel,
      maxCells: args.maxCells,
    });
    const pointId = await ctx.db.insert("points", args.document as any);

    const cells = s2Cells(s2, args.document.coordinates, args);
    const tupleKey = encodeTupleKey(args.document.sortKey, pointId);
    for (const cell of cells) {
      await ctx.db.insert("pointsByCell", { cell, tupleKey });
      await increment(ctx, cellCounterKey(cell), 1);
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
    minLevel: v.number(),
    maxLevel: v.number(),
    maxCells: v.number(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const s2 = await S2Bindings.load();

    const existing = await ctx.db
      .query("points")
      .withIndex("key", (q) => q.eq("key", args.key))
      .first();
    if (!existing) {
      return false;
    }

    const cells = s2Cells(s2, existing.coordinates, args);
    const tupleKey = encodeTupleKey(existing.sortKey, existing._id);
    for (const cell of cells) {
      const existingCell = await ctx.db
        .query("pointsByCell")
        .withIndex("cell", (q) => q.eq("cell", cell).eq("tupleKey", tupleKey))
        .unique();
      if (!existingCell) {
        throw new Error(
          `Invariant failed: Missing cell ${cell} for point ${existing._id}`,
        );
      }
      await ctx.db.delete(existingCell._id);
      await increment(ctx, cellCounterKey(cell), -1);
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
