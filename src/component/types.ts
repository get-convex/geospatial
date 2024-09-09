import { Infer, v } from "convex/values";

export const point = v.object({
  latitude: v.number(),
  longitude: v.number(),
});

export type Point = Infer<typeof point>;
