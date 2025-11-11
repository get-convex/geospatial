import { v, type Infer } from "convex/values";

export const interval = v.object({
  startInclusive: v.optional(v.number()),
  endExclusive: v.optional(v.number()),
});
export type Interval = Infer<typeof interval>;
