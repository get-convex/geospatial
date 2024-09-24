// This file is for thick component clients and helpers that run

import {
  Expand,
  FunctionReference,
  FunctionReturnType,
  OptionalRestArgs,
} from "convex/server";
import { GenericId } from "convex/values";
import type { api } from "../component/_generated/api.js";
import type { Point, Primitive, Rectangle } from "../component/types.js";
import { point } from "../component/types.js";
import { LogLevel } from "../component/lib/logging.js";

export type { Point };
export { point };

declare global {
  const Convex: Record<string, unknown>;
}
if (typeof Convex === "undefined") {
  throw new Error(
    "this is Convex backend code, but it's running somewhere else!",
  );
}

export const DEFAULT_MAX_RESOLUTION = 10;

export type GeospatialDocument = {
  key: string;
  coordinates: Point;
  filterKeys: Record<string, Primitive | Primitive[]>;
  sortKey: number;
};

export class GeospatialIndex<
  Doc extends GeospatialDocument = GeospatialDocument,
> {
  logLevel: LogLevel;
  maxResolution: number;

  /**
   * Create a new geospatial index, powered by H3 and Convex. This index maps unique string keys to geographic coordinates
   * on the Earth's surface, with the ability to efficiently query for all keys within a given geographic area.
   *
   * @param component - The registered geospatial index from `components`.
   * @param maxResolution - The maximum resolution to use when querying. See https://h3geo.org/docs/core-library/restable/
   * for the feature size at each resolution. Higher resolution indexes will be able to distinguish between closer
   * points at the cost of storage, insertion time, and query time. This defaults to 10, which has ~28m resolution.
   */
  constructor(
    private component: UseApi<typeof api>,
    options?: {
      maxResolution?: number;
      logLevel?: LogLevel;
    },
  ) {
    let DEFAULT_LOG_LEVEL: LogLevel = "INFO";
    if (process.env.ACTION_RETRIER_LOG_LEVEL) {
      if (
        !["DEBUG", "INFO", "WARN", "ERROR"].includes(
          process.env.ACTION_RETRIER_LOG_LEVEL,
        )
      ) {
        console.warn(
          `Invalid log level (${process.env.ACTION_RETRIER_LOG_LEVEL}), defaulting to "INFO"`,
        );
      }
      DEFAULT_LOG_LEVEL = process.env.ACTION_RETRIER_LOG_LEVEL as LogLevel;
    }
    this.logLevel = options?.logLevel ?? DEFAULT_LOG_LEVEL;
    this.maxResolution = options?.maxResolution ?? DEFAULT_MAX_RESOLUTION;
  }

  /**
   * Insert a new key-coordinate pair into the index.
   *
   * @param ctx - The Convex mutation context.
   * @param key - The unique string key to associate with the coordinate.
   * @param coordinates - The geographic coordinate `{ latitude, longitude }` to associate with the key.
   * @param filterKeys - The filter keys to associate with the key.
   * @param sortKey - The sort key to associate with the key, defaults to a randomly generated number.
   */
  async insert(
    ctx: MutationCtx,
    key: Doc["key"],
    coordinates: Point,
    filterKeys: Doc["filterKeys"],
    sortKey?: number,
  ) {
    await ctx.runMutation(this.component.document.insert, {
      document: {
        key,
        coordinates,
        filterKeys,
        sortKey: sortKey ?? Math.random(),
      },
      maxResolution: this.maxResolution,
    });
  }

  /**
   * Retrieve the coordinate associated with a specific key.
   *
   * @param ctx - The Convex query context.
   * @param key - The unique string key to retrieve the coordinate for.
   * @returns - The geographic coordinate `{ latitude, longitude }` associated with the key, or `null` if the key is not found.
   */
  async get(ctx: QueryCtx, key: Doc["key"]): Promise<Doc | null> {
    const result = await ctx.runQuery(this.component.document.get, { key });
    return result as Doc | null;
  }

  /**
   * Remove a key-coordinate pair from the index.
   *
   * @param ctx - The Convex mutation context.
   * @param key - The unique string key to remove from the index.
   * @returns - `true` if the key was found and removed, `false` otherwise.
   */
  async remove(ctx: MutationCtx, key: Doc["key"]): Promise<boolean> {
    return await ctx.runMutation(this.component.document.remove, {
      key,
      maxResolution: this.maxResolution,
    });
  }

  /**
   * Query for keys within a given rectangle.
   *
   * This method is intended for user-facing queries, like finding all points of interest on the
   * user's viewport. It automatically determines the query resolution based on the rectangle's
   * dimensions and samples at most `maxRows` results.
   *
   * @param ctx - The Convex query context.
   * @param rectangle - The geographic area to query.
   * @param filterConditions - The filter conditions to apply to the query.
   * @param sortingInterval - The sorting interval to apply to the query.
   * @param cursor - The continuation cursor to use for paginating through results.
   * @param maxRows - The maximum number of rows to return.
   * @returns - An array of objects with the key-coordinate pairs and optionally a continuation cursor.
   */

  async queryRectangle(
    ctx: QueryCtx,
    rectangle: Rectangle,
    filterConditions: FilterObject<Doc>[] = [],
    sortingInterval: { startInclusive?: number; endExclusive?: number } = {},
    cursor: string | undefined = undefined,
    maxRows: number = 64,
  ): Promise<{
    results: { key: Doc["key"]; coordinates: Point }[];
    nextCursor?: string;
  }> {
    const resp = await ctx.runQuery(this.component.query.execute, {
      query: {
        rectangle,
        filtering: filterConditions as any,
        sorting: { interval: sortingInterval },
        maxResults: maxRows,
      },
      cursor,
      maxResolution: this.maxResolution,
      logLevel: this.logLevel,
    });
    return resp;
  }

  /**
   * Debug the H3 cells that would be queried for a given rectangle.
   *
   * @param ctx - The Convex query context.
   * @param rectangle - The geographic area to query.
   * @param maxResolution - The maximum resolution to use when querying.
   * @returns - An array of H3 cell identifiers.
   */
  async debugH3Cells(
    ctx: QueryCtx,
    rectangle: Rectangle,
    maxResolution: number,
  ): Promise<string[]> {
    const resp = await ctx.runQuery(this.component.query.debugH3Cells, {
      rectangle,
      maxResolution,
    });
    return resp as any;
  }
}

