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
import type * as streams_constants from "../streams/constants.js";
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
import { anyApi, componentsGeneric } from "convex/server";

const fullApi: ApiFromModules<{
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
  "streams/constants": typeof streams_constants;
  "streams/databaseRange": typeof streams_databaseRange;
  "streams/filterKeyRange": typeof streams_filterKeyRange;
  "streams/intersection": typeof streams_intersection;
  "streams/union": typeof streams_union;
  "streams/zigzag": typeof streams_zigzag;
  types: typeof types;
}> = anyApi as any;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
> = anyApi as any;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
> = anyApi as any;

export const components = componentsGeneric() as unknown as {};
