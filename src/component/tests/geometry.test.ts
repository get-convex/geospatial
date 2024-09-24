import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "../_generated/api.js";
import schema from "../schema.js";
import { modules } from "../test.setup.js";
import { decodeTupleKey } from "../lib/tupleKey.js";
import { test as fcTest, fc } from "@fast-check/vitest";
import { arbitraryDocument, arbitraryResolution } from "./arbitrary.helpers.js";
import { rectangleContains, validateRectangle } from "../lib/geometry.js";

// Generate an arbitrary viewport rectangle on the sphere.
const rectangle = fc
  .record({
    west: fc.float({ min: -180, max: 180, noNaN: true }),
    eastFraction: fc.float({ min: 0, max: 1, noNaN: true }),

    south: fc.float({ min: -90, max: 90, noNaN: true }),
    northFraction: fc.float({ min: 0, max: 1, noNaN: true }),
  })
  .map(({ west, eastFraction, south, northFraction }) => {
    const east = west + eastFraction * (180 - west);
    const north = south + northFraction * (90 - south);
    return { north, south, east, west };
  });

const point = fc.record({
  latitude: fc.float({ min: -90, max: 90, noNaN: true }),
  longitude: fc.float({ min: -180, max: 180, noNaN: true }),
});

fcTest.prop({ rectangle, point })(
  "rectangleContains",
  async ({ rectangle, point }) => {
    const computed = rectangleContains(rectangle, point);
    const expected =
      rectangle.west <= point.longitude &&
      point.longitude <= rectangle.east &&
      rectangle.south <= point.latitude &&
      point.latitude <= rectangle.north;
    expect(computed).toEqual(expected);
  },
);
