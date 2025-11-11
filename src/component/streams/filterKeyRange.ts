import type { QueryCtx } from "../_generated/server.js";
import type { Interval } from "../lib/interval.js";
import type { Logger } from "../lib/logging.js";
import { toKey as serialize, type Primitive } from "../lib/primitive.js";
import { encodeBound, type TupleKey } from "../lib/tupleKey.js";
import { DatabaseRange } from "./databaseRange.js";
import type { Stats } from "./zigzag.js";

export class FilterKeyRange extends DatabaseRange {
  constructor(
    ctx: QueryCtx,
    logger: Logger,
    private filterKey: string,
    private filterValue: Primitive,
    cursor: TupleKey | undefined,
    interval: Interval,
    prefetchSize: number,
    stats: Stats,
  ) {
    super(ctx, logger, cursor, interval, prefetchSize, stats);
  }

  async initialQuery(): Promise<TupleKey[]> {
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
    this.logger.debug(
      `Initial query for filter key ${this.filterKey} returned ${docs.length} results`,
    );
    return docs.map((doc) => doc.tupleKey);
  }

  async advanceQuery(lastKey: TupleKey): Promise<TupleKey[]> {
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
    this.logger.debug(
      `Advance query for filter key ${this.filterKey} returned ${docs.length} results`,
    );
    return docs.map((doc) => doc.tupleKey);
  }

  async seekQuery(tuple: TupleKey): Promise<TupleKey[]> {
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
    this.logger.debug(
      `Seek query for filter key ${this.filterKey} returned ${docs.length} results`,
    );
    return docs.map((doc) => doc.tupleKey);
  }

  getCounterKey(): string {
    return filterCounterKey(this.filterKey, this.filterValue);
  }
}

export function filterCounterKey(
  filterKey: string,
  filterValue: Primitive,
): string {
  return "filter:" + filterKey + ":" + serialize(filterValue);
}
