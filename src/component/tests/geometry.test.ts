import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "../_generated/api.js";
import schema from "../schema.js";
import { modules } from "../test.setup.js";
import { decodeTupleKey } from "../lib/tupleKey.js";
import { test as fcTest, fc } from "@fast-check/vitest";
import { arbitraryDocument, arbitraryResolution } from "./arbitrary.helpers.js";
import { coverRectangle, h3CellToPolygon } from "../lib/geometry.js";
import { createLogger } from "../lib/logging.js";

// Generate an arbitrary viewport rectangle on the sphere.
// const rectangle = fc
//   .record({
//     west: fc.float({ min: -180, max: 180, noNaN: true }),
//     eastFraction: fc.float({ min: 0, max: 1, noNaN: true }),

//     south: fc.float({ min: -90, max: 90, noNaN: true }),
//     northFraction: fc.float({ min: 0, max: 1, noNaN: true }),
//   })
//   .map(({ west, eastFraction, south, northFraction }) => {
//     const east = west + eastFraction * (180 - west);
//     const north = south + northFraction * (90 - south);
//     return { north, south, east, west };
//   });

// const point = fc.record({
//   latitude: fc.float({ min: -90, max: 90, noNaN: true }),
//   longitude: fc.float({ min: -180, max: 180, noNaN: true }),
// });

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
  const easy = "8049fffffffffff";
  const gmt = "8019fffffffffff";

  // only crosses once?!
  const north = "8001fffffffffff";

  // crosses anti
  const anti = "809bfffffffffff";

  console.log(JSON.stringify(h3CellToPolygon("812b7ffffffffff")));
});
