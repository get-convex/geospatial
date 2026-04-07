import type { ChordAngle, Point, Rectangle } from "../types.js";
import { Go } from "./goRuntime.js";
import { wasmSource } from "./s2wasm.js";

// Cell level bounds matching Go implementation (Standard S2 Inverted Index)
export const MIN_CELL_LEVEL = 4;
export const MAX_CELL_LEVEL = 16;
export const NUM_QUERY_LEVELS = MAX_CELL_LEVEL - MIN_CELL_LEVEL + 1; // 13

// Do some work at import time to speed `vitest` up (since it reuses the same module
// across tests, unlike the Convex runtime).
const wasmBinary = atob(wasmSource);
const wasmBuffer = new Uint8Array(wasmBinary.length);
for (let i = 0; i < wasmBinary.length; i++) {
  wasmBuffer[i] = wasmBinary.charCodeAt(i);
}

export type CellID = bigint;

// See https://docs.s2cell.aliddell.com/en/stable/useful_s2_links.html for useful articles
// for working with S2.
export class S2Bindings {
  private decoder = new TextDecoder();

  constructor(
    private exports: any,
    private go: Go,
  ) {}

  static async load(): Promise<S2Bindings> {
    const go = new Go();
    const { instance } = await WebAssembly.instantiate(
      wasmBuffer,
      go.importObject,
    );
    await go.run(instance);
    return new S2Bindings(instance.exports, go);
  }

  cellIDFromPoint(point: Point): CellID {
    return this.exports.cellIDFromLatLng(point.latitude, point.longitude);
  }

  cellIDToken(cellID: CellID): string {
    const len = this.exports.cellIDToken(cellID);
    if (len < 0) {
      throw new Error(`Failed to get cell ID token`);
    }
    const ptr = this.exports.tokenBufferPtr();
    const wasmMemory = new Uint8Array(this.exports.memory.buffer);
    const buffer = wasmMemory.slice(ptr + 0, ptr + len);
    return this.decoder.decode(buffer.buffer);
  }

  cellIDParent(cellID: CellID, level: number): CellID {
    return this.exports.cellIDParent(cellID, level);
  }

  cellIDLevel(cellID: CellID): number {
    return this.exports.cellIDLevel(cellID);
  }

  coverRectangle(
    rectangle: Rectangle,
    minLevel: number,
    maxLevel: number,
    levelMod: number,
    maxCells: number,
  ): CellID[] {
    const len = this.exports.coverRectangle(
      rectangle.south,
      rectangle.west,
      rectangle.north,
      rectangle.east,
      minLevel,
      maxLevel,
      levelMod,
      maxCells,
    );
    if (len < 0) {
      throw new Error(`Failed to coverRectangle`);
    }
    const ptr = this.exports.coverRectangleBufferPtr();
    const wasmMemory = new Uint8Array(this.exports.memory.buffer);
    const buffer = wasmMemory.slice(ptr + 0, ptr + len * 8);
    const uint64s = new BigUint64Array(buffer.buffer);
    return [...uint64s];
  }

  rectangleContains(rectangle: Rectangle, point: Point): boolean {
    return this.exports.rectangleContains(
      rectangle.south,
      rectangle.west,
      rectangle.north,
      rectangle.east,
      point.latitude,
      point.longitude,
    );
  }

  private writePolygonToBuffer(points: Point[]): void {
    const maxPoints = 1000; // POLYGON_BUFFER_SIZE / 2
    if (points.length > maxPoints) {
      throw new Error(
        `Polygon has too many points (${points.length}), maximum is ${maxPoints}`,
      );
    }
    const ptr = this.exports.polygonBufferPtr();
    const wasmMemory = new Float64Array(this.exports.memory.buffer);
    const offset = ptr / 8;
    const requiredLength = offset + points.length * 2;
    if (requiredLength > wasmMemory.length) {
      throw new Error("Polygon buffer overflow: WASM memory too small");
    }
    for (let i = 0; i < points.length; i++) {
      wasmMemory[offset + i * 2] = points[i].latitude;
      wasmMemory[offset + i * 2 + 1] = points[i].longitude;
    }
  }

