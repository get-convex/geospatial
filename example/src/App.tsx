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
import type { Point } from "@convex-dev/geospatial";
import { Select } from "antd";
import { FOOD_EMOJIS } from "../convex/constants.js";
import { useGeoQuery } from "./useGeoQuery.js";
import { useNearestQuery } from "./useNearestQuery.js";
import { FunctionReturnType } from "convex/server";

type Rows = FunctionReturnType<typeof api.example.search>["rows"];

const manhattan = [40.746, -73.985];

function normalizeLongitude(longitude: number) {
  return ((((longitude + 180) % 360) + 360) % 360) - 180;
}

function LocationSearch(props: {
  loading: boolean;
  setLoading: (loading: boolean) => void;
  mustFilter: string[];
  shouldFilter: string[];
  isNearestMode: boolean;
  nearestPoint: Point | null;
  setNearestPoint: (point: Point | null) => void;
  maxResults: number;
  showDebugCells: boolean;
}) {
  const map = useMap();
  const [bounds, setBounds] = useState(map.getBounds());
  const addPoint = useMutation(api.example.addPoint).withOptimisticUpdate(
    (store, args) => {
      const { point, name } = args;
      for (const { args, value } of store.getAllQueries(api.example.search)) {
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
        const newValue = {
          ...value,
          rows: [...value.rows, newRow],
        };
        store.setQuery(api.example.search, args, newValue);
      }
    },
  );

  useMapEvents({
    moveend: () => {
      if (props.isNearestMode) return;
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
      if (props.isNearestMode) return;
      e.originalEvent.preventDefault();
      const latLng = map.mouseEventToLatLng(e.originalEvent);
      const name = FOOD_EMOJIS[Math.floor(Math.random() * FOOD_EMOJIS.length)];
      addPoint({
        point: { latitude: latLng.lat, longitude: latLng.lng },
        name,
      }).catch(console.error);
    },
    click: (e) => {
      if (!props.isNearestMode) return;
      const latLng = map.mouseEventToLatLng(e.originalEvent);
      props.setNearestPoint({ latitude: latLng.lat, longitude: latLng.lng });
    }
  });

  const rectangle = useMemo(() => {
    return {
      west: bounds.getWest(),
      east: bounds.getEast(),
      south: bounds.getSouth(),
      north: bounds.getNorth(),
    };
  }, [bounds]);

  const { rows: viewportRows, loading } = useGeoQuery(
    rectangle,
    props.mustFilter,
    props.shouldFilter,
    96,
  );

  const { rows: nearestRows } = useNearestQuery(
    props.nearestPoint,
    props.maxResults
  );

  const rows = props.isNearestMode ? nearestRows : viewportRows;

  if (loading !== props.loading) {
    props.setLoading(loading);
  }

  const cells = useQuery(api.example.debugCells, {
    rectangle,
    maxResolution: 20,
  });

  const stickyCells = useRef<{ token: string; vertices: Point[] }[]>([]);
  if (cells !== undefined) {
    stickyCells.current = cells;
  }

  const stickyRows = useRef<Rows>([]);
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
      {!props.isNearestMode && props.showDebugCells && tilingPolygons.map(({ polygon, cell }, i) => (
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
      {props.nearestPoint && (
        <Marker
          position={[props.nearestPoint.latitude, props.nearestPoint.longitude]}
          icon={
            new Icon({
              iconUrl: `data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>📍</text></svg>`,
              iconSize: [20, 20],
              iconAnchor: [10, 20],
            })
          }
        />
      )}
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

  // Calculate size based on zoom level with a smoother scale
  const baseSize = 24;
  const size = Math.max(baseSize, baseSize * Math.pow(zoom / 12, 1.2));

  return (
    <Marker
      position={[latitude, longitude]}
      icon={
        new Icon({
          iconUrl: `data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><circle cx=%2250%22 cy=%2250%22 r=%2248%22 fill=%22white%22 stroke=%22%234a90e2%22 stroke-width=%222%22 opacity=%220.9%22 /><text y=%22.9em%22 x=%2250%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 font-size=%2270%22>${row.name}</text></svg>`,
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
          className: 'emoji-marker'
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
  const [isNearestMode, setIsNearestMode] = useState(false);
  const [nearestPoint, setNearestPoint] = useState<Point | null>(null);
  const [maxResults, setMaxResults] = useState(10);
  const [showDebugCells, setShowDebugCells] = useState(false);

  const commonButtonStyle = {
    backgroundColor: 'var(--accent-primary)',
    color: 'var(--bg-secondary)',
    border: 'none',
    padding: '8px 16px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    transition: 'all 0.2s',
    marginLeft: '10px',
    ':hover': {
      backgroundColor: 'var(--accent-secondary)',
    }
  } as const;

  const commonInputStyle = {
    padding: '8px 12px',
    borderRadius: '6px',
    border: '1px solid var(--border-color)',
    fontSize: '14px',
    width: '120px',
    backgroundColor: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
  } as const;

  return (
    <div style={{ 
      maxWidth: '1200px', 
      margin: '0 auto', 
      padding: '20px',
      backgroundColor: 'var(--bg-primary)',
      borderRadius: '12px',
      boxShadow: '0 2px 8px var(--shadow-color)'
    }}>
      <h1 style={{ 
        fontSize: '2.5em', 
        marginBottom: '24px',
        background: 'linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-secondary) 100%)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        textAlign: 'center'
      }}>
        Convex Geospatial Demo
      </h1>
      {isNearestMode ? (
        <>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '16px',
            marginBottom: '20px',
          }}>
            <p style={{ margin: 0, fontSize: '16px', color: 'var(--text-primary)' }}>
              Left click on the map to set a point and find the nearest emojis!
            </p>
            <button 
              onClick={() => setIsNearestMode(false)}
              style={commonButtonStyle}
            >
              Back to viewport mode
            </button>
          </div>
          <div style={{
            marginBottom: "20px",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: "16px",
            position: "relative",
            zIndex: 1000,
            padding: "16px",
            backgroundColor: "var(--bg-secondary)",
            borderRadius: "8px",
            boxShadow: "0 1px 4px var(--shadow-color)"
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <label style={{ fontSize: '14px', color: 'var(--text-primary)' }}>Max results:</label>
              <input
                type="number"
                value={maxResults}
                onChange={(e) => setMaxResults(Math.max(1, parseInt(e.target.value) || 1))}
                style={commonInputStyle}
              />
            </div>
            {nearestPoint && (
              <div style={{ 
                fontSize: '14px',
                backgroundColor: 'var(--accent-light)',
                padding: '8px 16px',
                borderRadius: '6px',
                border: '1px solid var(--accent-border)',
                color: 'var(--text-primary)'
              }}>
                Selected point: ({nearestPoint.latitude.toFixed(4)}, {nearestPoint.longitude.toFixed(4)})
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '16px',
            marginBottom: '20px',
          }}>
            <p style={{ margin: 0, fontSize: '16px', color: 'var(--text-primary)' }}>
              Right click on the map to put down a random emoji!
            </p>
            <button 
              onClick={() => setIsNearestMode(true)}
              style={commonButtonStyle}
            >
              Switch to nearest points mode
            </button>
          </div>
          <div
            style={{
              marginBottom: "20px",
              padding: "20px",
              backgroundColor: "var(--bg-secondary)",
              borderRadius: "8px",
              boxShadow: "0 1px 4px var(--shadow-color)",
              position: "relative",
              zIndex: 1000,
            }}
          >
            <div style={{ marginBottom: "16px" }}>
              <label style={{ 
                display: "flex", 
                alignItems: "center", 
                justifyContent: "center", 
                gap: "8px",
                fontSize: '14px',
                cursor: 'pointer',
                color: 'var(--text-primary)'
              }}>
                <input
                  type="checkbox"
                  checked={showDebugCells}
                  onChange={(e) => setShowDebugCells(e.target.checked)}
                  style={{ cursor: 'pointer' }}
                />
                Show S2 index cells
              </label>
            </div>
            <div style={{ 
              display: 'flex', 
              gap: '16px',
              flexWrap: 'wrap'
            }}>
              <Select
                allowClear
                placeholder="Pick an emoji to require"
                defaultValue={undefined}
                options={emojiFilterItems}
                style={{ 
                  width: "calc(50% - 8px)",
                  fontSize: '14px'
                }}
                onChange={(v: string) => setMustFilter(v ? [v] : [])}
              />
              <Select
                mode="multiple"
                allowClear
                placeholder="Pick some emoji to allow"
                defaultValue={[]}
                options={emojiFilterItems}
                style={{ 
                  width: "calc(50% - 8px)",
                  fontSize: '14px'
                }}
                onChange={setShouldFilter}
              />
            </div>
            {loading && (
              <div style={{ 
                position: "absolute", 
                right: "16px", 
                top: "16px",
                backgroundColor: 'var(--bg-primary)',
                padding: '4px 12px',
                borderRadius: '16px',
                fontSize: '14px',
                color: 'var(--text-secondary)'
              }}>
                Loading...
              </div>
            )}
          </div>
        </>
      )}
      <div style={{ 
        borderRadius: '12px', 
        overflow: 'hidden',
        boxShadow: '0 4px 12px var(--shadow-color-strong)'
      }}>
        <MapContainer
          center={manhattan as LatLngExpression}
          id="mapId"
          zoom={15}
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
            isNearestMode={isNearestMode}
            nearestPoint={nearestPoint}
            setNearestPoint={setNearestPoint}
            maxResults={maxResults}
            showDebugCells={showDebugCells}
          />
        </MapContainer>
      </div>
    </div>
  );
}

export default App;
