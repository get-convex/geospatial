import type {
  FunctionReference,
  FunctionReturnType,
  OptionalRestArgs,
} from "convex/server";
import type { Point, Primitive, Rectangle } from "../component/types.js";
import { point, rectangle } from "../component/types.js";
import type { LogLevel } from "../component/lib/logging.js";
import { FilterBuilderImpl, type GeospatialQuery } from "./query.js";
import type { ComponentApi } from "../component/_generated/component.js";

export type { Point, Primitive, GeospatialQuery, Rectangle };
export { point, rectangle };

declare global {
  const Convex: Record<string, unknown>;
}
if (typeof Convex === "undefined") {
  throw new Error(
    "this is Convex backend code, but it's running somewhere else!",
  );
}

export const DEFAULT_MIN_LEVEL = 4;
export const DEFAULT_MAX_LEVEL = 16;
export const DEFAULT_MAX_CELLS = 8;
export const DEFAULT_LEVEL_MOD = 2;

export type GeospatialFilters = Record<string, Primitive | Primitive[]>;
export type GeospatialDocument<
  Key extends string = string,
  Filters extends GeospatialFilters = GeospatialFilters,
> = {
  key: Key;
  coordinates: Point;
  filterKeys: Filters;
  sortKey: number;
};

export type NearestQueryOptions<
  Doc extends GeospatialDocument = GeospatialDocument,
> = {
  point: Point;
  limit: number;
  maxDistance?: number;
  filter?: NonNullable<GeospatialQuery<Doc>["filter"]>;
};

/**
 * @deprecated Use `NearestQueryOptions` with `nearest` instead.
 */
export type QueryNearestOptions<
  Doc extends GeospatialDocument = GeospatialDocument,
> = Pick<NearestQueryOptions<Doc>, "maxDistance" | "filter">;

export interface GeospatialIndexOptions {
  /**
   * The minimum S2 cell level to use when querying. Defaults to 4.
   */
  minLevel?: number;
  /**
   * The maximum S2 cell level to use when querying. Defaults to 16.
   */
  maxLevel?: number;
  /**
   * The distance between levels when indexing, implying a branching factor of `4^levelMod`. Defaults to 2.
   */
  levelMod?: number;
  /**
   * The maximum number of cells to use when querying. Defaults to 8.
   */
  maxCells?: number;
  /**
   * The log level to use when logging. Defaults to the `GEOSPATIAL_LOG_LEVEL` environment variable, or "INFO" if not set.
   */
  logLevel?: LogLevel;
}

export class GeospatialIndex<
  Key extends string = string,
  Filters extends GeospatialFilters = GeospatialFilters,
