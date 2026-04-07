import { query } from "./_generated/server.js";
import { v } from "convex/values";
import { S2Bindings } from "./lib/s2Bindings.js";
import { polygon, polyline, primitive, rectangle } from "./types.js";
import type { Point, Polygon, Rectangle, Primitive } from "./types.js";
import type { Id } from "./_generated/dataModel.js";

/**
 * List all stored geometries.
 */
export const list = query({
  args: {
    limit: v.optional(v.number()),
  },
  returns: v.array(
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
      filterKeys: v.optional(v.record(v.string(), primitive)),
    }),
  ),
  handler: async (ctx, args) => {
    const { limit = 100 } = args;
    const geometries = await ctx.db.query("geometries").take(limit);

    return geometries.map((g) => ({
      key: g.key,
      type: g.type,
      coordinates: g.coordinates,
      boundingBox: {
        south: g.south,
        north: g.north,
        west: g.west,
        east: g.east,
      },
      filterKeys: g.filterKeys,
    }));
  },
});

const MAX_CANDIDATES = 1000;
const METERS_PER_DEGREE_LAT = 111_000;

function boundingBoxesIntersect(
  a: { south: number; north: number; west: number; east: number },
  b: { south: number; north: number; west: number; east: number },
): boolean {
  return !(
    a.east < b.west ||
    b.east < a.west ||
    a.north < b.south ||
    b.north < a.south
  );
}

function boundingBoxContainsPoint(
  bbox: { south: number; north: number; west: number; east: number },
  point: Point,
): boolean {
  return (
    point.latitude >= bbox.south &&
    point.latitude <= bbox.north &&
    point.longitude >= bbox.west &&
    point.longitude <= bbox.east
  );
}

function rectangleToPolygonPoints(rect: Rectangle): Point[] {
  return [
    { latitude: rect.south, longitude: rect.west },
    { latitude: rect.south, longitude: rect.east },
    { latitude: rect.north, longitude: rect.east },
    { latitude: rect.north, longitude: rect.west },
  ];
}

function matchesFilterKeys(
  geometry: { filterKeys?: Record<string, Primitive> },
  filterKeys?: Record<string, Primitive>,
): boolean {
  if (!filterKeys) return true;
  if (!geometry.filterKeys) return false;

  return Object.entries(filterKeys).every(([key, expected]) => {
    const actual = geometry.filterKeys?.[key];
    if (Array.isArray(expected)) {
      return (
        Array.isArray(actual) &&
        expected.length === actual.length &&
        expected.every((v, i) => actual[i] === v)
      );
    }
    return actual === expected;
  });
}

/**
 * Find all polygons that contain a given point.
 */
export const containsPoint = query({
  args: {
    point: v.object({
      latitude: v.number(),
      longitude: v.number(),
    }),
    filterKeys: v.optional(v.record(v.string(), primitive)),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    results: v.array(
      v.object({
        key: v.string(),
        type: v.literal("polygon"),
        coordinates: polygon,
        boundingBox: v.object({
          south: v.number(),
          north: v.number(),
          west: v.number(),
          east: v.number(),
        }),
      }),
    ),
    truncated: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const s2 = await S2Bindings.load();
    const { point: queryPoint, filterKeys, limit = 100 } = args;

    const pointCells = s2.pointCellsAllLevels(queryPoint);
    const pointTokens = pointCells.map((cellId) => s2.cellIDToken(cellId));

    const candidateIds = new Map<Id<"geometries">, string>();
    let truncated = false;

    for (const token of pointTokens) {
      if (candidateIds.size >= MAX_CANDIDATES) {
        truncated = true;
        break;
      }

      const matches = await ctx.db
        .query("geometryCells")
        .withIndex("byCellToken", (q) => q.eq("cellToken", token))
        .take(MAX_CANDIDATES - candidateIds.size);

      for (const match of matches) {
        candidateIds.set(match.geometryId as Id<"geometries">, match.geometryKey);
      }

      if (candidateIds.size >= MAX_CANDIDATES) {
        truncated = true;
        break;
      }
    }

    const results: Array<{
      key: string;
      type: "polygon";
      coordinates: Polygon;
      boundingBox: Rectangle;
    }> = [];

    for (const [geometryId] of candidateIds) {
      if (results.length >= limit) break;

      const geometry = await ctx.db.get(geometryId);
      if (!geometry) continue;
      if (geometry.type !== "polygon") continue;
      if (!matchesFilterKeys(geometry, filterKeys)) continue;

      const bbox = {
        south: geometry.south,
        north: geometry.north,
        west: geometry.west,
        east: geometry.east,
      };
      if (!boundingBoxContainsPoint(bbox, queryPoint)) continue;

      const poly = geometry.coordinates as Polygon;
      if (s2.polygonContainsPoint(poly.exterior, queryPoint)) {
        results.push({
          key: geometry.key,
          type: "polygon",
          coordinates: poly,
          boundingBox: bbox,
        });
      }
    }

    return { results, truncated };
  },
});

