import { expect, test } from "vitest";
import { encodeTupleKey, decodeTupleKey } from "./tupleKey.js";
import type { Id } from "../_generated/dataModel.js";

test("encodeTupleKey and decodeTupleKey", () => {
  const sortKey = 123456789;
  const pointId = "1234567890" as Id<"points">;
  const tupleKey = encodeTupleKey(sortKey, pointId);
  const decoded = decodeTupleKey(tupleKey);
  expect(decoded.sortKey).toEqual(sortKey);
  expect(decoded.pointId).toEqual(pointId);
});