> {
  logLevel: LogLevel;

  minLevel: number;
  maxLevel: number;
  levelMod: number;
  maxCells: number;

  /**
   * Create a new geospatial index, powered by S2 and Convex. This index maps unique string keys to geographic coordinates
   * on the Earth's surface, with the ability to efficiently query for all keys within a given geographic area.
   *
   * @param component - The registered geospatial index from `components`.
   * @param options - The options to configure the index.
   */
  constructor(
    private component: ComponentApi,
    options?: GeospatialIndexOptions,
  ) {
    let DEFAULT_LOG_LEVEL: LogLevel = "INFO";
    if (process.env.GEOSPATIAL_LOG_LEVEL) {
      if (
        !["DEBUG", "INFO", "WARN", "ERROR"].includes(
          process.env.GEOSPATIAL_LOG_LEVEL,
        )
      ) {
        console.warn(
          `Invalid log level (${process.env.GEOSPATIAL_LOG_LEVEL}), defaulting to "INFO"`,
        );
      }
      DEFAULT_LOG_LEVEL = process.env.GEOSPATIAL_LOG_LEVEL as LogLevel;
    }
    this.logLevel = options?.logLevel ?? DEFAULT_LOG_LEVEL;
    this.minLevel = options?.minLevel ?? DEFAULT_MIN_LEVEL;
    this.maxLevel = options?.maxLevel ?? DEFAULT_MAX_LEVEL;
    this.levelMod = options?.levelMod ?? DEFAULT_LEVEL_MOD;
    this.maxCells = options?.maxCells ?? DEFAULT_MAX_CELLS;
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
    key: Key,
    coordinates: Point,
    filterKeys: Filters,
    sortKey?: number,
  ) {
    await ctx.runMutation(this.component.document.insert, {
      document: {
        key,
        coordinates,
        filterKeys,
        sortKey: sortKey ?? Math.random(),
      },
      minLevel: this.minLevel,
      maxLevel: this.maxLevel,
      levelMod: this.levelMod,
      maxCells: this.maxCells,
    });
  }

  /**
   * Retrieve the coordinate associated with a specific key.
   *
   * @param ctx - The Convex query context.
   * @param key - The unique string key to retrieve the coordinate for.
   * @returns - The geographic coordinate `{ latitude, longitude }` associated with the key, or `null` if the key is not found.
   */
  async get(
    ctx: QueryCtx,
    key: Key,
  ): Promise<GeospatialDocument<Key, Filters> | null> {
    const result = await ctx.runQuery(this.component.document.get, { key });
    return result as GeospatialDocument<Key, Filters> | null;
  }

  /**
   * Remove a key-coordinate pair from the index.
   *
   * @param ctx - The Convex mutation context.
   * @param key - The unique string key to remove from the index.
   * @returns - `true` if the key was found and removed, `false` otherwise.
   */
  async remove(ctx: MutationCtx, key: Key): Promise<boolean> {
    return await ctx.runMutation(this.component.document.remove, {
      key,
      minLevel: this.minLevel,
      maxLevel: this.maxLevel,
      levelMod: this.levelMod,
      maxCells: this.maxCells,
    });
  }

  /**
   * Query for keys within a given shape.
   *
   * @param ctx - The Convex query context.
   * @param query - The query to execute.
   * @param cursor - The continuation cursor to use for paginating through results.
   * @returns - An array of objects with the key-coordinate pairs and optionally a continuation cursor.
   */
  async query(
    ctx: QueryCtx,
    query: GeospatialQuery<GeospatialDocument<Key, Filters>>,
    cursor: string | undefined = undefined,
  ) {
    const filterBuilder = new FilterBuilderImpl<
      GeospatialDocument<Key, Filters>
    >();
    if (query.filter) {
      query.filter(filterBuilder);
    }
    const resp = await ctx.runQuery(this.component.query.execute, {
      query: {
        rectangle: query.shape.rectangle,
        filtering: filterBuilder.filterConditions,
        sorting: { interval: filterBuilder.interval ?? {} },
        maxResults: query.limit ?? 64,
      },
      cursor,
      minLevel: this.minLevel,
      maxLevel: this.maxLevel,
      levelMod: this.levelMod,
      maxCells: this.maxCells,
      logLevel: this.logLevel,
    });
    return resp as {
      results: { key: Key; coordinates: Point }[];
      nextCursor?: string;
    };
  }

  /**
   * Query for the nearest points to a given point.
   *
   * @param ctx - The Convex query context.
   * @param options - The nearest query parameters.
   * @returns - An array of objects with the key-coordinate pairs and their distance from the query point in meters.
   */
  async nearest(
    ctx: QueryCtx,
    {
      point,
      limit,
      maxDistance,
      filter,
    }: NearestQueryOptions<GeospatialDocument<Key, Filters>>,
  ) {
    const filterBuilder = new FilterBuilderImpl<
      GeospatialDocument<Key, Filters>
    >();
    if (filter) {
      filter(filterBuilder);
    }

    const resp = await ctx.runQuery(this.component.query.nearestPoints, {
      point,
      maxDistance,
      maxResults: limit,
      minLevel: this.minLevel,
      maxLevel: this.maxLevel,
      levelMod: this.levelMod,
      logLevel: this.logLevel,
      filtering: filterBuilder.filterConditions,
      sorting: { interval: filterBuilder.interval ?? {} },
    });
    return resp as { key: Key; coordinates: Point; distance: number }[];
  }

  /**
   * Query for the nearest points to a given point.
   *
   * @deprecated Use `nearest(ctx, { point, limit, maxDistance, filter })` instead.
   */
  async queryNearest(
    ctx: QueryCtx,
    point: Point,
    maxResults: number,
    maxDistance?: number,
  ) {
    return this.nearest(ctx, {
      point,
      limit: maxResults,
      maxDistance,
    });
  }

  /**
   * Debug the S2 cells that would be queried for a given rectangle.
   *
   * @param ctx - The Convex query context.
   * @param rectangle - The geographic area to query.
   * @param maxResolution - The maximum resolution to use when querying.
   * @returns - An array of S2 cell identifiers and their vertices.
   */
  async debugCells(
    ctx: QueryCtx,
    rectangle: Rectangle,
    maxResolution?: number,
  ): Promise<{ token: string; vertices: Point[] }[]> {
    const resp = await ctx.runQuery(this.component.query.debugCells, {
      rectangle,
      minLevel: this.minLevel,
      maxLevel: maxResolution ?? this.maxLevel,
      levelMod: this.levelMod,
      maxCells: this.maxCells,
    });
    return resp;
  }
}

export type FilterValue<
  Doc extends GeospatialDocument,
  FieldName extends keyof Doc["filterKeys"],
> = ExtractArray<Doc["filterKeys"][FieldName]>;

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

export type FilterObject<Doc extends GeospatialDocument> = {
  [K in keyof Doc["filterKeys"] & string]: {
    filterKey: K;
    filterValue: ExtractArray<Doc["filterKeys"][K]>;
    occur: "should" | "must";
  };
}[keyof Doc["filterKeys"] & string];

type ExtractArray<T> = T extends (infer U)[] ? U : T;
