# Geospatial Index

![image](https://github.com/user-attachments/assets/864c1785-37fc-4662-841c-a35238792bf4)

This component adds a geospatial index to Convex, allowing you to efficiently store and query points on the Earth's surface.
After installing this component, your Convex deployment will have a key value store that maps string keys to geographic coordinates. Then, after inserting in this store, you can efficiently search for all points within a given geographic region.

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

## Usage

After installing the component, you can `insert`, `get`, and `remove` points from the index:

```ts
// convex/index.ts

const example = mutation(async (ctx) => {
  await geospatialIndex.insert(ctx, "example", {
    latitude: 40.7831,
    longitude: -73.9712,
  });
  const result = await geospatialIndex.get(ctx, "example");
  await geospatialIndex.remove(ctx, "example");
});
```

After inserting some points, you can query them with the `queryRectangle` API. Pass in the four corners of
a given rectangle in clockwise order, and the API will return a list of points within that region:

```ts
// convex/index.ts

const example = query(async (ctx) => {
  const rectangle = [
    { latitude: 40.7831, longitude: -73.9712 },
    { latitude: 40.7831, longitude: -72.9712 },
    { latitude: 41.7831, longitude: -72.9712 },
    { latitude: 41.7831, longitude: -73.9712 },
  ];
  const result = await geospatialIndex.queryRectangle(ctx, rectangle);
  return result;
});
```

See `example/` for a full example with a [Leaflet](https://leafletjs.com/)-based frontend.
