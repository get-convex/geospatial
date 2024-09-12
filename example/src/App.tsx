import { useMemo, useRef, useState } from "react";
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
  const results = useQuery(api.search.default, {
    rectangle,
    mustFilter: props.mustFilter,
    shouldFilter: props.shouldFilter,
    maxRows: 96,
  });
  props.setLoading(results === undefined);

  const stickyResults = useRef(results);
  if (results !== undefined) {
    stickyResults.current = results;
  }
  if (stickyResults.current === undefined) {
    return null;
  }
  const tilingPolygons: number[][][] = [];
  for (const cell of stickyResults.current.h3Cells) {
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
      {stickyResults.current.rows.map((row) => (
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
