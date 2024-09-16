import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server";

export const updatePresence = mutation({
    args: {
        presenceId: v.id("presence"),
    },
    handler: async (ctx, { presenceId }) => {
        const presence = await ctx.db.get(presenceId);
        if (!presence) {
            throw new ConvexError("Presence not found");
        }
        await ctx.db.patch(presenceId, {
            lastSeen: Date.now(),
        });
    },
});