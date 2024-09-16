import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { point, primitive } from "./types.js";

export default defineSchema({
  points: defineTable({
    key: v.string(),
    coordinates: point,
    sortKey: v.number(),
    filterKeys: v.record(v.string(), v.union(primitive, v.array(primitive))),
  }).index("key", ["key"]),

  pointsbyH3Cell: defineTable({
    h3Cell: v.string(),
    tupleKey: v.string(),
  }).index("h3Cell", ["h3Cell", "tupleKey"]),

  pointsByFilterKey: defineTable({
    filterKey: v.string(),
    filterValue: primitive,
    tupleKey: v.string(),
  }).index("filterKey", ["filterKey", "filterValue", "tupleKey"]),

  // TODO: Switch this to the component when published.
  counters: defineTable({
    key: v.string(),
    shard: v.number(),
    value: v.number(),
  }).index("by_key_and_shard", ["key", "shard"]),  
});
