import { mutation, query } from "./_generated/server.js";
import { v } from "convex/values";
import { S2Bindings } from "./lib/s2Bindings.js";
import { polygon, polyline } from "./types.js";
import { primitive } from "./lib/primitive.js";
import type { Point, Polygon } from "./types.js";

const MAX_COVERING_CELLS = 30;

function validateCoordinates(
  type: "polygon" | "polyline",
  coordinates: unknown,
): Point[] {
  if (type === "polygon") {
    const poly = coordinates as Polygon & {
      holes?: unknown;
      interiors?: unknown;
      interior?: unknown;
    };
    if (!poly?.exterior || !Array.isArray(poly.exterior)) {
      throw new Error("Invalid polygon: missing 'exterior' array");
    }
    if (poly.exterior.length < 3) {
      throw new Error("Polygon must have at least 3 exterior points");
    }
    // Reject polygons with holes until holes are supported
    if (
      (poly.holes && Array.isArray(poly.holes) && poly.holes.length > 0) ||
      (poly.interiors &&
        Array.isArray(poly.interiors) &&
        poly.interiors.length > 0) ||
      (poly.interior &&
        Array.isArray(poly.interior) &&
        poly.interior.length > 0)
    ) {
      throw new Error("Polygon holes are not supported");
    }
    return poly.exterior;
  } else {
    const line = coordinates as Point[];
    if (!Array.isArray(line)) {
      throw new Error("Invalid polyline: coordinates must be an array");
    }
    if (line.length < 2) {
      throw new Error("Polyline must have at least 2 points");
    }
    return line;
  }
}

function validatePointBounds(points: Point[]): void {
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (p.latitude < -90 || p.latitude > 90) {
      throw new Error(
        `Invalid latitude ${p.latitude} at point ${i}: must be between -90 and 90`,
      );
    }
    if (p.longitude < -180 || p.longitude > 180) {
      throw new Error(
        `Invalid longitude ${p.longitude} at point ${i}: must be between -180 and 180`,
      );
    }
  }
}

function computeBoundingBox(points: Point[]): {
  south: number;
  north: number;
  west: number;
  east: number;
} {
  if (points.length === 0) {
    throw new Error("Cannot compute bounding box for empty points array");
  }
  let south = Infinity,
    north = -Infinity;
  let west = Infinity,
    east = -Infinity;

  for (const p of points) {
    south = Math.min(south, p.latitude);
    north = Math.max(north, p.latitude);
    west = Math.min(west, p.longitude);
    east = Math.max(east, p.longitude);
  }

  return { south, north, west, east };
}

/**
 * Insert a polygon or polyline into the spatial index.
 */
export const insert = mutation({
  args: {
    key: v.string(),
    type: v.union(v.literal("polygon"), v.literal("polyline")),
    coordinates: v.union(polygon, polyline),
    filterKeys: v.optional(v.record(v.string(), primitive)),
    sortKey: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const s2 = await S2Bindings.load();

    const existing = await ctx.db
      .query("geometries")
      .withIndex("byKey", (q) => q.eq("key", args.key))
      .first();
    if (existing) {
      throw new Error(`Geometry with key "${args.key}" already exists`);
    }

    const points = validateCoordinates(args.type, args.coordinates);
    validatePointBounds(points);
    const bbox = computeBoundingBox(points);

    const coveringCells =
      args.type === "polygon"
        ? s2.coverPolygonForIndex(points, MAX_COVERING_CELLS)
        : s2.coverPolylineForIndex(points, MAX_COVERING_CELLS);

    const geometryId = await ctx.db.insert("geometries", {
      key: args.key,
      type: args.type,
      coordinates: args.coordinates,
      ...bbox,
      sortKey: args.sortKey ?? 0,
      filterKeys: args.filterKeys,
    });

    for (const cellId of coveringCells) {
      const token = s2.cellIDToken(cellId);
      const level = s2.cellIDLevel(cellId);
      await ctx.db.insert("geometryCells", {
        geometryId,
        geometryKey: args.key,
        cellToken: token,
        level,
      });
    }
  },
});

/**
 * Remove a geometry from the spatial index.
 */
export const remove = mutation({
  args: { key: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const geometry = await ctx.db
      .query("geometries")
      .withIndex("byKey", (q) => q.eq("key", args.key))
      .first();
    if (!geometry) {
      throw new Error(`Geometry with key "${args.key}" not found`);
    }
    await ctx.db.delete(geometry._id);

    const cells = await ctx.db
      .query("geometryCells")
      .withIndex("byGeometryKey", (q) => q.eq("geometryKey", args.key))
      .collect();
    for (const cell of cells) {
      await ctx.db.delete(cell._id);
    }
  },
});

/**
 * Update a geometry's coordinates or metadata.
 */
export const update = mutation({
  args: {
    key: v.string(),
    coordinates: v.optional(v.union(polygon, polyline)),
    filterKeys: v.optional(v.record(v.string(), primitive)),
    sortKey: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const s2 = await S2Bindings.load();

    const existing = await ctx.db
      .query("geometries")
      .withIndex("byKey", (q) => q.eq("key", args.key))
      .first();
    if (!existing) {
      throw new Error(`Geometry with key "${args.key}" not found`);
    }

    if (args.coordinates !== undefined) {
      const oldCells = await ctx.db
        .query("geometryCells")
        .withIndex("byGeometryKey", (q) => q.eq("geometryKey", args.key))
        .collect();
      for (const cell of oldCells) {
        await ctx.db.delete(cell._id);
      }

      const points = validateCoordinates(existing.type, args.coordinates);
      validatePointBounds(points);
      const bbox = computeBoundingBox(points);

      const coveringCells =
        existing.type === "polygon"
          ? s2.coverPolygonForIndex(points, MAX_COVERING_CELLS)
          : s2.coverPolylineForIndex(points, MAX_COVERING_CELLS);

      for (const cellId of coveringCells) {
        const token = s2.cellIDToken(cellId);
        const level = s2.cellIDLevel(cellId);
        await ctx.db.insert("geometryCells", {
          geometryId: existing._id,
          geometryKey: args.key,
          cellToken: token,
          level,
        });
      }

      await ctx.db.patch(existing._id, {
        coordinates: args.coordinates,
        ...bbox,
        ...(args.filterKeys !== undefined && { filterKeys: args.filterKeys }),
        ...(args.sortKey !== undefined && { sortKey: args.sortKey }),
      });
    } else {
      await ctx.db.patch(existing._id, {
        ...(args.filterKeys !== undefined && { filterKeys: args.filterKeys }),
        ...(args.sortKey !== undefined && { sortKey: args.sortKey }),
      });
    }
  },
});

/**
 * Get a geometry by key.
 */
export const get = query({
  args: { key: v.string() },
  returns: v.union(
    v.object({
      key: v.string(),
      type: v.union(v.literal("polygon"), v.literal("polyline")),
      coordinates: v.union(polygon, polyline),
      boundingBox: v.object({
        south: v.number(),
        north: v.number(),
        west: v.number(),
        east: v.number(),
      }),
      sortKey: v.number(),
      filterKeys: v.optional(v.record(v.string(), primitive)),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const geometry = await ctx.db
      .query("geometries")
      .withIndex("byKey", (q) => q.eq("key", args.key))
      .first();

    if (!geometry) {
      return null;
    }

    return {
      key: geometry.key,
      type: geometry.type,
      coordinates: geometry.coordinates,
      boundingBox: {
        south: geometry.south,
        north: geometry.north,
        west: geometry.west,
        east: geometry.east,
      },
      sortKey: geometry.sortKey,
      filterKeys: geometry.filterKeys,
    };
  },
});
