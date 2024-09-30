import { v } from "convex/values";
import { query } from "./_generated/server";
import { Point, point } from "../../src/client";
import { geospatial } from ".";
import { Id } from "./_generated/dataModel";
import { rectangle } from "../../src/component/types";
import { S2Bindings } from "./s2Bindings";

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
    const mustFilterConditions = args.mustFilter.map((emoji) => ({
      filterKey: "name" as const,
      filterValue: emoji,
      occur: "must" as const,
    }));
    const shouldFilterConditions = args.shouldFilter.map((emoji) => ({
      filterKey: "name" as const,
      filterValue: emoji,
      occur: "should" as const,
    }));
    const { results, nextCursor } = await geospatial.queryRectangle(
      ctx,
      args.rectangle,
      [...mustFilterConditions, ...shouldFilterConditions],
      {},
      args.cursor,
      args.maxRows,
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



export const h3Cells = query({
  args: {
    rectangle,
    maxResolution: v.number(),
  },  
  handler: async (ctx, args) => {    
    // const s2 = await S2Bindings.load();
    // const cellIDs = s2.coverRectangle(args.rectangle.south, args.rectangle.west, args.rectangle.north, args.rectangle.east, args.maxResolution);
    // console.log(cellIDs, cellIDs.map((s) => s2.cellIDToken(s)));        
    return await geospatial.debugH3Cells(
      ctx,
      args.rectangle,
      args.maxResolution,
    );
  },
});
