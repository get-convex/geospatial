import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "../_generated/api.js";
import schema from "../schema.js";
import { modules } from "../test.setup.js";
import { S2Bindings } from "../lib/s2Bindings.js";
import { test as fcTest, fc } from "@fast-check/vitest";
import type { FunctionReturnType } from "convex/server";

type ExecuteResult = FunctionReturnType<typeof api.query.execute>;

const opts = {
  minLevel: 4,
  maxLevel: 16,
  levelMod: 2,
  maxCells: 8,
};

test("polyline query - points within buffer distance are returned", async () => {
  const t = convexTest(schema, modules);

  // Define a simple horizontal polyline from (0, 0) to (0, 1)
  const polyline = [
    { latitude: 0, longitude: 0 },
    { latitude: 0, longitude: 1 },
  ];

  const bufferMeters = 100000; // 100km buffer for wider coverage

  // Insert points at various distances from the polyline
  const points = [
    {
      key: "on_line",
      coordinates: { latitude: 0, longitude: 0.5 }, // On the line
      sortKey: 1,
      filterKeys: {},
    },
    {
      key: "close_north",
      coordinates: { latitude: 0.5, longitude: 0.5 }, // ~55km north (within buffer)
      sortKey: 2,
      filterKeys: {},
    },
    {
      key: "far_north",
      coordinates: { latitude: 5, longitude: 0.5 }, // ~555km north (outside buffer)
      sortKey: 3,
      filterKeys: {},
    },
    {
      key: "far_away",
      coordinates: { latitude: 10, longitude: 10 }, // Very far away
      sortKey: 4,
      filterKeys: {},
    },
  ];

  for (const point of points) {
    await t.mutation(api.document.insert, {
      document: point,
      ...opts,
    });
  }

  const result = await t.query(api.query.execute, {
    query: {
      shape: { type: "polyline", polyline, bufferMeters },
      filtering: [],
      sorting: { interval: {} },
      maxResults: 10,
    },
    ...opts,
    logLevel: "INFO",
  });

  const keys = result.results.map((r) => r.key).sort();
  expect(keys).toContain("on_line");
  expect(keys).toContain("close_north");
  expect(keys).not.toContain("far_north");
  expect(keys).not.toContain("far_away");
});

test("polyline query - single segment (2 points)", async () => {
  const t = convexTest(schema, modules);

  const polyline = [
    { latitude: 0, longitude: 0 },
    { latitude: 1, longitude: 0 },
  ];

  const bufferMeters = 100000; // 100km buffer

  const points = [
    {
      key: "midpoint",
      coordinates: { latitude: 0.5, longitude: 0 }, // On the line
      sortKey: 1,
      filterKeys: {},
    },
    {
      key: "endpoint1",
      coordinates: { latitude: 0, longitude: 0 }, // At first endpoint
      sortKey: 2,
      filterKeys: {},
    },
    {
      key: "outside",
      coordinates: { latitude: 5, longitude: 5 }, // Far away
      sortKey: 3,
      filterKeys: {},
    },
  ];

  for (const point of points) {
    await t.mutation(api.document.insert, {
      document: point,
      ...opts,
    });
  }

  const result = await t.query(api.query.execute, {
    query: {
      shape: { type: "polyline", polyline, bufferMeters },
      filtering: [],
      sorting: { interval: {} },
      maxResults: 10,
    },
    ...opts,
    logLevel: "INFO",
  });

  const keys = result.results.map((r) => r.key).sort();
  expect(keys).toContain("midpoint");
  expect(keys).toContain("endpoint1");
  expect(keys).not.toContain("outside");
});

