import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "../_generated/api.js";
import schema from "../schema.js";
import { modules } from "../test.setup.js";

// Test polygon: roughly Manhattan
const MANHATTAN_POLYGON = {
  exterior: [
    { latitude: 40.7, longitude: -74.02 },
    { latitude: 40.7, longitude: -73.97 },
    { latitude: 40.8, longitude: -73.93 },
    { latitude: 40.88, longitude: -73.93 },
    { latitude: 40.88, longitude: -73.94 },
    { latitude: 40.8, longitude: -74.01 },
  ],
};

// Test polyline: a route through Manhattan
const MANHATTAN_ROUTE = [
  { latitude: 40.71, longitude: -74.01 },
  { latitude: 40.75, longitude: -73.99 },
  { latitude: 40.8, longitude: -73.96 },
];

// Point inside Manhattan
const POINT_INSIDE = { latitude: 40.758, longitude: -73.985 };

// Point outside Manhattan (in New Jersey)
const POINT_OUTSIDE = { latitude: 40.73, longitude: -74.07 };

describe("Geometry Storage", () => {
  describe("insert/remove", () => {
    test("insert polygon creates cell index entries", async () => {
      const t = convexTest(schema, modules);

      await t.mutation(api.geometry.insert, {
        key: "manhattan",
        type: "polygon",
        coordinates: MANHATTAN_POLYGON,
      });

      // Verify geometry was created
      const geometry = await t.query(api.geometry.get, { key: "manhattan" });
      expect(geometry).not.toBeNull();
      expect(geometry?.type).toBe("polygon");
      expect(geometry?.boundingBox).toBeDefined();
    });

    test("insert polyline creates cell index entries", async () => {
      const t = convexTest(schema, modules);

      await t.mutation(api.geometry.insert, {
        key: "route",
        type: "polyline",
        coordinates: MANHATTAN_ROUTE,
      });

      // Verify geometry was created
      const geometry = await t.query(api.geometry.get, { key: "route" });
      expect(geometry).not.toBeNull();
      expect(geometry?.type).toBe("polyline");
    });

    test("remove polygon deletes geometry and cell entries", async () => {
      const t = convexTest(schema, modules);

      await t.mutation(api.geometry.insert, {
        key: "manhattan",
        type: "polygon",
        coordinates: MANHATTAN_POLYGON,
      });

      await t.mutation(api.geometry.remove, { key: "manhattan" });

      const geometry = await t.query(api.geometry.get, { key: "manhattan" });
      expect(geometry).toBeNull();
    });

    test("duplicate key throws error", async () => {
      const t = convexTest(schema, modules);

      await t.mutation(api.geometry.insert, {
        key: "manhattan",
        type: "polygon",
        coordinates: MANHATTAN_POLYGON,
      });

      await expect(
        t.mutation(api.geometry.insert, {
          key: "manhattan",
          type: "polygon",
          coordinates: MANHATTAN_POLYGON,
        }),
      ).rejects.toThrow(/already exists/);
    });

    test("update geometry coordinates re-indexes", async () => {
      const t = convexTest(schema, modules);

      await t.mutation(api.geometry.insert, {
        key: "test",
        type: "polygon",
        coordinates: {
          exterior: [
            { latitude: 0, longitude: 0 },
            { latitude: 0, longitude: 1 },
            { latitude: 1, longitude: 1 },
            { latitude: 1, longitude: 0 },
          ],
        },
      });

      // Update with new coordinates
      await t.mutation(api.geometry.update, {
        key: "test",
        coordinates: {
          exterior: [
            { latitude: 10, longitude: 10 },
            { latitude: 10, longitude: 11 },
            { latitude: 11, longitude: 11 },
            { latitude: 11, longitude: 10 },
          ],
        },
      });

      const geometry = await t.query(api.geometry.get, { key: "test" });
      expect(geometry?.boundingBox.south).toBe(10);
    });
  });

  describe("containsPoint", () => {
    test("finds polygon containing point", async () => {
      const t = convexTest(schema, modules);

      await t.mutation(api.geometry.insert, {
        key: "manhattan",
        type: "polygon",
        coordinates: MANHATTAN_POLYGON,
      });

      const result = await t.query(api.geometryQuery.containsPoint, {
        point: POINT_INSIDE,
      });

      expect(result.results.length).toBe(1);
      expect(result.results[0].key).toBe("manhattan");
      expect(result.truncated).toBe(false);
    });

    test("returns empty for point outside all polygons", async () => {
      const t = convexTest(schema, modules);

      await t.mutation(api.geometry.insert, {
        key: "manhattan",
        type: "polygon",
        coordinates: MANHATTAN_POLYGON,
      });

      const result = await t.query(api.geometryQuery.containsPoint, {
        point: POINT_OUTSIDE,
      });

      expect(result.results.length).toBe(0);
    });

    test("respects filterKeys", async () => {
      const t = convexTest(schema, modules);

      await t.mutation(api.geometry.insert, {
        key: "manhattan",
        type: "polygon",
        coordinates: MANHATTAN_POLYGON,
        filterKeys: { borough: "manhattan" },
      });

      // Should find with matching filter
      const results1 = await t.query(api.geometryQuery.containsPoint, {
        point: POINT_INSIDE,
        filterKeys: { borough: "manhattan" },
      });
      expect(results1.results.length).toBe(1);

      // Should not find with non-matching filter
      const results2 = await t.query(api.geometryQuery.containsPoint, {
        point: POINT_INSIDE,
        filterKeys: { borough: "brooklyn" },
      });
      expect(results2.results.length).toBe(0);
    });

    test("finds multiple overlapping polygons", async () => {
      const t = convexTest(schema, modules);

      // Insert two overlapping polygons
      await t.mutation(api.geometry.insert, {
        key: "large",
        type: "polygon",
        coordinates: {
          exterior: [
            { latitude: 40, longitude: -75 },
            { latitude: 40, longitude: -73 },
            { latitude: 42, longitude: -73 },
            { latitude: 42, longitude: -75 },
          ],
        },
      });

      await t.mutation(api.geometry.insert, {
        key: "small",
        type: "polygon",
        coordinates: {
          exterior: [
            { latitude: 40.7, longitude: -74.1 },
            { latitude: 40.7, longitude: -73.9 },
            { latitude: 40.9, longitude: -73.9 },
            { latitude: 40.9, longitude: -74.1 },
          ],
        },
      });

      const result = await t.query(api.geometryQuery.containsPoint, {
        point: { latitude: 40.8, longitude: -74.0 },
      });

      expect(result.results.length).toBe(2);
      const keys = result.results.map((r) => r.key).sort();
      expect(keys).toEqual(["large", "small"]);
    });
  });

  describe("intersects", () => {
    test("finds polygon intersecting rectangle", async () => {
      const t = convexTest(schema, modules);

      await t.mutation(api.geometry.insert, {
        key: "manhattan",
        type: "polygon",
        coordinates: MANHATTAN_POLYGON,
      });

      // Rectangle that overlaps Manhattan
      const result = await t.query(api.geometryQuery.intersects, {
        shape: {
          type: "rectangle",
          rectangle: {
            south: 40.75,
            north: 40.76,
            west: -73.99,
            east: -73.98,
          },
        },
      });

      expect(result.results.length).toBe(1);
      expect(result.results[0].key).toBe("manhattan");
    });

    test("returns empty for non-intersecting shapes", async () => {
      const t = convexTest(schema, modules);

      await t.mutation(api.geometry.insert, {
        key: "manhattan",
        type: "polygon",
        coordinates: MANHATTAN_POLYGON,
      });

      // Rectangle in New Jersey (doesn't intersect Manhattan)
      const result = await t.query(api.geometryQuery.intersects, {
        shape: {
          type: "rectangle",
          rectangle: {
            south: 40.7,
            north: 40.75,
            west: -74.1,
            east: -74.05,
          },
        },
      });

      expect(result.results.length).toBe(0);
    });

    test("finds polyline intersecting query polygon", async () => {
      const t = convexTest(schema, modules);

      // Insert a polyline
      await t.mutation(api.geometry.insert, {
        key: "route",
        type: "polyline",
        coordinates: MANHATTAN_ROUTE,
      });

      // Query with a polygon that the route passes through
      const result = await t.query(api.geometryQuery.intersects, {
        shape: {
          type: "polygon",
          polygon: {
            exterior: [
              { latitude: 40.745, longitude: -74.0 },
              { latitude: 40.745, longitude: -73.98 },
              { latitude: 40.755, longitude: -73.98 },
              { latitude: 40.755, longitude: -74.0 },
            ],
          },
        },
      });

      expect(result.results.length).toBe(1);
      expect(result.results[0].key).toBe("route");
    });
  });

  describe("geometriesNear", () => {
    test("finds polygons within distance", async () => {
      const t = convexTest(schema, modules);

      await t.mutation(api.geometry.insert, {
        key: "manhattan",
        type: "polygon",
        coordinates: MANHATTAN_POLYGON,
      });

      // Point clearly outside Manhattan (in New Jersey, west of the Hudson)
      const nearPoint = { latitude: 40.75, longitude: -74.05 };

      const result = await t.query(api.geometryQuery.geometriesNear, {
        point: nearPoint,
        maxDistance: 5000, // 5km
      });

      expect(result.results.length).toBe(1);
      expect(result.results[0].key).toBe("manhattan");
      expect(result.results[0].distance).toBeGreaterThan(0);
      expect(result.results[0].distance).toBeLessThan(5000);
    });

    test("returns distance=0 for point inside polygon", async () => {
      const t = convexTest(schema, modules);

      await t.mutation(api.geometry.insert, {
        key: "manhattan",
        type: "polygon",
        coordinates: MANHATTAN_POLYGON,
      });

      const result = await t.query(api.geometryQuery.geometriesNear, {
        point: POINT_INSIDE,
        maxDistance: 1000,
      });

      expect(result.results.length).toBe(1);
      expect(result.results[0].distance).toBe(0);
    });

    test("finds multiple overlapping polygons containing point", async () => {
      const t = convexTest(schema, modules);

      // Insert Manhattan polygon
      await t.mutation(api.geometry.insert, {
        key: "manhattan",
        type: "polygon",
        coordinates: MANHATTAN_POLYGON,
      });

      // Insert a larger polygon that also contains the query point
      await t.mutation(api.geometry.insert, {
        key: "nyc",
        type: "polygon",
        coordinates: {
          exterior: [
            { latitude: 40.5, longitude: -74.3 },
            { latitude: 40.5, longitude: -73.7 },
            { latitude: 40.95, longitude: -73.7 },
            { latitude: 40.95, longitude: -74.3 },
          ],
        },
      });

      // Query for geometries near the point - both polygons contain it
      const queryPoint = POINT_INSIDE; // { latitude: 40.758, longitude: -73.985 }
      const result = await t.query(api.geometryQuery.geometriesNear, {
        point: queryPoint,
        maxDistance: 5000,
      });

      // Both polygons contain the point, so both have distance=0
      expect(result.results.length).toBe(2);
      const keys = result.results.map((r) => r.key).sort();
      expect(keys).toEqual(["manhattan", "nyc"]);
      // Both should have distance=0 since point is inside both
      expect(result.results[0].distance).toBe(0);
      expect(result.results[1].distance).toBe(0);
    });

    test("finds polylines within distance", async () => {
      const t = convexTest(schema, modules);

      await t.mutation(api.geometry.insert, {
        key: "route",
        type: "polyline",
        coordinates: MANHATTAN_ROUTE,
      });

      const result = await t.query(api.geometryQuery.geometriesNear, {
        point: { latitude: 40.75, longitude: -73.99 },
        maxDistance: 1000,
      });

      expect(result.results.length).toBe(1);
      expect(result.results[0].key).toBe("route");
      expect(result.results[0].type).toBe("polyline");
    });
  });

  describe("large polygon storage (no hotspots)", () => {
    test("large polygon stores coarse cells, small polygon stores fine cells", async () => {
      const t = convexTest(schema, modules);

      // Insert a Texas-sized polygon (~700,000 km²)
      await t.mutation(api.geometry.insert, {
        key: "texas",
        type: "polygon",
        coordinates: {
          exterior: [
            { latitude: 25.8, longitude: -106.6 }, // SW corner
            { latitude: 25.8, longitude: -93.5 }, // SE corner
            { latitude: 36.5, longitude: -100.0 }, // N middle
            { latitude: 36.5, longitude: -103.0 }, // NW area
          ],
        },
      });

      // Insert a building-sized polygon (~100m × 100m)
      await t.mutation(api.geometry.insert, {
        key: "building",
        type: "polygon",
        coordinates: {
          exterior: [
            { latitude: 40.758, longitude: -73.9855 },
            { latitude: 40.758, longitude: -73.9845 },
            { latitude: 40.759, longitude: -73.9845 },
            { latitude: 40.759, longitude: -73.9855 },
          ],
        },
      });

      // Both should be queryable
      const texasResult = await t.query(api.geometry.get, { key: "texas" });
      const buildingResult = await t.query(api.geometry.get, { key: "building" });

      expect(texasResult).not.toBeNull();
      expect(buildingResult).not.toBeNull();

      // Verify containsPoint works for both
      const texasPoint = { latitude: 31.0, longitude: -100.0 };
      const buildingPoint = { latitude: 40.7585, longitude: -73.985 };

      const texasContains = await t.query(api.geometryQuery.containsPoint, {
        point: texasPoint,
      });
      const buildingContains = await t.query(api.geometryQuery.containsPoint, {
        point: buildingPoint,
      });

      expect(texasContains.results.length).toBe(1);
      expect(texasContains.results[0].key).toBe("texas");

      expect(buildingContains.results.length).toBe(1);
      expect(buildingContains.results[0].key).toBe("building");
    });
  });
});
