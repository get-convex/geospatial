import { Feature, GeoJsonProperties, Polygon } from "geojson";
import { Latitude, Longitude, Point } from "../types.js";
import * as turf from "@turf/turf"

export type Position = [Longitude, Latitude];

function isClose(a: number, b: number, rtol: number = 1e-5, atol: number =1e-8) {
    if (Number.isNaN(a) || Number.isNaN(b) || !Number.isFinite(a) || !Number.isFinite(b)) {
      throw new Error(`Invalid isClose(${a}, ${b}) comparison`);
    }
    return Math.abs(a - b) <= atol + rtol * Math.abs(b);
  }
  
  function round(n: number) {
    return Math.round(n * 1e7) / 1e7;
  }
  
  function crossingLatitude(start: Position, end: Position) {
    const [startLng, startLat] = start;
    const [endLng, endLat] = end;
  
    if (Math.abs(startLng) == 180) {
      return startLat;
    } else if (Math.abs(endLng) == 180) {
      return endLat;
    }
    const latitudeDelta = endLat - startLat;
    if (endLng > 0) {
      return round(startLat + (180 - startLng) * latitudeDelta / (endLng + 360 - startLng))
    } else {
      return round(startLat + (startLng + 180) * latitudeDelta / (startLng + 360 - endLng))
    }
  }

  function pointArraysEqual(p: [number, number], q: [number, number]) {
    return p[0] == q[0] && p[1] == q[1];
  }
  
  
  
  function segment(coords: Position[]): Position[][] {
    let segment: Position[]= [];
    const segments: Position[][] = [];
  
    for (let i = 1; i < coords.length; i++) {
       const start = coords[i - 1];
       const [startLng, startLat] = start;
  
       const end = coords[i];
       const [endLng, endLat] = end;
  
       segment.push(start);
  
       if ((endLng - startLng > 180) && (endLng - startLng !== 360)) {
        const latitude = crossingLatitude(start, end);
        segment.push([-180, latitude]);
        segments.push(segment);
        segment = [[180, latitude]];
       } else if ((startLng - endLng > 180) && (startLng - endLng !== 360)) {
        const latitude = crossingLatitude(end, start);
        segment.push([180, latitude]);
        segments.push(segment);
        segment = [[-180, latitude]];
       }
    }
  
    if (!segments.length) {
      return [];
    }
  
    if (pointArraysEqual(coords.at(-1)!, segments[0][0])) {
      segments[0] = [...segment, ...segments[0]]
    } else {
      segment.push(coords.at(-1)!);
      segments.push(segment);
    }
    return segments;
  }
  
  function normalizeLongitudes(coords: Position[]) {
    let allOnAntimeridian = true;
    const result: Position[] = [];
    for (let i = 0; i < coords.length; i++) {
      const [currentLng, currentLat] = coords[i];
      const [prevLng, prevLat] = coords[(i - 1 + coords.length) % coords.length];
      
      if (isClose(currentLng, 180)) {
        if (Math.abs(currentLat) !== 90 && isClose(prevLng, -180)) {
          result.push([-180, currentLat]);
        } else {
          result.push([180, currentLat]);
        }      
      } else if (isClose(currentLng, -180)) {
        if (Math.abs(currentLat) !== 90 && isClose(prevLng, 180)) {
          result.push([180, currentLat]);
        } else {
          result.push([-180, currentLat]);
        }
      } else {
        allOnAntimeridian = false;
        result.push([(currentLng + 180) % 360 - 180, currentLat]);
      }
    }
    if (allOnAntimeridian) {
      return coords;
    }
    return result;  
  }
  
  function extendOverPoles(segments: Position[][], forceNorthPole: boolean = false, forceSouthPole: boolean = false): Position[][] {
    type IndexAndLatitude = { index: number, latitude: Latitude };
    let leftStart: IndexAndLatitude | null = null;
    let rightStart: IndexAndLatitude | null = null;
    let leftEnd: IndexAndLatitude | null = null;
    let rightEnd: IndexAndLatitude | null = null;
  
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
  
      const [startLng, startLat] = segment[0];
      const [endLng, endLat] = segment.at(-1)!;
  
      if (startLng === -180 && (leftStart === null || startLat < leftStart.latitude)) {
        leftStart = { index: i, latitude: startLat };
      } else if (startLng === 180 && (rightStart === null || startLat > rightStart.latitude)) {
        rightStart = { index: i, latitude: startLat };
      } 
  
      if (endLng === -180 && (leftEnd === null || endLat < leftEnd.latitude)) {
        leftEnd = { index: i, latitude: endLat };
      } else if (endLng === 180 && (rightEnd === null || endLat > rightEnd.latitude)) {
        rightEnd = { index: i, latitude: endLat };
      }
    }
  
    let isOverNorthPole = false;
    let isOverSouthPole = false;
  
    if (leftStart && rightStart) {
      isOverNorthPole = true;
    }
  
    if (leftEnd && rightEnd) {
      isOverSouthPole = true;
    }
  
    const result: Position[][] = segments.map(segment => segment.map(p => [...p]))    
  
    if (leftEnd) {
      if ((forceNorthPole && !forceSouthPole) && !rightEnd && (!leftStart || leftEnd.latitude > leftStart.latitude)) {
        isOverNorthPole = true;
        result[leftEnd.index].push([-180, 90], [180, 90]);
        result[leftEnd.index].reverse();
      } else if (forceSouthPole || !leftStart || leftEnd.latitude < leftStart.latitude) {
        isOverSouthPole = true;
        result[leftEnd.index].push([-180, -90], [180, -90]);      
      }
    }
    if (rightEnd) {
      if ((forceSouthPole && !forceNorthPole) && (!rightStart || rightEnd.latitude < rightStart.latitude)) {
        isOverSouthPole = true;
        result[rightEnd.index].push([-180, -90], [180, -90]);
        result[rightEnd.index].reverse();
      } else if (forceNorthPole || !rightStart || rightEnd.latitude > rightStart.latitude) {
        isOverNorthPole = true;
        result[rightEnd.index].push([180, 90], [-180, 90]);
      }
    }

    for (const ring of result) {
        if (!pointArraysEqual(ring[0], ring.at(-1)!)) {
            ring.push(ring[0]);
        }
    }


    return result;
  }
  
  function buildPolygons(segments: Position[][]): Feature<Polygon, GeoJsonProperties>[] {
    let segment = segments.pop();
    if (!segment) {
      return [];
    }    
  
    const isRight = segment.at(-1)![0] === 180;
  
    type IndexAndLatitude = { index: number | null, latitude: Latitude };
    const candidates: IndexAndLatitude[] = [];
  
    if (isSelfClosing(segment)) {
      candidates.push({ index: null, latitude: segment[0][1] });
    }
    for (let i = 0; i < segments.length; i++) {
      const s = segments[i];
      const [startLng, startLat] = s[0];
      const [endLng, endLat] = s.at(-1)!;
  
      if (startLng === endLng) {
        const isCandidate = 
          (isRight && startLat > endLat && (!isSelfClosing(s) || endLat < startLat)) ||
          (!isRight && startLat < endLat && (!isSelfClosing(s) || endLat > startLat));
        if (isCandidate) {
          candidates.push({ index: i, latitude: startLat });
        }            
      }
    }
  
    candidates.sort((a, b) => (a.latitude - b.latitude) * (isRight ? 1 : -1));
    let index: number | null = null;
    if (candidates.length) {
      index = candidates[0].index;
    }
    if (index) {
      segment.push(...segments.splice(index, 1)[0]);
      segments.push(segment);
      return buildPolygons(segments);
    } else {
      const polygons = buildPolygons(segments);
      if (!segment.every(p => pointArraysEqual(p, segment[0]))) {
        polygons.push(turf.polygon([segment]));
      }
      return polygons;
    }
  }
  
  function isSelfClosing(segment: Position[]) {
    const [firstLng, firstLat] = segment[0];
    const [lastLng, lastLat] = segment.at(-1)!;
  
    const isRight = lastLng === 180;
    return firstLng === lastLng && (
      (isRight && firstLat > lastLat) || (!isRight && firstLat < lastLat)
    )  
  }
  
  export function fixPolygon(coords: Position[]) {    
    const exterior = normalizeLongitudes(coords);    
    const segments = segment(exterior);        
    if (!segments.length) {
      return new DisjointPolygons(turf.polygon([exterior]));
    }    
    const extended = extendOverPoles(segments);    
    const polygons = buildPolygons(extended);
    return new DisjointPolygons(...polygons);
  }
  
  
  export class DisjointPolygons {
    // `turf` doesn't fully support multi-polygons, so just manage a list of polygons ourselves.
    polygons: Feature<Polygon, GeoJsonProperties>[];
    area: number;
  
    constructor(...polygons: Feature<Polygon, GeoJsonProperties>[]) {
      for (const polygon of polygons) {
        // Check that the polygons don't have any holes.
        if (polygon.geometry.coordinates.length > 1) {
          throw new Error("Polygon has holes:");
        }
        // Check that the exterior ring is counter-clockwise.
        const exteriorRing = polygon.geometry.coordinates[0];
        if (turf.booleanClockwise(exteriorRing)) {
          throw new Error(`Exterior ring is clockwise: ${JSON.stringify(exteriorRing)}`);
        }
      }
      for (let i = 0; i < polygons.length; i++) {
        for (let j = i + 1; j < polygons.length; j++) {
          const a = polygons[i];
          const b = polygons[j];
          const intersects = turf.booleanContains(a, b) || turf.booleanContains(b, a) || turf.booleanIntersects(a, b);
          if (intersects) {
            throw new Error(`Polygons are not disjoint: ${JSON.stringify(a)} intersects with ${JSON.stringify(b)}`);
          }
        }
      }
      this.polygons = polygons;
      this.area = this.polygons.reduce((acc, polygon) => acc + turf.area(polygon), 0);
    }
  
    overlaps(other: DisjointPolygons) {
      if (this.contains(other) || other.contains(this)) {
        return true;
      }
      for (const polygon of this.polygons) {
        for (const otherPolygon of other.polygons) {
          if (turf.booleanContains(polygon, otherPolygon) || turf.booleanContains(otherPolygon, polygon) || turf.booleanIntersects(polygon, otherPolygon)) {
            return true;
          }
        }
      }
      return false;
    }
  
    contains(other: DisjointPolygons) {
      return other.polygons.every(polygon => this.polygons.some(p => turf.booleanContains(p, polygon)));
    }
  
    containsPoint(point: Point) {
      const p = turf.point([point.longitude, point.latitude]);
      return this.polygons.some(polygon => turf.booleanPointInPolygon(p, polygon));
    }
  }