test("polyline query - multi-segment polyline", async () => {
  const t = convexTest(schema, modules);

  // L-shaped polyline
  const polyline = [
    { latitude: 0, longitude: 0 },
    { latitude: 0, longitude: 1 },
    { latitude: 1, longitude: 1 },
  ];

  const bufferMeters = 100000; // 100km buffer for wider coverage

  const points = [
    {
      key: "on_first_segment",
      coordinates: { latitude: 0, longitude: 0.5 },
      sortKey: 1,
      filterKeys: {},
    },
    {
      key: "on_second_segment",
      coordinates: { latitude: 0.5, longitude: 1 },
      sortKey: 2,
      filterKeys: {},
    },
    {
      key: "at_corner",
      coordinates: { latitude: 0, longitude: 1 },
      sortKey: 3,
      filterKeys: {},
    },
    {
      key: "outside",
      coordinates: { latitude: 10, longitude: 10 },
      sortKey: 4,
      filterKeys: {},
    },
  ];

  for (const point of points) {
    await t.mutation(api.document.insert, {
      document: point,
      ...opts,
    });
  }

  const result = await t.query(api.query.execute, {
    query: {
      shape: { type: "polyline", polyline, bufferMeters },
      filtering: [],
      sorting: { interval: {} },
      maxResults: 10,
    },
    ...opts,
    logLevel: "INFO",
  });

  const keys = result.results.map((r) => r.key).sort();
  expect(keys).toContain("on_first_segment");
  expect(keys).toContain("on_second_segment");
  expect(keys).toContain("at_corner");
  expect(keys).not.toContain("outside");
});

test("polyline query - with filters", async () => {
  const t = convexTest(schema, modules);

  const polyline = [
    { latitude: 0, longitude: 0 },
    { latitude: 0, longitude: 1 },
  ];

  const bufferMeters = 100000;

  const points = [
    {
      key: "gas1",
      coordinates: { latitude: 0, longitude: 0.3 },
      sortKey: 1,
      filterKeys: { category: "gas" },
    },
    {
      key: "gas2",
      coordinates: { latitude: 0, longitude: 0.7 },
      sortKey: 2,
      filterKeys: { category: "gas" },
    },
    {
      key: "food1",
      coordinates: { latitude: 0, longitude: 0.5 },
      sortKey: 3,
      filterKeys: { category: "food" },
    },
  ];

  for (const point of points) {
    await t.mutation(api.document.insert, {
      document: point,
      ...opts,
    });
  }

  // Query with category filter
  const result = await t.query(api.query.execute, {
    query: {
      shape: { type: "polyline", polyline, bufferMeters },
      filtering: [
        { occur: "must", filterKey: "category", filterValue: "gas" },
      ],
      sorting: { interval: {} },
      maxResults: 10,
    },
    ...opts,
    logLevel: "INFO",
  });

  const keys = result.results.map((r) => r.key).sort();
  expect(keys).toEqual(["gas1", "gas2"]);
});

test("polyline query - pagination with cursor", async () => {
  const t = convexTest(schema, modules);

  const polyline = [
    { latitude: 0, longitude: 0 },
    { latitude: 0, longitude: 2 },
  ];

  const bufferMeters = 100000;

  // Insert many points along the line
  const numPoints = 10;
  for (let i = 0; i < numPoints; i++) {
    await t.mutation(api.document.insert, {
      document: {
        key: `point_${i}`,
        coordinates: { latitude: 0, longitude: i * 0.2 },
        sortKey: i,
        filterKeys: {},
      },
      ...opts,
    });
  }

  // Query with small page size
  const pageSize = 3;
  const allResults: string[] = [];
  let nextCursor: string | undefined = undefined;

  for (let page = 0; page < 5; page++) {
    const result: ExecuteResult = await t.query(api.query.execute, {
      query: {
        shape: { type: "polyline" as const, polyline, bufferMeters },
        filtering: [] as { occur: "should" | "must"; filterKey: string; filterValue: string }[],
        sorting: { interval: {} },
        maxResults: pageSize,
      },
      cursor: nextCursor,
      ...opts,
      logLevel: "INFO" as const,
    });

    for (const r of result.results) {
      if (!allResults.includes(r.key)) {
        allResults.push(r.key);
      }
    }

    if (!result.nextCursor) {
      break;
    }
    nextCursor = result.nextCursor;
  }

  expect(allResults.length).toBe(numPoints);
});

test("S2Bindings - coverPolylineBuffered basic", async () => {
  const s2 = await S2Bindings.load();

  const points = [
    { latitude: 0, longitude: 0 },
    { latitude: 1, longitude: 0 },
  ];

  // Note: ExpandByRadius can produce more cells than maxCells
  const cells = s2.coverPolylineBuffered(points, 10000, 4, 16, 2, 8, 4);

  expect(cells.length).toBeGreaterThan(0);
  // After expansion, we may have more than maxCells
  expect(cells.length).toBeLessThanOrEqual(100);
});

