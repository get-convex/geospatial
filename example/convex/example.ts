import { GeospatialIndex, Point, point } from "@convex-dev/geospatial";
import { Id } from "./_generated/dataModel";
import { components } from "./_generated/api";
import { mutation } from "./_generated/server";
import { v } from "convex/values";

type EmojiLocation = {
  key: Id<"locations">;
  coordinates: Point;
  filterKeys: {
    name: string;
  };
  sortKey: number;
};

export const geospatial = new GeospatialIndex<EmojiLocation>(
  components.geospatial,
);

export const addPoint = mutation({
  args: { point, name: v.string() },
  handler: async (ctx, { point, name }) => {
    const id = await ctx.db.insert("locations", {
      name,
    });
    await geospatial.insert(ctx, id, point, { name });
  },
});
