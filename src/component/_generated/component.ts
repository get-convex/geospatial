/* eslint-disable */
/**
 * Generated `ComponentApi` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { FunctionReference } from "convex/server";

/**
 * A utility for referencing a Convex component's exposed API.
 *
 * Useful when expecting a parameter like `components.myComponent`.
 * Usage:
 * ```ts
 * async function myFunction(ctx: QueryCtx, component: ComponentApi) {
 *   return ctx.runQuery(component.someFile.someQuery, { ...args });
 * }
 * ```
 */
export type ComponentApi<Name extends string | undefined = string | undefined> =
  {
    document: {
      get: FunctionReference<
        "query",
        "internal",
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
        } | null,
        Name
      >;
      insert: FunctionReference<
        "mutation",
        "internal",
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
        null,
        Name
      >;
      remove: FunctionReference<
        "mutation",
        "internal",
        {
          key: string;
          levelMod: number;
          maxCells: number;
          maxLevel: number;
          minLevel: number;
        },
        boolean,
        Name
      >;
    };
    geometry: {
      get: FunctionReference<
        "query",
        "internal",
        { key: string },
        {
          boundingBox: {
            east: number;
            north: number;
            south: number;
            west: number;
          };
          coordinates:
            | {
                exterior: Array<{ latitude: number; longitude: number }>;
                holes?: Array<Array<{ latitude: number; longitude: number }>>;
              }
            | Array<{ latitude: number; longitude: number }>;
          filterKeys?: Record<
            string,
            string | number | boolean | null | bigint
          >;
          key: string;
          sortKey: number;
          type: "polygon" | "polyline";
        } | null,
        Name
      >;
      insert: FunctionReference<
        "mutation",
        "internal",
        {
          coordinates:
            | {
                exterior: Array<{ latitude: number; longitude: number }>;
                holes?: Array<Array<{ latitude: number; longitude: number }>>;
              }
            | Array<{ latitude: number; longitude: number }>;
          filterKeys?: Record<
            string,
            string | number | boolean | null | bigint
          >;
          key: string;
          sortKey?: number;
          type: "polygon" | "polyline";
        },
        null,
        Name
      >;
      remove: FunctionReference<
        "mutation",
        "internal",
        { key: string },
        null,
        Name
      >;
      update: FunctionReference<
        "mutation",
        "internal",
        {
          coordinates?:
            | {
                exterior: Array<{ latitude: number; longitude: number }>;
                holes?: Array<Array<{ latitude: number; longitude: number }>>;
              }
            | Array<{ latitude: number; longitude: number }>;
          filterKeys?: Record<
            string,
            string | number | boolean | null | bigint
          >;
          key: string;
          sortKey?: number;
        },
        null,
        Name
      >;
    };
    geometryMeasure: {
      polygonArea: FunctionReference<
        "query",
        "internal",
        {
          polygon: {
            exterior: Array<{ latitude: number; longitude: number }>;
            holes?: Array<Array<{ latitude: number; longitude: number }>>;
          };
        },
        number,
        Name
      >;
      polygonCentroid: FunctionReference<
        "query",
        "internal",
        {
          polygon: {
            exterior: Array<{ latitude: number; longitude: number }>;
            holes?: Array<Array<{ latitude: number; longitude: number }>>;
          };
        },
        { latitude: number; longitude: number },
        Name
      >;
      polygonPerimeter: FunctionReference<
        "query",
        "internal",
        {
          polygon: {
            exterior: Array<{ latitude: number; longitude: number }>;
            holes?: Array<Array<{ latitude: number; longitude: number }>>;
          };
        },
        number,
        Name
      >;
      polylineCentroid: FunctionReference<
        "query",
        "internal",
        { polyline: Array<{ latitude: number; longitude: number }> },
        { latitude: number; longitude: number },
        Name
      >;
      polylineLength: FunctionReference<
        "query",
        "internal",
        { polyline: Array<{ latitude: number; longitude: number }> },
        number,
        Name
      >;
    };
    geometryQuery: {
      containsPoint: FunctionReference<
        "query",
        "internal",
        {
          filterKeys?: Record<
            string,
            string | number | boolean | null | bigint
          >;
          limit?: number;
          point: { latitude: number; longitude: number };
        },
        {
          results: Array<{
            boundingBox: {
              east: number;
              north: number;
              south: number;
              west: number;
            };
            coordinates: {
              exterior: Array<{ latitude: number; longitude: number }>;
              holes?: Array<Array<{ latitude: number; longitude: number }>>;
            };
            key: string;
            type: "polygon";
          }>;
          truncated: boolean;
        },
        Name
      >;
      geometriesNear: FunctionReference<
        "query",
        "internal",
        {
          filterKeys?: Record<
            string,
            string | number | boolean | null | bigint
          >;
          limit?: number;
          maxDistance: number;
          point: { latitude: number; longitude: number };
        },
        {
          results: Array<{
            boundingBox: {
              east: number;
              north: number;
              south: number;
              west: number;
            };
            coordinates:
              | {
                  exterior: Array<{ latitude: number; longitude: number }>;
                  holes?: Array<Array<{ latitude: number; longitude: number }>>;
                }
              | Array<{ latitude: number; longitude: number }>;
            distance: number;
            key: string;
            type: "polygon" | "polyline";
          }>;
          truncated: boolean;
        },
        Name
      >;
      intersects: FunctionReference<
        "query",
        "internal",
        {
          filterKeys?: Record<
            string,
            string | number | boolean | null | bigint
          >;
          limit?: number;
          maxCoveringCells?: number;
          shape:
            | {
                rectangle: {
                  east: number;
                  north: number;
                  south: number;
                  west: number;
                };
                type: "rectangle";
              }
            | {
                polygon: {
                  exterior: Array<{ latitude: number; longitude: number }>;
                  holes?: Array<Array<{ latitude: number; longitude: number }>>;
                };
                type: "polygon";
              };
        },
        {
          results: Array<{
            boundingBox: {
              east: number;
              north: number;
              south: number;
              west: number;
            };
            coordinates:
              | {
                  exterior: Array<{ latitude: number; longitude: number }>;
                  holes?: Array<Array<{ latitude: number; longitude: number }>>;
                }
              | Array<{ latitude: number; longitude: number }>;
            key: string;
            type: "polygon" | "polyline";
          }>;
          truncated: boolean;
        },
        Name
      >;
      list: FunctionReference<
        "query",
        "internal",
        { limit?: number },
        Array<{
          boundingBox: {
            east: number;
            north: number;
            south: number;
            west: number;
          };
          coordinates:
            | {
                exterior: Array<{ latitude: number; longitude: number }>;
                holes?: Array<Array<{ latitude: number; longitude: number }>>;
              }
            | Array<{ latitude: number; longitude: number }>;
          filterKeys?: Record<
            string,
            string | number | boolean | null | bigint
          >;
          key: string;
          type: "polygon" | "polyline";
        }>,
        Name
      >;
    };
    query: {
      debugCells: FunctionReference<
        "query",
        "internal",
        {
          levelMod: number;
          maxCells: number;
          maxLevel: number;
          minLevel: number;
          rectangle: {
            east: number;
            north: number;
            south: number;
            west: number;
          };
        },
        Array<{
          token: string;
          vertices: Array<{ latitude: number; longitude: number }>;
        }>,
        Name
      >;
      execute: FunctionReference<
        "query",
        "internal",
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
            shape:
              | {
                  rectangle: {
                    east: number;
                    north: number;
                    south: number;
                    west: number;
                  };
                  type: "rectangle";
                }
              | {
                  polygon: {
                    exterior: Array<{ latitude: number; longitude: number }>;
                    holes?: Array<
                      Array<{ latitude: number; longitude: number }>
                    >;
                  };
                  type: "polygon";
                }
              | {
                  bufferMeters: number;
                  polyline: Array<{ latitude: number; longitude: number }>;
                  type: "polyline";
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
        },
        Name
      >;
      nearestPoints: FunctionReference<
        "query",
        "internal",
        {
          filtering: Array<{
            filterKey: string;
            filterValue: string | number | boolean | null | bigint;
            occur: "should" | "must";
          }>;
          levelMod: number;
          logLevel: "DEBUG" | "INFO" | "WARN" | "ERROR";
          maxDistance?: number;
          maxLevel: number;
          maxResults: number;
          minLevel: number;
          nextCursor?: string;
          point: { latitude: number; longitude: number };
          sorting: {
            interval: { endExclusive?: number; startInclusive?: number };
          };
        },
        Array<{
          coordinates: { latitude: number; longitude: number };
          distance: number;
          key: string;
        }>,
        Name
      >;
    };
  };
