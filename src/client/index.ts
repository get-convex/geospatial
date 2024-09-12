// This file is for thick component clients and helpers that run

import {
  Expand,
  FunctionReference,
  FunctionReturnType,
  OptionalRestArgs,
} from "convex/server";
import { GenericId } from "convex/values";
import type { api } from "../component/_generated/api.js";
import type { Point } from "../component/types.js";
import { point } from "../component/types.js";

export type { Point };
export { point };

// on the Convex backend.
declare global {
  const Convex: Record<string, unknown>;
}

if (typeof Convex === "undefined") {
  throw new Error(
    "this is Convex backend code, but it's running somewhere else!",
  );
}

export const DEFAULT_MAX_RESOLUTION = 14;

export class GeospatialIndex<K extends string = string> {
  /**
   * Create a new geospatial index, powered by H3 and Convex. This index maps unique string keys to geographic coordinates
   * on the Earth's surface, with the ability to efficiently query for all keys within a given geographic area.
   *
   * @param component - The registered geospatial index from `components`.
   * @param maxResolution - The maximum resolution to use when querying. See https://h3geo.org/docs/core-library/restable/
   * for the feature size at each resolution. Higher resolution indexes will be able to distinguish between closer
   * points at the cost of storage, insertion time, and query time.
   */
  constructor(
    private component: UseApi<typeof api>,
    private maxResolution: number = DEFAULT_MAX_RESOLUTION,
  ) {}

  /**
   * Insert a new key-coordinate pair into the index.
   *
   * @param ctx - The Convex mutation context.
   * @param key - The unique string key to associate with the coordinate.
   * @param coordinates - The geographic coordinate `{ latitude, longitude }` to associate with the key.
   */
  async insert(ctx: MutationCtx, key: K, coordinates: Point) {
    await ctx.runMutation(this.component.index.insert, {
      key,
      coordinates,
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
  async get(ctx: QueryCtx, key: K): Promise<Point | null> {
    return await ctx.runQuery(this.component.index.get, { key });
  }

  /**
   * Remove a key-coordinate pair from the index.
   *
   * @param ctx - The Convex mutation context.
   * @param key - The unique string key to remove from the index.
   * @returns - `true` if the key was found and removed, `false` otherwise.
   */
  async remove(ctx: MutationCtx, key: K): Promise<boolean> {
    return await ctx.runMutation(this.component.index.remove, {
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
   * @param maxRows - The maximum number of rows to return.
   * @returns - An array of objects with the key-coordinate pairs and the H3 cell identifiers.
   */

  async queryRectangle(
    ctx: QueryCtx,
    rectangle: {
      sw: Point;
      nw: Point;
      ne: Point;
      se: Point;
    },
    maxRows: number = 64,
  ): Promise<{
    results: Array<{ key: K; coordinates: Point }>;
    h3Cells: string[];
  }> {
    const resp = await ctx.runQuery(this.component.index.queryRectangle, {
      rectangle,
      maxRows,
      maxResolution: this.maxResolution,
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
