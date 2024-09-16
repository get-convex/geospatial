import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import { api } from "../convex/_generated/api";

import "leaflet/dist/leaflet.css";
import {
  MapContainer,
  Marker,
  Polygon,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import { cellToVertexes, vertexToLatLng } from "h3-js";
import { Icon, LatLng, LatLngExpression } from "leaflet";
import { useMutation, useQuery } from "convex/react";
import { Doc } from "../convex/_generated/dataModel";
import { Point } from "../../src/client";
import { Select } from "antd";
import { FOOD_EMOJIS } from "../convex/constants.js";
import { convexAddress } from "./main.js";

const manhattan = [40.746, -73.985];

function LocationSearch(props: {
  setLoading: (loading: boolean) => void;
  mustFilter: string[];
  shouldFilter: string[];
}) {
  const map = useMap();
  const [bounds, setBounds] = useState(map.getBounds());
  const addPoint = useMutation(api.addPoint.default);
  useMapEvents({
    moveend: () => {
      setBounds(map.getBounds());
    },
    contextmenu: (e) => {
      e.originalEvent.preventDefault();
      const latLng = map.mouseEventToLatLng(e.originalEvent);
      addPoint({ point: { latitude: latLng.lat, longitude: latLng.lng } });
    },
  });
  const rectangle = useMemo(() => {
    const latLongToObj = (latLong: LatLng) => ({
      latitude: latLong.lat,
      longitude: latLong.lng,
    });
    return {
      sw: latLongToObj(bounds.getSouthWest()),
      nw: latLongToObj(bounds.getNorthWest()),
      ne: latLongToObj(bounds.getNorthEast()),
      se: latLongToObj(bounds.getSouthEast()),
    };
  }, [bounds]);

  const [rows, setRows] = useState<any[]>([]);
  const generationNumber = useRef(0);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const url =
      convexAddress.replace(/\.convex\.cloud$/, ".convex.site") + "/search";
    const abortController = new AbortController();

    generationNumber.current++;
    const executionNumber = generationNumber.current;
    console.log(`Starting search @ ${executionNumber}`);

    const receiver = async () => {
      if (executionNumber !== generationNumber.current) {
        console.log(`Skipping canceled results @ ${executionNumber} `);
        return;
      }
      setLoading(true);
      props.setLoading(true);
      setRows([]);
      const resp = await fetch(url, {
        method: "POST",
        body: JSON.stringify({
          rectangle,
          mustFilter: props.mustFilter,
          shouldFilter: props.shouldFilter,
          maxRows: 96,
        }),
        signal: abortController.signal,
      });
      if (!resp.ok) {
        throw new Error(resp.statusText);
      }
      if (!resp.body) {
        throw new Error("Body missing from response");
      }
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        const results: any[] = [];
        for (const line of lines) {
          if (line.trim()) {
            results.push(JSON.parse(line));
          }
        }
        if (executionNumber !== generationNumber.current) {
          console.log(`Skipping canceled results @ ${executionNumber} `);
          return;
        }
        setRows((prev) => [...prev, ...results]);
      }
      if (buffer.trim()) {
        const lines = buffer.split("\n");
        const results: any[] = [];
        for (const line of lines) {
          if (line.trim()) {
            results.push(JSON.parse(line));
          }
        }
        if (executionNumber !== generationNumber.current) {
          console.log(`Skipping canceled results @ ${executionNumber} `);
          return;
        }
        setRows((prev) => [...prev, ...results]);
      }
      setLoading(false);
      props.setLoading(false);
    };
    void receiver();
    return () => abortController.abort("canceled");
  }, [
    JSON.stringify({
      rectangle,
      mustFilter: props.mustFilter,
      shouldFilter: props.shouldFilter,
    }),
    setLoading,
  ]);

  const h3Cells = useQuery(api.search.h3Cells, {
    rectangle,
    maxResolution: 10,
  });

  const stickyH3Cells = useRef<string[]>([]);
  if (h3Cells !== undefined) {
    stickyH3Cells.current = h3Cells;
  }

  const stickyRows = useRef<any[]>([]);
  if (rows.length > 0 || loading === false) {
    stickyRows.current = rows;
  }

  const tilingPolygons: number[][][] = [];
  for (const cell of stickyH3Cells.current) {
    const polygon = [];
    for (const vertex of cellToVertexes(cell)) {
      const coords = vertexToLatLng(vertex);
      polygon.push(coords);
    }
    tilingPolygons.push(polygon);
  }
  return (
    <>
      {tilingPolygons.map((polygon, i) => (
        <Polygon
          key={i}
          pathOptions={{ color: "blue" }}
          positions={polygon as any}
        />
      ))}
      {stickyRows.current.map((row) => (
        <SearchResult key={row._id} row={row} />
      ))}
    </>
  );
}

function SearchResult(props: {
  row: Doc<"locations"> & { coordinates: Point };
}) {
  const { row } = props;
  const { latitude, longitude } = row.coordinates;
  const map = useMap();
  const zoom = map.getZoom();

  // Calculate size based on zoom level
  const baseSize = 20;
  const size = Math.max(baseSize, baseSize * (zoom / 10));

  return (
    <Marker
      position={[latitude, longitude]}
      icon={
        new Icon({
          iconUrl: `data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>${row.name}</text></svg>`,
          iconSize: [size, size],
          iconAnchor: [size / 2, size],
        })
      }
    />
  );
}

const emojiFilterItems = [
  // {value: 'none', label: 'No filter'},
  ...FOOD_EMOJIS.map((emoji) => ({ label: emoji, value: emoji })),
];

function App() {
  const [loading, setLoading] = useState(true);
  const [mustFilter, setMustFilter] = useState<string[]>([]);
  const [shouldFilter, setShouldFilter] = useState<string[]>([]);
  return (
    <>
      <h1>Convex Geospatial Demo</h1>
      Right click on the map to put down a random emoji! The blue polygons
      visualize the current H3 index cells. You can also filter the results by a
      single emoji (a "must" filter that's a required condition) or a set of
      emojis (a "should" filter that requires at least one of the emojis to
      match).
      <div
        style={{
          marginBottom: "10px",
          display: "flex",
          justifyContent: "center",
          gap: "10px",
          position: "relative",
          zIndex: 1000,
        }}
      >
        <Select
          allowClear
          placeholder="Pick an emoji to require"
          defaultValue={[]}
          options={emojiFilterItems}
          style={{ width: "50%" }}
          onChange={(v: any) => setMustFilter(v ? [v] : [])}
        />
        <Select
          mode="multiple"
          allowClear
          placeholder="Pick some emoji to allow"
          defaultValue={[]}
          options={emojiFilterItems}
          style={{ width: "50%" }}
          onChange={setShouldFilter}
        />
        {loading && (
          <span style={{ position: "absolute", right: "6px", top: "50px" }}>
            <i>Loading...</i>
          </span>
        )}
      </div>
      <MapContainer center={manhattan as LatLngExpression} id="mapId" zoom={15}>
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        <LocationSearch
          setLoading={setLoading}
          mustFilter={mustFilter}
          shouldFilter={shouldFilter}
        />
      </MapContainer>
    </>
  );
}

export default App;
