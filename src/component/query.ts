import { v } from "convex/values";
import { Point, point, primitive, rectangle } from "./types.js";
import { query } from "./_generated/server.js";
import {
  coverRectangle,
  rectangleContains,
  validateRectangle,
} from "./lib/geometry.js";
import { PointSet, Stats } from "./streams/zigzag.js";
import { Intersection } from "./streams/intersection.js";
import { Union } from "./streams/union.js";
import { FilterKeyRange } from "./streams/filterKeyRange.js";
import { H3CellRange } from "./streams/h3CellRange.js";
import { interval } from "./lib/interval.js";
import { decodeTupleKey } from "./lib/tupleKey.js";
import { Channel, ChannelClosedError } from "async-channel";
import { Doc } from "./_generated/dataModel.js";

const BATCH_SIZE = 8;

const equalityCondition = v.object({
  occur: v.union(v.literal("should"), v.literal("must")),
  filterKey: v.string(),
  filterValue: primitive,
});

const geospatialQuery = v.object({
  rectangle,
  filtering: v.array(equalityCondition),
  sorting: v.object({
    // TODO: Support reverse order.
    // order: v.union(v.literal("asc"), v.literal("desc")),
    interval,
  }),
  maxResults: v.number(),
});

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
  },
});

export const execute = query({
  args: {
    query: geospatialQuery,
    maxResolution: v.number(),
  },
  returns: v.array(queryResult),
  handler: async (ctx, args) => {
    console.time("execute");
    // First, validate the query.
    const { sorting } = args.query;
    if (
      sorting.interval.startInclusive !== undefined &&
      sorting.interval.endExclusive !== undefined
    ) {
      if (sorting.interval.startInclusive > sorting.interval.endExclusive) {
        throw new Error("Invalid interval: start is greater than end");
      }
      if (sorting.interval.startInclusive === sorting.interval.endExclusive) {
        return [];
      }
    }
    validateRectangle(args.query.rectangle);

    // Second, convert the rectangle to a set of H3 cells.
    const h3Cells = coverRectangle(args.query.rectangle, args.maxResolution);
    if (!h3Cells) {
      console.warn(
        `Failed to find interior cells for empty rectangle: ${JSON.stringify(args.query.rectangle)}`,
      );
      return [];
    }
    const stats: Stats = {
      h3Cells: h3Cells.size,
      queriesIssued: 0,
      rowsRead: 0,
      rowsPostFiltered: 0,
    };
    const h3SRanges = [...h3Cells].map(
      (h3Cell) =>
        new H3CellRange(ctx, h3Cell, sorting.interval, BATCH_SIZE, stats),
    );
    const h3Stream = new Union(h3SRanges);

    // Third, build up the streams for filter keys.
    const mustRanges: FilterKeyRange[] = [];
    const shouldRanges: FilterKeyRange[] = [];
    for (const filter of args.query.filtering) {
      const ranges = filter.occur === "must" ? mustRanges : shouldRanges;
      ranges.push(
        new FilterKeyRange(
          ctx,
          filter.filterKey,
          filter.filterValue,
          sorting.interval,
          BATCH_SIZE,
          stats,
        ),
      );
    }

    // Fourth, build up the final query stream.
    const intersectionStreams: PointSet[] = [h3Stream];
    if (shouldRanges.length > 0) {
      intersectionStreams.push(new Union(shouldRanges));
    }
    if (mustRanges.length > 0) {
      intersectionStreams.push(...mustRanges);
    }
    let stream: PointSet;
    if (intersectionStreams.length > 1) {
      stream = new Intersection(intersectionStreams);
    } else {
      stream = intersectionStreams[0];
    }

    // Finally, consume the stream and fetch the resulting IDs.
    const channel = new Channel<Promise<Doc<"points"> | null>>(8);
    const producer = async () => {
      try {
        while (true) {
          const tupleKey = await stream.current();
          if (tupleKey === null) {
            break;
          }
          const { pointId } = decodeTupleKey(tupleKey);
          try {
            await channel.push(ctx.db.get(pointId));
          } catch (e) {
            if (e instanceof ChannelClosedError) {
              break;
            }
            throw e;
          }
          await stream.advance();
        }
      } finally {
        if (!channel.closed) {
          channel.close(true);
        }
      }
    };
    const results: { key: string; coordinates: Point }[] = [];
    const consumer = async () => {
      for await (const docPromise of channel) {
        const doc = await docPromise;
        if (doc === null) {
          throw new Error("Internal error: document not found");
        }
        if (!rectangleContains(args.query.rectangle, doc.coordinates)) {
          stats.rowsPostFiltered++;
          continue;
        }
        results.push({
          key: doc.key,
          coordinates: doc.coordinates,
        });
        if (results.length >= args.query.maxResults) {
          channel.close(true);
          break;
        }
      }
      return results;
    };
    await Promise.all([producer(), consumer()]);
    console.log(`Found ${results.length} results (${JSON.stringify(stats)})`);
    console.timeEnd("execute");

    return results;
  },
});
