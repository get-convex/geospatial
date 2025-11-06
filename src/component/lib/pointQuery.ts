import { Heap } from "heap-js";
import type { Primitive } from "../types.js";
import { ChordAngle, Meters, Point } from "../types.js";
import { Doc, Id } from "../_generated/dataModel.js";
import { S2Bindings } from "./s2Bindings.js";
import { QueryCtx } from "../_generated/server.js";
import * as approximateCounter from "./approximateCounter.js";
import { CellRange, cellCounterKey } from "../streams/cellRange.js";
import { FilterKeyRange } from "../streams/filterKeyRange.js";
import { Intersection } from "../streams/intersection.js";
import { Union } from "../streams/union.js";
import { decodeTupleKey } from "./tupleKey.js";
import { Logger } from "./logging.js";
import type { Interval } from "./interval.js";
import type { PointSet, Stats } from "../streams/zigzag.js";
import { PREFETCH_SIZE } from "../streams/constants.js";

type FilterCondition = {
  filterKey: string;
  filterValue: Primitive;
  occur: "must" | "should";
};

export class ClosestPointQuery {
  // Min-heap of cells to process.
  toProcess: Heap<CellCandidate>;

  // Max-heap of results.
  results: Heap<Result>;

  maxDistanceChordAngle?: ChordAngle;
  private mustFilters: FilterCondition[];
  private shouldFilters: FilterCondition[];
  private sortInterval: Interval;

  constructor(
    private s2: S2Bindings,
    private logger: Logger,
    private point: Point,
    private maxDistance: Meters | undefined,
    private maxResults: number,
    private minLevel: number,
    private maxLevel: number,
    private levelMod: number,
    filtering: FilterCondition[] = [],
    interval: Interval = {},
  ) {
    this.toProcess = new Heap<CellCandidate>((a, b) => a.distance - b.distance);
    this.results = new Heap<Result>((a, b) => b.distance - a.distance);
    this.maxDistanceChordAngle =
      this.maxDistance && this.s2.metersToChordAngle(this.maxDistance);
    this.mustFilters = filtering.filter((filter) => filter.occur === "must");
    this.shouldFilters = filtering.filter(
      (filter) => filter.occur === "should",
    );
    this.sortInterval = interval;

    for (const cellID of this.s2.initialCells(this.minLevel)) {
      const distance = this.s2.minDistanceToCell(this.point, cellID);
      const level = this.s2.cellIDLevel(cellID);
      this.addCandidate(cellID, level, distance);
    }
  }

  async execute(ctx: QueryCtx) {
    while (true) {
      const candidate = this.popCandidate();
      this.logger.debug(`Processing candidate: ${candidate?.cellID}`);
      if (candidate === null) {
        break;
      }
      const canSubdivide = candidate.level < this.maxLevel;

      const cellIDToken = this.s2.cellIDToken(candidate.cellID);
      const sizeEstimate = await approximateCounter.estimateCount(
        ctx,
        cellCounterKey(cellIDToken),
      );
      this.logger.debug(`Size estimate for ${cellIDToken}: ${sizeEstimate}`);

      if (canSubdivide && sizeEstimate >= approximateCounter.SAMPLING_RATE) {
        this.logger.debug(`Subdividing cell ${candidate.cellID}`);
        const nextLevel = Math.min(
          candidate.level + this.levelMod,
          this.maxLevel,
        );
        for (const cellID of this.s2.cellIDChildren(
          candidate.cellID,
          nextLevel,
        )) {
          const distance = this.s2.minDistanceToCell(this.point, cellID);
          this.addCandidate(cellID, nextLevel, distance);
        }
      } else {
        const stats: Stats = {
          cells: 1,
          queriesIssued: 0,
          rowsRead: 0,
          rowsPostFiltered: 0,
        };
        const stream = this.buildStreamForCell(ctx, cellIDToken, stats);
        let tuple = await stream.current();
        while (tuple !== null) {
          const { pointId } = decodeTupleKey(tuple);
          const point = await ctx.db.get(pointId);
          if (!point) {
            throw new Error("Point not found");
          }
          if (this.matchesFilters(point)) {
            this.addResult(point._id, point.coordinates);
          } else {
            stats.rowsPostFiltered++;
          }
          await stream.advance();
          tuple = await stream.current();
        }
      }
    }
    const entries = this.results
      .toArray()
      .sort((a, b) => a.distance - b.distance);
    const points = await Promise.all(entries.map((r) => ctx.db.get(r.pointID)));
    const results = [];
    for (let i = 0; i < entries.length; i++) {
      const point = points[i];
      if (!point) {
        throw new Error("Point not found");
      }
      if (!this.matchesFilters(point)) {
        continue;
      }
      results.push({
        key: point.key,
        coordinates: point.coordinates,
        distance: this.s2.chordAngleToMeters(entries[i].distance),
      });
    }
    return results;
  }