/**
 * Find all geometries that intersect a given shape.
 */
export const intersects = query({
  args: {
    shape: v.union(
      v.object({ type: v.literal("rectangle"), rectangle }),
      v.object({ type: v.literal("polygon"), polygon }),
    ),
    maxCoveringCells: v.optional(v.number()),
    filterKeys: v.optional(v.record(v.string(), primitive)),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    results: v.array(
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
      }),
    ),
    truncated: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const s2 = await S2Bindings.load();
    const { shape, maxCoveringCells = 30, filterKeys, limit = 100 } = args;
    let truncated = false;

    let queryBbox: { south: number; north: number; west: number; east: number };
    let queryPolygonPoints: Point[];

    if (shape.type === "rectangle") {
      queryBbox = shape.rectangle;
      queryPolygonPoints = rectangleToPolygonPoints(shape.rectangle);
    } else {
      // Reject polygons with holes
      const poly = shape.polygon as Polygon & {
        holes?: unknown;
        interiors?: unknown;
        interior?: unknown;
      };
      if (
        (poly.holes && Array.isArray(poly.holes) && poly.holes.length > 0) ||
        (poly.interiors &&
          Array.isArray(poly.interiors) &&
          poly.interiors.length > 0) ||
        (poly.interior && Array.isArray(poly.interior) && poly.interior.length > 0)
      ) {
        throw new Error("Polygon holes are not supported");
      }
      const points = shape.polygon.exterior;
      queryBbox = {
        south: Math.min(...points.map((p) => p.latitude)),
        north: Math.max(...points.map((p) => p.latitude)),
        west: Math.min(...points.map((p) => p.longitude)),
        east: Math.max(...points.map((p) => p.longitude)),
      };
      queryPolygonPoints = points;
    }

    const queryCells = s2.coverPolygonForIndex(
      queryPolygonPoints,
      maxCoveringCells,
    );

    const queryTokens = new Set<string>();
    for (const cellId of queryCells) {
      queryTokens.add(s2.cellIDToken(cellId));
      const ancestors = s2.cellAncestors(cellId);
      for (const ancestor of ancestors) {
        queryTokens.add(s2.cellIDToken(ancestor));
      }
    }

    const candidateIds = new Map<Id<"geometries">, string>();

    for (const token of queryTokens) {
      if (candidateIds.size >= MAX_CANDIDATES) {
        truncated = true;
        break;
      }

      const matches = await ctx.db
        .query("geometryCells")
        .withIndex("byCellToken", (q) => q.eq("cellToken", token))
        .take(MAX_CANDIDATES - candidateIds.size);

      for (const match of matches) {
        candidateIds.set(match.geometryId as Id<"geometries">, match.geometryKey);
      }

      if (candidateIds.size >= MAX_CANDIDATES) {
        truncated = true;
        break;
      }
    }

    const results: Array<{
      key: string;
      type: "polygon" | "polyline";
      coordinates: Polygon | Point[];
      boundingBox: Rectangle;
    }> = [];

    for (const [geometryId] of candidateIds) {
      if (results.length >= limit) break;

      const geometry = await ctx.db.get(geometryId);
      if (!geometry) continue;
      if (!matchesFilterKeys(geometry, filterKeys)) continue;

      const geomBbox = {
        south: geometry.south,
        north: geometry.north,
        west: geometry.west,
        east: geometry.east,
      };
      if (!boundingBoxesIntersect(geomBbox, queryBbox)) continue;

      let doesIntersect = false;
      if (geometry.type === "polygon") {
        const storedPolygon = (geometry.coordinates as Polygon).exterior;
        doesIntersect = s2.polygonIntersectsPolygon(
          storedPolygon,
          queryPolygonPoints,
        );
      } else {
        const polylinePoints = geometry.coordinates as Point[];
        doesIntersect = s2.polylineIntersectsPolygon(
          polylinePoints,
          queryPolygonPoints,
        );
      }

      if (doesIntersect) {
        results.push({
          key: geometry.key,
          type: geometry.type,
          coordinates: geometry.coordinates,
          boundingBox: geomBbox,
        });
      }
    }

    return { results, truncated };
  },
});

