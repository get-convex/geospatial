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
import {
  Icon,
  latLngBounds,
  LatLngBounds,
  LatLngExpression,
  LatLngTuple,
} from "leaflet";
import { useMutation, useQuery } from "convex/react";
import { Doc, Id } from "../convex/_generated/dataModel";
import type { Point } from "../../src/client";
import { Select } from "antd";
import { FOOD_EMOJIS } from "../convex/constants.js";
import { useGeoQuery } from "./useGeoQuery.js";

const manhattan = [40.746, -73.985];

function normalizeLongitude(longitude: number) {
  return ((((longitude + 180) % 360) + 360) % 360) - 180;
}

function LocationSearch(props: {
  loading: boolean;
  setLoading: (loading: boolean) => void;
  mustFilter: string[];
  shouldFilter: string[];
}) {
  const map = useMap();
  const [bounds, setBounds] = useState(map.getBounds());
  const addPoint = useMutation(api.example.addPoint).withOptimisticUpdate(
    (store, args) => {
      const { point, name } = args;
      for (const { args, value } of store.getAllQueries(api.search.execute)) {
        console.log("optimistic update", point, name, args, value);
        if (!value) {
          continue;
        }
        if (args.cursor) {
          continue;
        }
        const { rectangle } = args;
        if (
          point.latitude < rectangle.south ||
          point.latitude > rectangle.north ||
          point.longitude < rectangle.west ||
          point.longitude > rectangle.east
        ) {
          continue;
        }
        if (props.mustFilter.length > 0 && props.mustFilter[0] !== name) {
          continue;
        }
        if (
          props.shouldFilter.length > 0 &&
          !props.shouldFilter.includes(name)
        ) {
          continue;
        }
        const newRow = {
          _id: JSON.stringify(point) as Id<"locations">,
          _creationTime: 0,
          name,
          coordinates: point,
        };
        console.log("adding new row", newRow, "to", args);
        const newValue = {
          ...value,
          rows: [...value.rows, newRow],
        };
        store.setQuery(api.search.execute, args, newValue);
      }
    },
  );
  useMapEvents({
    moveend: () => {
      const bounds = map.getBounds();
      const normalizedWest = normalizeLongitude(bounds.getWest());
      const normalizedEast = normalizeLongitude(bounds.getEast());
      const normalizedBounds = new LatLngBounds([
        [bounds.getSouth(), normalizedWest],
        [bounds.getNorth(), normalizedEast],
      ]);
      setBounds(normalizedBounds);
    },
    contextmenu: (e) => {
      e.originalEvent.preventDefault();
      const latLng = map.mouseEventToLatLng(e.originalEvent);
      const name = FOOD_EMOJIS[Math.floor(Math.random() * FOOD_EMOJIS.length)];
      addPoint({
        point: { latitude: latLng.lat, longitude: latLng.lng },
        name,
      }).catch(console.error);
    },
  });
  const rectangle = useMemo(() => {
    return {
      west: bounds.getWest(),
      east: bounds.getEast(),
      south: bounds.getSouth(),
      north: bounds.getNorth(),
    };
  }, [bounds]);

  const { rows, loading } = useGeoQuery(
    rectangle,
    props.mustFilter,
    props.shouldFilter,
    96,
  );

  if (loading !== props.loading) {
    props.setLoading(loading);
  }
  const cells = useQuery(api.search.debugCells, {
    rectangle,
    maxResolution: 20,
  });

  const stickyCells = useRef<{ token: string; vertices: Point[] }[]>([]);
  if (cells !== undefined) {
    stickyCells.current = cells;
  }

  const stickyRows = useRef<any[]>([]);
  if (rows.length > 0 || loading === false) {
    stickyRows.current = rows;
  }

  const tilingPolygons: { polygon: LatLngExpression[]; cell: string }[] = [];
  for (const { token, vertices } of stickyCells.current) {
    const leafletPolygon = vertices.map((p) => {
      return [p.latitude, p.longitude] as LatLngTuple;
    });
    tilingPolygons.push({ polygon: leafletPolygon, cell: token });
  }

  return (
    <>
      {tilingPolygons.map(({ polygon, cell }, i) => (
        <Polygon
          key={i}
          pathOptions={{ color: "blue", lineCap: "round", lineJoin: "bevel" }}
          positions={polygon}
          eventHandlers={{
            click: (e) => {
              e.originalEvent.preventDefault();
              console.log(`Clicked on cell ${cell}`, polygon);
            },
          }}
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
      visualize the current S2 index cells. You can also filter the results by a
      single emoji (an AND of an equality condition) or a set of emojis (an AND
      of an IN condition).
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
      <MapContainer
        center={manhattan as LatLngExpression}
        id="mapId"
        zoom={15}
        // TODO: Leaflet doesn't handle the antimeridian, so bound the viewport away from the edges.
        // Convex's underlying geospatial index, however, uses spherical geometry and is fine.
        maxBounds={latLngBounds([
          [-80, -175],
          [80, 175],
        ])}
        maxBoundsViscosity={1.0}
        bounceAtZoomLimits={false}
        maxZoom={18}
        minZoom={4}
        zoomSnap={1}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        <LocationSearch
          loading={loading}
          setLoading={setLoading}
          mustFilter={mustFilter}
          shouldFilter={shouldFilter}
        />
      </MapContainer>
    </>
  );
}

export default App;
