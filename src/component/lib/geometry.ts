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
import { Latitude, Longitude, Point, Rectangle } from "../types.js";
import { Logger } from "./logging.js";
import * as turf from "@turf/turf";
import { Feature, GeoJsonProperties, Polygon } from "geojson";
import { DisjointPolygons, fixPolygon } from "./antimeridian.js";

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



export function rectangleToPolygon(rectangle: Rectangle) {
  if (rectangle.south > rectangle.north) {
    throw new Error("Bottom edge of rectangle must be below top edge");
  }
  validateLatitude(rectangle.south);
  validateLatitude(rectangle.north);
  validateLongitude(rectangle.west);
  validateLongitude(rectangle.east);
  if (rectangle.west > rectangle.east) {
    // Split the rectangle into two rings across the antimeridian. Note that
    // GeoJSON polygons must obey the right-hand rule, so the exterior rings
    // most go counter clockwise.    
    return new DisjointPolygons(
      turf.polygon([
        [
          [rectangle.west, rectangle.south],
          [180, rectangle.south],
          [180, rectangle.north],
          [rectangle.west, rectangle.north],
          [rectangle.west, rectangle.south],
        ],
      ]),
      turf.polygon([
        [
          [-180, rectangle.south],
          [rectangle.east, rectangle.south],
          [rectangle.east, rectangle.north],
          [-180, rectangle.north],
          [-180, rectangle.south],
        ],
      ]),
    );
  } else {
    return new DisjointPolygons(
      turf.polygon([
        [
          [rectangle.west, rectangle.south],
          [rectangle.east, rectangle.south],
          [rectangle.east, rectangle.north],
          [rectangle.west, rectangle.north],
          [rectangle.west, rectangle.south],
        ],
      ]),
    );
  }
}

export function cellToPolygon(cell: string): DisjointPolygons {
  const h3Vertices = cellToBoundary(cell, true);
  const first = h3Vertices[0];
  if (!first) {
    throw new Error(`Invalid H3 boundary for ${cell}`);
  }
  return fixPolygon(h3Vertices);  
}

export function coverRectangle(
  logger: Logger,
  rectangle: DisjointPolygons,
  maxResolution: number,
  minOverlap: number = 0.33,
): Set<string> {
  console.time("coverRectangle");
  if (maxResolution < 0 || maxResolution > 15) {
    throw new Error("maxResolution must be between 0 and 15.");
  }
  if (minOverlap < 0 || minOverlap > 1) {
    throw new Error("minOverlap must be between 0 and 1.");
  }

  const allCells = new Set<string>();
  
  let resolution = 0;
  let candidates = new Set<string>();
  for (const cell of getRes0Cells()) {
    candidates.add(cell);
  }
  while (true) {
    const { cells, tiledArea } = coverRectangleAtResolution(
      logger,
      rectangle,
      candidates,
    );
    logger.info(
      `At resolution ${resolution}, ${cells.size} cells cover ${rectangle.area}/${tiledArea} = ${((rectangle.area / tiledArea) * 100).toFixed(2)}%`,
    );
    if (
      rectangle.area / tiledArea >= minOverlap ||
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
    try {
      const polygon = cellToPolygon(cell);  
      if (polygon.overlaps(rectanglePolygon)) {
        cells.add(cell);
        tiledArea += polygon.area;
      }
    } catch (e) {
      logger.error(`Error processing cell ${cell}: ${e}`);
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
