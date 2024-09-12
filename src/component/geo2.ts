import { v } from "convex/values";
import { mutation, query } from "./_generated/server.js";
import { point, primitive, recordValidator } from "./types.js";
import { latLngToCells } from "./lib/geometry.js";
import { encodeTupleKey } from "./lib/tupleKey.js";

const geoDocument = v.object({
  key: v.string(),
  coordinates: point,
  sortKey: v.number(),
  filterKeys: recordValidator(
    v.string(),
    v.union(primitive, v.array(primitive)),
  ),
});

export const insertDocument = mutation({
  args: {
    document: geoDocument,
    maxResolution: v.number(),
  },
  handler: async (ctx, args) => {
    await deleteDocument(ctx, {
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
      }
    }
  },
});

export const getDocument = query({
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

export const deleteDocument = mutation({
  args: {
    key: v.string(),
    maxResolution: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("points")
      .withIndex("key", (q) => q.eq("key", args.key))
      .first();
    if (!existing) {
      return null;
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
      }
    }
    await ctx.db.delete(existing._id);
  },
});
