import { v } from "convex/values";
import { mutation, query } from "./_generated/server.js";
import { api } from "./_generated/api.js";
import { point, pointToArray } from "./types.js";
import { latLngToCells, polygonContains } from "./lib/geometry.js";
import {
  getHexagonEdgeLengthAvg,
  greatCircleDistance,
  gridDisk,
  polygonToCells,
  UNITS,
} from "h3-js";
import { shuffle } from "d3-array";

export const insert = mutation({
  args: {
    key: v.string(),
    coordinates: point,
    maxResolution: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.runQuery(api.index.get, { key: args.key });
    if (existing !== null) {
      await ctx.runMutation(api.index.remove, {
        key: args.key,
        maxResolution: args.maxResolution,
      });
    }
    const locationId = await ctx.db.insert("locations", {
      key: args.key,
      coordinates: args.coordinates,
    });
    const cells = latLngToCells(args.maxResolution, args.coordinates);
    for (const h3Cell of cells) {
      await ctx.db.insert("locationIndex", {
        h3Cell,
        locationId,
      });
    }
  },
});

export const get = query({
  args: {
    key: v.string(),
  },
  returns: v.union(point, v.null()),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("locations")
      .withIndex("key", (q) => q.eq("key", args.key))
      .first();
    return row && row.coordinates;
  },
});

export const remove = mutation({
  args: {
    key: v.string(),
    maxResolution: v.number(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("locations")
      .withIndex("key", (q) => q.eq("key", args.key))
      .first();
    if (!row) {
      return false;
    }

    const resolution = args.maxResolution;
    for (const cell of latLngToCells(resolution, row.coordinates)) {
      const indexRow = await ctx.db
        .query("locationIndex")
        .withIndex("h3Cell", (q) =>
          q.eq("h3Cell", cell).eq("locationId", row._id),
        )
        .first();
      if (!indexRow) {
        throw new Error(`Index row for ${args.key}:${cell} not found`);
      }
      await ctx.db.delete(indexRow._id);
    }

    await ctx.db.delete(row._id);
    return true;
  },
});

export const queryRectangle = query({
  args: {
    rectangle: v.object({
      sw: point,
      nw: point,
      ne: point,
      se: point,
    }),
    maxRows: v.number(),
    maxResolution: v.number(),
  },
  returns: v.object({
    results: v.array(
      v.object({
        key: v.string(),
        coordinates: point,
      }),
    ),
    h3Cells: v.array(v.string()),
  }),
  handler: async (ctx, args) => {
    console.time("queryRectangle");

    // Pick a resolution that's about 25% of the average of the rectangle's width and height.
    // We don't have to be precise here, but going too large will increase the number of cells
    // we query, while going too small will cause us to overfetch and post-filter more.
    const rectangleHeight = greatCircleDistance(
      pointToArray(args.rectangle.sw),
      pointToArray(args.rectangle.nw),
      UNITS.m,
    );
    const rectangleWidth = greatCircleDistance(
      pointToArray(args.rectangle.sw),
      pointToArray(args.rectangle.se),
      UNITS.m,
    );
    const averageDimension = (rectangleHeight + rectangleWidth) / 2;
    let resolution = args.maxResolution;
    for (; resolution >= 0; resolution--) {
      const hexWidth = getHexagonEdgeLengthAvg(resolution, UNITS.m);
      if (hexWidth / averageDimension > 0.25) {
        break;
      }
    }

    const h3Polygon = [
      pointToArray(args.rectangle.sw),
      pointToArray(args.rectangle.nw),
      pointToArray(args.rectangle.ne),
      pointToArray(args.rectangle.se),
    ];
    let h3InteriorCells = polygonToCells(h3Polygon, resolution);
    while (!h3InteriorCells.length) {
      if (resolution > args.maxResolution) {
        console.warn(
          `Failed to find interior cells for empty rectangle: ${JSON.stringify(args.rectangle)}`,
        );
        return { results: [], h3Cells: [] };
      }
      resolution++;
      h3InteriorCells = polygonToCells(h3Polygon, resolution);
    }

    const h3CellSet = new Set<string>();
    for (const cell of h3InteriorCells) {
      h3CellSet.add(cell);

      // `polygonToCells` only returns the set of cells whose centroids are within
      // the polygon. We also want to include cells that are adjacent to the polygon.
      // TODO: Prove that adding adjacent neighbors is sufficient.
      for (const neighbor of gridDisk(cell, 1)) {
        h3CellSet.add(neighbor);
      }
    }
    let h3Cells = [...h3CellSet];
    console.log(
      `Searching ${h3Cells.length} cells at resolution ${resolution}`,
    );

    // Query all of the index entries for each cell.
    const loadIndex = async (h3Cell: string) => {
      const indexRows = await ctx.db
        .query("locationIndex")
        .withIndex("h3Cell", (q) => q.eq("h3Cell", h3Cell))
        .collect();
      return indexRows.map((indexRow) => indexRow.locationId);
    };
    const loadIndexPromises = Array.from(h3Cells).map(loadIndex);
    const indexResults = await Promise.all(loadIndexPromises);
    const locationIdSet = new Set(indexResults.flat());
    console.log(`Found ${locationIdSet.size} locations`);

    let locationIds = Array.from(locationIdSet);
    const maxLocationIds = 2 * args.maxRows;
    if (locationIds.length > maxLocationIds) {
      console.warn(
        `Too many locations ${locationIds.length} reducing to ${maxLocationIds}`,
      );
      shuffle(locationIds);
      locationIds = locationIds.slice(0, args.maxRows * 2);
    }

    // Load the rows for each location after deduplicating by ID.
    const locationRowPromises = locationIds.map((locationId) =>
      ctx.db.get(locationId),
    );
    const locationRows = await Promise.all(locationRowPromises);

    // Post filter to remove locations that are not in the rectangle.
    let results = locationRows
      .filter((row) => {
        if (!row) {
          throw new Error("Location not found");
        }
        const rectangle = [
          args.rectangle.sw,
          args.rectangle.se,
          args.rectangle.ne,
          args.rectangle.nw,
        ];
        return polygonContains(row.coordinates, rectangle);
      })
      .map((row) => ({ key: row!.key, coordinates: row!.coordinates }));
    console.log(`Filtered to ${results.length} locations`);
    if (results.length > args.maxRows) {
      console.warn(
        `Too many results ${results.length} reducing to ${args.maxRows}`,
      );
      shuffle(results);
      results = results.slice(0, args.maxRows);
    }

    console.timeEnd("queryRectangle");

    return { results, h3Cells };
  },
});
