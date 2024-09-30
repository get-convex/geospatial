import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "../_generated/api.js";
import schema from "../schema.js";
import { modules } from "../test.setup.js";
import { decodeTupleKey } from "../lib/tupleKey.js";
import { test as fcTest, fc } from "@fast-check/vitest";
import { arbitraryDocument, arbitraryResolution } from "./arbitrary.helpers.js";
import {
  coverRectangle,
  cellToPolygon,
  rectangleToPolygon,
} from "../lib/geometry.js";
import { createLogger } from "../lib/logging.js";
import * as h3 from "h3-js";

// Generate an arbitrary viewport rectangle on the sphere.
const rectangle = fc
  .record({
    west: fc.float({ min: -179, max: 179, noNaN: true }),
    eastFraction: fc.float({ min: 0, max: Math.fround(0.95), noNaN: true }),

    south: fc.float({ min: -89, max: 89, noNaN: true }),
    northFraction: fc.float({ min: 0, max: Math.fround(0.96), noNaN: true }),
  })
  .map(({ west, eastFraction, south, northFraction }) => {
    const east = west + eastFraction * (180 - west);
    const north = south + northFraction * (90 - south);
    return { north, south, east, west };
  });

const point = fc.record({
  latitude: fc.float({ min: -89, max: 89, noNaN: true }),
  longitude: fc.float({ min: -179, max: 179, noNaN: true }),
});

fcTest.prop({ rectangle })("coverRectangle", async ({ rectangle }) => {
  const logger = createLogger("INFO");
  const polygon = rectangleToPolygon(rectangle);
  const rectangles = coverRectangle(logger, polygon, 1);
});

// fcTest.prop({ rectangle, point })(
//   "rectangleContains",
//   async ({ rectangle, point }) => {
//     const computed = rectangleContains(rectangle, point);
//     const expected =
//       rectangle.west <= point.longitude &&
//       point.longitude <= rectangle.east &&
//       rectangle.south <= point.latitude &&
//       point.latitude <= rectangle.north;
//     expect(computed).toEqual(expected);
//   },
// );

// h3 viewer: https://h3geo.org/
// mapbox geojson viewer: https://geojson.io/#map=2.42/11.91/-162.23/0/8
// turf docs: https://turfjs.org/docs/api/
test("coverRectangle", async () => {
  // const cells = coverRectangle(createLogger("INFO"), {
  //     east: -45.615234375,
  //     north: 17.518344187852218,
  //     south: -12.554563528593656,
  //     west: -101.865234375
  // }, 0, 0.5)
  // console.log(cells);
  // Broken around meridian
  // [CONVEX Q(search:h3Cells)] [LOG] 'coverRectangle' {
  //     east: 44.912109375,
  //     north: 64.39693778132846,
  //     south: 23.32208001137844,
  //     west: -60.64453125
  //   } 10 0.5
  // Broken zoomed out around antimeridian
  // [CONVEX Q(search:h3Cells)] [LOG] 'coverRectangle' {
  //     east: 145.01953125,
  //     north: 63.78248603116502,
  //     south: -35.74651225991851,
  //     west: -3.8671875
  //   } 10 0.5
  // More zoomed in around antimeridian
  // [CONVEX Q(search:h3Cells)] [LOG] 'coverRectangle' {
  //     east: 148.4033203125,
  //     north: 21.82070785387503,
  //     south: -8.059229627200192,
  //     west: -158.818359375
  //   } 10 0.5
  // Near north pole
  // [CONVEX Q(search:h3Cells)] [LOG] 'coverRectangle' {
  //     east: 8.96484375,
  //     north: 81.26838476405415,
  //     south: 65.07213008560697,
  //     west: -96.591796875
  //   } 10 0.5
});

test("h3CellToPolygon", async () => {
  const cell = "8001fffffffffff";
  const polygon = cellToPolygon(cell);
  console.log(polygon.area);
  expect(polygon.area).toBeGreaterThan(0);
});

test("h3CellToPolygonArea", async () => {
  const polarExemptions = new Set([
    "8001fffffffffff",
    "8003fffffffffff",
    "8005fffffffffff",
    "80f3fffffffffff",
    "81033ffffffffff",
    "81f2bffffffffff",
    "820327fffffffff",
    "82f297fffffffff",
    "830326fffffffff",
    "83f293fffffffff",
  ]);

  let current = new Set<string>();
  for (const cell of h3.getRes0Cells()) {
    current.add(cell);
  }
  let next = new Set<string>();

  for (let resolution = 0; resolution < 3; resolution++) {
    for (const cell of current.values()) {
      const polygon = cellToPolygon(cell);
      const h3Area = h3.cellArea(cell, h3.UNITS.m2);
      if (!polarExemptions.has(cell)) {
        expect(Math.abs(polygon.area - h3Area) / polygon.area).toBeLessThan(
          0.1,
        );
      }
    }
    for (const cell of current.values()) {
      for (const child of h3.cellToChildren(cell, resolution + 1)) {
        next.add(child);
        for (const neighbor of h3.gridDisk(child, 1)) {
          next.add(neighbor);
        }
      }
    }
    current = next;
    next = new Set<string>();
  }
});
