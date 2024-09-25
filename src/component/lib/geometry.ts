import {
  cellToBoundary,
  cellToChildren,
  cellToParent,
  CoordPair,
  getRes0Cells,
  greatCircleDistance,
  gridDisk,
  latLngToCell,
  UNITS,
} from "h3-js";
import { Point, Rectangle } from "../types.js";
import { Logger } from "./logging.js";
import * as turf from "@turf/turf";

export function latLngToCells(maxResolution: number, point: Point) {
  const leafCell = latLngToCell(
    point.latitude,
    point.longitude,
    maxResolution + 1,
  );
  if (leafCell === null) {
    throw new Error("Invalid coordinates");
  }
  const cells = [leafCell];
  for (let resolution = maxResolution; resolution >= 0; resolution--) {
    const parentCell = cellToParent(leafCell, resolution);
    if (parentCell === null) {
      throw new Error("Invalid resolution");
    }
    cells.push(parentCell);
  }
  return cells;
}

export function polygonContains(point: Point, polygon: Point[]) {
  let contains = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const { latitude: xi, longitude: yi } = polygon[i];
    const { latitude: xj, longitude: yj } = polygon[j];
    const intersect =
      yi > point.longitude !== yj > point.longitude &&
      point.latitude < ((xj - xi) * (point.latitude - yi)) / (yj - yi) + xi;
    if (intersect) {
      contains = !contains;
    }
  }
  return contains;
}

// export function rectangleContains(rectangle: Rectangle, point: Point) {
//   return polygonContains(point, rectangleToPolygon(rectangle));
// }

export function normalizeLongitude(longitude: number) {
  return ((((longitude + 180) % 360) + 360) % 360) - 180;
}

export function validateLatitude(latitude: number) {
  if (latitude < -90 || latitude > 90) {
    throw new Error(`Latitude ${latitude} must be in [-90, 90]`);
  }
}

export function validateLongitude(longitude: number) {
  if (longitude < -180 || longitude >= 180) {
    throw new Error(`Longitude ${longitude} must be in [-180, 180)`);
  }
}

export function rectangleToPolygon(rectangle: Rectangle) {
  if (rectangle.south > rectangle.north) {
    throw new Error("Bottom edge of rectangle must be below top edge");
  }
  validateLatitude(rectangle.south);
  validateLatitude(rectangle.north);
  validateLongitude(rectangle.west);
  validateLongitude(rectangle.east);
  const linearRings = [];
  if (rectangle.west > rectangle.east) {
    // Split the rectangle into two rings across the antimeridian.
    return turf.multiPolygon([
      [
        [
          [rectangle.west, rectangle.south],
          [rectangle.west, rectangle.north],
          [180, rectangle.north],
          [180, rectangle.south],
          [rectangle.west, rectangle.south],
        ],
      ],
      [
        [
          [-180, rectangle.south],
          [-180, rectangle.north],
          [rectangle.east, rectangle.north],
          [rectangle.east, rectangle.south],
          [-180, rectangle.south],
        ],
      ],
    ]);
  } else {
    return turf.polygon([
      [
        [rectangle.west, rectangle.south],
        [rectangle.west, rectangle.north],
        [rectangle.east, rectangle.north],
        [rectangle.east, rectangle.south],
        [rectangle.west, rectangle.south],
      ],
    ]);
  }
}

function pointArraysEqual(p: [number, number], q: [number, number]) {
  return p[0] == q[0] && p[1] == q[1];
}

export function h3CellToPolygon(cell: string) {
  const h3Vertices = cellToBoundary(cell, true);
  const first = h3Vertices[0];
  if (!first) {
    throw new Error(`Invalid H3 boundary for ${cell}`);
  }
  const last = h3Vertices[h3Vertices.length - 1];
  if (!pointArraysEqual(first, last)) {
    throw new Error(`H3 vertices for ${cell} do not form a loop.`);
  }
  console.log("h3", h3Vertices);

  const firstLoop = [first];
  let secondLoop: CoordPair[] | null = null;
  let currentLoop = firstLoop;

  // H3 returns its points in clockwise order.
  // 179 -> -179
  // -179 -> 179

  for (const current of h3Vertices.slice(1)) {
    const prev = currentLoop.at(-1)!;

    const prevLng = prev[0];
    const currentLng = current[0];

    // HACK: Use a longitude difference of 180 degrees as signal
    // that the polygon has crossed the antimeridian. This
    // is safe since we know the maximum edge length for
    // h3 cells is smaller.
    const crosses =
      Math.abs(prevLng - currentLng) >= 180 &&
      Math.abs(Math.abs(prevLng) - Math.abs(currentLng)) <= 10;
    // const line = turf.lineString([prev, current])
    // console.log(turf.length(line, {units: "kilometers"}), JSON.stringify(line))
    // const antimeridian = turf.lineString([[180, 90], [180, -90]]);
    // console.log('intersects', turf.lineIntersect(antimeridian, turf.lineString([prev, current])))
    // const crosses = turf.lineIntersect(antimeridian, turf.lineString([prev, current])).features.length > 0;

    console.log(prev, current, crosses);
    if (!crosses) {
      currentLoop.push(current);
      continue;
    }

    if (prevLng > 0) {
      const rightLng = currentLng + 360;
      const dx = rightLng - prevLng;
      const dy = current[1] - prev[1];
      const t = (180 - prevLng) / dx;

      const latitude = t * dy + prev[1];
      console.log({ dx, dy, t, latitude });
      if (!secondLoop) {
        firstLoop.push([180, latitude]);
        const newLoop: CoordPair[] = [[-180, latitude], current];
        secondLoop = newLoop;
        currentLoop = secondLoop;
      } else {
        console.log("second loop done");
        secondLoop.push([180, latitude], secondLoop[0]);
        firstLoop.push([-180, latitude], current);
        currentLoop = firstLoop;
      }
    } else {
      const rightLng = currentLng - 360;
      const dx = rightLng - prevLng;
      const dy = current[1] - prev[1];
      const t = (-180 - prevLng) / dx;
      const latitude = t * dy + prev[1];
      console.log({ dx, dy, t, latitude });

      if (!secondLoop) {
        firstLoop.push([-180, latitude]);
        const newLoop: CoordPair[] = [[180, latitude], current];
        secondLoop = newLoop;
        currentLoop = secondLoop;
      } else {
        console.log("second loop done");
        secondLoop.push([-180, latitude], secondLoop[0]);
        firstLoop.push([180, latitude], current);
        currentLoop = firstLoop;
      }
    }
  }

  if (secondLoop) {
    return turf.multiPolygon([[firstLoop], [secondLoop]]);
  } else {
    return turf.polygon([firstLoop]);
  }
}

