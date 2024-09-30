import { v } from "convex/values";
import { query } from "./_generated/server";
import { Point, point } from "../../src/client";
import { geospatial } from ".";
import { Id } from "./_generated/dataModel";
import { rectangle } from "../../src/component/types";

export const execute = query({
  args: {
    rectangle,
    mustFilter: v.array(v.string()),
    shouldFilter: v.array(v.string()),
    cursor: v.optional(v.string()),
    maxRows: v.number(),
  },
  returns: v.object({
    rows: v.array(
      v.object({
        _id: v.id("locations"),
        _creationTime: v.number(),
        name: v.string(),
        coordinates: point,
      }),
    ),
    nextCursor: v.optional(v.string()),
  }),
  async handler(ctx, args) {
    const { results, nextCursor } = await geospatial.query(
      ctx,
      {
        shape: {
          type: "rectangle",
          rectangle: args.rectangle,
        },
        filter: (q) => {
          for (const condition of args.mustFilter) {
            q = q.eq("name", condition);
          }
          if (!args.shouldFilter.length) {
            return q;
          }
          return q.in("name", args.shouldFilter);
        },
        limit: args.maxRows,
      },
      args.cursor,
    );
    const coordinatesByKey = new Map<string, Point>();
    const rowFetches = [];
    for (const result of results) {
      rowFetches.push(ctx.db.get(result.key as Id<"locations">));
      coordinatesByKey.set(result.key, result.coordinates);
    }
    for (const result of results) {
      coordinatesByKey.set(result.key, result.coordinates);
    }
    const rows = [];
    for (const row of await Promise.all(rowFetches)) {
      if (!row) {
        throw new Error("Invalid locationId");
      }
      const coordinates = coordinatesByKey.get(row._id)!;
      rows.push({ coordinates, ...row });
    }
    return {
      rows,
      nextCursor,
    };
  },
});

export const debugCells = query({
  args: {
    rectangle,
    maxResolution: v.number(),
  },
  handler: async (ctx, args) => {
    return await geospatial.debugCells(ctx, args.rectangle, args.maxResolution);
  },
});
