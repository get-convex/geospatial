import { v } from "convex/values";
import { action, httpAction, query } from "./_generated/server";
import { Point, point } from "../../src/client";
import { geospatial } from ".";
import { Id } from "./_generated/dataModel";
import { rectangle } from "../../src/component/types";
import { api } from "./_generated/api";

export const executeStreaming = httpAction(async (ctx, req) => {
  const { rectangle, mustFilter, shouldFilter, maxRows } = await req.json();
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      try {
        let cursor: string | undefined = undefined;
        let numEmitted = 0;
        while (true) {
          console.log("querying", cursor);
          const { rows, nextCursor } = (await ctx.runQuery(api.search.execute, {
            rectangle,
            mustFilter,
            shouldFilter,
            cursor,
            maxRows: 64,
          })) as { rows: any[]; nextCursor: string | undefined };
          console.log("received", rows, nextCursor);
          for (const result of rows) {
            controller.enqueue(encoder.encode(JSON.stringify(result) + "\n"));
            numEmitted++;
            if (numEmitted >= maxRows) {
              break;
            }
          }
          if (nextCursor === undefined || numEmitted >= maxRows) {
            break;
          }
          if (cursor === nextCursor) {
            console.error("cursor did not advance");
            break;
          }
          cursor = nextCursor;
        }
      } catch (e: any) {
        controller.error(e);
      } finally {
        controller.close();
      }
    },
  });
  return new Response(body, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "*",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Max-Age": "86400",
    },
  });
});

export const execute = query({
  args: {
    rectangle,
    mustFilter: v.array(v.string()),
    shouldFilter: v.array(v.string()),
    cursor: v.optional(v.string()),
    maxRows: v.number(),
  },
  returns: v.object({
    rows: v.array(
      v.object({
        _id: v.id("locations"),
        _creationTime: v.number(),
        name: v.string(),
        coordinates: point,
      }),
    ),
    nextCursor: v.optional(v.string()),
    h3Cells: v.array(v.string()),
  }),
  async handler(ctx, args) {
    const mustFilterConditions = args.mustFilter.map((emoji) => ({
      filterKey: "name" as const,
      filterValue: emoji,
      occur: "must" as const,
    }));
    const shouldFilterConditions = args.shouldFilter.map((emoji) => ({
      filterKey: "name" as const,
      filterValue: emoji,
      occur: "should" as const,
    }));
    const { results, nextCursor } = await geospatial.queryRectangle(
      ctx,
      args.rectangle,
      [...mustFilterConditions, ...shouldFilterConditions],
      {},
      args.cursor,
      args.maxRows,
    );
    const coordinatesByKey = new Map<string, Point>();
    const rowFetches = [];
    for (const result of results) {
      rowFetches.push(ctx.db.get(result.key as Id<"locations">));
      coordinatesByKey.set(result.key, result.coordinates);
    }
    for (const result of results) {
      coordinatesByKey.set(result.key, result.coordinates);
    }
    const rows = [];
    for (const row of await Promise.all(rowFetches)) {
      if (!row) {
        throw new Error("Invalid locationId");
      }
      const coordinates = coordinatesByKey.get(row._id)!;
      rows.push({ coordinates, ...row });
    }

    const h3Cells = await geospatial.debugH3Cells(
      ctx,
      args.rectangle,
      geospatial.maxResolution,
    );
    return {
      rows,
      h3Cells,
      nextCursor,
    };
  },
});

export const h3Cells = query({
  args: {
    rectangle,
    maxResolution: v.number(),
  },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    return await geospatial.debugH3Cells(
      ctx,
      args.rectangle,
      args.maxResolution,
    );
  },
});
