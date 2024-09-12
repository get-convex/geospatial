import { Infer, v } from "convex/values"

export const interval = v.object({
    startInclusive: v.number(),
    endExclusive: v.number(),
})
export type Interval = Infer<typeof interval>;