export function coverRectangle(
  logger: Logger,
  rectangle: Rectangle,
  maxResolution: number,
  minOverlap: number = 0.5,
): Set<string> {
  console.log("coverRectangle", rectangle, maxResolution, minOverlap);
  console.time("coverRectangle");
  if (maxResolution < 0 || maxResolution > 15) {
    throw new Error("maxResolution must be between 0 and 15.");
  }
  if (minOverlap < 0 || minOverlap > 1) {
    throw new Error("minOverlap must be between 0 and 1.");
  }

  // Split the query rectangle if it crosses the antimeridian.
  const antimeridian = turf.lineString([
    [-180, 0],
    [180, 0],
  ]);
  const rectanglePolygons = [];
  if (rectangle.east < rectangle.west) {
    rectanglePolygons.push(
      turf.polygon([rectangleToGeoJSON({ ...rectangle, east: 180 })]),
    );
    rectanglePolygons.push(
      turf.polygon([rectangleToGeoJSON({ ...rectangle, west: -180 })]),
    );
    logger.info(`Split rectangle into two polygons to avoid the antimeridian.`);
  } else {
    rectanglePolygons.push(turf.polygon([rectangleToGeoJSON(rectangle)]));
  }

  const allCells = new Set<string>();

  for (const rectanglePolygon of rectanglePolygons) {
    const rectangleArea = turf.area(rectanglePolygon);
    let resolution = 0;
    let candidates = new Set<string>();
    for (const cell of getRes0Cells()) {
      const polygon = turf.polygon([cellToBoundary(cell, true)]);

      const anyNegative = polygon.geometry.coordinates[0].some(
        ([lng, _lat]) => lng < 0,
      );
      const anyPositive = polygon.geometry.coordinates[0].some(
        ([lng, _lat]) => lng > 0,
      );

      if (anyNegative && anyPositive) {
        continue;
      }
      candidates.add(cell);
      // if (!turf.lineIntersect(antimeridian, polygon).features.length) {
      //   candidates.add(cell);
      // }
    }
    while (true) {
      const { cells, tiledArea } = coverRectangleAtResolution(
        logger,
        rectanglePolygon,
        candidates,
      );
      logger.info(
        `At resolution ${resolution}, ${cells.size} cells cover ${rectangleArea}/${tiledArea} = ${((rectangleArea / tiledArea) * 100).toFixed(2)}%`,
      );
      if (
        rectangleArea / tiledArea >= minOverlap ||
        resolution >= maxResolution
      ) {
        for (const cell of cells.values()) {
          allCells.add(cell);
        }
        break;
      }
      candidates = expandCandidates(logger, cells, resolution);
      resolution++;
    }
  }
  console.timeEnd("coverRectangle");
  return allCells;
}

function coverRectangleAtResolution(
  logger: Logger,
  rectanglePolygon: any,
  candidates: Set<string>,
): { cells: Set<string>; tiledArea: number } {
  const cells = new Set<string>();
  let tiledArea = 0;
  for (const cell of candidates) {
    const polygon = turf.polygon([cellToBoundary(cell, true)]);
    const overlaps =
      turf.booleanContains(rectanglePolygon, polygon) ||
      turf.booleanContains(polygon, rectanglePolygon) ||
      turf.booleanIntersects(rectanglePolygon, polygon);
    if (overlaps) {
      cells.add(cell);
      tiledArea += turf.area(polygon);
    }
  }
  return { cells, tiledArea };
}

function expandCandidates(
  logger: Logger,
  candidates: Set<string>,
  resolution: number,
): Set<string> {
  const expanded = new Set<string>();
  for (const cell of candidates.values()) {
    for (const child of cellToChildren(cell, resolution + 1)) {
      expanded.add(child);
      for (const neighbor of gridDisk(child, 1)) {
        expanded.add(neighbor);
      }
    }
  }
  return expanded;
}