  coverPolygon(
    points: Point[],
    minLevel: number,
    maxLevel: number,
    levelMod: number,
    maxCells: number,
  ): CellID[] {
    if (points.length < 3) {
      throw new Error("Polygon must have at least 3 points");
    }
    this.writePolygonToBuffer(points);
    const len = this.exports.coverPolygon(
      points.length,
      minLevel,
      maxLevel,
      levelMod,
      maxCells,
    );
    if (len < 0) {
      throw new Error("Failed to coverPolygon");
    }
    const ptr = this.exports.coverRectangleBufferPtr();
    const wasmMemory = new Uint8Array(this.exports.memory.buffer);
    const buffer = wasmMemory.slice(ptr + 0, ptr + len * 8);
    const uint64s = new BigUint64Array(buffer.buffer);
    return [...uint64s];
  }

  polygonContainsPoint(polygonPoints: Point[], point: Point): boolean {
    if (polygonPoints.length < 3) {
      return false;
    }
    this.writePolygonToBuffer(polygonPoints);
    // WASM returns 0 or 1, convert to boolean
    return Boolean(
      this.exports.polygonContainsPoint(
        polygonPoints.length,
        point.latitude,
        point.longitude,
      ),
    );
  }

  private writePolylineToBuffer(points: Point[]): void {
    const maxPoints = 1000; // POLYLINE_BUFFER_SIZE / 2
    if (points.length > maxPoints) {
      throw new Error(
        `Polyline has too many points (${points.length}), maximum is ${maxPoints}`,
      );
    }
    const ptr = this.exports.polylineBufferPtr();
    const wasmMemory = new Float64Array(this.exports.memory.buffer);
    const offset = ptr / 8;
    const requiredLength = offset + points.length * 2;
    if (requiredLength > wasmMemory.length) {
      throw new Error("Polyline buffer overflow: WASM memory too small");
    }
    for (let i = 0; i < points.length; i++) {
      wasmMemory[offset + i * 2] = points[i].latitude;
      wasmMemory[offset + i * 2 + 1] = points[i].longitude;
    }
  }

  coverPolylineBuffered(
    points: Point[],
    bufferMeters: number,
    minLevel: number,
    maxLevel: number,
    levelMod: number,
    maxCells: number,
    maxLevelDiff: number = 4,
  ): CellID[] {
    if (points.length < 2) {
      throw new Error("Polyline must have at least 2 points");
    }
    if (bufferMeters < 0) {
      throw new Error("bufferMeters must be non-negative");
    }
    this.writePolylineToBuffer(points);
    const len = this.exports.coverPolylineBuffered(
      points.length,
      bufferMeters,
      minLevel,
      maxLevel,
      levelMod,
      maxCells,
      maxLevelDiff,
    );
    if (len < 0) {
      throw new Error("Failed to coverPolylineBuffered");
    }
    const ptr = this.exports.coverRectangleBufferPtr();
    const wasmMemory = new Uint8Array(this.exports.memory.buffer);
    const buffer = wasmMemory.slice(ptr + 0, ptr + len * 8);
    const uint64s = new BigUint64Array(buffer.buffer);
    return [...uint64s];
  }

  distanceToPolyline(linePoints: Point[], queryPoint: Point): ChordAngle {
    if (linePoints.length < 2) {
      throw new Error("Polyline must have at least 2 points");
    }
    this.writePolylineToBuffer(linePoints);
    const distance = this.exports.distanceToPolyline(
      linePoints.length,
      queryPoint.latitude,
      queryPoint.longitude,
    );
    if (distance < 0) {
      throw new Error("Failed to compute distance to polyline");
    }
    return distance;
  }

  cellVertexes(cellID: CellID): Point[] {
    const result = [];
    for (let k = 0; k < 4; k++) {
      const latitude = this.exports.cellVertexLatDegrees(cellID, k);
      const longitude = this.exports.cellVertexLngDegrees(cellID, k);
      result.push({ latitude, longitude });
    }
    return result;
  }

