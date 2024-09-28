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
  LatLng,
  latLngBounds,
  LatLngBounds,
  LatLngExpression,
  LatLngTuple,
} from "leaflet";
import { useMutation, useQuery } from "convex/react";
import { Doc } from "../convex/_generated/dataModel";
import { Point } from "../../src/client";
import { Select } from "antd";
import { FOOD_EMOJIS } from "../convex/constants.js";
import { useGeoQuery } from "./useGeoQuery.js";
import { cellToPolygon } from "../../src/component/lib/geometry.js";

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
  const addPoint = useMutation(api.addPoint.default).withOptimisticUpdate(
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
          _id: JSON.stringify(point) as any,
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
    }
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
      });
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

  const tilingPolygons: { polygon: LatLngExpression[]; cell: string }[] = [];
  for (const cell of stickyH3Cells.current) {
    const { polygons } = cellToPolygon(cell);
    for (const polygon of polygons) {
      const leafletPolygon = polygon.geometry.coordinates[0].map((coord) => {
        const [lng, lat] = coord;
        return [lat, lng] as LatLngTuple;
      });
      tilingPolygons.push({ polygon: leafletPolygon, cell });
    }    
  }
  
  console.log(
    "map bounds",
    `long: ${map.getBounds().getWest()} -> ${map.getBounds().getEast()}`,
    `lat: ${map.getBounds().getSouth()} -> ${map.getBounds().getNorth()}`,
  );
  
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
      <MapContainer
        center={manhattan as LatLngExpression}
        id="mapId"
        zoom={15}
        maxBounds={latLngBounds([
          [-80, -179.9],
          [80, 179.9],
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
