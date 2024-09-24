import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "../_generated/api.js";
import schema from "../schema.js";
import { modules } from "../test.setup.js";
import { decodeTupleKey } from "../lib/tupleKey.js";
import { test as fcTest, fc } from "@fast-check/vitest";
import { arbitraryDocument, arbitraryResolution } from "./arbitrary.test.js";

const percentage = fc.float({ min: Math.fround(1e-2), max: 1, noNaN: true });

const enclosingRectangle = fc.record({
  north: percentage,
  south: percentage,
  east: percentage,
  west: percentage,
});

const enclosingRectangles = fc.array(enclosingRectangle, {
  minLength: 1,
  maxLength: 10,
});

// fcTest.prop({ document: arbitraryDocument, enclosingRectangles })
//     ("query containing rectangle", async ({ document, enclosingRectangles }) => {
//         const resolution = 10;
//         const t = convexTest(schema, modules);
//         await t.mutation(api.document.insert, {
//             document,
//             maxResolution: resolution,
//         });

//         for (const enclosingRectangle of enclosingRectangles) {
//             const minLongitude = -180;
//             const rectangleMinLongitude = (document.coordinates.longitude - minLongitude) * (1 - enclosingRectangle.west) + minLongitude;
//             const maxLongitude = 180;
//             const rectangleMaxLongitude = (maxLongitude - document.coordinates.longitude) * enclosingRectangle.east + document.coordinates.longitude;
//             const minLatitude = -90;
//             const rectangleMinLatitude = (document.coordinates.latitude - minLatitude) * (1 - enclosingRectangle.south) + minLatitude;
//             const maxLatitude = 90;
//             const rectangleMaxLatitude = (maxLatitude - document.coordinates.latitude) * enclosingRectangle.north + document.coordinates.latitude;
//             const rectangle = {
//                 sw: {
//                     latitude: rectangleMinLatitude,
//                     longitude: rectangleMinLongitude,
//                 },
//                 nw: {
//                     latitude: rectangleMaxLatitude,
//                     longitude: rectangleMinLongitude,
//                 },
//                 ne: {
//                     latitude: rectangleMaxLatitude,
//                     longitude: rectangleMaxLongitude,
//                 },
//                 se: {
//                     latitude: rectangleMinLatitude,
//                     longitude: rectangleMaxLongitude,
//                 },
//             };

//             const result = await t.query(api.query.execute, {
//                 query: {
//                     rectangle,
//                     filtering: [],
//                     sorting: {
//                         interval: {}
//                     },
//                     maxResults: 10,
//                 },
//                 maxResolution: resolution,
//                 logLevel: "DEBUG",
//             });
//             expect(result.results.length).toEqual(1);
//             expect(result.results[0].key).toEqual(document.key);
//         }
//     });

test("repro", async () => {
  // const t = convexTest(schema, modules);
  // const document = { "key": "", "sortKey": 0, "filterKeys": {}, "coordinates": { "latitude": 0, "longitude": 0 } };
  // const enclosingRectangle = { "north": 0.009999999776482582, "south": 0.009999999776482582, "east": 0.009999999776482582, "west": 0.13814382255077362 };
  // const resolution = 10;
  // await t.mutation(api.document.insert, {
  //     document,
  //     maxResolution: resolution,
  // });
  // await t.run(async (ctx) => {
  //     const indexEntries = await ctx.db.query("pointsbyH3Cell").collect();
  //     console.log(indexEntries);
  // });
  // const minLongitude = -180;
  // const rectangleMinLongitude = (document.coordinates.longitude - minLongitude) * (1 - enclosingRectangle.west) + minLongitude;
  // const maxLongitude = 180;
  // const rectangleMaxLongitude = (maxLongitude - document.coordinates.longitude) * enclosingRectangle.east + document.coordinates.longitude;
  // const minLatitude = -90;
  // const rectangleMinLatitude = (document.coordinates.latitude - minLatitude) * (1 - enclosingRectangle.south) + minLatitude;
  // const maxLatitude = 90;
  // const rectangleMaxLatitude = (maxLatitude - document.coordinates.latitude) * enclosingRectangle.north + document.coordinates.latitude;
  // const rectangle = {
  //     sw: {
  //         latitude: rectangleMinLatitude,
  //         longitude: rectangleMinLongitude,
  //     },
  //     nw: {
  //         latitude: rectangleMaxLatitude,
  //         longitude: rectangleMinLongitude,
  //     },
  //     ne: {
  //         latitude: rectangleMaxLatitude,
  //         longitude: rectangleMaxLongitude,
  //     },
  //     se: {
  //         latitude: rectangleMinLatitude,
  //         longitude: rectangleMaxLongitude,
  //     },
  // };
  // console.log(rectangle);
  // const result = await t.query(api.query.execute, {
  //     query: {
  //         rectangle,
  //         filtering: [],
  //         sorting: {
  //             interval: {}
  //         },
  //         maxResults: 10,
  //     },
  //     maxResolution: resolution,
  //     logLevel: "DEBUG",
  // });
  // expect(result.results.length).toEqual(1);
  // expect(result.results[0].key).toEqual(document.key);
});
