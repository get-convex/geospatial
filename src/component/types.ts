import { Infer, v } from "convex/values";

export const point = v.object({
  latitude: v.number(),
  longitude: v.number(),
});

export function pointToArray(p: Point): [number, number] {
  return [p.latitude, p.longitude];
}

export type Point = Infer<typeof point>;
