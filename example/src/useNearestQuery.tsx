import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { Point } from "@convex-dev/geospatial";
import { FunctionReturnType } from "convex/server";

type NearestResults = FunctionReturnType<typeof api.example.nearestPoints>;

export function useNearestQuery(point: Point | null, maxResults: number) {
  const results = useQuery(
    api.example.nearestPoints,
    point
      ? {
          point,
          maxRows: maxResults,
        }
      : "skip"
  );

  if (!point || !results) {
    return { rows: [], loading: false };
  }

  const rows = results.map((result) => ({
    _id: result.key as any,
    _creationTime: 0,
    name: result.coordinates.name,
    coordinates: result.coordinates,
    distance: result.distance,
  }));

  return { rows, loading: false };
} 