  metersToChordAngle(meters: number): number {
    return this.exports.metersToChordAngle(meters);
  }

  chordAngleToMeters(chordAngle: number): number {
    return this.exports.chordAngleToMeters(chordAngle);
  }

  pointDistance(point1: Point, point2: Point): ChordAngle {
    return this.exports.pointDistance(
      point1.latitude,
      point1.longitude,
      point2.latitude,
      point2.longitude,
    );
  }

  initialCells(minLevel: number): CellID[] {
    const len = this.exports.initialCells(minLevel);
    if (len < 0) {
      throw new Error(`Failed to get initial cells`);
    }
    const ptr = this.exports.cellsBufferPtr();
    const wasmMemory = new Uint8Array(this.exports.memory.buffer);
    const buffer = wasmMemory.slice(ptr + 0, ptr + len * 8);
    const uint64s = new BigUint64Array(buffer.buffer);
    return [...uint64s];
  }

  minDistanceToCell(point: Point, cellID: CellID): ChordAngle {
    return this.exports.minDistanceToCell(
      point.latitude,
      point.longitude,
      cellID,
    );
  }

  cellIDChildren(cellID: CellID, level: number): CellID[] {
    const len = this.exports.cellIDChildren(cellID, level);
    if (len < 0) {
      throw new Error(
        `Failed to get cell ID children for ${cellID} at level ${level}`,
      );
    }
    const ptr = this.exports.cellsBufferPtr();
    const wasmMemory = new Uint8Array(this.exports.memory.buffer);
    const buffer = wasmMemory.slice(ptr + 0, ptr + len * 8);
    const uint64s = new BigUint64Array(buffer.buffer);
    return [...uint64s];
  }

  private writePolygonToBuffer2(points: Point[]): void {
    const ptr = this.exports.polygonBuffer2Ptr();
    const wasmMemory = new Float64Array(this.exports.memory.buffer);
    const offset = ptr / 8;

    for (let i = 0; i < points.length; i++) {
      wasmMemory[offset + i * 2] = points[i].latitude;
      wasmMemory[offset + i * 2 + 1] = points[i].longitude;
    }
  }

  polygonIntersectsPolygon(polygon1: Point[], polygon2: Point[]): boolean {
    if (polygon1.length < 3 || polygon2.length < 3) {
      return false;
    }
    this.writePolygonToBuffer(polygon1);
    this.writePolygonToBuffer2(polygon2);
    return Boolean(
      this.exports.polygonIntersectsPolygon(polygon1.length, polygon2.length),
    );
  }

  polygonContainsPolygon(polygon1: Point[], polygon2: Point[]): boolean {
    if (polygon1.length < 3 || polygon2.length < 3) {
      return false;
    }
    this.writePolygonToBuffer(polygon1);
    this.writePolygonToBuffer2(polygon2);
    return Boolean(
      this.exports.polygonContainsPolygon(polygon1.length, polygon2.length),
    );
  }

  polylineIntersectsPolygon(polyline: Point[], polygon: Point[]): boolean {
    if (polyline.length < 2 || polygon.length < 3) {
      return false;
    }
    this.writePolylineToBuffer(polyline);
    this.writePolygonToBuffer(polygon);
    return Boolean(
      this.exports.polylineIntersectsPolygon(polyline.length, polygon.length),
    );
  }

  distanceToPolygonEdge(polygonPoints: Point[], point: Point): ChordAngle {
    if (polygonPoints.length < 3) {
      throw new Error("Polygon must have at least 3 points");
    }
    this.writePolygonToBuffer(polygonPoints);
    const distance = this.exports.distanceToPolygonEdge(
      polygonPoints.length,
      point.latitude,
      point.longitude,
    );
    if (distance < 0) {
      throw new Error("Failed to compute distance to polygon edge");
    }
    return distance;
  }

