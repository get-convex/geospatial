import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "../_generated/api.js";
import schema from "../schema.js";
import { modules } from "../test.setup.js";

// Test polygon: roughly a 1km x 1km square in NYC
const NYC_SQUARE = {
  exterior: [
    { latitude: 40.7, longitude: -74.0 },
    { latitude: 40.7, longitude: -73.99 },
    { latitude: 40.71, longitude: -73.99 },
    { latitude: 40.71, longitude: -74.0 },
  ],
};

// Test polyline: a route through Manhattan (~8-10km)
const MANHATTAN_ROUTE = [
  { latitude: 40.71, longitude: -74.01 },
  { latitude: 40.75, longitude: -73.99 },
  { latitude: 40.78, longitude: -73.96 },
];

// Large polygon: roughly Texas-sized
const TEXAS_POLYGON = {
  exterior: [
    { latitude: 25.8, longitude: -106.6 },
    { latitude: 25.8, longitude: -93.5 },
    { latitude: 36.5, longitude: -100.0 },
  ],
};

describe("Geometry Measurements", () => {
  describe("polygonArea", () => {
    test("calculates area of small polygon", async () => {
      const t = convexTest(schema, modules);

      const area = await t.query(api.geometryMeasure.polygonArea, {
        polygon: NYC_SQUARE,
      });

      // ~1km x 1km = ~1,000,000 m²
      // Allow 20% tolerance for spherical geometry
      expect(area).toBeGreaterThan(800_000);
      expect(area).toBeLessThan(1_500_000);
    });

    test("calculates area of large polygon", async () => {
      const t = convexTest(schema, modules);

      const area = await t.query(api.geometryMeasure.polygonArea, {
        polygon: TEXAS_POLYGON,
      });

      // Our simplified triangle covers ~770,000 km² = 770,000,000,000 m²
      expect(area).toBeGreaterThan(500_000_000_000);
      expect(area).toBeLessThan(1_000_000_000_000);
    });
  });

  describe("polylineLength", () => {
    test("calculates length of polyline", async () => {
      const t = convexTest(schema, modules);

      const length = await t.query(api.geometryMeasure.polylineLength, {
        polyline: MANHATTAN_ROUTE,
      });

      // Route is roughly 8-10km
      expect(length).toBeGreaterThan(7_000);
      expect(length).toBeLessThan(12_000);
    });

    test("calculates length of short segment", async () => {
      const t = convexTest(schema, modules);

      const length = await t.query(api.geometryMeasure.polylineLength, {
        polyline: [
          { latitude: 0, longitude: 0 },
          { latitude: 0, longitude: 1 },
        ],
      });

      // 1 degree of longitude at equator ≈ 111km
      expect(length).toBeGreaterThan(100_000);
      expect(length).toBeLessThan(120_000);
    });
  });

  describe("polygonPerimeter", () => {
    test("calculates perimeter of polygon", async () => {
      const t = convexTest(schema, modules);

      const perimeter = await t.query(api.geometryMeasure.polygonPerimeter, {
        polygon: NYC_SQUARE,
      });

      // ~1km x 1km square = ~4km perimeter
      expect(perimeter).toBeGreaterThan(3_000);
      expect(perimeter).toBeLessThan(5_000);
    });
  });

  describe("polygonCentroid", () => {
    test("calculates centroid of symmetric polygon", async () => {
      const t = convexTest(schema, modules);

      const centroid = await t.query(api.geometryMeasure.polygonCentroid, {
        polygon: NYC_SQUARE,
      });

      // Centroid should be near center of square
      expect(centroid.latitude).toBeCloseTo(40.705, 2);
      expect(centroid.longitude).toBeCloseTo(-73.995, 2);
    });

    test("calculates centroid of triangle", async () => {
      const t = convexTest(schema, modules);

      const centroid = await t.query(api.geometryMeasure.polygonCentroid, {
        polygon: {
          exterior: [
            { latitude: 0, longitude: 0 },
            { latitude: 0, longitude: 3 },
            { latitude: 3, longitude: 0 },
          ],
        },
      });

      // Centroid of triangle is at (1, 1)
      expect(centroid.latitude).toBeCloseTo(1, 1);
      expect(centroid.longitude).toBeCloseTo(1, 1);
    });
  });

  describe("polylineCentroid", () => {
    test("calculates centroid of polyline", async () => {
      const t = convexTest(schema, modules);

      const centroid = await t.query(api.geometryMeasure.polylineCentroid, {
        polyline: MANHATTAN_ROUTE,
      });

      // Centroid should be roughly in the middle of the route
      expect(centroid.latitude).toBeGreaterThan(40.71);
      expect(centroid.latitude).toBeLessThan(40.78);
      expect(centroid.longitude).toBeGreaterThan(-74.01);
      expect(centroid.longitude).toBeLessThan(-73.96);
    });

    test("calculates centroid of straight line", async () => {
      const t = convexTest(schema, modules);

      const centroid = await t.query(api.geometryMeasure.polylineCentroid, {
        polyline: [
          { latitude: 0, longitude: 0 },
          { latitude: 0, longitude: 10 },
        ],
      });

      // Centroid should be at midpoint
      expect(centroid.latitude).toBeCloseTo(0, 1);
      expect(centroid.longitude).toBeCloseTo(5, 1);
    });
  });
});
