import { v } from "convex/values";
import { query } from "./_generated/server";
import { Point, point } from "../../src/client";
import { geospatial } from ".";

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
    const { results, h3Cells } = await geospatial.queryRectangle(
      ctx,
      args.rectangle,
      args.maxRows,
    );
    const coordinatesByKey = new Map<string, Point>();
    const rowFetches = [];
    for (const result of results) {
      rowFetches.push(ctx.db.get(result.key));
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
