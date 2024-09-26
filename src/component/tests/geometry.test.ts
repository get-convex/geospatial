import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "../_generated/api.js";
import schema from "../schema.js";
import { modules } from "../test.setup.js";
import { decodeTupleKey } from "../lib/tupleKey.js";
import { test as fcTest, fc } from "@fast-check/vitest";
import { arbitraryDocument, arbitraryResolution } from "./arbitrary.helpers.js";
import { coverRectangle, cellToPolygon } from "../lib/geometry.js";
import { createLogger } from "../lib/logging.js";
import * as h3 from "h3-js";

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

  for (const cell of h3.getRes0Cells()) {
    const polygon = cellToPolygon(cell);
    const polygonArea = polygon.area();
    const h3Area = h3.cellArea(cell, h3.UNITS.m2);
    console.log(cell, polygonArea, h3Area, polygon.polygons[0].geometry.coordinates);
    expect(Math.abs(polygonArea - h3Area) / polygonArea).toBeLessThan(0.01);
  }


  
  // const gmt = "8019fffffffffff";

  // // only crosses once?!
  // const north = "8001fffffffffff";  
  // const easy = "8049fffffffffff";  
  // const easyExpected = [
  //   [
  //     [ -106.55968523174009, 12.150574686647923 ],
  //     [ -96.05020989622145, 19.26900694125663 ],
  //     [ -96.66289038040519, 31.619530626908524 ],
  //     [ -110.25748485653355, 36.80019706117427 ],
  //     [ -121.3366283326517, 28.653019311484535 ],
  //     [ -118.48186571718101, 16.572699557873403 ],
  //     [ -106.55968523174009, 12.150574686647923 ]
  //   ]
  // ]
  // expect(cellToPolygon(easy).geometry.coordinates).toEqual(easyExpected);  

  // crosses anti
  // const anti = "809bfffffffffff";    
  // const expected = [[[[-170.6193233947984,-25.603702576968775],[-161.63482061718392,-16.505947603561054],[-165.41674992858836,-5.7628604914369355],[-176.05696384421353,-3.9687969766095947],[-180,-7.723262175159634],[-180,-22.91062789900188],[-170.6193233947984,-25.603702576968775]]],[[[180,-7.723262175159634],[175.98600155652952,-11.545295975414767],[177.51613498805204,-22.19754138630238],[180,-22.91062789900188],[180,-7.723262175159634]]]];
  // expect(cellToPolygon(anti).geometry.coordinates).toEqual(expected);


  

  const failures = [
  //   "8003fffffffffff",
  //  '80edfffffffffff',
  //   '81033ffffffffff',
  //   '81f2bffffffffff',    

    "82054ffffffffff",
  ]
  for (const cell of failures) {
    console.log(cell, JSON.stringify(cellToPolygon(cell)));
  }

});
