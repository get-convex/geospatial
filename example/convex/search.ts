import { v } from "convex/values";
import { query } from "./_generated/server";
import { Point, point } from "../../src/client";
import { geospatial } from ".";
import { Id } from "./_generated/dataModel";
import { rectangle } from "../../src/component/types";

export default query({
  args: {
    rectangle,
    mustFilter: v.array(v.string()),
    shouldFilter: v.array(v.string()),
    maxRows: v.number(),
  },
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
    const results = await geospatial.queryRectangle(
      ctx,
      args.rectangle,
      [...mustFilterConditions, ...shouldFilterConditions],
      {},
      args.maxRows,
    );

    const h3Cells = await geospatial.debugH3Cells(
      ctx,
      args.rectangle,
      geospatial.maxResolution,
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
      h3Cells,
      rows,
    };
  },
});