/**
 * Find geometries within a given distance of a point.
 * Returns results sorted by distance.
 */
export const geometriesNear = query({
  args: {
    point: v.object({
      latitude: v.number(),
      longitude: v.number(),
    }),
    maxDistance: v.number(),
    filterKeys: v.optional(v.record(v.string(), primitive)),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    results: v.array(
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
        distance: v.number(),
      }),
    ),
    truncated: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const s2 = await S2Bindings.load();
    const { point: queryPoint, maxDistance, filterKeys, limit = 100 } = args;

    if (maxDistance < 0) {
      throw new Error("maxDistance must be non-negative");
    }

    let truncated = false;

    const latDelta = maxDistance / METERS_PER_DEGREE_LAT;
    const cosLat = Math.cos((queryPoint.latitude * Math.PI) / 180);
    const lngDelta =
      cosLat > 0.01
        ? Math.min(maxDistance / (METERS_PER_DEGREE_LAT * cosLat), 180)
        : 180;

    const searchBbox = {
      south: Math.max(-90, queryPoint.latitude - latDelta),
      north: Math.min(90, queryPoint.latitude + latDelta),
      west: Math.max(-180, queryPoint.longitude - lngDelta),
      east: Math.min(180, queryPoint.longitude + lngDelta),
    };

    const searchPolygon = rectangleToPolygonPoints(searchBbox);
    const searchCells = s2.coverPolygonForIndex(searchPolygon, 50);

    const searchTokens = new Set<string>();
    for (const cellId of searchCells) {
      searchTokens.add(s2.cellIDToken(cellId));
      const ancestors = s2.cellAncestors(cellId);
      for (const ancestor of ancestors) {
        searchTokens.add(s2.cellIDToken(ancestor));
      }
    }

    const candidateIds = new Map<Id<"geometries">, string>();

    for (const token of searchTokens) {
      if (candidateIds.size >= MAX_CANDIDATES) {
        truncated = true;
        break;
      }

      const matches = await ctx.db
        .query("geometryCells")
        .withIndex("byCellToken", (q) => q.eq("cellToken", token))
        .take(MAX_CANDIDATES - candidateIds.size);

      for (const match of matches) {
        candidateIds.set(match.geometryId as Id<"geometries">, match.geometryKey);
      }

      if (candidateIds.size >= MAX_CANDIDATES) {
        truncated = true;
        break;
      }
    }

    const resultsWithDistance: Array<{
      key: string;
      type: "polygon" | "polyline";
      coordinates: Polygon | Point[];
      boundingBox: Rectangle;
      distance: number;
    }> = [];

    for (const [geometryId] of candidateIds) {
      const geometry = await ctx.db.get(geometryId);
      if (!geometry) continue;
      if (!matchesFilterKeys(geometry, filterKeys)) continue;

      let distanceMeters: number;
      if (geometry.type === "polygon") {
        const polygonPoints = (geometry.coordinates as Polygon).exterior;
        if (s2.polygonContainsPoint(polygonPoints, queryPoint)) {
          distanceMeters = 0;
        } else {
          const chordAngle = s2.distanceToPolygonEdge(polygonPoints, queryPoint);
          distanceMeters = s2.chordAngleToMeters(chordAngle);
        }
      } else {
        const polylinePoints = geometry.coordinates as Point[];
        const chordAngle = s2.distanceToPolyline(polylinePoints, queryPoint);
        distanceMeters = s2.chordAngleToMeters(chordAngle);
      }

      if (distanceMeters <= maxDistance) {
        const geomBbox = {
          south: geometry.south,
          north: geometry.north,
          west: geometry.west,
          east: geometry.east,
        };

        resultsWithDistance.push({
          key: geometry.key,
          type: geometry.type,
          coordinates: geometry.coordinates,
          boundingBox: geomBbox,
          distance: distanceMeters,
        });
      }
    }

    resultsWithDistance.sort((a, b) => a.distance - b.distance);
    return { results: resultsWithDistance.slice(0, limit), truncated };
  },
});
