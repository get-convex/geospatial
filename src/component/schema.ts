import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { point } from "./types.js";

export default defineSchema({
  locations: defineTable({
    key: v.string(),
    coordinates: point,
  }).index("key", ["key"]),

  locationIndex: defineTable({
    h3Cell: v.string(),
    locationId: v.id("locations"),
  }).index("h3Cell", ["h3Cell", "locationId"]),
});
