import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { point, primitive, recordValidator } from "./types.js";

export default defineSchema({
  locations: defineTable({
    key: v.string(),
    coordinates: point,
  }).index("key", ["key"]),

  locationIndex: defineTable({
    h3Cell: v.string(),
    locationId: v.id("locations"),
  }).index("h3Cell", ["h3Cell", "locationId"]),

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
});
