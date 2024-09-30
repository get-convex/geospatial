# Geospatial Index (Beta)

![image](https://github.com/user-attachments/assets/864c1785-37fc-4662-841c-a35238792bf4)

This component adds a geospatial index to Convex, allowing you to efficiently store and query points on the Earth's surface.
After installing this component, your Convex deployment will have a key value store that maps string keys to geographic
coordinates. Then, after inserting in this store, you can efficiently search for all points within a given geographic region.

Oh, and since it's built on Convex, everything is automatically consistent, reactive, and cached.

This component is currently in beta. It's missing some functionality, but what's there should work. We've tested the example
app up to about 300,000 points, so reach out if you're using a much larger dataset.

## Installation

First, add `@convex-dev/geospatial` to your Convex project:

```bash
npm install @convex-dev/geospatial
```

Then, install the component into your Convex project within the `convex/convex.config.ts` file:

```ts
// convex/convex.config.ts
import geospatial from "@convex-dev/geospatial/convex.config.js";
import { defineApp } from "convex/server";

const app = defineApp();
app.use(geospatial);
export default app;
```

Finally, create a new `GeospatialIndex` within your `convex/` folder, and point it to the installed component:

```ts
// convex/index.ts
import { GeospatialIndex } from "@convex-dev/geospatial";
import { components } from "./_generated/api";

const geospatial = new GeospatialIndex(components.geospatial);
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
  const result = await geospatial.get(ctx, "example");
  await geospatial.remove(ctx, "example");
});
```

If you would like some more typesafety, you can specify a type argument for the `GeospatialIndex` class. This
will also provide you with auto-complete for the `filterKeys` and `sortKey` parameters.

```ts
// convex/index.ts
import { GeospatialIndex, Point } from "@convex-dev/geospatial";
import { components } from "./_generated/api";

type MyDocument = {
  key: "some" | "strings";
  coordinates: Point;
  filterKeys: { filterExample: string; anotherExample?: number };
  sortKey: number;
};

const geospatial = new GeospatialIndex<MyDocument>(components.geospatial);
```

## Querying points

After inserting some points, you can query them with the `query` API.

```ts
// convex/index.ts

const example = query(async (ctx) => {
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
});
```

This query will find all points that lie within the query rectangle, sort them in ascending
`sortKey` order, and return at most 16 results.

You can optionally add filter conditions to queries.

The first type of filter condition is an `in()` filter, which requires that a matching
document have a filter field with a value in a specified set.

```ts
// convex/index.ts

const example = query(async (ctx) => {
  const rectangle = {
    west: -73.9712,
    south: 40.7831,
    east: -72.9712,
    north: 41.7831,
  };
  const result = await geospatialIndex.query(ctx, {
    shape: { type: "rectangle", rectangle },
    filter: (q) => q.in("filterExample", ["hi", "bye"]),
  });
  return result;
});
```

The second type of filter condition is an `eq()` filter, which requires that a matching
document have a filter field with a value equal to a specified value.

```ts
// convex/index.ts

const example = query(async (ctx) => {
  const result = await geospatialIndex.query(ctx, {
    shape: { type: "rectangle", rectangle },
    filter: (q) => q.eq("filterExample", "hi"),
  });
  return result;
});
```

The final type of filter condition allows you to specify ranges over the `sortKey`. We currently only support (optional) inclusive lower bounds and exclusive upper bounds.

```ts
// convex/index.ts

const example = query(async (ctx) => {
  const rectangle = {
    west: -73.9712,
    south: 40.7831,
    east: -72.9712,
    north: 41.7831,
  };
  const result = await geospatialIndex.query(ctx, {
    shape: { type: "rectangle", rectangle },
    filter: (q) => q.gte("sortKey", 10).lt("sortKey", 20),
  });
  return result;
});
```

Queries take in a `limit`, which bounds the maximum number of rows returned. If this limit is hit,
the query will return a `nextCursor` for continuation. The query may also return a `nextCursor` with fewer than `limit` results if it runs out of its IO budget while executing.

In either case, you can continue the stream by passing `nextCursor` to the next call's `cursor` parameter.

```ts
// convex/index.ts

const example = query(async (ctx) => {
  const rectangle = {
    west: -73.9712,
    south: 40.7831,
    east: -72.9712,
    north: 41.7831,
  };
  const startCursor = undefined;
  const result = await geospatialIndex.query(
    ctx,
    {
      shape: { type: "rectangle", rectangle },
      limit: 16,
    },
    startCursor,
  );
  if (result.nextCursor) {
    // Continue the query, starting from the first query's cursor.
    const nextResult = await geospatialIndex.query(
      ctx,
      {
        shape: { type: "rectangle", rectangle },
        limit: 16,
      },
      result.nextCursor,
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