  coverPolygonForIndex(points: Point[], maxCells: number = 30): CellID[] {
    if (points.length < 3) {
      throw new Error("Polygon must have at least 3 points");
    }
    this.writePolygonToBuffer(points);
    const count = this.exports.coverPolygonForIndex(points.length, maxCells);
    if (count < 0) {
      throw new Error("Failed to compute polygon covering");
    }
    return this.readCoveringBuffer(count);
  }

  coverPolylineForIndex(points: Point[], maxCells: number = 30): CellID[] {
    if (points.length < 2) {
      throw new Error("Polyline must have at least 2 points");
    }
    this.writePolylineToBuffer(points);
    const count = this.exports.coverPolylineForIndex(points.length, maxCells);
    if (count < 0) {
      throw new Error("Failed to compute polyline covering");
    }
    return this.readCoveringBuffer(count);
  }

  pointCellsAllLevels(point: Point): CellID[] {
    const count = this.exports.pointCellsAllLevels(
      point.latitude,
      point.longitude,
    );
    return this.readPointAncestorsBuffer(count);
  }

  cellAncestors(cellId: CellID): CellID[] {
    const count = this.exports.cellAncestors(cellId);
    return this.readCoveringBuffer(count);
  }

  private readCoveringBuffer(count: number): CellID[] {
    const ptr = this.exports.coveringBufferPtr();
    const wasmMemory = new Uint8Array(this.exports.memory.buffer);
    const buffer = wasmMemory.slice(ptr, ptr + count * 8);
    const uint64s = new BigUint64Array(buffer.buffer);
    return [...uint64s];
  }

  private readPointAncestorsBuffer(count: number): CellID[] {
    const ptr = this.exports.pointAncestorsBufferPtr();
    const wasmMemory = new Uint8Array(this.exports.memory.buffer);
    const buffer = wasmMemory.slice(ptr, ptr + count * 8);
    const uint64s = new BigUint64Array(buffer.buffer);
    return [...uint64s];
  }

  polygonArea(points: Point[]): number {
    if (points.length < 3) {
      throw new Error("Polygon must have at least 3 points");
    }
    this.writePolygonToBuffer(points);
    const area = this.exports.polygonArea(points.length);
    if (area < 0) {
      throw new Error("Failed to compute polygon area");
    }
    return area;
  }

  polylineLength(points: Point[]): number {
    if (points.length < 2) {
      throw new Error("Polyline must have at least 2 points");
    }
    this.writePolylineToBuffer(points);
    const length = this.exports.polylineLength(points.length);
    if (length < 0) {
      throw new Error("Failed to compute polyline length");
    }
    return length;
  }

  polygonPerimeter(points: Point[]): number {
    if (points.length < 3) {
      throw new Error("Polygon must have at least 3 points");
    }
    this.writePolygonToBuffer(points);
    const perimeter = this.exports.polygonPerimeter(points.length);
    if (perimeter < 0) {
      throw new Error("Failed to compute polygon perimeter");
    }
    return perimeter;
  }

  polygonCentroid(points: Point[]): Point {
    if (points.length < 3) {
      throw new Error("Polygon must have at least 3 points");
    }
    this.writePolygonToBuffer(points);
    const success = this.exports.polygonCentroid(points.length);
    if (!success) {
      throw new Error("Failed to compute polygon centroid");
    }
    return this.readCentroidBuffer();
  }

  polylineCentroid(points: Point[]): Point {
    if (points.length < 2) {
      throw new Error("Polyline must have at least 2 points");
    }
    this.writePolylineToBuffer(points);
    const success = this.exports.polylineCentroid(points.length);
    if (!success) {
      throw new Error("Failed to compute polyline centroid");
    }
    return this.readCentroidBuffer();
  }

  private readCentroidBuffer(): Point {
    const ptr = this.exports.centroidBufferPtr();
    const wasmMemory = new Float64Array(this.exports.memory.buffer);
    const offset = ptr / 8;
    return {
      latitude: wasmMemory[offset],
      longitude: wasmMemory[offset + 1],
    };
  }
}
