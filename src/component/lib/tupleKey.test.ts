import { expect, test, describe } from "vitest";
import { encodeTupleKey, decodeTupleKey, encodeBound } from "./tupleKey.js";
import type { Id } from "../_generated/dataModel.js";

test("encodeTupleKey and decodeTupleKey", () => {
  const sortKey = 123456789;
  const pointId = "1234567890" as Id<"points">;
  const tupleKey = encodeTupleKey(sortKey, pointId);
  const decoded = decodeTupleKey(tupleKey);
  expect(decoded.sortKey).toEqual(sortKey);
  expect(decoded.pointId).toEqual(pointId);
});

describe("tupleKey ordering", () => {
  test("encodeBound should maintain numerical order", () => {
    // Test a range of values to ensure lexicographic ordering matches numerical ordering
    const testValues = [
      0, 1, 10, 100, 500, 1000, 1140, 1150, 1160, 1200, 2000, 10000,
      -1, -10, -100, -1000,
    ];

    // Generate all pairs and verify ordering
    for (let i = 0; i < testValues.length; i++) {
      for (let j = 0; j < testValues.length; j++) {
        const val1 = testValues[i];
        const val2 = testValues[j];
        const bound1 = encodeBound(val1);
        const bound2 = encodeBound(val2);

        // Lexicographic comparison should match numerical comparison
        const lexicographic = bound1 < bound2;
        const numerical = val1 < val2;

        if (lexicographic !== numerical) {
          console.error(`ORDERING BUG: ${val1} vs ${val2}`);
          console.error(`  Numerical: ${val1} < ${val2} = ${numerical}`);
          console.error(`  Lexicographic: "${bound1}" < "${bound2}" = ${lexicographic}`);
          console.error(`  Bound1: ${bound1}`);
          console.error(`  Bound2: ${bound2}`);
        }

        expect(lexicographic).toBe(numerical);
      }
    }
  });

  test("specific bug case: 1150 vs 1160", () => {
    const bound1150 = encodeBound(1150);
    const bound1160 = encodeBound(1160);

    console.log(`Bound for 1150: ${bound1150}`);
    console.log(`Bound for 1160: ${bound1160}`);
    console.log(`bound1150 < bound1160: ${bound1150 < bound1160}`);

    // This should be true since 1150 < 1160
    expect(bound1150 < bound1160).toBe(true);
  });

  test("encodeTupleKey roundtrip", () => {
    const testCases = [
      { sortKey: 0, pointId: "abc123" as Id<"points"> },
      { sortKey: 1140, pointId: "xyz789" as Id<"points"> },
      { sortKey: -100, pointId: "neg456" as Id<"points"> },
      { sortKey: 999999, pointId: "big000" as Id<"points"> },
    ];

    for (const testCase of testCases) {
      const encoded = encodeTupleKey(testCase.sortKey, testCase.pointId);
      const decoded = decodeTupleKey(encoded);
      expect(decoded.sortKey).toBe(testCase.sortKey);
      expect(decoded.pointId).toBe(testCase.pointId);
    }
  });

  test("encodeTupleKey maintains order with same sortKey", () => {
    // Tuples with the same sortKey should be ordered by pointId
    const tuple1 = encodeTupleKey(1140, "aaa" as Id<"points">);
    const tuple2 = encodeTupleKey(1140, "bbb" as Id<"points">);
    const tuple3 = encodeTupleKey(1140, "zzz" as Id<"points">);

    expect(tuple1 < tuple2).toBe(true);
    expect(tuple2 < tuple3).toBe(true);
    expect(tuple1 < tuple3).toBe(true);
  });

  test("encodeTupleKey maintains order with different sortKeys", () => {
    // Tuples with different sortKeys should be ordered by sortKey first
    const tuple1 = encodeTupleKey(1140, "zzz" as Id<"points">);
    const tuple2 = encodeTupleKey(1150, "aaa" as Id<"points">);

    // Even though "zzz" > "aaa", sortKey takes precedence
    expect(tuple1 < tuple2).toBe(true);
  });

  test("bound should be minimum tuple for that sortKey", () => {
    // The bound for a sortKey should be less than or equal to any tuple with that sortKey
    const bound = encodeBound(1140);
    const tuple1 = encodeTupleKey(1140, "" as Id<"points">);
    const tuple2 = encodeTupleKey(1140, "aaa" as Id<"points">);
    const tuple3 = encodeTupleKey(1140, "zzz" as Id<"points">);

    expect(bound <= tuple1).toBe(true);
    expect(bound <= tuple2).toBe(true);
    expect(bound <= tuple3).toBe(true);

    // And all tuples with sortKey=1140 should be less than bound for 1141
    const nextBound = encodeBound(1141);
    expect(tuple1 < nextBound).toBe(true);
    expect(tuple2 < nextBound).toBe(true);
    expect(tuple3 < nextBound).toBe(true);
  });
});
