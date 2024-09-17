import { v } from "convex/values";
import { geospatial } from ".";
import { point } from "../../src/client";
import {
  internalAction,
  internalMutation,
  mutation,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { FOOD_EMOJIS } from "./constants.js";

export default mutation({
  args: { point, name: v.string() },
  handler: async (ctx, { point, name }) => {
    const id = await ctx.db.insert("locations", {
      name,
    });
    await geospatial.insert(ctx, id, point, { name });
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
      const latitudeRange = [39, 41];
      const longitudeRange = [-75, -73];
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

export const addMany = internalAction({
  args: { count: v.number(), batchSize: v.number(), parallelism: v.number() },
  handler: async (ctx, args) => {
    let ix = 0;
    let added = 0;
    const inProgress: Map<number, Promise<number>> = new Map();

    while (true) {
      if (added >= args.count) {
        if (inProgress.size > 0) {
          await Promise.all(inProgress.values());
        }
        break;
      }
      if (inProgress.size >= args.parallelism) {
        const index = await Promise.race(inProgress.values());
        inProgress.delete(index);
        added += args.batchSize;
        console.log(`Added ${args.batchSize} points (total: ${added})`);
      }
      if (inProgress.size < args.parallelism) {
        const index = ix++;
        const promise = ctx
          .runMutation(internal.addPoint.addBatch, { count: args.batchSize })
          .then(() => index);
        inProgress.set(index, promise);
      }
    }
  },
});
