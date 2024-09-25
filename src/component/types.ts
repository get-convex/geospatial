import { Infer, v, Validator } from "convex/values";

export type { Primitive } from "./lib/primitive.js";
export { primitive } from "./lib/primitive.js";

// Latitudes can be between -90 and 90.
export const latitude = v.number();
export type Latitude = Infer<typeof latitude>;

// Longitudes can be between -180 and 180.
export const longitude = v.number();
export type Longitude = Infer<typeof longitude>;

export const point = v.object({
  latitude,
  longitude,
});
export type Point = Infer<typeof point>;

export function pointToArray(p: Point): [number, number] {
  return [p.latitude, p.longitude];
}

export const rectangle = v.object({
  west: longitude,
  east: longitude,
  south: latitude,
  north: latitude,
});
export type Rectangle = Infer<typeof rectangle>;

export function rectangleToPolygon(r: Rectangle): Point[] {
  return [
    { latitude: r.south, longitude: r.west },
    { latitude: r.north, longitude: r.west },
    { latitude: r.north, longitude: r.east },
    { latitude: r.south, longitude: r.east },
  ];
}
