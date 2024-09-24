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

import type * as counter from "../counter.js";
import type * as document from "../document.js";
import type * as lib_d64 from "../lib/d64.js";
import type * as lib_geometry from "../lib/geometry.js";
import type * as lib_interval from "../lib/interval.js";
import type * as lib_logging from "../lib/logging.js";
import type * as lib_primitive from "../lib/primitive.js";
import type * as lib_tupleKey from "../lib/tupleKey.js";
import type * as query from "../query.js";
import type * as streams_databaseRange from "../streams/databaseRange.js";
import type * as streams_filterKeyRange from "../streams/filterKeyRange.js";
import type * as streams_h3CellRange from "../streams/h3CellRange.js";
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
  counter: typeof counter;
  document: typeof document;
  "lib/d64": typeof lib_d64;
  "lib/geometry": typeof lib_geometry;
  "lib/interval": typeof lib_interval;
  "lib/logging": typeof lib_logging;
  "lib/primitive": typeof lib_primitive;
  "lib/tupleKey": typeof lib_tupleKey;
  query: typeof query;
  "streams/databaseRange": typeof streams_databaseRange;
  "streams/filterKeyRange": typeof streams_filterKeyRange;
  "streams/h3CellRange": typeof streams_h3CellRange;
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
        filterKeys: any;
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
          filterKeys: any;
          key: string;
          sortKey: number;
        };
        maxResolution: number;
      },
      any
    >;
    remove: FunctionReference<
      "mutation",
      "public",
      { key: string; maxResolution: number },
      boolean
    >;
  };
  query: {
    debugH3Cells: FunctionReference<
      "query",
      "public",
      {
        maxResolution: number;
        rectangle: {
          ne: { latitude: number; longitude: number };
          nw: { latitude: number; longitude: number };
          se: { latitude: number; longitude: number };
          sw: { latitude: number; longitude: number };
        };
      },
      Array<string>
    >;
    execute: FunctionReference<
      "query",
      "public",
      {
        cursor?: string;
        logLevel: "DEBUG" | "INFO" | "WARN" | "ERROR";
        maxResolution: number;
        query: {
          filtering: Array<{
            filterKey: string;
            filterValue: string | number | boolean | null | bigint;
            occur: "should" | "must";
          }>;
          maxResults: number;
          rectangle: {
            ne: { latitude: number; longitude: number };
            nw: { latitude: number; longitude: number };
            se: { latitude: number; longitude: number };
            sw: { latitude: number; longitude: number };
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

/* prettier-ignore-end */
