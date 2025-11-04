import { Heap } from "heap-js";
import type { TupleKey } from "../lib/tupleKey.js";
import type { PointSet } from "./zigzag.js";

type HeapEntry = {
  tuple: TupleKey;
  stream: PointSet;
};

export class Union implements PointSet {
  private heap?: Heap<HeapEntry>;

  constructor(private streams: Array<PointSet>) {}

  async initializeHeap(): Promise<Heap<HeapEntry>> {
    if (this.heap) {
      return this.heap;
    }
    const promises = this.streams.map((stream) => stream.current());
    const results = await Promise.all(promises);

    const entries = [];
    for (let i = 0; i < this.streams.length; i++) {
      const result = results[i];
      if (result !== null) {
        entries.push({ tuple: result, stream: this.streams[i] });
      }
    }
    const heap = new Heap<HeapEntry>((a, b) =>
      a.tuple < b.tuple ? -1 : a.tuple > b.tuple ? 1 : 0,
    );
    heap.init(entries);
    this.heap = heap;
    return heap;
  }

  async current(): Promise<TupleKey | null> {
    const heap = await this.initializeHeap();
    const smallest = heap.peek();
    if (smallest === undefined) {
      return null;
    }
    return smallest.tuple;
  }

  async advance(): Promise<TupleKey | null> {
    const heap = await this.initializeHeap();
    const smallest = heap.pop();
    if (smallest === undefined) {
      return null;
    }
    const toRefill = [smallest.stream];
    while (true) {
      const next = heap.peek();
      if (next === undefined) {
        break;
      }
      if (smallest.tuple === next.tuple) {
        heap.pop();
        toRefill.push(next.stream);
        continue;
      }
      break;
    }
    for (const stream of toRefill) {
      const result = await stream.advance();
      if (result !== null) {
        heap.push({ tuple: result, stream });
      }
    }
    return smallest.tuple;
  }

  async seek(tuple: TupleKey): Promise<void> {
    const heap = await this.initializeHeap();

    // Remove the heap entries that are less than `pos`.
    const toRefill = [];
    while (true) {
      const next = heap.peek();
      if (next === undefined) {
        break;
      }
      if (next.tuple < tuple) {
        heap.pop();
        toRefill.push(next.stream);
        continue;
      }
      break;
    }

    const seekPromises = toRefill.map((stream) => stream.seek(tuple));
    await Promise.all(seekPromises);

    const currentPromises = toRefill.map(async (stream) => {
      const result = await stream.current();
      return { result, stream };
    });
    const currentResults = await Promise.all(currentPromises);
    for (const { result, stream } of currentResults) {
      if (result !== null) {
        heap.push({ tuple: result, stream });
      }
    }
  }

  async sizeHint(): Promise<number> {
    // Assume the underlying streams are disjoint (which is true for our covering).
    const promises = this.streams.map((stream) => stream.sizeHint());
    const results = await Promise.all(promises);
    return results.reduce((a, b) => a + b, 0);
  }

  setPrefetch(prefetch: number): void {
    for (const stream of this.streams) {
      stream.setPrefetch(prefetch);
    }
  }
}
