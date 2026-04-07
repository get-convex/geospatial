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

test("polygon query - triangle", async () => {
  const t = convexTest(schema, modules);

  // Define a triangle roughly around (0, 0)
  // Points are: (1, 0), (0, 1), (-1, 0) forming a triangle
  const trianglePolygon = {
    exterior: [
      { latitude: 1, longitude: 0 },
      { latitude: 0, longitude: 1 },
      { latitude: -1, longitude: 0 },
    ],
  };

  // Insert points inside and outside the triangle
  const points = [
    {
      key: "inside1",
      coordinates: { latitude: 0, longitude: 0.3 }, // Inside
      sortKey: 1,
      filterKeys: {},
    },
    {
      key: "inside2",
      coordinates: { latitude: 0.2, longitude: 0.2 }, // Inside
      sortKey: 2,
      filterKeys: {},
    },
    {
      key: "outside1",
      coordinates: { latitude: 2, longitude: 2 }, // Outside
      sortKey: 3,
      filterKeys: {},
    },
    {
      key: "outside2",
      coordinates: { latitude: -2, longitude: -2 }, // Outside
      sortKey: 4,
      filterKeys: {},
    },
  ];

  // Insert all points
  for (const point of points) {
    await t.mutation(api.document.insert, {
      document: point,
      ...opts,
    });
  }

  // Query with triangle polygon
  const result = await t.query(api.query.execute, {
    query: {
      shape: { type: "polygon", polygon: trianglePolygon },
      filtering: [],
      sorting: { interval: {} },
      maxResults: 10,
    },
    ...opts,
    logLevel: "INFO",
  });

  // Should only return the inside points
  const keys = result.results.map((r) => r.key).sort();
  expect(keys).toEqual(["inside1", "inside2"]);
});

test("polygon query - square region", async () => {
  const t = convexTest(schema, modules);

  // Define a square polygon
  const squarePolygon = {
    exterior: [
      { latitude: 1, longitude: -1 },
      { latitude: 1, longitude: 1 },
      { latitude: -1, longitude: 1 },
      { latitude: -1, longitude: -1 },
    ],
  };

  // Insert points inside and outside
  const points = [
    {
      key: "center",
      coordinates: { latitude: 0, longitude: 0 }, // Inside
      sortKey: 1,
      filterKeys: {},
    },
    {
      key: "corner",
      coordinates: { latitude: 0.9, longitude: 0.9 }, // Inside
      sortKey: 2,
      filterKeys: {},
    },
    {
      key: "outside",
      coordinates: { latitude: 2, longitude: 0 }, // Outside
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
      shape: { type: "polygon", polygon: squarePolygon },
      filtering: [],
      sorting: { interval: {} },
      maxResults: 10,
    },
    ...opts,
    logLevel: "INFO",
  });

  const keys = result.results.map((r) => r.key).sort();
  expect(keys).toEqual(["center", "corner"]);
});

test("polygon query - with filtering", async () => {
  const t = convexTest(schema, modules);

  const polygon = {
    exterior: [
      { latitude: 1, longitude: -1 },
      { latitude: 1, longitude: 1 },
      { latitude: -1, longitude: 1 },
      { latitude: -1, longitude: -1 },
    ],
  };

  const points = [
    {
      key: "coffee1",
      coordinates: { latitude: 0, longitude: 0 },
      sortKey: 1,
      filterKeys: { category: "coffee" },
    },
    {
      key: "coffee2",
      coordinates: { latitude: 0.5, longitude: 0.5 },
      sortKey: 2,
      filterKeys: { category: "coffee" },
    },
    {
      key: "tea1",
      coordinates: { latitude: -0.5, longitude: -0.5 },
      sortKey: 3,
      filterKeys: { category: "tea" },
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
      shape: { type: "polygon", polygon },
      filtering: [
        { occur: "must", filterKey: "category", filterValue: "coffee" },
      ],
      sorting: { interval: {} },
      maxResults: 10,
    },
    ...opts,
    logLevel: "INFO",
  });

  const keys = result.results.map((r) => r.key).sort();
  expect(keys).toEqual(["coffee1", "coffee2"]);
});

