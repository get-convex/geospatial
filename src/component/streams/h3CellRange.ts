import { QueryCtx } from "../_generated/server.js";
import { Interval } from "../lib/interval.js";
import { TupleKey, encodeBound } from "../lib/tupleKey.js";
import { DatabaseRange } from "./databaseRange.js";
import { Stats } from "./zigzag.js";

export class H3CellRange extends DatabaseRange {
  constructor(
    ctx: QueryCtx,
    private h3Cell: string,
    cursor: TupleKey | undefined,
    interval: Interval,
    prefetchSize: number,
    stats: Stats,
  ) {
    super(ctx, cursor, interval, prefetchSize, stats);
  }

  async initialQuery(): Promise<TupleKey[]> {
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
    return docs.map((doc) => doc.tupleKey);
  }

  async advanceQuery(lastKey: TupleKey): Promise<TupleKey[]> {
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
    return docs.map((doc) => doc.tupleKey);
  }

  async seekQuery(tuple: TupleKey): Promise<TupleKey[]> {
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
    return docs.map((doc) => doc.tupleKey);
  }

  getCounterKey(): string {
    return h3CellCounterKey(this.h3Cell);
  }
}

export function h3CellCounterKey(h3Cell: string): string {
  return "h3:" + h3Cell;
}