test("S2Bindings - distanceToPolyline", async () => {
  const s2 = await S2Bindings.load();

  // Horizontal line from (0, 0) to (0, 1)
  const polylinePoints = [
    { latitude: 0, longitude: 0 },
    { latitude: 0, longitude: 1 },
  ];

  // Point on the line should have distance ~0
  const distanceOnLine = s2.distanceToPolyline(polylinePoints, { latitude: 0, longitude: 0.5 });
  const metersOnLine = s2.chordAngleToMeters(distanceOnLine);
  expect(metersOnLine).toBeLessThan(1); // Should be essentially 0

  // Point 1 degree north (~111km) should have that distance
  const distanceNorth = s2.distanceToPolyline(polylinePoints, { latitude: 1, longitude: 0.5 });
  const metersNorth = s2.chordAngleToMeters(distanceNorth);
  expect(metersNorth).toBeGreaterThan(100000); // Should be ~111km
  expect(metersNorth).toBeLessThan(120000);
});

test("S2Bindings - distanceToPolyline at endpoints", async () => {
  const s2 = await S2Bindings.load();

  const polylinePoints = [
    { latitude: 0, longitude: 0 },
    { latitude: 0, longitude: 1 },
  ];

  // Point beyond the endpoint should measure distance to endpoint
  const distanceBeyond = s2.distanceToPolyline(polylinePoints, { latitude: 0, longitude: 2 });
  const metersBeyond = s2.chordAngleToMeters(distanceBeyond);

  // Should be ~111km (distance from (0,2) to (0,1))
  expect(metersBeyond).toBeGreaterThan(100000);
  expect(metersBeyond).toBeLessThan(120000);
});

test("S2Bindings - distanceToPolyline multi-segment", async () => {
  const s2 = await S2Bindings.load();

  // L-shaped polyline
  const polylinePoints = [
    { latitude: 0, longitude: 0 },
    { latitude: 0, longitude: 1 },
    { latitude: 1, longitude: 1 },
  ];

  // Point close to second segment
  const distance = s2.distanceToPolyline(polylinePoints, { latitude: 0.5, longitude: 1 });
  const meters = s2.chordAngleToMeters(distance);
  expect(meters).toBeLessThan(1); // Should be essentially 0 (on the line)
});

describe("property-based polyline tests", () => {
  // Reuse a single S2Bindings instance for performance
  const s2Promise = S2Bindings.load();

  const arbitraryPolyline = fc
    .tuple(
      fc.float({ min: Math.fround(-45), max: Math.fround(45), noNaN: true }), // center lat
      fc.float({ min: Math.fround(-90), max: Math.fround(90), noNaN: true }), // center lng
      fc.integer({ min: 2, max: 20 }), // number of points
    )
    .map(([centerLat, centerLng, numPoints]): {
      points: { latitude: number; longitude: number }[];
      center: { latitude: number; longitude: number };
    } => {
      const points: { latitude: number; longitude: number }[] = [];
      for (let i = 0; i < numPoints; i++) {
        points.push({
          latitude: centerLat + (i * 0.1),
          longitude: centerLng + (i * 0.1),
        });
      }
      return { points, center: { latitude: centerLat, longitude: centerLng } };
    });

  fcTest.prop({ polyline: arbitraryPolyline })(
    "coverPolylineBuffered returns valid cells",
    async ({ polyline }) => {
      const s2 = await s2Promise;
      const cells = s2.coverPolylineBuffered(polyline.points, 10000, 4, 16, 2, 8, 4);

      expect(cells.length).toBeGreaterThan(0);
      // After expansion, we may have more than maxCells, but should be reasonable
      expect(cells.length).toBeLessThanOrEqual(200);

      for (const cell of cells) {
        expect(typeof cell).toBe("bigint");
        expect(cell).toBeGreaterThan(0n);
      }
    },
  );

  fcTest.prop({ polyline: arbitraryPolyline })(
    "point on first vertex has zero distance",
    async ({ polyline }) => {
      const s2 = await s2Promise;
      const firstPoint = polyline.points[0];
      const distance = s2.distanceToPolyline(polyline.points, firstPoint);
      const meters = s2.chordAngleToMeters(distance);
      expect(meters).toBeLessThan(1); // Should be essentially 0
    },
  );
});
