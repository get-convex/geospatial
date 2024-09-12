import { geospatial } from ".";
import { point } from "../../src/client";
import { components, mutation } from "./_generated/server";

const FOOD_EMOJIS = [
  "🌰",
  "🌶️",
  "🌽",
  "🍄",
  "🍅",
  "🍆",
  "🍇",
  "🍈",
  "🍉",
  "🍊",
  "🍋",
  "🍌",
  "🍍",
  "🍎",
  "🍐",
  "🍑",
  "🍒",
  "🍓",
  "🍯",
  "🥑",
  "🥒",
  "🥔",
  "🥕",
  "🥜",
  "🥝",
  "🥥",
  "🥦",
  "🥬",
  "🥭",
  "🥭",
  "🧄",
  "🧅",
  "🫐",
  "🫑",
  "🫘",
  "🫛",
];

export default mutation({
  args: { point },
  handler: async (ctx, { point }) => {
    const id = await ctx.db.insert("locations", {
      name: FOOD_EMOJIS[Math.floor(Math.random() * FOOD_EMOJIS.length)],
    });
    // await geospatial.insert(ctx, id, point);
    await ctx.runMutation(components.geospatial.geo2.insertDocument, {
      document: {
        key: id,
        coordinates: point,
        sortKey: Math.random(),
        filterKeys: {},
      },
      maxResolution: 14,
    });
  },
});
