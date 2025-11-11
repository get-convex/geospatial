// Encode (sortKey: number, pointId: Id<"points">) as an order preserving string.

import type { Id } from "../_generated/dataModel.js";
import * as d64 from "./d64.js";

export type TupleKey = string;

export function encodeTupleKey(
  sortKey: number,
  pointId: Id<"points">,
): TupleKey {
  const buf = new ArrayBuffer(9);
  const view = new DataView(buf);

  // Write `0x0D` as the header.
  view.setUint8(0, 0x0d);

  const littleEndian = true;
  view.setFloat64(1, sortKey, littleEndian);

  let sortKeyUint64 = view.getBigUint64(1, littleEndian);

  // Flip all of the bits if the sign bit is set.
  if ((sortKeyUint64 & (1n << 63n)) !== 0n) {
    sortKeyUint64 = ~sortKeyUint64;
  }
  // Otherwise, just flip the sign bit.
  else {
    sortKeyUint64 |= 1n << 63n;
  }
  view.setBigUint64(1, sortKeyUint64, littleEndian);

  let out = d64.encode(buf);
  out += `:${pointId}`;
  return out;
}

export function decodeTupleKey(key: TupleKey): {
  sortKey: number;
  pointId: Id<"points">;
} {
  const pieces = key.split(":");
  if (pieces.length !== 2) {
    throw new Error(
      `Invalid tuple key ${key}: Expected two parts separated by a colon`,
    );
  }
  const [encodedSortKey, pointId] = pieces;
  const buf = d64.decode(encodedSortKey);
  if (buf.byteLength !== 9) {
    throw new Error(
      `Invalid tuple key ${key}: Expected 9 bytes, got ${buf.byteLength}`,
    );
  }
  const view = new DataView(buf);
  if (view.getUint8(0) !== 0x0d) {
    throw new Error(
      `Invalid tuple key ${key}: Expected header 0x0D, got ${view.getUint8(0)}`,
    );
  }
  const littleEndian = true;
  let encodedUint64 = view.getBigUint64(1, littleEndian);
  // If the sign bit was set, just turn it off.
  if ((encodedUint64 & (1n << 63n)) !== 0n) {
    encodedUint64 &= ~(1n << 63n);
  }
  // Otherwise, flip all of the bits.
  else {
    encodedUint64 = ~encodedUint64;
  }
  view.setBigUint64(1, encodedUint64, littleEndian);
  const sortKey = view.getFloat64(1, littleEndian);
  return { sortKey, pointId: pointId as Id<"points"> };
}

export function encodeBound(sortKey: number): string {
  return encodeTupleKey(sortKey, "" as Id<"points">);
}
