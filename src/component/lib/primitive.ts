import { v, Infer } from "convex/values";

export const primitive = v.union(
  v.string(),
  v.number(),
  v.boolean(),
  v.bytes(),
  v.null(),
  v.int64(),
);
export type Primitive = Infer<typeof primitive>;
