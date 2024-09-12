import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { components } from "./_generated/server";
import { point, rectangle } from "../../src/component/types";

export const test = mutation({
    args: {
        key: v.string(),
        coordinates: point,
        filterKeys: v.any(),
        sortKey: v.number()
    },
    handler: async (ctx, args) => {
        await ctx.runMutation(components.geospatial.geo2.insertDocument, {
            document: {
                coordinates: args.coordinates,
                filterKeys: args.filterKeys,
                key: args.key,
                sortKey: args.sortKey
            },
            maxResolution: 14
        });
    }
})

export const search = query({
    args: {
        rectangle,
        maxRows: v.number()
    },
    handler: async (ctx, args) => {
        const results = await ctx.runQuery(components.geospatial.geo2query.queryDocuments, {
            query: {
                rectangle: args.rectangle,
                sorting: {
                    interval: {
                        startInclusive: Number.MIN_VALUE,
                        endExclusive: Number.MAX_VALUE
                    }
                },
                filtering: [],
                maxResults: args.maxRows,
            },
            maxResolution: 14,            
        });
        return results;
    }
});