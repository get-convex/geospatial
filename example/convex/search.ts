import { v } from "convex/values";
import { components, query } from "./_generated/server";
import { Point, point } from "../../src/client";
import { geospatial } from ".";
import { Id } from "./_generated/dataModel";

export default query({
  args: {
    rectangle: v.object({
      sw: point,
      nw: point,
      ne: point,
      se: point,
    }),
    maxRows: v.number(),
  },
  async handler(ctx, args) {
    const results = await ctx.runQuery(components.geospatial.geo2query.queryDocuments, {
      query: {
        rectangle: args.rectangle,
        filtering: [],
        sorting: {
          interval: {
            startInclusive: Number.MIN_VALUE,
            endExclusive: Number.MAX_VALUE,
          }
        },
        maxResults: args.maxRows,
      },
      maxResolution: 14,      
    });
    const h3Cells = await ctx.runQuery(components.geospatial.geo2query.debugH3Cells, {
      rectangle: args.rectangle,
      maxResolution: 14,
    });
    const coordinatesByKey = new Map<string, Point>();
    const rowFetches = [];
    for (const result of results) {
      rowFetches.push(ctx.db.get(result.key as Id<"locations">));
      coordinatesByKey.set(result.key, result.coordinates);
    }    
    for (const result of results) {
      coordinatesByKey.set(result.key, result.coordinates);
    }
    // const { results, h3Cells } = await geospatial.queryRectangle(
    //   ctx,
    //   args.rectangle,
    //   args.maxRows,
    // );
    // const coordinatesByKey = new Map<string, Point>();
    // const rowFetches = [];
    // for (const result of results) {
    //   rowFetches.push(ctx.db.get(result.key));
    //   coordinatesByKey.set(result.key, result.coordinates);
    // }
    const rows = [];
    for (const row of await Promise.all(rowFetches)) {
      if (!row) {
        throw new Error("Invalid locationId");
      }
      const coordinates = coordinatesByKey.get(row._id)!;
      rows.push({ coordinates, ...row });
    }
    return {
      h3Cells,
      rows,
    };
  },
});
