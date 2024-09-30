import { Point, Rectangle } from '../types.js';
import { Go } from './goRuntime.js';
import { wasmSource } from './s2wasm.js';

export type CellID = BigInt;

export class S2Bindings {
    private decoder = new TextDecoder();
    private wasmMemory: Uint8Array;
    
    constructor(private exports: any, private go: Go) {
        this.wasmMemory = new Uint8Array(exports.memory.buffer);
    }

    static async load(): Promise<S2Bindings> {
        const wasmBinary = atob(wasmSource);
        const wasmBuffer = new Uint8Array(wasmBinary.length);
        for (let i = 0; i < wasmBinary.length; i++) {
          wasmBuffer[i] = wasmBinary.charCodeAt(i);
        }
        const go = new Go();
        const { instance } = await WebAssembly.instantiate(wasmBuffer, go.importObject);
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
        const buffer = this.wasmMemory.slice(ptr + 0, ptr + len);
        return this.decoder.decode(buffer.buffer);
    }

    cellIDParent(cellID: CellID, level: number): CellID {
        return this.exports.cellIDParent(cellID, level);
    }

    coverRectangle(rectangle: Rectangle, maxResolution: number): CellID[] {
        const len = this.exports.coverRectangle(rectangle.south, rectangle.west, rectangle.north, rectangle.east, maxResolution);
        if (len < 0) {
            throw new Error(`Failed to coverRectangle`);
        }
        const ptr = this.exports.coverRectangleBufferPtr();        
        const buffer = this.wasmMemory.slice(ptr + 0, ptr + len * 8);
        const uint64s = new BigUint64Array(buffer.buffer);
        return [...uint64s];        
    }        

    rectangleContains(rectangle: Rectangle, point: Point): boolean {
        return this.exports.rectangleContains(rectangle.south, rectangle.west, rectangle.north, rectangle.east, point.latitude, point.longitude);
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
}