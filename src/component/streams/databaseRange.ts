import type { QueryCtx } from "../_generated/server.js";
import * as approximateCounter from "../lib/approximateCounter.js";
import type { Interval } from "../lib/interval.js";
import type { Logger } from "../lib/logging.js";
import { encodeBound, type TupleKey } from "../lib/tupleKey.js";
import type { PointSet, Stats } from "./zigzag.js";

export abstract class DatabaseRange implements PointSet {
  private state:
    | { type: "init" }
    | { type: "buffered"; buffer: TupleKey[]; pos: number }
    | { type: "done" } = { type: "init" };

  constructor(
    protected ctx: QueryCtx,
    protected logger: Logger,
    protected cursor: TupleKey | undefined,
    protected interval: Interval,
    protected prefetchSize: number,
    protected stats: Stats,
  ) {}

  abstract initialQuery(): Promise<TupleKey[]>;
  abstract advanceQuery(lastKey: TupleKey): Promise<TupleKey[]>;
  abstract seekQuery(tuple: TupleKey): Promise<TupleKey[]>;
  abstract getCounterKey(): string;

  async current(): Promise<TupleKey | null> {
    if (this.state.type === "done") {
      return null;
    }
    if (this.state.type === "buffered") {
      return this.state.buffer[this.state.pos];
    }

    const buffer = await this.initialQuery();
    this.stats.queriesIssued++;
    this.stats.rowsRead += buffer.length;

    if (buffer.length === 0) {
      this.state = { type: "done" };
      return null;
    }
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
    const buffer = await this.advanceQuery(lastKey);
    this.stats.queriesIssued++;
    this.stats.rowsRead += buffer.length;

    if (buffer.length === 0) {
      this.state = { type: "done" };
      return null;
    }
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
    const buffer = await this.seekQuery(tuple);
    this.stats.queriesIssued++;
    this.stats.rowsRead += buffer.length;
    if (buffer.length === 0) {
      this.state = { type: "done" };
      return;
    }
    this.state = { type: "buffered", buffer, pos: 0 };
  }

  async sizeHint(): Promise<number> {
    const count = await approximateCounter.estimateCount(
      this.ctx,
      this.getCounterKey(),
    );
    this.logger.debug(`Size hint for ${this.getCounterKey()} is ${count}`);
    return count;
  }

  setPrefetch(prefetch: number): void {
    this.prefetchSize = prefetch;
  }

  protected applyInterval(q: any): any {
    let withEnd = q;
    if (this.interval.endExclusive !== undefined) {
      const bound = encodeBound(this.interval.endExclusive);
      withEnd = q.lt("tupleKey", bound);
    }
    return withEnd;
  }
}
