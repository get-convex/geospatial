import { v } from "convex/values";
import { query } from "./_generated/server";
import { Point, point } from "../../src/client";
import { geospatial } from ".";

export default query({
  args: {
    rectangle: v.array(point),
    maxRows: v.number(),
  },
  async handler(ctx, args) {
    if (args.rectangle.length !== 4) {
      throw new Error("Invalid rectangle");
    }
    const { results, h3Cells } = await geospatial.queryRectangle(
      ctx,
      [args.rectangle[0], args.rectangle[1], args.rectangle[2], args.rectangle[3]],
      args.maxRows
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
