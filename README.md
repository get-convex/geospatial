# Geospatial Index (Beta)

![image](https://github.com/user-attachments/assets/864c1785-37fc-4662-841c-a35238792bf4)

This component adds a geospatial index to Convex, allowing you to efficiently store and query points on the Earth's surface.
After installing this component, your Convex deployment will have a key value store that maps string keys to geographic
coordinates. Then, after inserting in this store, you can efficiently search for all points within a given geographic region.

This component is currently in beta. It's missing some functionality, but what's there should work. We've tested the example
app up to about _300,000_ points, so reach out if you're using a much larger dataset.

## Installation

First, add `@convex-dev/geospatial-index` to your Convex project:

```bash
npm install @convex-dev/geospatial-index
```

Then, install the component into your Convex project within the `convex/convex.config.ts` file:

```ts
// convex/convex.config.ts
import geospatialIndex from "@convex-dev/geospatial-index/component";
import { defineApp } from "convex/server";

const app = defineApp();
app.use(geospatialIndex);
export default app;
```

Finally, create a new `GeospatialIndex` within your `convex/` folder, and point it to the installed component:

```ts
// convex/index.ts
import { GeospatialIndex } from "@convex-dev/geospatial-index/client";
import { components } from "./_generated/server";

const geospatialIndex = new GeospatialIndex(components.geospatialIndex);
```

## Inserting points

After installing the component, you can `insert`, `get`, and `remove` points from the index. You can specify
a `filterKeys` record for filtering at query time and optionally a `sortKey` for the query result order. We
currently only support ascending order on the `sortKey`.

```ts
// convex/index.ts

const example = mutation(async (ctx) => {
  await geospatialIndex.insert(
    ctx,
    "example",
    {
      latitude: 40.7831,
      longitude: -73.9712,
    },
    { filterExample: "hi" },
    10.17,
  );
  const result = await geospatialIndex.get(ctx, "example");
  await geospatialIndex.remove(ctx, "example");
});
```

If you would like some more typesafety, you can specify a type argument for the `GeospatialIndex` class. This
will also provide you with auto-complete for the `filterKeys` and `sortKey` parameters.

```ts
// convex/index.ts
import { GeospatialIndex } from "@convex-dev/geospatial-index/client";
import { components } from "./_generated/server";
import type { Point, Primitive, Rectangle } from "../component/types.js";

type MyDocument = {
  key: "some" | "string" | "subtype";
  coordinates: Point;
  filterKeys: { filterExample: string; anotherExample?: number };
  sortKey: number;
};

const geospatialIndex = new GeospatialIndex<MyDocument>(
  components.geospatialIndex,
);
```

## Querying points

After inserting some points, you can query them with the `queryRectangle` API. Pass in the four corners of
a given rectangle, and the API will return a list of points within that region:

```ts
// convex/index.ts

const example = query(async (ctx) => {
  const rectangle = {
    sw: { latitude: 40.7831, longitude: -73.9712 },
    nw: { latitude: 40.7831, longitude: -72.9712 },
    ne: { latitude: 41.7831, longitude: -72.9712 },
    se: { latitude: 41.7831, longitude: -73.9712 },
  };
  const result = await geospatialIndex.queryRectangle(ctx, rectangle);
  return result;
});
```

You can optionally add filter conditions to queries. There are two types of filters you can apply:

1. "should" filters: At least one of all of the "should" filter conditions must apply.
2. "must" filters: All of the "must" filter conditions must apply.

```ts
// convex/index.ts

const example = query(async (ctx) => {
  const rectangle = {
    sw: { latitude: 40.7831, longitude: -73.9712 },
    nw: { latitude: 40.7831, longitude: -72.9712 },
    ne: { latitude: 41.7831, longitude: -72.9712 },
    se: { latitude: 41.7831, longitude: -73.9712 },
  };
  const result = await geospatialIndex.queryRectangle(ctx, rectangle, [
    { filterKey: "filterExample", filterValue: "hi", occur: "should" },
    { filterKey: "anotherExample", filterValue: 10, occur: "must" },
  ]);
  return result;
});
```

Queries can also specify a range over the sorting key. We currently only support (optional) inclusive lower bounds
and exclusive upper bounds.

```ts
// convex/index.ts

const example = query(async (ctx) => {
  const rectangle = {
    sw: { latitude: 40.7831, longitude: -73.9712 },
    nw: { latitude: 40.7831, longitude: -72.9712 },
    ne: { latitude: 41.7831, longitude: -72.9712 },
    se: { latitude: 41.7831, longitude: -73.9712 },
  };
  const result = await geospatialIndex.queryRectangle(
    ctx,
    rectangle,
    [],
    { startInclusive: 10, endExclusive: 20 },
    undefined,
    64,
  );
  return result;
});
```

Queries take in a `maxRows` parameter, which limits the maximum number of rows returned. If this limit is hit,
the query will return a `nextCursor` for continuation.

The query may also return a `nextCursor` with fewer than `maxRows` results if it runs out of its IO budget
while executing.

In either case, you can continue the stream by passing `nextCursor` to the next call's `cursor` parameter.

```ts
// convex/index.ts

const example = query(async (ctx) => {
  const rectangle = {
    sw: { latitude: 40.7831, longitude: -73.9712 },
    nw: { latitude: 40.7831, longitude: -72.9712 },
    ne: { latitude: 41.7831, longitude: -72.9712 },
    se: { latitude: 41.7831, longitude: -73.9712 },
  };
  const startCursor = undefined;
  const result = await geospatialIndex.queryRectangle(
    ctx,
    rectangle,
    [],
    { startInclusive: 10, endExclusive: 20 },
    startCursor,
    64,
  );
  if (result.nextCursor) {
    // Continue the query, starting from the first query's cursor.
    const nextResult = await geospatialIndex.queryRectangle(
      ctx,
      rectangle,
      [],
      { startInclusive: 10, endExclusive: 20 },
      result.nextCursor,
      64,
    );
  }
  return result;
});
```

## Example

See `example/` for a full example with a [Leaflet](https://leafletjs.com/)-based frontend.

## Development

Install dependencies and fire up the example app to get started.

```bash
npm install
cd example
npm install
npm run dev
```

The component definition is in `src/` and reflects what users of the component will install. The example app,
which is entirely independent, lives in `example/`.
