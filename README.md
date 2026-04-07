# Convex Geospatial Index (Beta)

[![npm version](https://badge.fury.io/js/@convex-dev%2Fgeospatial.svg)](https://badge.fury.io/js/@convex-dev%2Fgeospatial)

![image](https://frugal-mandrill-176.convex.cloud/api/storage/8fb21c7f-441c-4ce9-9abb-925c31e9faab)

<!-- START: Include on https://convex.dev/components -->

This component adds a geospatial index to Convex, allowing you to efficiently
store and query points on the Earth's surface.

- Insert points into the geospatial key value store along with their geographic
  coordinates.
- Efficiently query for all points within a rectangle or polygon on the sphere.
- Control the sort order for the results with a custom sorting key.
- Filter query results with equality and `IN` clauses.
- Store polygons and polylines as first-class indexed geometries.
- Query for geometries that contain a point, intersect a shape, or are within a
  distance.
- Calculate area, perimeter, length, and centroids of geometries.
- And since it's built on Convex, everything is automatically consistent,
  reactive, and cached!

This component is currently in beta. It's missing some functionality, but what's
there should work. We've tested the example app up to about 1,000,000 points, so
reach out if you're using a much larger dataset. If you find a bug or have a
feature request, you can
[file it here](https://github.com/get-convex/geospatial/issues).

## Pre-requisite: Convex

You'll need an existing Convex project to use the component. Convex is a hosted
backend platform, including a database, serverless functions, and a ton more you
can learn about [here](https://docs.convex.dev/get-started).

Run `npm create convex` or follow any of the
[quickstarts](https://docs.convex.dev/home) to set one up.

## Installation

First, add `@convex-dev/geospatial` to your Convex project:

```bash
npm install @convex-dev/geospatial
```

Then, install the component into your Convex project within the
`convex/convex.config.ts` file:

```ts
// convex/convex.config.ts
import geospatial from "@convex-dev/geospatial/convex.config.js";
import { defineApp } from "convex/server";

const app = defineApp();
app.use(geospatial);

export default app;
```

Finally, create a new `GeospatialIndex` within your `convex/` folder, and point
it to the installed component:

```ts
// convex/index.ts
import { GeospatialIndex } from "@convex-dev/geospatial";
import { components } from "./_generated/api";

const geospatial = new GeospatialIndex(components.geospatial);
```

## Inserting points

After installing the component, you can `insert`, `get`, and `remove` points
from the index. You can specify a `filterKeys` record for filtering at query
time and optionally a `sortKey` for the query result order. We currently only
support ascending order on the `sortKey`.

```ts
// convex/index.ts

const example = mutation({
  handler: async (ctx) => {
    const cityId = await ctx.db.insert("cities", {...});
    await geospatial.insert(
      ctx,
      "American Museum of Natural History",
      {
        latitude: 40.7813,
        longitude: -73.9737,
      },
      { category: "museum" },
      28.0, // Price used as the sort key
    );
    const result = await geospatial.get(ctx, cityId);
    await geospatial.remove(ctx, cityId);
  },
});
```

If you would like some more typesafety, you can specify a type argument for the
`GeospatialIndex` class. This will also provide you with auto-complete for the
`filterKeys` and `sortKey` parameters. Above the key was "American Museum of
Natural History" but most commonly the `key` will be an ID in another table of
yours.

```ts
// convex/index.ts
import { GeospatialIndex, Point } from "@convex-dev/geospatial";
import { components } from "./_generated/api";
import { Id } from "./_generated/dataModel";

export const geospatial = new GeospatialIndex<
  Id<"museums">,
  { category: string; anotherFilter?: number }
>(components.geospatial);
```

## Querying points within a shape

After inserting some points, you can query them with the `query` API.

```ts
// convex/index.ts

const example = query({
  handler: async (ctx) => {
    const rectangle = {
      west: -73.9712,
      south: 40.7831,
      east: -72.9712,
      north: 41.7831,
    };
    const result = await geospatial.query(ctx, {
      shape: { type: "rectangle", rectangle },
      limit: 16,
    });
    return result;
  },
});
```

The legacy `queryNearest` helper now delegates to `nearest` and is deprecated.
It only accepts a `maxDistance` numeric argument for backwards compatibility.
New integrations should prefer `nearest`.

This query will find all points that lie within the query rectangle, sort them
in ascending `sortKey` order, and return at most 16 results.

You can also query within arbitrary polygon shapes:

```ts
// convex/index.ts

const example = query({
  handler: async (ctx) => {
    const polygon = {
      exterior: [
        { latitude: 40.7831, longitude: -73.9712 },
        { latitude: 40.7931, longitude: -73.9612 },
        { latitude: 40.7731, longitude: -73.9512 },
      ],
    };
    const result = await geospatial.query(ctx, {
      shape: { type: "polygon", polygon },
      limit: 16,
    });
    return result;
  },
});
```

Polygons are defined by an `exterior` ring of points. The winding order doesn't
matter—the library will automatically normalize it.

You can also query for points within a buffer distance of a polyline (useful for
route-based searches):

```ts
// convex/index.ts

const example = query({
  handler: async (ctx) => {
    const route = [
      { latitude: 40.7128, longitude: -74.006 }, // NYC
      { latitude: 40.7589, longitude: -73.9851 }, // Midtown
      { latitude: 40.7831, longitude: -73.9712 }, // Upper East
    ];
    const result = await geospatial.query(ctx, {
      shape: {
        type: "polyline",
        polyline: route,
        bufferMeters: 500, // 500m corridor
      },
      limit: 16,
    });
    return result;
  },
});
```

This finds all points within 500 meters of the route path.

You can optionally add filter conditions to queries.

The first type of filter condition is an `in()` filter, which requires that a
matching document have a filter field with a value in a specified set.

```ts
// convex/index.ts

const example = query({
  handler: async (ctx) => {
    const rectangle = {
      west: -73.9712,
      south: 40.7831,
      east: -72.9712,
      north: 41.7831,
    };
    const result = await geospatial.query(ctx, {
      shape: { type: "rectangle", rectangle },
      filter: (q) => q.in("category", ["museum", "restaurant"]),
    });
    return result;
  },
});
```

The second type of filter condition is an `eq()` filter, which requires that a
matching document have a filter field with a value equal to a specified value.

```ts
// convex/index.ts

const example = query({
  handler: async (ctx) => {
    const result = await geospatial.query(ctx, {
      shape: { type: "rectangle", rectangle },
      filter: (q) => q.eq("category", "museum"),
    });
    return result;
  },
});
```

The final type of filter condition allows you to specify ranges over the
`sortKey`. We currently only support (optional) inclusive lower bounds and
exclusive upper bounds.

```ts
// convex/index.ts

const example = query({
  handler: async (ctx) => {
    const rectangle = {
      west: -73.9712,
      south: 40.7831,
      east: -72.9712,
      north: 41.7831,
    };
    const result = await geospatial.query(ctx, {
      shape: { type: "rectangle", rectangle },
      filter: (q) => q.gte("sortKey", 10).lt("sortKey", 30),
    });
    return result;
  },
});
```

Queries take in a `limit`, which bounds the maximum number of rows returned. If
this limit is hit, the query will return a `nextCursor` for continuation. The
query may also return a `nextCursor` with fewer than `limit` results if it runs
out of its IO budget while executing.

In either case, you can continue the stream by passing `nextCursor` to the next
call's `cursor` parameter.

```ts
// convex/index.ts

const example = query({
  handler: async (ctx) => {
    const rectangle = {
      west: -73.9712,
      south: 40.7831,
      east: -72.9712,
      north: 41.7831,
    };
    const startCursor = undefined;
    const result = await geospatial.query(
      ctx,
      {
        shape: { type: "rectangle", rectangle },
        limit: 16,
      },
      startCursor,
    );
    if (result.nextCursor) {
      // Continue the query, starting from the first query's cursor.
      const nextResult = await geospatial.query(
        ctx,
        {
          shape: { type: "rectangle", rectangle },
          limit: 16,
        },
        result.nextCursor,
      );
      return [...result.results, ...nextResult.results];
    }
    return result.results; // { key, coordinates }[]
  },
});
```

**Note: you typically pass the `nextCursor` in from a client that is paginating
through results, to avoid loading too much data in a single query.**

## Querying the points nearest a query point

You can also query for the points closest to a given point, optionally limiting
to a maximum distance (in meters).

```ts
// convex/index.ts

const example = query({
  handler: async (ctx) => {
    const maxResults = 16;
    const maxDistance = 10000;
    const result = await geospatial.nearest(ctx, {
      point: { latitude: 40.7813, longitude: -73.9737 },
      limit: maxResults,
      maxDistance,
      filter: (q) => q.eq("category", "coffee"),
    });
    return result;
  },
});
```

The second argument is an options object containing `point`, `limit`, and
optionally `maxDistance` and `filter`. You can combine `maxDistance` with the
same filter builder used by `query`, including `eq`, `in`, `gte`, and `lt`
conditions. These filters are enforced through the indexed `pointsByFilterKey`
range before documents are loaded, so the database does the heavy lifting and
the query avoids reading unrelated points. Pairing that with a sensible
`maxDistance` further constrains the search space and can greatly speed up
searching the index.

## Storing geometries (polygons and polylines)

In addition to indexing points, you can store polygons and polylines as
first-class indexed geometries. This enables queries like "which delivery zones
contain this address?" or "which transit routes pass near this location?"

```ts
// convex/index.ts

const example = mutation({
  handler: async (ctx) => {
    // Store a polygon (e.g., a delivery zone)
    await geospatial.insertPolygon(
      ctx,
      "zone-manhattan",
      {
        exterior: [
          { latitude: 40.7, longitude: -74.02 },
          { latitude: 40.7, longitude: -73.97 },
          { latitude: 40.82, longitude: -73.97 },
          { latitude: 40.82, longitude: -74.02 },
        ],
      },
      { type: "delivery-zone", region: "nyc" },
    );

    // Store a polyline (e.g., a transit route)
    await geospatial.insertPolyline(
      ctx,
      "route-a-train",
      [
        { latitude: 40.7128, longitude: -74.006 },
        { latitude: 40.7589, longitude: -73.9851 },
        { latitude: 40.8448, longitude: -73.8648 },
      ],
      { type: "subway", line: "A" },
    );

    // Update or remove geometries
    await geospatial.updateGeometry(ctx, "zone-manhattan", undefined, {
      type: "delivery-zone",
      active: true,
    });
    await geospatial.removeGeometry(ctx, "route-a-train");
  },
});
```

### Querying geometries

Find all polygons that contain a given point:

```ts
const example = query({
  handler: async (ctx) => {
    const { results } = await geospatial.containsPoint(
      ctx,
      { latitude: 40.7580, longitude: -73.9855 }, // Times Square
      { type: "delivery-zone" }, // Optional filter
    );
    return results; // All delivery zones containing this point
  },
});
```

Find geometries that intersect a given shape:

```ts
const example = query({
  handler: async (ctx) => {
    const { results } = await geospatial.intersects(ctx, {
      type: "rectangle",
      rectangle: { south: 40.7, north: 40.8, west: -74.0, east: -73.9 },
    });
    return results; // All geometries overlapping this rectangle
  },
});
```

Find geometries within a distance of a point:

```ts
const example = query({
  handler: async (ctx) => {
    const { results } = await geospatial.geometriesNear(
      ctx,
      { latitude: 40.7580, longitude: -73.9855 },
      5000, // 5km radius
    );
    // Results include distance in meters, sorted by proximity
    return results;
  },
});
```

## Geometry measurements

Calculate area, perimeter, length, and centroids of geometries:

```ts
const example = query({
  handler: async (ctx) => {
    const polygon = {
      exterior: [
        { latitude: 40.7, longitude: -74.0 },
        { latitude: 40.7, longitude: -73.9 },
        { latitude: 40.8, longitude: -73.9 },
        { latitude: 40.8, longitude: -74.0 },
      ],
    };

    // Polygon measurements
    const area = await geospatial.polygonArea(ctx, polygon); // square meters
    const perimeter = await geospatial.polygonPerimeter(ctx, polygon); // meters
    const centroid = await geospatial.polygonCentroid(ctx, polygon); // { latitude, longitude }

    // Polyline measurements
    const route = [
      { latitude: 40.7128, longitude: -74.006 },
      { latitude: 40.7589, longitude: -73.9851 },
    ];
    const length = await geospatial.polylineLength(ctx, route); // meters
    const routeCentroid = await geospatial.polylineCentroid(ctx, route);

    return { area, perimeter, centroid, length, routeCentroid };
  },
});
```

All measurements use spherical great-circle calculations on the Earth's surface
(approximating Earth as a sphere for performance and robustness). For most
applications, this provides sufficient accuracy. If you need exact WGS84
ellipsoidal geodesics, consider using a dedicated geodesy library like
[GeographicLib](https://geographiclib.sourceforge.io/).

## Example

See [`example/`](./example/) for a full example with a
[Leaflet](https://leafletjs.com/)-based frontend.

## Development

Install dependencies and fire up the example app to get started.

```bash
npm install
cd example
npm install
npm run dev
```

The component definition is in `src/` and reflects what users of the component
will install. The example app, which is entirely independent, lives in
`example/`.

<!-- END: Include on https://convex.dev/components -->
