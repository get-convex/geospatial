# Geospatial Index (Beta)

![image](https://github.com/user-attachments/assets/de5be125-d5f9-43e0-8496-37df1427ef07)

This component adds a geospatial index to Convex, allowing you to efficiently store and query points on the Earth's surface.
After installing this component, your Convex deployment will have a key value store that maps string keys to geographic
coordinates. Then, after inserting in this store, you can efficiently search for all points within a given geographic region.

Oh, and since it's built on Convex, everything is automatically consistent, reactive, and cached.

This component is currently in beta. It's missing some functionality, but what's there should work. We've tested the example
app up to about 1,000,000 points, so reach out if you're using a much larger dataset.

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

# 🧑‍🏫 What is Convex?

[Convex](https://convex.dev) is a hosted backend platform with a
built-in database that lets you write your
[database schema](https://docs.convex.dev/database/schemas) and
[server functions](https://docs.convex.dev/functions) in
[TypeScript](https://docs.convex.dev/typescript). Server-side database
[queries](https://docs.convex.dev/functions/query-functions) automatically
[cache](https://docs.convex.dev/functions/query-functions#caching--reactivity) and
[subscribe](https://docs.convex.dev/client/react#reactivity) to data, powering a
[realtime `useQuery` hook](https://docs.convex.dev/client/react#fetching-data) in our
[React client](https://docs.convex.dev/client/react). There are also clients for
[Python](https://docs.convex.dev/client/python),
[Rust](https://docs.convex.dev/client/rust),
[ReactNative](https://docs.convex.dev/client/react-native), and
[Node](https://docs.convex.dev/client/javascript), as well as a straightforward
[HTTP API](https://docs.convex.dev/http-api/).

The database supports
[NoSQL-style documents](https://docs.convex.dev/database/document-storage) with
[opt-in schema validation](https://docs.convex.dev/database/schemas),
[relationships](https://docs.convex.dev/database/document-ids) and
[custom indexes](https://docs.convex.dev/database/indexes/)
(including on fields in nested objects).

The
[`query`](https://docs.convex.dev/functions/query-functions) and
[`mutation`](https://docs.convex.dev/functions/mutation-functions) server functions have transactional,
low latency access to the database and leverage our
[`v8` runtime](https://docs.convex.dev/functions/runtimes) with
[determinism guardrails](https://docs.convex.dev/functions/runtimes#using-randomness-and-time-in-queries-and-mutations)
to provide the strongest ACID guarantees on the market:
immediate consistency,
serializable isolation, and
automatic conflict resolution via
[optimistic multi-version concurrency control](https://docs.convex.dev/database/advanced/occ) (OCC / MVCC).

The [`action` server functions](https://docs.convex.dev/functions/actions) have
access to external APIs and enable other side-effects and non-determinism in
either our
[optimized `v8` runtime](https://docs.convex.dev/functions/runtimes) or a more
[flexible `node` runtime](https://docs.convex.dev/functions/runtimes#nodejs-runtime).

Functions can run in the background via
[scheduling](https://docs.convex.dev/scheduling/scheduled-functions) and
[cron jobs](https://docs.convex.dev/scheduling/cron-jobs).

Development is cloud-first, with
[hot reloads for server function](https://docs.convex.dev/cli#run-the-convex-dev-server) editing via the
[CLI](https://docs.convex.dev/cli),
[preview deployments](https://docs.convex.dev/production/hosting/preview-deployments),
[logging and exception reporting integrations](https://docs.convex.dev/production/integrations/),
There is a
[dashboard UI](https://docs.convex.dev/dashboard) to
[browse and edit data](https://docs.convex.dev/dashboard/deployments/data),
[edit environment variables](https://docs.convex.dev/production/environment-variables),
[view logs](https://docs.convex.dev/dashboard/deployments/logs),
[run server functions](https://docs.convex.dev/dashboard/deployments/functions), and more.

There are built-in features for
[reactive pagination](https://docs.convex.dev/database/pagination),
[file storage](https://docs.convex.dev/file-storage),
[reactive text search](https://docs.convex.dev/text-search),
[vector search](https://docs.convex.dev/vector-search),
[https endpoints](https://docs.convex.dev/functions/http-actions) (for webhooks),
[snapshot import/export](https://docs.convex.dev/database/import-export/),
[streaming import/export](https://docs.convex.dev/production/integrations/streaming-import-export), and
[runtime validation](https://docs.convex.dev/database/schemas#validators) for
[function arguments](https://docs.convex.dev/functions/args-validation) and
[database data](https://docs.convex.dev/database/schemas#schema-validation).

Everything scales automatically, and it’s [free to start](https://www.convex.dev/plans).
