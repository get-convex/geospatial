import type { TupleKey } from "../lib/tupleKey.js";

export interface PointSet {
  /**
   * Advance the stream to the next item and return it. Return null if the stream is exhausted.
   */
  advance(): Promise<TupleKey | null>;

  /**
   * Return the current item in the stream.
   */
  current(): Promise<TupleKey | null>;

  /**
   * Seek to the given tuple.
   */
  seek(tuple: TupleKey): Promise<void>;

  /**
   * Estimate on the number of elements in the stream.
   */
  sizeHint(): Promise<number>;

  /**
   * Set number of rows to prefetch after the current position.
   */
  setPrefetch(prefetch: number): void;
}

export type Stats = {
  cells: number;
  queriesIssued: number;
  rowsRead: number;
  rowsPostFiltered: number;
};