test("S2Bindings - coverPolygon basic", async () => {
  const s2 = await S2Bindings.load();

  // Simple triangle
  const points = [
    { latitude: 0, longitude: 0 },
    { latitude: 1, longitude: 0 },
    { latitude: 0.5, longitude: 1 },
  ];

  const cells = s2.coverPolygon(points, 4, 16, 2, 8);

  // Should return some cells
  expect(cells.length).toBeGreaterThan(0);
  expect(cells.length).toBeLessThanOrEqual(8);
});

test("S2Bindings - polygonContainsPoint", async () => {
  const s2 = await S2Bindings.load();

  // Square from -1,-1 to 1,1
  const squarePoints = [
    { latitude: 1, longitude: -1 },
    { latitude: 1, longitude: 1 },
    { latitude: -1, longitude: 1 },
    { latitude: -1, longitude: -1 },
  ];

  // Center should be inside
  expect(s2.polygonContainsPoint(squarePoints, { latitude: 0, longitude: 0 })).toBe(true);

  // Corner area should be inside
  expect(s2.polygonContainsPoint(squarePoints, { latitude: 0.5, longitude: 0.5 })).toBe(true);

  // Outside should be outside
  expect(s2.polygonContainsPoint(squarePoints, { latitude: 2, longitude: 2 })).toBe(false);
  expect(s2.polygonContainsPoint(squarePoints, { latitude: 0, longitude: 5 })).toBe(false);
});

test("S2Bindings - polygon with clockwise points normalizes correctly", async () => {
  const s2 = await S2Bindings.load();

  // Clockwise square (opposite winding order)
  const clockwiseSquare = [
    { latitude: -1, longitude: -1 },
    { latitude: -1, longitude: 1 },
    { latitude: 1, longitude: 1 },
    { latitude: 1, longitude: -1 },
  ];

  // Should still work correctly due to loop.Normalize()
  expect(s2.polygonContainsPoint(clockwiseSquare, { latitude: 0, longitude: 0 })).toBe(true);
  expect(s2.polygonContainsPoint(clockwiseSquare, { latitude: 5, longitude: 5 })).toBe(false);
});

test("polygon query - concave L-shape", async () => {
  const t = convexTest(schema, modules);

  // L-shaped polygon (concave)
  //   2 +--+
  //     |  |
  //   1 +--+--+
  //     |     |
  //   0 +-----+
  //     0  1  2
  const lShapePolygon = {
    exterior: [
      { latitude: 0, longitude: 0 },
      { latitude: 0, longitude: 2 },
      { latitude: 1, longitude: 2 },
      { latitude: 1, longitude: 1 },
      { latitude: 2, longitude: 1 },
      { latitude: 2, longitude: 0 },
    ],
  };

  const points = [
    {
      key: "in_bottom",
      coordinates: { latitude: 0.5, longitude: 1.5 }, // Inside bottom part
      sortKey: 1,
      filterKeys: {},
    },
    {
      key: "in_left",
      coordinates: { latitude: 1.5, longitude: 0.5 }, // Inside left part
      sortKey: 2,
      filterKeys: {},
    },
    {
      key: "in_notch",
      coordinates: { latitude: 1.5, longitude: 1.5 }, // In the notch (outside L)
      sortKey: 3,
      filterKeys: {},
    },
    {
      key: "outside",
      coordinates: { latitude: 3, longitude: 3 }, // Clearly outside
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
      shape: { type: "polygon", polygon: lShapePolygon },
      filtering: [],
      sorting: { interval: {} },
      maxResults: 10,
    },
    ...opts,
    logLevel: "INFO",
  });

  const keys = result.results.map((r) => r.key).sort();
  // Should include points in the L, but NOT the notch or outside
  expect(keys).toEqual(["in_bottom", "in_left"]);
});

