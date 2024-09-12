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
    mustFilter: v.array(v.string()),
    shouldFilter: v.array(v.string()),
    maxRows: v.number(),
  },
  async handler(ctx, args) {
    const mustFilterConditions = args.mustFilter.map((emoji) => ({
      filterKey: "name",
      filterValue: emoji,
      occur: "must" as const,
    }));
    const shouldFilterConditions = args.shouldFilter.map((emoji) => ({
      filterKey: "name",
      filterValue: emoji,
      occur: "should" as const,
    }));
    const results = await ctx.runQuery(
      components.geospatial.geo2query.queryDocuments,
      {
        query: {
          rectangle: args.rectangle,
          filtering: [...mustFilterConditions, ...shouldFilterConditions],
          sorting: {
            interval: {},
          },
          maxResults: args.maxRows,
        },
        maxResolution: 9,
      },
    );
    const h3Cells = await ctx.runQuery(
      components.geospatial.geo2query.debugH3Cells,
      {
        rectangle: args.rectangle,
        maxResolution: 9,
      },
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
