import { QueryCtx } from "../_generated/server.js";
import { Interval } from "../lib/interval.js";
import { Logger } from "../lib/logging.js";
import { TupleKey, encodeBound } from "../lib/tupleKey.js";
import { DatabaseRange } from "./databaseRange.js";
import { Stats } from "./zigzag.js";

export class CellRange extends DatabaseRange {
  constructor(
    ctx: QueryCtx,
    logger: Logger,
    private cell: string,
    cursor: TupleKey | undefined,
    interval: Interval,
    prefetchSize: number,
    stats: Stats,
  ) {
    super(ctx, logger, cursor, interval, prefetchSize, stats);
  }

  async initialQuery(): Promise<TupleKey[]> {
    const docs = await this.ctx.db
      .query("pointsByCell")
      .withIndex("cell", (q) => {
        const withCell = q.eq("cell", this.cell);
        let withStart;
        if (this.cursor !== undefined) {
          withStart = withCell.gt("tupleKey", this.cursor);
        } else if (this.interval.startInclusive !== undefined) {
          const bound = encodeBound(this.interval.startInclusive);
          withStart = withCell.gte("tupleKey", bound);
        } else {
          withStart = withCell;
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
      `Initial query for cell ${this.cell} returned ${docs.length} results`,
      docs,
    );
    return docs.map((doc) => doc.tupleKey);
  }

  async advanceQuery(lastKey: TupleKey): Promise<TupleKey[]> {
    const docs = await this.ctx.db
      .query("pointsByCell")
      .withIndex("cell", (q) => {
        const withStart = q.eq("cell", this.cell).gt("tupleKey", lastKey);
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
      `Advance query for cell ${this.cell} returned ${docs.length} results`,
      docs,
    );
    return docs.map((doc) => doc.tupleKey);
  }

  async seekQuery(tuple: TupleKey): Promise<TupleKey[]> {
    const docs = await this.ctx.db
      .query("pointsByCell")
      .withIndex("cell", (q) => {
        const withStart = q.eq("cell", this.cell).gte("tupleKey", tuple);
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
      `Seek query for cell ${this.cell} returned ${docs.length} results`,
      docs,
    );
    return docs.map((doc) => doc.tupleKey);
  }

  getCounterKey(): string {
    return cellCounterKey(this.cell);
  }
}

export function cellCounterKey(cell: string): string {
  return "cell:" + cell;
}
