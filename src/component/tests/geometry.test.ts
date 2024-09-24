import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "../_generated/api.js";
import schema from "../schema.js";
import { modules } from "../test.setup.js";
import { decodeTupleKey } from "../lib/tupleKey.js";
import { test as fcTest, fc } from "@fast-check/vitest";
import { arbitraryDocument, arbitraryResolution } from "./arbitrary.test.js";
import { rectangleContains, validateRectangle } from "../lib/geometry.js";

// Generate an arbitrary viewport rectangle on the sphere.
const rectangle = fc
  .record({
    east: fc.float({ min: -180, max: 180, noNaN: true }),
    west: fc.float({ min: -180, max: 180, noNaN: true }),

    south: fc.float({ min: -90, max: 90, noNaN: true }),
    northFraction: fc.float({ min: 0, max: 1, noNaN: true }),
  })
  .map(({ east, west, south, northFraction }) => {
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
    const rect = {
      sw: {
        latitude: rectangle.south,
        longitude: rectangle.west,
      },
      se: {
        latitude: rectangle.south,
        longitude: rectangle.east,
      },
      ne: {
        latitude: rectangle.north,
        longitude: rectangle.east,
      },
      nw: {
        latitude: rectangle.north,
        longitude: rectangle.west,
      },
    };
    const computed = rectangleContains(rect, point);

    if (rectangle.east < rectangle.west) {
      if (point.longitude <= rectangle.east) {
        point.longitude += 360;
      }
      rectangle.east += 360;
    }
    const expected =
      rectangle.west <= point.longitude &&
      point.longitude <= rectangle.east &&
      rectangle.south <= point.latitude &&
      point.latitude <= rectangle.north;
    expect(computed).toEqual(expected);
  },
);
