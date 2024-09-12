import { Infer, v } from "convex/values"
import { point, primitive, rectangle } from "./types.js"
import { query } from "./_generated/server.js"
import { primitiveCompare } from "./lib/primitive.js"
import { coverRectangle, validateRectangle } from "./lib/geometry.js"
import { FilterKeyRange, H3CellRange, Intersection, PointSet, Union } from "./lib/zigzag.js"
import { interval } from "./lib/interval.js"
import { decodeTupleKey } from "./lib/tupleKey.js"

const equalityCondition = v.object({
    filterKey: v.string(),
    filterValue: primitive,
})

const geo2Query = v.object({
    rectangle,

    filtering: v.array(equalityCondition),

    sorting: v.object({
        // TODO: Support reverse order.
        // order: v.union(v.literal("asc"), v.literal("desc")),
        interval,
    }),

    maxResults: v.number(),
})

const queryResult = v.object({
    key: v.string(),
    coordinates: point,
});

export const debugH3Cells = query({
    args: {
        rectangle,
        maxResolution: v.number(),
    },
    returns: v.array(v.string()),
    handler: async (ctx, args) => {
        const h3Cells = coverRectangle(args.rectangle, args.maxResolution);
        return h3Cells ? [...h3Cells] : [];
    }
})

export const queryDocuments = query({
    args: {
        query: geo2Query,
        maxResolution: v.number(),
    },
    returns: v.array(queryResult),
    handler: async (ctx, args) => {
        // First, validate the query.
        const { sorting } = args.query;
        const cmp = primitiveCompare(sorting.interval.startInclusive, sorting.interval.endExclusive);
        if (cmp > 0) {
            throw new Error("Invalid interval: start is greater than end");
        }
        if (cmp === 0) {
            return [];
        }
        validateRectangle(args.query.rectangle);

        // Second, convert the rectangle to a set of H3 cells.        
        const h3Cells = coverRectangle(args.query.rectangle, args.maxResolution);
        if (!h3Cells) {
            console.warn(`Failed to find interior cells for empty rectangle: ${JSON.stringify(args.query.rectangle)}`);
            return [];
        }
        const h3SRanges = [...h3Cells].map(h3Cell => new H3CellRange(ctx, h3Cell, sorting.interval));
        const h3SStream = new Union(h3SRanges);

        // Third, build up the streams for filter keys.
        const filterRanges = args.query.filtering.map(filter => {
            return new FilterKeyRange(ctx, filter.filterKey, filter.filterValue, sorting.interval)
        })

        // Fourth, build up the final query stream.
        let stream: PointSet;
        if (filterRanges.length > 0) {
            stream = new Intersection([h3SStream, ...filterRanges]);
        } else {
            stream = h3SStream;
        }

        // Finally, consume the stream and fetch the resulting IDs.
        const resultPromises = [];
        while (resultPromises.length < args.query.maxResults) {
            const tupleKey = await stream.current();
            if (tupleKey === null) {
                break;
            }
            const { pointId } = decodeTupleKey(tupleKey);
            resultPromises.push(ctx.db.get(pointId));
            await stream.advance();
        }
        const resultDocs = await Promise.all(resultPromises);
        return resultDocs.map(d => {
            if (d === null) {
                throw new Error("Internal error: document not found");
            }
            return {
                key: d.key,
                coordinates: d.coordinates,
            }
        });
    }
})