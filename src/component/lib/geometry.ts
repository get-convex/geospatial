import {
  cellToParent,
  getHexagonEdgeLengthAvg,
  greatCircleDistance,
  gridDisk,
  latLngToCell,
  polygonToCells,
  UNITS,
} from "h3-js";
import { Point, pointToArray, Rectangle } from "../types.js";

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
  return polygonContains(point, [
    rectangle.sw,
    rectangle.se,
    rectangle.ne,
    rectangle.nw,
  ]);
}

export function validateRectangle(rectangle: Rectangle) {
  const { sw, nw, ne, se } = rectangle;

  if (sw.longitude !== nw.longitude || se.longitude !== ne.longitude) {
    throw new Error("Invalid rectangle: longitudes for side edges must match");
  }
  if (sw.longitude > se.longitude) {
    throw new Error("Left edge of rectangle must be before right edge");
  }
  if (sw.latitude !== se.latitude || nw.latitude !== ne.latitude) {
    throw new Error(
      "Invalid rectangle: latitudes for top and bottom edges must match",
    );
  }
  if (sw.latitude > nw.latitude) {
    throw new Error("Bottom edge of rectangle must be below top edge");
  }
}

export function coverRectangle(
  rectangle: Rectangle,
  maxResolution: number,
): Set<string> | null {
  // Pick a resolution that's about 25% of the average of the rectangle's width and height.
  // We don't have to be precise here, but going too large will increase the number of cells
  // we query, while going too small will cause us to overfetch and post-filter more.
  const rectangleHeight = greatCircleDistance(
    pointToArray(rectangle.sw),
    pointToArray(rectangle.nw),
    UNITS.m,
  );
  const rectangleWidth = greatCircleDistance(
    pointToArray(rectangle.sw),
    pointToArray(rectangle.se),
    UNITS.m,
  );
  const averageDimension = (rectangleHeight + rectangleWidth) / 2;
  let resolution = maxResolution;
  for (; resolution >= 0; resolution--) {
    const hexWidth = getHexagonEdgeLengthAvg(resolution, UNITS.m);
    if (hexWidth / averageDimension > 0.25) {
      break;
    }
  }

  const h3Polygon = [
    pointToArray(rectangle.sw),
    pointToArray(rectangle.nw),
    pointToArray(rectangle.ne),
    pointToArray(rectangle.se),
  ];
  let h3InteriorCells = polygonToCells(h3Polygon, resolution);
  while (!h3InteriorCells.length) {
    if (resolution > maxResolution) {
      return null;
    }
    resolution++;
    h3InteriorCells = polygonToCells(h3Polygon, resolution);
  }

  const h3CellSet = new Set<string>();
  for (const cell of h3InteriorCells) {
    h3CellSet.add(cell);

    // `polygonToCells` only returns the set of cells whose centroids are within
    // the polygon. We also want to include cells that are adjacent to the polygon.
    // TODO: Prove that adding adjacent neighbors is sufficient.
    for (const neighbor of gridDisk(cell, 1)) {
      h3CellSet.add(neighbor);
    }
  }
  console.log(`Returning ${h3CellSet.size} cells at ${resolution} resolution`);
  return h3CellSet;
}
