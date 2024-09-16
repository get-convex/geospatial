import { QueryCtx } from "../_generated/server.js";
import { get } from "../counter.js";
import { Interval } from "../lib/interval.js";
import { TupleKey, encodeBound } from "../lib/tupleKey.js";
import { PointSet, Stats } from "./zigzag.js";

export class H3CellRange implements PointSet {
  private state:
    | { type: "init" }
    | { type: "buffered"; buffer: TupleKey[]; pos: number }
    | { type: "done" } = { type: "init" };

  constructor(
    private ctx: QueryCtx,
    private h3Cell: string,
    private cursor: TupleKey | undefined,
    private interval: Interval,
    private prefetchSize: number,
    private stats: Stats,
  ) {}

  async current(): Promise<TupleKey | null> {
    if (this.state.type === "done") {
      return null;
    }
    if (this.state.type === "buffered") {
      return this.state.buffer[this.state.pos];
    }

    const docs = await this.ctx.db
      .query("pointsbyH3Cell")
      .withIndex("h3Cell", (q) => {
        const withH3Cell = q.eq("h3Cell", this.h3Cell);
        let withStart;
        if (this.cursor !== undefined) {
          withStart = withH3Cell.gt("tupleKey", this.cursor);
        } else if (this.interval.startInclusive !== undefined) {
          const bound = encodeBound(this.interval.startInclusive);
          withStart = withH3Cell.gte("tupleKey", bound);
        } else {
          withStart = withH3Cell;
        }
        let withEnd;
        if (this.interval.endExclusive !== undefined) {
          const bound = encodeBound(this.interval.endExclusive);
          withEnd = withStart.lt("tupleKey", bound);
        } else {
          withEnd = withStart;
        }
        return withEnd;
      })
      .take(this.prefetchSize);
    this.stats.queriesIssued++;
    this.stats.rowsRead += docs.length;

    if (docs.length === 0) {
      this.state = { type: "done" };
      return null;
    }
    const buffer = docs.map((doc) => doc.tupleKey);
    this.state = { type: "buffered", buffer, pos: 0 };
    return this.state.buffer[0];
  }

  async advance(): Promise<TupleKey | null> {
    if (this.state.type === "done") {
      return null;
    }
    if (this.state.type === "init") {
      await this.current();
      return await this.advance();
    }
    if (this.state.pos < this.state.buffer.length - 1) {
      this.state.pos++;
      return this.state.buffer[this.state.pos];
    }
    const lastKey = this.state.buffer[this.state.buffer.length - 1];
    const docs = await this.ctx.db
      .query("pointsbyH3Cell")
      .withIndex("h3Cell", (q) => {
        const withStart = q.eq("h3Cell", this.h3Cell).gt("tupleKey", lastKey);
        let withEnd;
        if (this.interval.endExclusive !== undefined) {
          const bound = encodeBound(this.interval.endExclusive);
          withEnd = withStart.lt("tupleKey", bound);
        } else {
          withEnd = withStart;
        }
        return withEnd;
      })
      .take(this.prefetchSize);
    this.stats.queriesIssued++;
    this.stats.rowsRead += docs.length;

    if (docs.length === 0) {
      this.state = { type: "done" };
      return null;
    }
    const buffer = docs.map((doc) => doc.tupleKey);
    this.state = { type: "buffered", buffer, pos: 0 };
    return this.state.buffer[0];
  }

  async seek(tuple: TupleKey): Promise<void> {
    if (this.state.type === "init") {
      await this.current();
      return await this.seek(tuple);
    }
    if (this.state.type === "done") {
      return;
    }
    if (tuple < this.state.buffer[0]) {
      return;
    }
    if (tuple <= this.state.buffer[this.state.buffer.length - 1]) {
      const newPos = this.state.buffer.findIndex((key) => key >= tuple);
      this.state.pos = Math.max(newPos, this.state.pos);
      return;
    }
    const docs = await this.ctx.db
      .query("pointsbyH3Cell")
      .withIndex("h3Cell", (q) => {
        const withStart = q.eq("h3Cell", this.h3Cell).gte("tupleKey", tuple);
        let withEnd;
        if (this.interval.endExclusive !== undefined) {
          const bound = encodeBound(this.interval.endExclusive);
          withEnd = withStart.lt("tupleKey", bound);
        } else {
          withEnd = withStart;
        }
        return withEnd;
      })
      .take(this.prefetchSize);
    this.stats.queriesIssued++;
    this.stats.rowsRead += docs.length;

    if (docs.length === 0) {
      this.state = { type: "done" };
      return;
    }
    const buffer = docs.map((doc) => doc.tupleKey);
    this.state = { type: "buffered", buffer, pos: 0 };
  }

  async sizeHint(): Promise<number> {
    return await get(this.ctx, h3CellCounterKey(this.h3Cell));
  }

  setPrefetch(prefetch: number): void {
    this.prefetchSize = prefetch;
  }
}

export function h3CellCounterKey(h3Cell: string): string {
  return 'h3:' + h3Cell;
}
