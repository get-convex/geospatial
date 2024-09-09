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

import type * as geometry from "../geometry.js";
import type * as index from "../index.js";
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
  geometry: typeof geometry;
  index: typeof index;
  types: typeof types;
}>;
declare const fullApiWithMounts: typeof fullApi & {
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
        rectangle: Array<{ latitude: number; longitude: number }>;
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

export declare const api: FilterApi<
  typeof fullApiWithMounts,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApiWithMounts,
  FunctionReference<any, "internal">
>;

/* prettier-ignore-end */
