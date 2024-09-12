import { Infer, v, Validator } from "convex/values";

export type { Primitive } from "./lib/primitive.js";
export { primitive } from "./lib/primitive.js";

export const point = v.object({
  latitude: v.number(),
  longitude: v.number(),
});

export function pointToArray(p: Point): [number, number] {
  return [p.latitude, p.longitude];
}

export type Point = Infer<typeof point>;

export const rectangle = v.object({
  sw: point,
  nw: point,
  ne: point,
  se: point,
})
export type Rectangle = Infer<typeof rectangle>;

export function recordValidator<
  Key extends Validator<any, "required", any>,
  Value extends Validator<any, "required", any>,
>(keys: Key, values: Value) {
  return (v as any).any();
}
