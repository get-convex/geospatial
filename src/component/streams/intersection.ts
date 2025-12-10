import type { TupleKey } from "../lib/tupleKey.js";
import { PREFETCH_SIZE } from "./constants.js";
import type { PointSet } from "./zigzag.js";

export class Intersection implements PointSet {
  private initialized = false;
  constructor(private streams: Array<PointSet>) {}

  async initialize() {
    if (this.initialized) {
      return;
    }
    const sizeHintPromises = this.streams.map(async (stream) => {
      return { stream, sizeHint: await stream.sizeHint() };
    });
    const sizeHintByStream = new Map();
    for (const { stream, sizeHint } of await Promise.all(sizeHintPromises)) {
      sizeHintByStream.set(stream, sizeHint);
    }
    this.streams.sort(
      (a, b) => sizeHintByStream.get(a)! - sizeHintByStream.get(b)!,
    );
    for (const stream of this.streams.slice(1)) {
      stream.setPrefetch(PREFETCH_SIZE / 4);
    }

    await this.goToFirstDoc();

    this.initialized = true;
  }

  async goToFirstDoc(): Promise<TupleKey | null> {
    if (this.streams.length === 0) {
      return null;
    }
    const currentPromises = this.streams.map((stream) => stream.current());
    const currentResults = await Promise.all(currentPromises);

    let candidate: null | TupleKey = null;
    for (const result of currentResults) {
      if (result === null) {
        this.streams = [];
        return null;
      }
      if (candidate === null || candidate < result) {
        candidate = result;
      }
    }
    if (candidate === null) {
      this.streams = [];
      return null;
    }
    while (true) {
      let restart = false;
      for (const stream of this.streams) {
        await stream.seek(candidate);
        const seekResult = await stream.current();
        if (seekResult === null) {
          this.streams = [];
          return null;
        }
        if (candidate < seekResult) {
          candidate = seekResult;
          restart = true;
          break;
        }
      }
      if (restart) {
        continue;
      }
      for (const stream of this.streams) {
        if ((await stream.current()) !== candidate) {
          throw new Error("Internal error: stream diverged");
        }
      }
      return candidate;
    }
  }

  async current(): Promise<TupleKey | null> {
    await this.initialize();
    return this.streams.length > 0 ? this.streams[0].current() : null;
  }

  async advance(): Promise<TupleKey | null> {
    await this.initialize();
    if (this.streams.length === 0) {
      return null;
    }
    await this.streams[0].advance();
    return this.goToFirstDoc();
  }

  async seek(tuple: TupleKey): Promise<void> {
    await this.initialize();
    if (this.streams.length === 0) {
      return;
    }
    await this.streams[0].seek(tuple);
    await this.goToFirstDoc();
  }

  async sizeHint(): Promise<number> {
    await this.initialize();
    return this.streams.length > 0 ? this.streams[0].sizeHint() : 0;
  }

  setPrefetch(prefetch: number): void {
    for (const stream of this.streams) {
      stream.setPrefetch(prefetch);
    }
  }
}
