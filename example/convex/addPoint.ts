import { geospatial } from ".";
import { point } from "../../src/client";
import { mutation } from "./_generated/server";

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
    await geospatial.insert(ctx, id, point);
  },
});
