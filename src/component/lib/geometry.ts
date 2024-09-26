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
import { Feature, GeoJsonProperties, Polygon } from "geojson";

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

// `turf` doesn't fully support multi-polygons.
class DisjointPolygons {
  polygons: Feature<Polygon, GeoJsonProperties>[];
  constructor(...polygons: Feature<Polygon, GeoJsonProperties>[]) {
    this.polygons = polygons;
  }

  area() {
    return this.polygons.reduce((acc, polygon) => acc + turf.area(polygon), 0);
  }

  overlaps(other: DisjointPolygons) {
    if (this.contains(other) || other.contains(this)) {
      return true;
    }
    for (const polygon of this.polygons) {
      for (const otherPolygon of other.polygons) {
        if (turf.booleanContains(polygon, otherPolygon) || turf.booleanContains(otherPolygon, polygon) || turf.booleanIntersects(polygon, otherPolygon)) {
          return true;
        }
      }
    }
    return false;
  }

  contains(other: DisjointPolygons) {
    return other.polygons.every(polygon => this.polygons.some(p => turf.booleanContains(p, polygon)));
  }

  containsPoint(point: Point) {
    const p = turf.point([point.longitude, point.latitude]);
    return this.polygons.some(polygon => turf.booleanPointInPolygon(p, polygon));
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
  if (rectangle.west > rectangle.east) {
    // Split the rectangle into two rings across the antimeridian.    
    return new DisjointPolygons(
      turf.polygon([
        [
          [rectangle.west, rectangle.south],
          [rectangle.west, rectangle.north],
          [180, rectangle.north],
          [180, rectangle.south],
          [rectangle.west, rectangle.south],
        ],
      ]),
      turf.polygon([
        [
          [-180, rectangle.south],
          [-180, rectangle.north],
          [rectangle.east, rectangle.north],
          [rectangle.east, rectangle.south],
          [-180, rectangle.south],
        ],
      ]),
    );
  } else {
    return new DisjointPolygons(
      turf.polygon([
        [
          [rectangle.west, rectangle.south],
          [rectangle.west, rectangle.north],
          [rectangle.east, rectangle.north],
          [rectangle.east, rectangle.south],
          [rectangle.west, rectangle.south],
        ],
      ]),
    );
  }
}

function pointArraysEqual(p: [number, number], q: [number, number]) {
  return p[0] == q[0] && p[1] == q[1];
}

const hackyExemptions = new Set([
  "8003fffffffffff",
  // "80edfffffffffff",
  "81033ffffffffff",
  "81f2bffffffffff",

  // NEW
  "8001fffffffffff",
  '80f3fffffffffff',
  '820327fffffffff',
  '82f297fffffffff',
]);

export function cellToPolygon(cell: string): DisjointPolygons {
  const h3Vertices = cellToBoundary(cell, true);
  const first = h3Vertices[0];
  if (!first) {
    throw new Error(`Invalid H3 boundary for ${cell}`);
  }
  const last = h3Vertices[h3Vertices.length - 1];
  if (!pointArraysEqual(first, last)) {
    throw new Error(`H3 vertices for ${cell} do not form a loop.`);
  }

  const firstLoop = [first];
  let secondLoop: CoordPair[] | null = null;
  let currentLoop = firstLoop;

  let numCrosses = 0;

  for (const current of h3Vertices.slice(1)) {
    const [currentLng, currentLat] = current;
    const prev = currentLoop.at(-1)!;
    const [prevLng, prevLat] = prev;

    // HACK: Use a longitude difference of 180 degrees as signal
    // that the polygon has crossed the antimeridian. This
    // is safe since we know the maximum edge length for
    // h3 cells is smaller.
    const crossesAntimeridian =
      Math.abs(prevLng - currentLng) >= 180 &&
      !hackyExemptions.has(cell);

    if (!crossesAntimeridian) {
      currentLoop.push(current);
      continue;
    }

    numCrosses++;

    // If `prevLng > 0`, we're heading east, and we want to wrap
    // around `currentLng < 0` to compute our intersection point.
    // If `prevLng < 0`, we're going west and want to subtract 360
    // degrees such that `endLng < prevLng`.
    const endLng = currentLng + (prevLng > 0 ? 360 : -360);
    const dx = endLng - prevLng;
    const dy = currentLat - prevLat;

    // If we're going east, use +180 as the antimeridian.
    const antimeridianLng = prevLng > 0 ? 180 : -180;
    const t = (antimeridianLng - prevLng) / dx;
    const latitude = prevLat + dy * t;

    if (!secondLoop) {
      firstLoop.push([antimeridianLng, latitude]);
      const newLoop: CoordPair[] = [[antimeridianLng * -1, latitude], current];
      secondLoop = newLoop;
      currentLoop = secondLoop;
    } else {
      secondLoop.push([antimeridianLng, latitude], secondLoop[0]);
      firstLoop.push([antimeridianLng * -1, latitude], current);
      currentLoop = firstLoop;
    }
  }
  if (numCrosses % 2 !== 0) {
    throw new Error(`Invalid number of antimeridian crossings for ${cell}: ${numCrosses}`);
  }
  if (secondLoop) {
    return new DisjointPolygons(turf.polygon([firstLoop]), turf.polygon([secondLoop]));
  } else {
    return new DisjointPolygons(turf.polygon([firstLoop]));
  }
}

export function coverRectangle(
  logger: Logger,
  rectanglePolygon: DisjointPolygons,
  maxResolution: number,
  minOverlap: number = 0.5,
): Set<string> {
  console.time("coverRectangle");
  if (maxResolution < 0 || maxResolution > 15) {
    throw new Error("maxResolution must be between 0 and 15.");
  }
  if (minOverlap < 0 || minOverlap > 1) {
    throw new Error("minOverlap must be between 0 and 1.");
  }

  const allCells = new Set<string>();

  const rectangleArea = rectanglePolygon.area();
  let resolution = 0;
  let candidates = new Set<string>();
  for (const cell of getRes0Cells()) {
    candidates.add(cell);
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

  console.timeEnd("coverRectangle");
  return allCells;
}

function coverRectangleAtResolution(
  logger: Logger,
  rectanglePolygon: DisjointPolygons,
  candidates: Set<string>,
): { cells: Set<string>; tiledArea: number } {
  const cells = new Set<string>();
  let tiledArea = 0;
  for (const cell of candidates) {
    const polygon = cellToPolygon(cell);
    if (polygon.overlaps(rectanglePolygon)) {
      cells.add(cell);
      tiledArea += polygon.area();
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
