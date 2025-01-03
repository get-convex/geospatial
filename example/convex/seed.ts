import { v } from "convex/values";
import { geospatial } from "./example.js";
import { action, internalMutation } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { FOOD_EMOJIS } from "./constants.js";

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
