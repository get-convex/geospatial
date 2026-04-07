import { RequestForQueries, useQueries } from "convex/react";
import { useState, useMemo, useEffect } from "react";
import { Point } from "@convex-dev/geospatial";
import { api } from "../convex/_generated/api";
import { FunctionReturnType } from "convex/server";

type Rows = FunctionReturnType<typeof api.example.searchPolyline>["rows"];

export function usePolylineQuery(
  polyline: Point[] | null,
  bufferMeters: number,
  mustFilter: string[],
  shouldFilter: string[],
  maxRows: number,
) {
  const [queries, setQueries] = useState<RequestForQueries>({});
  const argsKey = useMemo(
    () =>
      JSON.stringify({
        polyline,
        bufferMeters,
        mustFilter,
        shouldFilter,
      }),
    [polyline, bufferMeters, mustFilter, shouldFilter],
  );
  const queryResults = useQueries(queries);

  useEffect(() => {
    // Don't query if no polyline or polyline has less than 2 points
    if (!polyline || polyline.length < 2) {
      // Only clear if not already empty to avoid infinite loop
      setQueries((prev) => (Object.keys(prev).length === 0 ? prev : {}));
      return;
    }

    const startKey = `${argsKey}@0`;
    if (queries[startKey] === undefined) {
      setQueries({
        [startKey]: {
          query: api.example.searchPolyline,
          args: {
            polyline,
            bufferMeters,
            mustFilter,
            shouldFilter,
            maxRows,
          },
        },
      });
      return;
    }
    let lastResult = queryResults[startKey];
    if (lastResult instanceof Error) {
      throw lastResult;
    }
    if (!lastResult) {
      return;
    }
    if (!lastResult.nextCursor) {
      return;
    }
    let totalRows = lastResult.rows.length;
    for (let i = 1; ; i++) {
      if (totalRows >= maxRows) {
        break;
      }
      const key = `${argsKey}@${i}`;
      if (queries[key] === undefined) {
        setQueries({
          ...queries,
          [key]: {
            query: api.example.searchPolyline,
            args: {
              polyline,
              bufferMeters,
              mustFilter,
              shouldFilter,
              maxRows: maxRows - totalRows,
              cursor: lastResult.nextCursor,
            },
          },
        });
        break;
      }
      const result = queryResults[key];
      if (result === undefined) {
        break;
      }
      if (result instanceof Error) {
        throw result;
      }
      if (!result.nextCursor) {
        break;
      }
      lastResult = result;
      totalRows += result.rows.length;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queries, argsKey, queryResults, maxRows, polyline, bufferMeters]);

  const rows: Rows = [];
  const seen = new Set<string>();
  let loading = false;
  let foundAny = false;

  // If no valid polyline, return empty
  if (!polyline || polyline.length < 2) {
    return { rows: [], loading: false };
  }

  for (const [key, result] of Object.entries(queryResults)) {
    if (key.startsWith(argsKey)) {
      foundAny = true;
      if (result instanceof Error) {
        throw result;
      }
      if (result) {
        for (const row of result.rows) {
          if (seen.has(row._id)) {
            continue;
          }
          rows.push(row);
          seen.add(row._id);
        }
      } else {
        loading = true;
      }
    }
  }
  if (!foundAny) {
    loading = true;
  }
  return { rows, loading };
}
