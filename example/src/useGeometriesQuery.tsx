import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import type { Point, Polygon } from "@convex-dev/geospatial";

/**
 * Hook to interact with stored geometries (polygons/polylines).
 */
export function useGeometriesQuery() {
  // List all stored geometries
  const geometriesResult = useQuery(api.example.listGeometries);

  // Seed state polygons
  const seedStates = useMutation(api.seed.seedStatePolygons);

  // Delete a geometry
  const deleteGeometry = useMutation(api.example.deleteGeometry);

  return {
    geometries: geometriesResult ?? [],
    seedStates,
    deleteGeometry,
    loading: geometriesResult === undefined,
  };
}

/**
 * Hook to query which geometries contain a given point.
 */
export function useContainsPointQuery(point: Point | null) {
  const result = useQuery(
    api.example.geometryContainsPoint,
    point ? { point } : "skip"
  );

  return {
    results: result?.results ?? [],
    truncated: result?.truncated ?? false,
    loading: point !== null && result === undefined,
  };
}

/**
 * Hook to query geometries near a point.
 */
export function useGeometriesNearQuery(
  point: Point | null,
  maxDistance: number
) {
  const result = useQuery(
    api.example.geometriesNearPoint,
    point ? { point, maxDistance } : "skip"
  );

  return {
    results: result?.results ?? [],
    truncated: result?.truncated ?? false,
    loading: point !== null && result === undefined,
  };
}

/**
 * Hook to get measurements for a polygon.
 */
export function usePolygonMeasurements(polygon: Polygon | null) {
  const result = useQuery(
    api.example.measurePolygon,
    polygon ? { polygon } : "skip"
  );

  return {
    area: result?.area ?? null,
    perimeter: result?.perimeter ?? null,
    centroid: result?.centroid ?? null,
    loading: polygon !== null && result === undefined,
  };
}
