/* prettier-ignore-start */

/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as document from "../document.js";
import type * as lib_approximateCounter from "../lib/approximateCounter.js";
import type * as lib_d64 from "../lib/d64.js";
import type * as lib_goRuntime from "../lib/goRuntime.js";
import type * as lib_interval from "../lib/interval.js";
import type * as lib_logging from "../lib/logging.js";
import type * as lib_pointQuery from "../lib/pointQuery.js";
import type * as lib_primitive from "../lib/primitive.js";
import type * as lib_s2Bindings from "../lib/s2Bindings.js";
import type * as lib_s2wasm from "../lib/s2wasm.js";
import type * as lib_tupleKey from "../lib/tupleKey.js";
import type * as lib_xxhash from "../lib/xxhash.js";
import type * as query from "../query.js";
import type * as streams_cellRange from "../streams/cellRange.js";
import type * as streams_databaseRange from "../streams/databaseRange.js";
import type * as streams_filterKeyRange from "../streams/filterKeyRange.js";
import type * as streams_intersection from "../streams/intersection.js";
import type * as streams_union from "../streams/union.js";
import type * as streams_zigzag from "../streams/zigzag.js";
import type * as types from "../types.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  document: typeof document;
  "lib/approximateCounter": typeof lib_approximateCounter;
  "lib/d64": typeof lib_d64;
  "lib/goRuntime": typeof lib_goRuntime;
  "lib/interval": typeof lib_interval;
  "lib/logging": typeof lib_logging;
  "lib/pointQuery": typeof lib_pointQuery;
  "lib/primitive": typeof lib_primitive;
  "lib/s2Bindings": typeof lib_s2Bindings;
  "lib/s2wasm": typeof lib_s2wasm;
  "lib/tupleKey": typeof lib_tupleKey;
  "lib/xxhash": typeof lib_xxhash;
  query: typeof query;
  "streams/cellRange": typeof streams_cellRange;
  "streams/databaseRange": typeof streams_databaseRange;
  "streams/filterKeyRange": typeof streams_filterKeyRange;
  "streams/intersection": typeof streams_intersection;
  "streams/union": typeof streams_union;
  "streams/zigzag": typeof streams_zigzag;
  types: typeof types;
}>;
export type Mounts = {
  document: {
    get: FunctionReference<
      "query",
      "public",
      { key: string },
      {
        coordinates: { latitude: number; longitude: number };
        filterKeys: Record<
          string,
          | string
          | number
          | boolean
          | null
          | bigint
          | Array<string | number | boolean | null | bigint>
        >;
        key: string;
        sortKey: number;
      } | null
    >;
    insert: FunctionReference<
      "mutation",
      "public",
      {
        document: {
          coordinates: { latitude: number; longitude: number };
          filterKeys: Record<
            string,
            | string
            | number
            | boolean
            | null
            | bigint
            | Array<string | number | boolean | null | bigint>
          >;
          key: string;
          sortKey: number;
        };
        levelMod: number;
        maxCells: number;
        maxLevel: number;
        minLevel: number;
      },
      null
    >;
    remove: FunctionReference<
      "mutation",
      "public",
      {
        key: string;
        levelMod: number;
        maxCells: number;
        maxLevel: number;
        minLevel: number;
      },
      boolean
    >;
  };
  query: {
    debugCells: FunctionReference<
      "query",
      "public",
      {
        levelMod: number;
        maxCells: number;
        maxLevel: number;
        minLevel: number;
        rectangle: { east: number; north: number; south: number; west: number };
      },
      Array<{
        token: string;
        vertices: Array<{ latitude: number; longitude: number }>;
      }>
    >;
    execute: FunctionReference<
      "query",
      "public",
      {
        cursor?: string;
        levelMod: number;
        logLevel: "DEBUG" | "INFO" | "WARN" | "ERROR";
        maxCells: number;
        maxLevel: number;
        minLevel: number;
        query: {
          filtering: Array<{
            filterKey: string;
            filterValue: string | number | boolean | null | bigint;
            occur: "should" | "must";
          }>;
          maxResults: number;
          rectangle: {
            east: number;
            north: number;
            south: number;
            west: number;
          };
          sorting: {
            interval: { endExclusive?: number; startInclusive?: number };
          };
        };
      },
      {
        nextCursor?: string;
        results: Array<{
          coordinates: { latitude: number; longitude: number };
          key: string;
        }>;
      }
    >;
    nearestPoints: FunctionReference<
      "query",
      "public",
      {
        levelMod: number;
        logLevel: "DEBUG" | "INFO" | "WARN" | "ERROR";
        maxDistance?: number;
        maxLevel: number;
        maxResults: number;
        minLevel: number;
        nextCursor?: string;
        point: { latitude: number; longitude: number };
        filtering: Array<{
          filterKey: string;
          filterValue: string | number | boolean | null | bigint;
          occur: "should" | "must";
        }>;
        sorting: {
          interval: { endExclusive?: number; startInclusive?: number };
        };
      },
      Array<{
        coordinates: { latitude: number; longitude: number };
        distance: number;
        key: string;
      }>
    >;
  };
};
// For now fullApiWithMounts is only fullApi which provides
// jump-to-definition in component client code.
// Use Mounts for the same type without the inference.
declare const fullApiWithMounts: typeof fullApi;

export declare const api: FilterApi<
  typeof fullApiWithMounts,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApiWithMounts,
  FunctionReference<any, "internal">
>;

export declare const components: {};

/* prettier-ignore-end */
