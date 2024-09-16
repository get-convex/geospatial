import { expect, test } from "vitest";
import { encode, decode } from "./d64.js";

test("encode and decode", () => {
  const array = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const encoded = encode(array.buffer);
  const decoded = decode(encoded);
  expect(array.buffer).toEqual(decoded);
});
