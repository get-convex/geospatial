import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "../_generated/api.js";
import schema from "../schema.js";
import { modules } from "../test.setup.js";
import { test as fcTest } from "@fast-check/vitest";
import {
  arbitraryDocuments,
  arbitraryResolution,
} from "./arbitrary.helpers.js";

test("CRUD operations", async () => {
  const t = convexTest(schema, modules);
  const document = {
    key: "test",
    coordinates: { latitude: 0, longitude: 0 },
    sortKey: 1,
    filterKeys: {},
  };
  await t.mutation(api.document.insert, {
    document,
    maxResolution: 10,
  });
  const result = await t.query(api.document.get, { key: "test" });
  expect(result).toEqual(document);

  const newDocument = {
    key: "test",
    coordinates: { latitude: 0, longitude: 0 },
    sortKey: 2,
    filterKeys: {},
  };
  await t.mutation(api.document.insert, {
    document: newDocument,
    maxResolution: 10,
  });
  const result2 = await t.query(api.document.get, { key: "test" });
  expect(result2).toEqual(newDocument);

  await t.mutation(api.document.remove, {
    key: "test",
    maxResolution: 10,
  });
  const result3 = await t.query(api.document.get, { key: "test" });
  expect(result3).toEqual(null);

  await t.run(async (ctx) => {
    const indexEntries = await ctx.db.query("pointsByCell").collect();
    expect(indexEntries.length).toEqual(0);

    const filterEntries = await ctx.db.query("pointsByFilterKey").collect();
    expect(filterEntries.length).toEqual(0);
  });
});

fcTest.prop({ documents: arbitraryDocuments, resolution: arbitraryResolution })(
  "insert and delete",
  async ({ documents, resolution }) => {
    const t = convexTest(schema, modules);

    const documentsByKey = new Map<string, any>();

    for (const document of documents) {
      await t.mutation(api.document.insert, {
        document,
        maxResolution: resolution,
      });
      const result = await t.query(api.document.get, { key: document.key });
      expect(result).toEqual(document);
      documentsByKey.set(document.key, document);
    }

    for (const [key, document] of documentsByKey) {
      const result = await t.query(api.document.get, { key });
      expect(result).toEqual(document);

      await t.mutation(api.document.remove, {
        key,
        maxResolution: resolution,
      });
      const result2 = await t.query(api.document.get, { key });
      expect(result2).toEqual(null);
    }
  },
  10000,
);
