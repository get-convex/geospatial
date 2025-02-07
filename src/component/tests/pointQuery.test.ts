import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { test as fcTest } from "@fast-check/vitest";
import { arbitraryDocuments } from "./arbitrary.helpers.js";
import schema from "../schema.js";
import { modules } from "../test.setup.js";
import { S2Bindings } from "../lib/s2Bindings.js";
import { ClosestPointQuery } from "../lib/pointQuery.js";
import { createLogger } from "../lib/logging.js";
import { api } from "../_generated/api.js";

const opts = {
  minLevel: 4,
  maxLevel: 16,
  levelMod: 2,
  maxCells: 8,
};

test("closest point query - basic functionality", async () => {
  const t = convexTest(schema, modules);
  const s2 = await S2Bindings.load();
  const logger = createLogger("INFO");

  // Insert some test points
  const points = [
    {
      key: "point1",
      coordinates: { latitude: 0, longitude: 0 },
      sortKey: 1,
      filterKeys: {},
    },
    {
      key: "point2",
      coordinates: { latitude: 1, longitude: 1 },
      sortKey: 2,
      filterKeys: {},
    },
    {
      key: "point3",
      coordinates: { latitude: -1, longitude: -1 },
      sortKey: 3,
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

  await t.run(async (ctx) => {
    // Test finding closest point to origin
    const query1 = new ClosestPointQuery(
      s2,
      logger,
      { latitude: 0, longitude: 0 },
      1000, // maxDistance in meters
      1, // maxResults
      opts.minLevel,
      opts.maxLevel,
      opts.levelMod,
    );
    const result1 = await query1.execute(ctx);
    expect(result1.length).toBe(1);
    expect(result1[0].key).toBe("point1");
    expect(result1[0].distance).toBeLessThan(1); // Should be very close to 0

    // Test finding closest points to (1,1)
    const query2 = new ClosestPointQuery(
      s2,
      logger,
      { latitude: 1, longitude: 1 },
      10000000,
      2,
      opts.minLevel,
      opts.maxLevel,
      opts.levelMod,
    );
    const result2 = await query2.execute(ctx);
    expect(result2.length).toBe(2);
    expect(result2[0].key).toBe("point2");
    expect(result2[1].key).toBe("point1");
    expect(result2[0].distance).toBeLessThan(result2[1].distance);

    // Test maxDistance constraint
    const query3 = new ClosestPointQuery(
      s2,
      logger,
      { latitude: 0, longitude: 0 },
      50, // Small radius in meters
      10,
      opts.minLevel,
      opts.maxLevel,
      opts.levelMod,
    );
    const result3 = await query3.execute(ctx);
    expect(result3.length).toBe(1);
    expect(result3[0].key).toBe("point1");
  });
});

fcTest.prop({ documents: arbitraryDocuments })(
  "closest point query - property based testing",
  async ({ documents }) => {
    const t = convexTest(schema, modules);
    const s2 = await S2Bindings.load();
    const logger = createLogger("INFO");

    // Insert all documents
    for (const document of documents) {
      await t.mutation(api.document.insert, {
        document,
        ...opts,
      });
    }

    await t.run(async (ctx) => {
      const testPoint = { latitude: 0, longitude: 0 };
      const query = new ClosestPointQuery(
        s2,
        logger,
        testPoint,
        1000,
        documents.length,
        opts.minLevel,
        opts.maxLevel,
        opts.levelMod,
      );
      const results = await query.execute(ctx);

      // Verify results are ordered by distance
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].distance).toBeLessThanOrEqual(
          results[i].distance,
        );
      }

      // Verify all distances are within maxDistance
      for (const result of results) {
        expect(result.distance).toBeLessThanOrEqual(1000);
      }
    });
  },
  10000,
);
