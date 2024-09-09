import { v } from "convex/values";
import { mutation, query } from "./_generated/server.js";
import { api } from "./_generated/api.js";
import { point } from "./types.js";
import { latLngToCells, polygonContains } from "./geometry.js";
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
          q.eq("h3Cell", cell).eq("locationId", row._id)
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
    rectangle: v.array(point),
    maxRows: v.number(),
    maxResolution: v.number(),
  },
  returns: v.object({
    results: v.array(
      v.object({
        key: v.string(),
        coordinates: point,
      })
    ),
    h3Cells: v.array(v.string()),
  }),
  handler: async (ctx, args) => {
    console.time("queryRectangle");

    // Find the most granular resolution such that the average hexagon
    // width at the resolution is at least 25% of the query rectangle width.
    const polygonWidth = greatCircleDistance(
      [args.rectangle[0].latitude, args.rectangle[0].longitude],
      [args.rectangle[1].latitude, args.rectangle[1].longitude],
      UNITS.m
    );
    let resolution = args.maxResolution;
    for (; resolution >= 0; resolution--) {
      const hexWidth = getHexagonEdgeLengthAvg(resolution, UNITS.m);
      if (hexWidth / polygonWidth > 0.25) {
        break;
      }
    }

    const h3CellSet = new Set<string>();
    const h3Polygon = args.rectangle.map((p) => [p.latitude, p.longitude]);
    for (const cell of polygonToCells(h3Polygon, resolution)) {
      h3CellSet.add(cell);

      // Include all of the cell's neighbors.
      for (const neighbor of gridDisk(cell, 1)) {
        h3CellSet.add(neighbor);
      }
    }
    let h3Cells = [...h3CellSet];
    if (h3Cells.length > 32) {
      console.warn("Too many cells", h3Cells.length, "reducing to 32");
      shuffle(h3Cells);
      h3Cells = h3Cells.slice(0, 32);
    }

    console.log(
      `Searching ${h3Cells.length} cells at resolution ${resolution}`
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
        `Too many locations ${locationIds.length} reducing to ${maxLocationIds}`
      );
      shuffle(locationIds);
      locationIds = locationIds.slice(0, args.maxRows * 2);
    }

    // Load the rows for each location after deduplicating by ID.
    const locationRowPromises = locationIds.map((locationId) =>
      ctx.db.get(locationId)
    );
    const locationRows = await Promise.all(locationRowPromises);

    // Post filter to remove locations that are not in the rectangle.
    let results = locationRows
      .filter((row) => {
        if (!row) {
          throw new Error("Location not found");
        }
        return polygonContains(row.coordinates, args.rectangle);
      })
      .map((row) => ({ key: row!.key, coordinates: row!.coordinates }));
    console.log(`Filtered to ${results.length} locations`);
    if (results.length > args.maxRows) {
      console.warn(
        `Too many results ${results.length} reducing to ${args.maxRows}`
      );
      shuffle(results);
      results = results.slice(0, args.maxRows);
    }

    console.timeEnd("queryRectangle");

    return { results, h3Cells };
  },
});