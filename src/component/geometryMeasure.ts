import { query } from "./_generated/server.js";
import { v } from "convex/values";
import { S2Bindings } from "./lib/s2Bindings.js";
import { point, polygon, polyline } from "./types.js";

/**
 * Calculate the area of a polygon in square meters.
 * Uses spherical geometry on Earth's surface.
 */
export const polygonArea = query({
  args: {
    polygon: polygon,
  },
  returns: v.number(),
  handler: async (_ctx, args) => {
    const s2 = await S2Bindings.load();
    return s2.polygonArea(args.polygon.exterior);
  },
});

/**
 * Calculate the length of a polyline in meters.
 * Uses great-circle distance on Earth's surface.
 */
export const polylineLength = query({
  args: {
    polyline: polyline,
  },
  returns: v.number(),
  handler: async (_ctx, args) => {
    const s2 = await S2Bindings.load();
    return s2.polylineLength(args.polyline);
  },
});

/**
 * Calculate the perimeter of a polygon in meters.
 * Uses great-circle distance on Earth's surface.
 */
export const polygonPerimeter = query({
  args: {
    polygon: polygon,
  },
  returns: v.number(),
  handler: async (_ctx, args) => {
    const s2 = await S2Bindings.load();
    return s2.polygonPerimeter(args.polygon.exterior);
  },
});

/**
 * Calculate the centroid of a polygon.
 * Returns the geographic center point.
 */
export const polygonCentroid = query({
  args: {
    polygon: polygon,
  },
  returns: point,
  handler: async (_ctx, args) => {
    const s2 = await S2Bindings.load();
    return s2.polygonCentroid(args.polygon.exterior);
  },
});

/**
 * Calculate the centroid of a polyline.
 * Returns the weighted center point along the line.
 */
export const polylineCentroid = query({
  args: {
    polyline: polyline,
  },
  returns: point,
  handler: async (_ctx, args) => {
    const s2 = await S2Bindings.load();
    return s2.polylineCentroid(args.polyline);
  },
});
