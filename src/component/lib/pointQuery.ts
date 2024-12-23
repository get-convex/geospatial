import { Heap } from "heap-js";
import { ChordAngle, Meters, Point } from "../types.js";
import { Id } from "../_generated/dataModel.js";
import { S2Bindings } from "./s2Bindings.js";
import { QueryCtx } from "../_generated/server.js";
import * as approximateCounter from "./approximateCounter.js";
import { cellCounterKey } from "../streams/cellRange.js";
import { decodeTupleKey } from "./tupleKey.js";
import { Logger } from "./logging.js";

export class ClosestPointQuery {
  // Min-heap of cells to process.
  toProcess: Heap<CellCandidate>;

  // Max-heap of results.
  results: Heap<Result>;

  maxDistanceChordAngle: ChordAngle;

  constructor(
    private s2: S2Bindings,
    private logger: Logger,
    private point: Point,
    private maxDistance: Meters,
    private maxResults: number,
    private minLevel: number,
    private maxLevel: number,
    private levelMod: number,
  ) {
    this.toProcess = new Heap<CellCandidate>((a, b) => a.distance - b.distance);
    this.results = new Heap<Result>((a, b) => b.distance - a.distance);
    this.maxDistanceChordAngle = this.s2.metersToChordAngle(this.maxDistance);

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
        // Query the current cell and add its results in.
        const pointEntries = await ctx.db
          .query("pointsByCell")
          .withIndex("cell", (q) => q.eq("cell", cellIDToken))
          .collect();
        this.logger.debug(`Found ${pointEntries.length} points in cell ${cellIDToken}`);
        const pointIds = pointEntries.map(
          (entry) => decodeTupleKey(entry.tupleKey).pointId,
        );        
        const points = await Promise.all(pointIds.map((id) => ctx.db.get(id)));
        for (const point of points) {
          if (!point) {
            throw new Error("Point not found");
          }
          this.addResult(point._id, point.coordinates);
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
      results.push({
        key: point.key,
        coordinates: point.coordinates,
        distance: this.s2.chordAngleToMeters(entries[i].distance),
      });
    }
    return results;
  }

  addCandidate(cellID: bigint, level: number, distance: ChordAngle) {
    if (distance > this.maxDistanceChordAngle) {
      return;
    }
    const worst = this.worstResult();
    if (worst !== null && distance >= worst.distance) {
      return;
    }
    this.toProcess.push({ cellID, level, distance });
  }

  popCandidate(): CellCandidate | null {
    const worst = this.worstResult();
    while (true) {
      const candidate = this.toProcess.pop();
      if (candidate === undefined) {
        break;
      }
      if (worst === null || candidate.distance <= worst.distance) {
        return candidate;
      }
    }
    return null;
  }

  addResult(pointID: Id<"points">, point: Point) {
    const distance = this.s2.pointDistance(this.point, point);
    const worst = this.worstResult();
    if (worst !== null && distance >= worst.distance) {
      return;
    }
    while (this.results.size() >= this.maxResults) {
      this.results.pop();
    }
    this.results.push({ pointID, distance });
  }

  worstResult(): Result | null {
    if (this.results.size() < this.maxResults) {
      return null;
    }
    return this.results.peek() ?? null;
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
