import { v } from "convex/values";
import { geospatial } from "./example.js";
import { action, internalMutation, mutation } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { FOOD_EMOJIS } from "./constants.js";

// Simplified US state polygon coordinates for demonstration
const US_STATE_POLYGONS = {
  pennsylvania: {
    name: "Pennsylvania",
    exterior: [
      { latitude: 42.0, longitude: -80.52 },
      { latitude: 42.0, longitude: -79.76 },
      { latitude: 42.27, longitude: -79.76 },
      { latitude: 42.0, longitude: -77.83 },
      { latitude: 42.0, longitude: -75.36 },
      { latitude: 41.36, longitude: -75.07 },
      { latitude: 40.97, longitude: -75.13 },
      { latitude: 40.57, longitude: -75.07 },
      { latitude: 40.37, longitude: -74.73 },
      { latitude: 39.72, longitude: -75.56 },
      { latitude: 39.72, longitude: -76.57 },
      { latitude: 39.72, longitude: -79.48 },
      { latitude: 39.72, longitude: -80.52 },
      { latitude: 40.64, longitude: -80.52 },
      { latitude: 42.0, longitude: -80.52 },
    ],
  },
  illinois: {
    name: "Illinois",
    exterior: [
      { latitude: 42.5, longitude: -90.64 },
      { latitude: 42.5, longitude: -87.02 },
      { latitude: 41.76, longitude: -87.53 },
      { latitude: 39.35, longitude: -87.53 },
      { latitude: 38.95, longitude: -87.95 },
      { latitude: 38.78, longitude: -87.66 },
      { latitude: 38.2, longitude: -88.07 },
      { latitude: 37.95, longitude: -88.71 },
      { latitude: 37.22, longitude: -89.17 },
      { latitude: 36.97, longitude: -89.52 },
      { latitude: 37.0, longitude: -90.37 },
      { latitude: 38.17, longitude: -90.21 },
      { latitude: 38.83, longitude: -90.11 },
      { latitude: 39.31, longitude: -91.06 },
      { latitude: 40.0, longitude: -91.42 },
      { latitude: 40.61, longitude: -91.22 },
      { latitude: 41.07, longitude: -90.95 },
      { latitude: 41.46, longitude: -90.46 },
      { latitude: 42.5, longitude: -90.64 },
    ],
  },
  ohio: {
    name: "Ohio",
    exterior: [
      { latitude: 41.98, longitude: -84.82 },
      { latitude: 41.76, longitude: -83.45 },
      { latitude: 41.5, longitude: -82.69 },
      { latitude: 41.68, longitude: -81.0 },
      { latitude: 40.99, longitude: -80.52 },
      { latitude: 40.64, longitude: -80.52 },
      { latitude: 39.72, longitude: -80.52 },
      { latitude: 38.77, longitude: -81.76 },
      { latitude: 38.59, longitude: -82.29 },
      { latitude: 38.76, longitude: -82.86 },
      { latitude: 39.02, longitude: -84.26 },
      { latitude: 39.1, longitude: -84.82 },
      { latitude: 41.98, longitude: -84.82 },
    ],
  },
};

/**
 * Seed the database with US state polygons using the geometry storage API.
 */
export const seedStatePolygons = mutation({
  args: {},
  handler: async (ctx) => {
    const inserted: string[] = [];

    for (const [stateKey, stateData] of Object.entries(US_STATE_POLYGONS)) {
      try {
        await geospatial.insertPolygon(
          ctx,
          `state:${stateKey}`,
          { exterior: stateData.exterior },
          { name: stateData.name, type: "state" }
        );
        inserted.push(stateData.name);
      } catch (e) {
        // Polygon may already exist
        console.warn(`State ${stateData.name} failed to insert:`, e);
      }
    }

    return { inserted };
  },
});

export const addBatch = internalMutation({
  args: { count: v.number() },
  handler: async (ctx, { count }) => {
    for (let i = 0; i < count; i++) {
      const name = FOOD_EMOJIS[Math.floor(Math.random() * FOOD_EMOJIS.length)];
      const id = await ctx.db.insert("locations", {
        name,
      });
      const latitudeRange = [10, 60];
      const longitudeRange = [-100, -10];
      const latitude =
        Math.random() * (latitudeRange[1] - latitudeRange[0]) +
        latitudeRange[0];
      const longitude =
        Math.random() * (longitudeRange[1] - longitudeRange[0]) +
        longitudeRange[0];
      const point = { latitude, longitude };
      await geospatial.insert(ctx, id, point, { name });
    }
  },
});

export const addMany = action({
  args: { count: v.number(), batchSize: v.number(), parallelism: v.number() },
  handler: async (ctx, args) => {
    let ix = 0;
    let added = 0;
    const inProgress: Map<number, Promise<number>> = new Map();
    const deadline = Date.now() + 60 * 1000;

    while (added < args.count && Date.now() < deadline) {
      if (inProgress.size >= args.parallelism) {
        const index = await Promise.race(inProgress.values());
        inProgress.delete(index);
        added += args.batchSize;
        console.log(`Added ${args.batchSize} points (total: ${added})`);
      }
      if (inProgress.size < args.parallelism) {
        const index = ix++;
        const promise = ctx
          .runMutation(internal.seed.addBatch, { count: args.batchSize })
          .then(() => index);
        inProgress.set(index, promise);
      }
    }
    if (inProgress.size > 0) {
      await Promise.all(inProgress.values());
      added += args.batchSize * inProgress.size;
    }

    if (added < args.count) {
      await ctx.scheduler.runAfter(0, api.seed.addMany, {
        count: args.count - added,
        batchSize: args.batchSize,
        parallelism: args.parallelism,
      });
    }
  },
});