type UseApi<API> = Expand<{
  [mod in keyof API]: API[mod] extends FunctionReference<
    infer FType,
    "public",
    infer FArgs,
    infer FReturnType,
    infer FComponentPath
  >
    ? FunctionReference<
        FType,
        "internal",
        OpaqueIds<FArgs>,
        OpaqueIds<FReturnType>,
        FComponentPath
      >
    : UseApi<API[mod]>;
}>;

type OpaqueIds<T> =
  T extends GenericId<infer _T>
    ? string
    : T extends (infer U)[]
      ? OpaqueIds<U>[]
      : T extends object
        ? { [K in keyof T]: OpaqueIds<T[K]> }
        : T;

type QueryCtx = {
  runQuery: <Query extends FunctionReference<"query", "public" | "internal">>(
    query: Query,
    ...args: OptionalRestArgs<Query>
  ) => Promise<FunctionReturnType<Query>>;
};

type MutationCtx = {
  runMutation: <
    Mutation extends FunctionReference<"mutation", "public" | "internal">,
  >(
    mutation: Mutation,
    ...args: OptionalRestArgs<Mutation>
  ) => Promise<FunctionReturnType<Mutation>>;
} & QueryCtx;

type FilterObject<Doc extends GeospatialDocument> = {
  [K in keyof Doc["filterKeys"]]: {
    filterKey: K;
    filterValue: ExtractArray<Doc["filterKeys"][K]>;
    occur: "should" | "must";
  };
}[keyof Doc["filterKeys"]];

type ExtractArray<T> = T extends (infer U)[] ? U : T;
