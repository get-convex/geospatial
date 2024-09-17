import { useQueries } from "convex/react";
import { useState, useMemo, useEffect } from "react";
import { Rectangle } from "../../src/component/types";
import { api } from "../convex/_generated/api";

export function useGeoQuery(
  rectangle: Rectangle,
  mustFilter: string[],
  shouldFilter: string[],
  maxRows: number,
) {
  const [queries, setQueries] = useState<Record<string, any>>({});
  const argsKey = useMemo(
    () =>
      JSON.stringify({
        rectangle,
        mustFilter,
        shouldFilter,
      }),
    [rectangle, mustFilter, shouldFilter],
  );
  const queryResults = useQueries(queries);
  useEffect(() => {
    const startKey = `${argsKey}@0`;
    if (queries[startKey] === undefined) {
      setQueries({
        [startKey]: {
          query: api.search.execute,
          args: {
            rectangle,
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
            query: api.search.execute,
            args: {
              rectangle,
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
  }, [queries, argsKey, queryResults]);
  const rows = [];
  let loading = false;
  let foundAny = false;
  for (const [key, result] of Object.entries(queryResults)) {
    if (key.startsWith(argsKey)) {
      foundAny = true;
      if (result instanceof Error) {
        throw result;
      }
      if (result) {
        rows.push(...result.rows);
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