  private buildStreamForCell(
    ctx: QueryCtx,
    cellIDToken: string,
    stats: Stats,
  ): PointSet {
    const ranges: PointSet[] = [
      new CellRange(
        ctx,
        this.logger,
        cellIDToken,
        undefined,
        this.sortInterval,
        PREFETCH_SIZE,
        stats,
      ),
    ];

    for (const filter of this.mustFilters) {
      ranges.push(
        new FilterKeyRange(
          ctx,
          this.logger,
          filter.filterKey,
          filter.filterValue,
          undefined,
          this.sortInterval,
          PREFETCH_SIZE,
          stats,
        ),
      );
    }

    if (this.shouldFilters.length > 0) {
      const shouldStreams = this.shouldFilters.map(
        (filter) =>
          new FilterKeyRange(
            ctx,
            this.logger,
            filter.filterKey,
            filter.filterValue,
            undefined,
            this.sortInterval,
            PREFETCH_SIZE,
            stats,
          ),
      );
      if (shouldStreams.length === 1) {
        ranges.push(shouldStreams[0]);
      } else if (shouldStreams.length > 1) {
        ranges.push(new Union(shouldStreams));
      }
    }

    if (ranges.length === 1) {
      return ranges[0];
    }
    return new Intersection(ranges);
  }

  private matchesFilters(point: Doc<"points">): boolean {
    if (
      this.sortInterval.startInclusive !== undefined &&
      point.sortKey < this.sortInterval.startInclusive
    ) {
      return false;
    }
    if (
      this.sortInterval.endExclusive !== undefined &&
      point.sortKey >= this.sortInterval.endExclusive
    ) {
      return false;
    }

    for (const filter of this.mustFilters) {
      if (!this.pointMatchesCondition(point, filter)) {
        return false;
      }
    }

    if (this.shouldFilters.length > 0) {
      let anyMatch = false;
      for (const filter of this.shouldFilters) {
        if (this.pointMatchesCondition(point, filter)) {
          anyMatch = true;
          break;
        }
      }
      if (!anyMatch) {
        return false;
      }
    }

    return true;
  }

  private pointMatchesCondition(point: Doc<"points">, filter: FilterCondition) {
    const value = point.filterKeys[filter.filterKey];
    if (value === undefined) {
      return false;
    }
    if (Array.isArray(value)) {
      return value.some((candidate) => candidate === filter.filterValue);
    }
    return value === filter.filterValue;
  }

  addCandidate(cellID: bigint, level: number, distance: ChordAngle) {
    if (this.maxDistanceChordAngle && distance > this.maxDistanceChordAngle) {
      return;
    }
    const threshold = this.distanceThreshold();
    if (threshold !== undefined && distance >= threshold) {
      return;
    }
    this.toProcess.push({ cellID, level, distance });
  }

  popCandidate(): CellCandidate | null {
    const threshold = this.distanceThreshold();
    while (true) {
      const candidate = this.toProcess.pop();
      if (candidate === undefined) {
        break;
      }
      if (threshold === undefined || candidate.distance <= threshold) {
        return candidate;
      }
    }
    return null;
  }

  addResult(pointID: Id<"points">, point: Point) {
    const distance = this.s2.pointDistance(this.point, point);
    const threshold = this.distanceThreshold();
    if (this.maxDistanceChordAngle && distance > this.maxDistanceChordAngle) {
      return;
    }
    if (threshold !== undefined && distance >= threshold) {
      return;
    }
    while (this.results.size() >= this.maxResults) {
      this.results.pop();
    }
    this.results.push({ pointID, distance });
  }

  distanceThreshold(): ChordAngle | undefined {
    const worstEntry = this.results.peek();
    if (worstEntry && this.results.size() >= this.maxResults) {
      if (
        this.maxDistanceChordAngle &&
        worstEntry.distance > this.maxDistanceChordAngle
      ) {
        throw new Error("Max distance exceeded by entry in heap?");
      }
      return worstEntry.distance;
    }
    return this.maxDistanceChordAngle;
  }
}

type CellCandidate = {
  cellID: bigint;
  level: number;
  distance: ChordAngle;
};

type Result = {
  pointID: Id<"points">;
  distance: ChordAngle;
};
