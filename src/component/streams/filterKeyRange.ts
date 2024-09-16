import { QueryCtx } from "../_generated/server.js";
import { get } from "../counter.js";
import { Interval } from "../lib/interval.js";
import { Primitive, toKey as serialize } from "../lib/primitive.js";
import { TupleKey, encodeBound } from "../lib/tupleKey.js";
import { PointSet, Stats } from "./zigzag.js";

export class FilterKeyRange implements PointSet {
  private state:
    | { type: "init" }
    | { type: "buffered"; buffer: TupleKey[]; pos: number }
    | { type: "done" } = { type: "init" };

  constructor(
    private ctx: QueryCtx,
    private filterKey: string,
    private filterValue: Primitive,
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
      .query("pointsByFilterKey")
      .withIndex("filterKey", (q) => {
        const withFilter = q
          .eq("filterKey", this.filterKey)
          .eq("filterValue", this.filterValue);
        let withStart;
        if (this.cursor !== undefined) {
          withStart = withFilter.gt("tupleKey", this.cursor);
        } else if (this.interval.startInclusive !== undefined) {
          const bound = encodeBound(this.interval.startInclusive);
          withStart = withFilter.gte("tupleKey", bound);
        } else {
          withStart = withFilter;
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
      .query("pointsByFilterKey")
      .withIndex("filterKey", (q) => {
        const withStart = q
          .eq("filterKey", this.filterKey)
          .eq("filterValue", this.filterValue)
          .gt("tupleKey", lastKey);
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
      .query("pointsByFilterKey")
      .withIndex("filterKey", (q) => {
        const withStart = q
          .eq("filterKey", this.filterKey)
          .eq("filterValue", this.filterValue)
          .gte("tupleKey", tuple);
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
    return await get(this.ctx, filterCounterKey(this.filterKey, this.filterValue));
  }

  setPrefetch(prefetch: number): void {
    this.prefetchSize = prefetch;
  }
}

export function filterCounterKey(filterKey: string, filterValue: Primitive): string {
  return 'filter:' + filterKey + ':' + serialize(filterValue);
}