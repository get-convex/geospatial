import { QueryCtx } from "../_generated/server.js";
import { Interval } from "../lib/interval.js";
import { Logger } from "../lib/logging.js";
import { TupleKey, encodeBound } from "../lib/tupleKey.js";
import { DatabaseRange } from "./databaseRange.js";
import { Stats } from "./zigzag.js";

export class H3CellRange extends DatabaseRange {
  constructor(
    ctx: QueryCtx,
    logger: Logger,
    private h3Cell: string,
    cursor: TupleKey | undefined,
    interval: Interval,
    prefetchSize: number,
    stats: Stats,
  ) {
    super(ctx, logger, cursor, interval, prefetchSize, stats);
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
    this.logger.debug(
      `Initial query for h3 cell ${this.h3Cell} returned ${docs.length} results`,
      docs,
    );
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
    this.logger.debug(
      `Advance query for h3 cell ${this.h3Cell} returned ${docs.length} results`,
      docs,
    );
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
    this.logger.debug(
      `Seek query for h3 cell ${this.h3Cell} returned ${docs.length} results`,
      docs,
    );
    return docs.map((doc) => doc.tupleKey);
  }

  getCounterKey(): string {
    return h3CellCounterKey(this.h3Cell);
  }
}

export function h3CellCounterKey(h3Cell: string): string {
  return "h3:" + h3Cell;
}
