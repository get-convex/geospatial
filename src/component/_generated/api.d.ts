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

import type * as geo2 from "../geo2.js";
import type * as geo2query from "../geo2query.js";
import type * as index from "../index.js";
import type * as lib_d64 from "../lib/d64.js";
import type * as lib_geometry from "../lib/geometry.js";
import type * as lib_interval from "../lib/interval.js";
import type * as lib_primitive from "../lib/primitive.js";
import type * as lib_tupleKey from "../lib/tupleKey.js";
import type * as lib_zigzag from "../lib/zigzag.js";
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
  geo2: typeof geo2;
  geo2query: typeof geo2query;
  index: typeof index;
  "lib/d64": typeof lib_d64;
  "lib/geometry": typeof lib_geometry;
  "lib/interval": typeof lib_interval;
  "lib/primitive": typeof lib_primitive;
  "lib/tupleKey": typeof lib_tupleKey;
  "lib/zigzag": typeof lib_zigzag;
  types: typeof types;
}>;
export type Mounts = {
  geo2: {
    deleteDocument: FunctionReference<
      "mutation",
      "public",
      { key: string; maxResolution: number },
      any
    >;
    getDocument: FunctionReference<
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
    insertDocument: FunctionReference<
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
  };
  geo2query: {
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
    queryDocuments: FunctionReference<
      "query",
      "public",
      {
        maxResolution: number;
        query: {
          filtering: Array<{
            filterKey: string;
            filterValue:
              | string
              | number
              | boolean
              | ArrayBuffer
              | null
              | bigint;
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
      Array<{
        coordinates: { latitude: number; longitude: number };
        key: string;
      }>
    >;
  };
  index: {
    get: FunctionReference<
      "query",
      "public",
      { key: string },
      { latitude: number; longitude: number } | null
    >;
    insert: FunctionReference<
      "mutation",
      "public",
      {
        coordinates: { latitude: number; longitude: number };
        key: string;
        maxResolution: number;
      },
      null
    >;
    queryRectangle: FunctionReference<
      "query",
      "public",
      {
        maxResolution: number;
        maxRows: number;
        rectangle: {
          ne: { latitude: number; longitude: number };
          nw: { latitude: number; longitude: number };
          se: { latitude: number; longitude: number };
          sw: { latitude: number; longitude: number };
        };
      },
      {
        h3Cells: Array<string>;
        results: Array<{
          coordinates: { latitude: number; longitude: number };
          key: string;
        }>;
      }
    >;
    remove: FunctionReference<
      "mutation",
      "public",
      { key: string; maxResolution: number },
      boolean
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