test("polygon query - pagination with cursor", async () => {
  const t = convexTest(schema, modules);

  // Square polygon
  const squarePolygon = {
    exterior: [
      { latitude: 1, longitude: -1 },
      { latitude: 1, longitude: 1 },
      { latitude: -1, longitude: 1 },
      { latitude: -1, longitude: -1 },
    ],
  };

  // Insert many points inside the polygon
  const numPoints = 10;
  for (let i = 0; i < numPoints; i++) {
    await t.mutation(api.document.insert, {
      document: {
        key: `point_${i}`,
        coordinates: {
          latitude: (i / numPoints) * 1.5 - 0.75, // Spread from -0.75 to 0.75
          longitude: (i / numPoints) * 1.5 - 0.75,
        },
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

  // Paginate through results
  for (let page = 0; page < 5; page++) {
    const result: ExecuteResult = await t.query(api.query.execute, {
      query: {
        shape: { type: "polygon" as const, polygon: squarePolygon },
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

  // Should have found all 10 points
  expect(allResults.length).toBe(numPoints);
});

test("polygon query - large polygon with many vertices", async () => {
  const t = convexTest(schema, modules);

  // Create a polygon with 60 vertices (approximating a circle)
  const numVertices = 60;
  const radius = 1; // degrees
  const center = { latitude: 0, longitude: 0 };
  const circleVertices = [];

  for (let i = 0; i < numVertices; i++) {
    const angle = (2 * Math.PI * i) / numVertices;
    circleVertices.push({
      latitude: center.latitude + radius * Math.sin(angle),
      longitude: center.longitude + radius * Math.cos(angle),
    });
  }

  const circlePolygon = { exterior: circleVertices };

  const points = [
    {
      key: "center",
      coordinates: { latitude: 0, longitude: 0 }, // Center of circle
      sortKey: 1,
      filterKeys: {},
    },
    {
      key: "near_edge",
      coordinates: { latitude: 0.5, longitude: 0 }, // Inside, halfway to edge
      sortKey: 2,
      filterKeys: {},
    },
    {
      key: "outside",
      coordinates: { latitude: 2, longitude: 0 }, // Outside the circle
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
      shape: { type: "polygon", polygon: circlePolygon },
      filtering: [],
      sorting: { interval: {} },
      maxResults: 10,
    },
    ...opts,
    logLevel: "INFO",
  });

  const keys = result.results.map((r) => r.key).sort();
  expect(keys).toEqual(["center", "near_edge"]);
});

test("S2Bindings - large polygon covering", async () => {
  const s2 = await S2Bindings.load();

  // Create a polygon with 100 vertices
  const numVertices = 100;
  const vertices = [];
  for (let i = 0; i < numVertices; i++) {
    const angle = (2 * Math.PI * i) / numVertices;
    vertices.push({
      latitude: Math.sin(angle) * 0.5,
      longitude: Math.cos(angle) * 0.5,
    });
  }

  const cells = s2.coverPolygon(vertices, 4, 16, 2, 8);

  // Should return valid cells
  expect(cells.length).toBeGreaterThan(0);
  expect(cells.length).toBeLessThanOrEqual(8);
});

test("S2Bindings - points near polygon boundary", async () => {
  const s2 = await S2Bindings.load();

  // Square from -1,-1 to 1,1
  const squarePoints = [
    { latitude: 1, longitude: -1 },
    { latitude: 1, longitude: 1 },
    { latitude: -1, longitude: 1 },
    { latitude: -1, longitude: -1 },
  ];

  // Test points very close to boundary (inside)
  expect(s2.polygonContainsPoint(squarePoints, { latitude: 0.999, longitude: 0 })).toBe(true);
  expect(s2.polygonContainsPoint(squarePoints, { latitude: 0, longitude: 0.999 })).toBe(true);

  // Test points very close to boundary (outside)
  expect(s2.polygonContainsPoint(squarePoints, { latitude: 1.001, longitude: 0 })).toBe(false);
  expect(s2.polygonContainsPoint(squarePoints, { latitude: 0, longitude: 1.001 })).toBe(false);

  // Test corners (exactly on vertex - behavior may vary, but should be consistent)
  const cornerResult = s2.polygonContainsPoint(squarePoints, { latitude: 1, longitude: 1 });
  // Just verify it doesn't crash and returns a boolean
  expect(typeof cornerResult).toBe("boolean");
});

test("S2Bindings - concave polygon containment", async () => {
  const s2 = await S2Bindings.load();

  // L-shaped polygon
  const lShape = [
    { latitude: 0, longitude: 0 },
    { latitude: 0, longitude: 2 },
    { latitude: 1, longitude: 2 },
    { latitude: 1, longitude: 1 },
    { latitude: 2, longitude: 1 },
    { latitude: 2, longitude: 0 },
  ];

  // Inside the L
  expect(s2.polygonContainsPoint(lShape, { latitude: 0.5, longitude: 0.5 })).toBe(true);
  expect(s2.polygonContainsPoint(lShape, { latitude: 0.5, longitude: 1.5 })).toBe(true);
  expect(s2.polygonContainsPoint(lShape, { latitude: 1.5, longitude: 0.5 })).toBe(true);

  // In the notch (outside)
  expect(s2.polygonContainsPoint(lShape, { latitude: 1.5, longitude: 1.5 })).toBe(false);

  // Clearly outside
  expect(s2.polygonContainsPoint(lShape, { latitude: 3, longitude: 3 })).toBe(false);
});

describe("property-based polygon tests", () => {
  // Reuse a single S2Bindings instance for performance
  const s2Promise = S2Bindings.load();

  // Arbitrary for generating valid polygon vertices (convex, to ensure valid shape)
  const arbitraryConvexPolygon = fc
    .tuple(
      fc.float({ min: Math.fround(-45), max: Math.fround(45), noNaN: true }), // center lat
      fc.float({ min: Math.fround(-90), max: Math.fround(90), noNaN: true }), // center lng
      fc.float({ min: Math.fround(0.1), max: Math.fround(5), noNaN: true }), // radius in degrees
      fc.integer({ min: 3, max: 20 }), // number of vertices
    )
    .map(([centerLat, centerLng, radius, numVertices]): {
      center: { latitude: number; longitude: number };
      vertices: { latitude: number; longitude: number }[];
      radius: number;
    } => {
      const vertices: { latitude: number; longitude: number }[] = [];
      for (let i = 0; i < numVertices; i++) {
        const angle = (2 * Math.PI * i) / numVertices;
        vertices.push({
          latitude: centerLat + radius * Math.sin(angle) * 0.5,
          longitude: centerLng + radius * Math.cos(angle),
        });
      }
      return { center: { latitude: centerLat, longitude: centerLng }, vertices, radius };
    });

  fcTest.prop({ polygon: arbitraryConvexPolygon })(
    "center point is always inside convex polygon",
    async ({ polygon }) => {
      const s2 = await s2Promise;
      const contains = s2.polygonContainsPoint(polygon.vertices, polygon.center);
      expect(contains).toBe(true);
    },
  );

  fcTest.prop({ polygon: arbitraryConvexPolygon })(
    "far away point is always outside polygon",
    async ({ polygon }) => {
      const s2 = await s2Promise;
      // Point very far from center (at least 2x radius away)
      const farPoint = {
        latitude: Math.max(-89, Math.min(89, polygon.center.latitude + polygon.radius * 3)),
        longitude: polygon.center.longitude + polygon.radius * 3,
      };
      const contains = s2.polygonContainsPoint(polygon.vertices, farPoint);
      expect(contains).toBe(false);
    },
  );

  fcTest.prop({ polygon: arbitraryConvexPolygon })(
    "coverPolygon returns valid cells",
    async ({ polygon }) => {
      const s2 = await s2Promise;
      const cells = s2.coverPolygon(polygon.vertices, 4, 16, 2, 8);

      expect(cells.length).toBeGreaterThan(0);
      expect(cells.length).toBeLessThanOrEqual(8);

      // All cells should be valid bigints
      for (const cell of cells) {
        expect(typeof cell).toBe("bigint");
        expect(cell).toBeGreaterThan(0n);
      }
    },
  );
});
