import { TupleKey } from "../lib/tupleKey.js";
import { PointSet } from "./zigzag.js";

export class Intersection implements PointSet {
  private state:
    | { type: "init" }
    | { type: "aligned"; tuple: TupleKey }
    | { type: "done" } = { type: "init" };
  constructor(private streams: Array<PointSet>) {}

  async tryAlign(): Promise<TupleKey | null> {
    while (true) {
      const results = await Promise.all(
        this.streams.map(async (stream) => {
          return { result: await stream.current(), stream };
        }),
      );
      let candidate: { result: TupleKey; streams: PointSet[] } | null = null;
      const needAdvance = [];
      for (const { result, stream } of results) {
        if (result === null) {
          candidate = null;
          break;
        }
        if (candidate === null) {
          candidate = { result, streams: [stream] };
          continue;
        }
        if (candidate.result < result) {
          needAdvance.push(...candidate.streams);
          candidate = { result, streams: [stream] };
        } else if (candidate.result === result) {
          candidate.streams.push(stream);
        } else {
          needAdvance.push(stream);
        }
      }
      if (candidate === null) {
        this.state = { type: "done" };
        return null;
      }
      if (needAdvance.length === 0) {
        this.state = { type: "aligned", tuple: candidate.result };
        return candidate.result;
      }
      const seekPromises = needAdvance.map((stream) =>
        stream.seek(candidate.result),
      );
      await Promise.all(seekPromises);
    }
  }

  async current(): Promise<TupleKey | null> {
    if (this.state.type === "done") {
      return null;
    }
    if (this.state.type === "aligned") {
      return this.state.tuple;
    }
    return this.tryAlign();
  }

  async advance(): Promise<TupleKey | null> {
    if (this.state.type === "done") {
      return null;
    }
    if (this.streams.length === 0) {
      this.state = { type: "done" };
      return null;
    }
    const advancePromises = this.streams.map((stream) => stream.advance());
    for (const result of await Promise.all(advancePromises)) {
      if (result === null) {
        this.state = { type: "done" };
        return null;
      }
    }
    return await this.tryAlign();
  }

  async seek(tuple: TupleKey): Promise<void> {
    const seekPromises = this.streams.map((stream) => stream.seek(tuple));
    await Promise.all(seekPromises);
    await this.tryAlign();
  }
}
