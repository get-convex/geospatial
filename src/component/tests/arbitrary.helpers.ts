import { fc } from "@fast-check/vitest";

const objectKeys = "abcdefghijklmnopqrstuvwxyz".split("");

export const arbitraryDocument = fc.record({
  key: fc.string(),
  sortKey: fc.float(),
  filterKeys: fc.dictionary(
    fc.string({ unit: fc.constantFrom(...objectKeys) }),
    fc.string(),
  ),
  coordinates: fc.record({
    latitude: fc.float({ min: -90, max: 90, noNaN: true }),
    longitude: fc.float({ min: -180, max: 180, noNaN: true }),
  }),
});

export const arbitraryDocuments = fc.array(arbitraryDocument, {
  minLength: 1,
  maxLength: 4,
});
