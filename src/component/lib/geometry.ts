import {
  cellToBoundary,
  cellToChildren,
  cellToParent,
  getHexagonEdgeLengthAvg,
  getRes0Cells,
  getResolution,
  greatCircleDistance,
  gridDisk,
  latLngToCell,
  polygonToCells,
  UNITS,
} from "h3-js";
import {
  Point,
  pointToArray,
  Rectangle,
  rectangleToGeoJSON,
  rectangleToPolygon,
} from "../types.js";
import { Logger } from "./logging.js";
import * as turf from "@turf/turf"

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

export function rectangleContains(rectangle: Rectangle, point: Point) {
  return polygonContains(point, rectangleToPolygon(rectangle));
}

function validateLatitude(latitude: number) {
  if (latitude < -90 || latitude > 90) {
    throw new Error("Latitude must be between -90 and 90");
  }
}

function validateLongitude(longitude: number) {
  if (longitude < -180 || longitude > 180) {
    throw new Error("Longitude must be between -180 and 180");
  }
}
export function validateRectangle(rectangle: Rectangle) {  
  if (rectangle.south > rectangle.north) {
    throw new Error("Bottom edge of rectangle must be below top edge");
  }
  validateLatitude(rectangle.south);
  validateLatitude(rectangle.north);
  validateLongitude(rectangle.west);
  validateLongitude(rectangle.east);
}

export function coverRectangle(
  logger: Logger,
  rectangle: Rectangle,
  maxResolution: number,
  minOverlap: number = 0.25,
): Set<string> {
  if (maxResolution < 0 || maxResolution > 15) {
    throw new Error('maxResolution must be between 0 and 15.');
  }
  if (minOverlap < 0 || minOverlap > 1) {
    throw new Error('minOverlap must be between 0 and 1.');
  }
  if (rectangle.east < rectangle.west) {
    throw new Error("TODO: East must be greater than West");
  }  
  const rectanglePolygon = turf.polygon([rectangleToGeoJSON(rectangle)]);

  const cells = new Set<string>();
  const queue = getRes0Cells();

  while (queue.length) {
    const cell = queue.shift()!;
    const currentResolution = getResolution(cell);    
    const cellPolygon = turf.polygon([cellToBoundary(cell, true)]);

    // If the current cell is entirely within the rectangle, add it to the set
    // and stop recursing.
    if (turf.booleanContains(rectanglePolygon, cellPolygon)) {
      logger.debug(`Cell ${cell} is entirely within the rectangle`);
      cells.add(cell);
      continue;
    }

    // If the rectangle is completely within the cell, unconditionally recurse.
    if (turf.booleanContains(cellPolygon, rectanglePolygon)) {      
      if (currentResolution >= maxResolution) { 
        throw new Error(`Rectangle fully contained by cell at resolution ${maxResolution}`);
      }
      const childCells = new Set<string>();
      for (const child of cellToChildren(cell, currentResolution + 1)) {
        for (const neighbor of gridDisk(child, 1)) {
          childCells.add(neighbor);
        }
      }
      queue.push(...childCells);
      continue;
    }

    // Drop the current cell if it doesn't overlap with the rectangle.
    const intersection = turf.intersect(turf.featureCollection([rectanglePolygon, cellPolygon]));
    if (!intersection) {      
      continue;
    }

    // Add the cell to our set and stop recursing if it meets the overlap threshold.
    const overlapFraction = turf.area(intersection) / turf.area(cellPolygon);
    if (overlapFraction >= minOverlap) {
      logger.debug(`Cell ${cell} has ${overlapFraction} overlap, adding to set`);
      cells.add(cell);
      continue;
    }

    // Otherwise, recurse on the cell's children.
    if (currentResolution >= maxResolution) {
      logger.debug(`Rectangle not covered by cell at max resolution ${maxResolution}`);
      continue;
    }
    const childCells = new Set<string>();
    for (const child of cellToChildren(cell, currentResolution + 1)) {
      for (const neighbor of gridDisk(child, 1)) {
        childCells.add(neighbor);
      }
    }
    queue.push(...childCells);
  }
  logger.debug(`Found ${cells.size} cells`, cells);
  return cells;
}
