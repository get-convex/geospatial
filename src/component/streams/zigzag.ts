import { TupleKey } from "../lib/tupleKey.js";

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
}

export type Stats = {
  h3Cells: number;
  queriesIssued: number;
  rowsRead: number;
  rowsPostFiltered: number;
};
