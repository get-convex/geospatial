import type { ChordAngle, Point, Rectangle } from "../types.js";
import { Go } from "./goRuntime.js";
import { wasmSource } from "./s2wasm.js";

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
}
