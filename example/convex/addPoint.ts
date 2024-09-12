import { v } from "convex/values";
import { geospatial } from ".";
import { point } from "../../src/client";
import { components, mutation } from "./_generated/server";
import { FOOD_EMOJIS } from "./constants.js";

export default mutation({
  args: { point },
  handler: async (ctx, { point }) => {
    const name = FOOD_EMOJIS[Math.floor(Math.random() * FOOD_EMOJIS.length)];
    const id = await ctx.db.insert("locations", {
      name,
    });
    // await geospatial.insert(ctx, id, point);
    await ctx.runMutation(components.geospatial.geo2.insertDocument, {
      document: {
        key: id,
        coordinates: point,
        sortKey: Math.random(),
        filterKeys: {
          name,
        },
      },
      maxResolution: 9,
    });
  },
});

export const addMany = mutation({
  args: { count: v.number() },
  handler: async (ctx, { count }) => {
    for (let i = 0; i < count; i++) {
      const name = FOOD_EMOJIS[Math.floor(Math.random() * FOOD_EMOJIS.length)];
      const id = await ctx.db.insert("locations", {
        name,
      });

      const latitudeRange = [40.70314, 40.86787];
      const longitudeRange = [-74.00712, -73.91972];
      const latitude =
        Math.random() * (latitudeRange[1] - latitudeRange[0]) +
        latitudeRange[0];
      const longitude =
        Math.random() * (longitudeRange[1] - longitudeRange[0]) +
        longitudeRange[0];
      const point = { latitude, longitude };
      await ctx.runMutation(components.geospatial.geo2.insertDocument, {
        document: {
          key: id,
          coordinates: point,
          sortKey: Math.random(),
          filterKeys: {
            name,
          },
        },
        maxResolution: 9,
      });
    }
  },
});
