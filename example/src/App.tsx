import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import { api } from "../convex/_generated/api";
import buffer from "@turf/buffer";
import { lineString } from "@turf/helpers";

import "leaflet/dist/leaflet.css";
import {
  MapContainer,
  Marker,
  Polygon as LeafletPolygon,
  Polyline,
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
import type { Point, Polygon } from "@convex-dev/geospatial";
import { Select } from "antd";
import { FOOD_EMOJIS } from "../convex/constants.js";
import { useGeoQuery } from "./useGeoQuery.js";
import { useNearestQuery } from "./useNearestQuery.js";
import { usePolygonQuery } from "./usePolygonQuery.js";
import { usePolylineQuery } from "./usePolylineQuery.js";
import {
  useGeometriesQuery,
  useContainsPointQuery,
  usePolygonMeasurements,
} from "./useGeometriesQuery.js";
import { FunctionReturnType } from "convex/server";

type SearchMode = "viewport" | "nearest" | "polygon" | "polyline" | "geometries";

type Rows = FunctionReturnType<typeof api.example.search>["rows"];

// Expected filterKeys shape for state polygons
interface StateFilterKeys {
  name?: string;
  type?: string;
}

const manhattan = [40.746, -73.985];

function normalizeLongitude(longitude: number) {
  return ((((longitude + 180) % 360) + 360) % 360) - 180;
}

function formatArea(squareMeters: number): string {
  const squareKm = squareMeters / 1_000_000;
  if (squareKm >= 1000) {
    return `${squareKm.toLocaleString(undefined, { maximumFractionDigits: 0 })} km²`;
  }
  if (squareKm >= 1) {
    return `${squareKm.toFixed(1)} km²`;
  }
  if (squareMeters >= 10_000) {
    return `${(squareMeters / 10_000).toFixed(1)} hectares`;
  }
  return `${squareMeters.toFixed(0)} m²`;
}

function formatDistance(meters: number): string {
  if (meters >= 1_000) {
    return `${(meters / 1_000).toFixed(1)} km`;
  }
  return `${meters.toFixed(0)} m`;
}

function LocationSearch(props: {
  loading: boolean;
  setLoading: (loading: boolean) => void;
  mustFilter: string[];
  shouldFilter: string[];
  searchMode: SearchMode;
  nearestPoint: Point | null;
  setNearestPoint: (point: Point | null) => void;
  polygonPoints: Point[];
  setPolygonPoints: (points: Point[]) => void;
  polylinePoints: Point[];
  setPolylinePoints: (points: Point[]) => void;
  bufferMeters: number;
  maxResults: number;
  showDebugCells: boolean;
  // Geometry storage mode props
  geometryQueryPoint: Point | null;
  setGeometryQueryPoint: (point: Point | null) => void;
  storedGeometries: Array<{
    key: string;
    type: "polygon" | "polyline";
    coordinates: { exterior: Point[] } | Point[];
    boundingBox: { south: number; north: number; west: number; east: number };
    filterKeys?: Record<string, unknown>;
  }>;
  containsResults: Array<{
    key: string;
    type: "polygon" | "polyline";
    coordinates: { exterior: Point[] } | Point[];
    boundingBox: { south: number; north: number; west: number; east: number };
  }>;
  selectedGeometryKey: string | null;
  setSelectedGeometryKey: (key: string | null) => void;
  selectedCentroid: Point | null;
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
      if (props.searchMode !== "viewport") return;
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
      if (props.searchMode !== "viewport") return;
      e.originalEvent.preventDefault();
      const latLng = map.mouseEventToLatLng(e.originalEvent);
      const name = FOOD_EMOJIS[Math.floor(Math.random() * FOOD_EMOJIS.length)];
      addPoint({
        point: { latitude: latLng.lat, longitude: latLng.lng },
        name,
      }).catch(console.error);
    },
    click: (e) => {
      if (props.searchMode === "nearest") {
        const latLng = map.mouseEventToLatLng(e.originalEvent);
        props.setNearestPoint({ latitude: latLng.lat, longitude: latLng.lng });
      } else if (props.searchMode === "polygon") {
        const latLng = map.mouseEventToLatLng(e.originalEvent);
        props.setPolygonPoints([
          ...props.polygonPoints,
          { latitude: latLng.lat, longitude: latLng.lng },
        ]);
      } else if (props.searchMode === "polyline") {
        const latLng = map.mouseEventToLatLng(e.originalEvent);
        props.setPolylinePoints([
          ...props.polylinePoints,
          { latitude: latLng.lat, longitude: latLng.lng },
        ]);
      } else if (props.searchMode === "geometries") {
        const latLng = map.mouseEventToLatLng(e.originalEvent);
        props.setGeometryQueryPoint({
          latitude: latLng.lat,
          longitude: latLng.lng,
        });
      }
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

  const { rows: viewportRows, loading } = useGeoQuery(
    rectangle,
    props.mustFilter,
    props.shouldFilter,
    96,
  );

  const { rows: nearestRows } = useNearestQuery(
    props.nearestPoint,
    props.maxResults,
  );

  // Build polygon for query (only if we have 3+ points)
  const polygonForQuery: Polygon | null = useMemo(() => {
    if (props.polygonPoints.length >= 3) {
      return { exterior: props.polygonPoints };
    }
    return null;
  }, [props.polygonPoints]);

  const { rows: polygonRows, loading: polygonLoading } = usePolygonQuery(
    polygonForQuery,
    props.mustFilter,
    props.shouldFilter,
    96,
  );

  // Build polyline for query (only if we have 2+ points)
  const polylineForQuery: Point[] | null = useMemo(() => {
    if (props.polylinePoints.length >= 2) {
      return props.polylinePoints;
    }
    return null;
  }, [props.polylinePoints]);

  const { rows: polylineRows, loading: polylineLoading } = usePolylineQuery(
    polylineForQuery,
    props.bufferMeters,
    props.mustFilter,
    props.shouldFilter,
    96,
  );

  // Select rows based on mode (geometries mode doesn't show point rows)
  const rows =
    props.searchMode === "nearest"
      ? nearestRows
      : props.searchMode === "polygon"
        ? polygonRows
        : props.searchMode === "polyline"
          ? polylineRows
          : props.searchMode === "geometries"
            ? [] // Geometries mode shows stored polygons, not point results
            : viewportRows;

  const currentLoading =
    props.searchMode === "polygon"
      ? polygonLoading
      : props.searchMode === "polyline"
        ? polylineLoading
        : loading;

  useEffect(() => {
    if (currentLoading !== props.loading) {
      props.setLoading(currentLoading);
    }
  }, [currentLoading, props.loading, props.setLoading]);

  const cells = useQuery(api.example.debugCells, {
    rectangle,
    maxResolution: 20,
  });

  const stickyCells = useRef<{ token: string; vertices: Point[] }[]>([]);
  if (cells !== undefined) {
    stickyCells.current = cells;
  }

  const stickyRows = useRef<Rows>([]);
  if (rows.length > 0 || currentLoading === false) {
    stickyRows.current = rows;
  }

  const tilingPolygons: { polygon: LatLngExpression[]; cell: string }[] = [];
  for (const { token, vertices } of stickyCells.current) {
    const leafletPolygon = vertices.map((p) => {
      return [p.latitude, p.longitude] as LatLngTuple;
    });
    tilingPolygons.push({ polygon: leafletPolygon, cell: token });
  }

  // Build the user-drawn polygon for display
  const drawnPolygonPositions: LatLngTuple[] = props.polygonPoints.map((p) => [
    p.latitude,
    p.longitude,
  ]);

  // Generate buffer polygon around the polyline using Turf.js
  const polylineBufferPolygon = useMemo((): LatLngTuple[] | null => {
    if (props.polylinePoints.length < 2) return null;
    try {
      // Convert to GeoJSON LineString (note: GeoJSON uses [lng, lat] order)
      const coords = props.polylinePoints.map((p) => [p.longitude, p.latitude] as [number, number]);
      const line = lineString(coords);
      // Create buffer polygon (distance in meters)
      const buffered = buffer(line, props.bufferMeters, { units: "meters" });
      if (!buffered || buffered.geometry.type !== "Polygon") return null;
      // Convert back to Leaflet format [lat, lng]
      return buffered.geometry.coordinates[0].map(
        (coord) => [coord[1], coord[0]] as LatLngTuple
      );
    } catch {
      console.warn("Failed to generate polyline buffer polygon");
      return null;
    }
  }, [props.polylinePoints, props.bufferMeters]);

  return (
    <>
      {props.searchMode === "viewport" &&
        props.showDebugCells &&
        tilingPolygons.map(({ polygon, cell }, i) => (
          <LeafletPolygon
            key={i}
            pathOptions={{ color: "blue", lineCap: "round", lineJoin: "bevel" }}
            positions={polygon}
            eventHandlers={{
              click: (e: L.LeafletMouseEvent) => {
                e.originalEvent.preventDefault();
                console.log(`Clicked on cell ${cell}`, polygon);
              },
            }}
          />
        ))}
      {/* Show the polygon being drawn */}
      {props.searchMode === "polygon" && drawnPolygonPositions.length >= 2 && (
        <Polyline
          positions={drawnPolygonPositions}
          pathOptions={{ color: "green", weight: 3 }}
        />
      )}
      {props.searchMode === "polygon" && drawnPolygonPositions.length >= 3 && (
        <LeafletPolygon
          positions={drawnPolygonPositions}
          pathOptions={{
            color: "green",
            fillColor: "green",
            fillOpacity: 0.2,
            weight: 3,
          }}
        />
      )}
      {/* Show vertex markers for the polygon */}
      {props.searchMode === "polygon" &&
        props.polygonPoints.map((point, i) => (
          <Marker
            key={`polygon-vertex-${i}`}
            position={[point.latitude, point.longitude]}
            icon={
              new Icon({
                iconUrl: `data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><circle cx=%2250%22 cy=%2250%22 r=%2240%22 fill=%22%2322c55e%22 stroke=%22white%22 stroke-width=%228%22/><text x=%2250%22 y=%2258%22 text-anchor=%22middle%22 fill=%22white%22 font-size=%2240%22 font-weight=%22bold%22>${i + 1}</text></svg>`,
                iconSize: [24, 24],
                iconAnchor: [12, 12],
              })
            }
          />
        ))}
      {/* Show buffer zone around polyline */}
      {props.searchMode === "polyline" && polylineBufferPolygon && (
        <LeafletPolygon
          positions={polylineBufferPolygon}
          pathOptions={{
            color: "#f59e0b",
            weight: 2,
            dashArray: "8, 8",
            fill: true,
            fillColor: "#f59e0b",
            fillOpacity: 0.15,
          }}
        />
      )}
      {/* Show the polyline being drawn */}
      {props.searchMode === "polyline" && props.polylinePoints.length >= 2 && (
        <Polyline
          positions={props.polylinePoints.map((p) => [p.latitude, p.longitude] as LatLngTuple)}
          pathOptions={{ color: "#f59e0b", weight: 4 }}
        />
      )}
      {/* Show vertex markers for the polyline */}
      {props.searchMode === "polyline" &&
        props.polylinePoints.map((point, i) => (
          <Marker
            key={`polyline-vertex-${i}`}
            position={[point.latitude, point.longitude]}
            icon={
              new Icon({
                iconUrl: `data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><circle cx=%2250%22 cy=%2250%22 r=%2240%22 fill=%22%23f59e0b%22 stroke=%22white%22 stroke-width=%228%22/><text x=%2250%22 y=%2258%22 text-anchor=%22middle%22 fill=%22white%22 font-size=%2240%22 font-weight=%22bold%22>${i + 1}</text></svg>`,
                iconSize: [24, 24],
                iconAnchor: [12, 12],
              })
            }
          />
        ))}
      {/* Render stored geometries in geometries mode */}
      {props.searchMode === "geometries" &&
        props.storedGeometries.map((geom) => {
          if (geom.type !== "polygon") return null;
          const coords = (geom.coordinates as { exterior: Point[] }).exterior;
          const positions: LatLngTuple[] = coords.map((p) => [
            p.latitude,
            p.longitude,
          ]);
          // Check if this geometry is in the contains results (highlighted)
          const isHighlighted = props.containsResults.some(
            (r) => r.key === geom.key
          );
          const isSelected = props.selectedGeometryKey === geom.key;
          return (
            <LeafletPolygon
              key={geom.key}
              positions={positions}
              pathOptions={{
                color: isSelected ? "#ec4899" : isHighlighted ? "#22c55e" : "#6366f1",
                fillColor: isSelected ? "#ec4899" : isHighlighted ? "#22c55e" : "#6366f1",
                fillOpacity: isSelected ? 0.5 : isHighlighted ? 0.4 : 0.2,
                weight: isSelected ? 4 : isHighlighted ? 3 : 2,
              }}
              eventHandlers={{
                click: (e) => {
                  e.originalEvent.stopPropagation();
                  props.setSelectedGeometryKey(
                    isSelected ? null : geom.key
                  );
                },
              }}
            />
          );
        })}
      {/* Show centroid marker for selected geometry */}
      {props.searchMode === "geometries" && props.selectedCentroid && (
        <Marker
          position={[
            props.selectedCentroid.latitude,
            props.selectedCentroid.longitude,
          ]}
          icon={
            new Icon({
              iconUrl: `data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><circle cx=%2250%22 cy=%2250%22 r=%2235%22 fill=%22%23ec4899%22 stroke=%22white%22 stroke-width=%226%22/><text x=%2250%22 y=%2258%22 text-anchor=%22middle%22 fill=%22white%22 font-size=%2240%22 font-weight=%22bold%22>C</text></svg>`,
              iconSize: [24, 24],
              iconAnchor: [12, 12],
            })
          }
        />
      )}
      {/* Show query point marker in geometries mode */}
      {props.geometryQueryPoint && props.searchMode === "geometries" && (
        <Marker
          position={[
            props.geometryQueryPoint.latitude,
            props.geometryQueryPoint.longitude,
          ]}
          icon={
            new Icon({
              iconUrl: `data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><circle cx=%2250%22 cy=%2250%22 r=%2240%22 fill=%22%23ef4444%22 stroke=%22white%22 stroke-width=%228%22/><circle cx=%2250%22 cy=%2250%22 r=%2215%22 fill=%22white%22/></svg>`,
              iconSize: [28, 28],
              iconAnchor: [14, 14],
            })
          }
        />
      )}
      {stickyRows.current.map((row) => (
        <SearchResult key={row._id} row={row} />
      ))}
      {props.nearestPoint && props.searchMode === "nearest" && (
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
          className: "emoji-marker",
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
  const [searchMode, setSearchMode] = useState<SearchMode>("viewport");
  const [nearestPoint, setNearestPoint] = useState<Point | null>(null);
  const [polygonPoints, setPolygonPoints] = useState<Point[]>([]);
  const [polylinePoints, setPolylinePoints] = useState<Point[]>([]);
  const [bufferMeters, setBufferMeters] = useState(500);
  const [maxResults, setMaxResults] = useState(10);
  const [showDebugCells, setShowDebugCells] = useState(false);

  // Geometries mode state
  const [geometryQueryPoint, setGeometryQueryPoint] = useState<Point | null>(
    null
  );
  const [selectedGeometryKey, setSelectedGeometryKey] = useState<string | null>(
    null
  );
  const { geometries, seedStates, deleteGeometry } = useGeometriesQuery();
  const { results: containsResults } = useContainsPointQuery(geometryQueryPoint);

  // Get selected polygon for measurements
  const selectedGeometry = geometries.find((g) => g.key === selectedGeometryKey);
  const selectedPolygon =
    selectedGeometry?.type === "polygon"
      ? (selectedGeometry.coordinates as { exterior: Point[] })
      : null;
  const { area, perimeter, centroid } = usePolygonMeasurements(selectedPolygon);

  const commonButtonStyle = {
    backgroundColor: "var(--accent-primary)",
    color: "var(--bg-secondary)",
    border: "none",
    padding: "8px 16px",
    borderRadius: "6px",
    cursor: "pointer",
    fontSize: "14px",
    transition: "all 0.2s",
    marginLeft: "10px",
  } as const;

  const commonInputStyle = {
    padding: "8px 12px",
    borderRadius: "6px",
    border: "1px solid var(--border-color)",
    fontSize: "14px",
    width: "120px",
    backgroundColor: "var(--bg-secondary)",
    color: "var(--text-primary)",
  } as const;

  return (
    <div
      style={{
        maxWidth: "1200px",
        margin: "0 auto",
        padding: "20px",
        backgroundColor: "var(--bg-primary)",
        borderRadius: "12px",
        boxShadow: "0 2px 8px var(--shadow-color)",
        width: "100%",
      }}
    >
      <h1
        style={{
          fontSize: "2.5em",
          marginBottom: "24px",
          background:
            "linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-secondary) 100%)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          textAlign: "center",
        }}
      >
        Convex Geospatial Demo
      </h1>
      {/* Mode selector buttons */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          gap: "8px",
          marginBottom: "20px",
        }}
      >
        <button
          onClick={() => {
            setSearchMode("viewport");
            setPolygonPoints([]);
            setPolylinePoints([]);
          }}
          style={{
            ...commonButtonStyle,
            marginLeft: 0,
            backgroundColor:
              searchMode === "viewport"
                ? "var(--accent-primary)"
                : "var(--bg-secondary)",
            color:
              searchMode === "viewport"
                ? "var(--bg-secondary)"
                : "var(--text-primary)",
            border: "1px solid var(--border-color)",
          }}
        >
          Viewport Search
        </button>
        <button
          onClick={() => {
            setSearchMode("nearest");
            setPolygonPoints([]);
            setPolylinePoints([]);
          }}
          style={{
            ...commonButtonStyle,
            marginLeft: 0,
            backgroundColor:
              searchMode === "nearest"
                ? "var(--accent-primary)"
                : "var(--bg-secondary)",
            color:
              searchMode === "nearest"
                ? "var(--bg-secondary)"
                : "var(--text-primary)",
            border: "1px solid var(--border-color)",
          }}
        >
          Nearest Points
        </button>
        <button
          onClick={() => {
            setSearchMode("polygon");
            setNearestPoint(null);
            setPolylinePoints([]);
          }}
          style={{
            ...commonButtonStyle,
            marginLeft: 0,
            backgroundColor:
              searchMode === "polygon" ? "var(--success-primary)" : "var(--bg-secondary)",
            color: searchMode === "polygon" ? "white" : "var(--text-primary)",
            border: "1px solid var(--border-color)",
          }}
        >
          Polygon Search
        </button>
        <button
          onClick={() => {
            setSearchMode("polyline");
            setNearestPoint(null);
            setPolygonPoints([]);
          }}
          style={{
            ...commonButtonStyle,
            marginLeft: 0,
            backgroundColor:
              searchMode === "polyline" ? "var(--polyline-primary)" : "var(--bg-secondary)",
            color: searchMode === "polyline" ? "white" : "var(--text-primary)",
            border: "1px solid var(--border-color)",
          }}
        >
          Route Search
        </button>
        <button
          onClick={() => {
            setSearchMode("geometries");
            setNearestPoint(null);
            setPolygonPoints([]);
            setPolylinePoints([]);
            setGeometryQueryPoint(null);
          }}
          style={{
            ...commonButtonStyle,
            marginLeft: 0,
            backgroundColor:
              searchMode === "geometries"
                ? "#6366f1"
                : "var(--bg-secondary)",
            color:
              searchMode === "geometries" ? "white" : "var(--text-primary)",
            border: "1px solid var(--border-color)",
          }}
        >
          Geometries
        </button>
      </div>

      {/* Mode-specific controls */}
      {searchMode === "nearest" && (
        <div
          style={{
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
            boxShadow: "0 1px 4px var(--shadow-color)",
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: "14px",
              color: "var(--text-primary)",
            }}
          >
            Click on the map to find nearest emojis
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <label style={{ fontSize: "14px", color: "var(--text-primary)" }}>
              Max results:
            </label>
            <input
              type="number"
              value={maxResults}
              onChange={(e) =>
                setMaxResults(Math.max(1, parseInt(e.target.value) || 1))
              }
              style={commonInputStyle}
            />
          </div>
          {nearestPoint && (
            <div
              style={{
                fontSize: "14px",
                backgroundColor: "var(--accent-light)",
                padding: "8px 16px",
                borderRadius: "6px",
                border: "1px solid var(--accent-border)",
                color: "var(--text-primary)",
              }}
            >
              Selected: ({nearestPoint.latitude.toFixed(4)},{" "}
              {nearestPoint.longitude.toFixed(4)})
            </div>
          )}
        </div>
      )}

      {searchMode === "polygon" && (
        <div
          style={{
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
            boxShadow: "0 1px 4px var(--shadow-color)",
            border: "2px solid var(--success-primary)",
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: "14px",
              color: "var(--text-primary)",
            }}
          >
            Click on the map to draw polygon vertices ({polygonPoints.length}{" "}
            points)
          </p>
          {polygonPoints.length >= 3 && (
            <div
              style={{
                fontSize: "14px",
                backgroundColor: "var(--success-light)",
                padding: "8px 16px",
                borderRadius: "6px",
                border: "1px solid var(--success-primary)",
                color: "var(--success-text)",
              }}
            >
              Searching inside polygon...
            </div>
          )}
          <button
            onClick={() => setPolygonPoints([])}
            style={{
              ...commonButtonStyle,
              backgroundColor: "var(--danger-primary)",
              marginLeft: 0,
            }}
          >
            ✕ Clear Polygon
          </button>
          {polygonPoints.length > 0 && (
            <button
              onClick={() => setPolygonPoints(polygonPoints.slice(0, -1))}
              style={{
                ...commonButtonStyle,
                backgroundColor: "var(--warning-primary)",
                marginLeft: 0,
              }}
            >
              ↩ Undo Point
            </button>
          )}
        </div>
      )}

      {searchMode === "polyline" && (
        <div
          style={{
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
            boxShadow: "0 1px 4px var(--shadow-color)",
            border: "2px solid var(--polyline-primary)",
            flexWrap: "wrap",
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: "14px",
              color: "var(--text-primary)",
            }}
          >
            Click on the map to draw route ({polylinePoints.length} points)
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <label style={{ fontSize: "14px", color: "var(--text-primary)" }}>
              Buffer (m):
            </label>
            <input
              type="number"
              value={bufferMeters}
              onChange={(e) =>
                setBufferMeters(Math.max(1, parseInt(e.target.value) || 1))
              }
              style={{
                ...commonInputStyle,
                width: "80px",
              }}
            />
          </div>
          {polylinePoints.length >= 2 && (
            <div
              style={{
                fontSize: "14px",
                backgroundColor: "var(--polyline-light)",
                padding: "8px 16px",
                borderRadius: "6px",
                border: "1px solid var(--polyline-primary)",
                color: "var(--polyline-text)",
              }}
            >
              Searching within {bufferMeters}m of route...
            </div>
          )}
          <button
            onClick={() => setPolylinePoints([])}
            style={{
              ...commonButtonStyle,
              backgroundColor: "var(--danger-primary)",
              marginLeft: 0,
            }}
          >
            ✕ Clear Route
          </button>
          {polylinePoints.length > 0 && (
            <button
              onClick={() => setPolylinePoints(polylinePoints.slice(0, -1))}
              style={{
                ...commonButtonStyle,
                backgroundColor: "var(--warning-primary)",
                marginLeft: 0,
              }}
            >
              ↩ Undo Point
            </button>
          )}
        </div>
      )}

      {searchMode === "geometries" && (
        <div
          style={{
            marginBottom: "20px",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: "16px",
            flexWrap: "wrap",
            position: "relative",
            zIndex: 1000,
            padding: "16px",
            backgroundColor: "var(--bg-secondary)",
            borderRadius: "8px",
            boxShadow: "0 1px 4px var(--shadow-color)",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "8px",
              width: "100%",
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: "14px",
                color: "var(--text-primary)",
              }}
            >
              Click on the map to test which state polygons contain that point
            </p>
            <div
              style={{
                display: "flex",
                gap: "12px",
                alignItems: "center",
                flexWrap: "wrap",
                justifyContent: "center",
              }}
            >
              <button
                onClick={() => seedStates().catch(console.error)}
                style={{
                  ...commonButtonStyle,
                  marginLeft: 0,
                  backgroundColor: "#6366f1",
                }}
              >
                Seed State Polygons
              </button>
              <button
                onClick={() => setGeometryQueryPoint(null)}
                style={{
                  ...commonButtonStyle,
                  marginLeft: 0,
                  backgroundColor: "var(--danger-primary)",
                }}
              >
                Clear Query Point
              </button>
            </div>
          </div>
          {geometries.length > 0 && (
            <div
              style={{
                width: "100%",
                fontSize: "14px",
                color: "var(--text-secondary)",
                textAlign: "center",
              }}
            >
              {geometries.length} stored geometries:{" "}
              {geometries.map((g) => g.filterKeys?.name || g.key).join(", ")}
            </div>
          )}
          {geometryQueryPoint && (
            <div
              style={{
                fontSize: "14px",
                backgroundColor: containsResults.length > 0 ? "#dcfce7" : "#fef3c7",
                padding: "8px 16px",
                borderRadius: "6px",
                border: `1px solid ${containsResults.length > 0 ? "#22c55e" : "#f59e0b"}`,
                color: containsResults.length > 0 ? "#166534" : "#92400e",
              }}
            >
              Point ({geometryQueryPoint.latitude.toFixed(4)},{" "}
              {geometryQueryPoint.longitude.toFixed(4)}) is in:{" "}
              {containsResults.length > 0
                ? containsResults
                    .map((r) => (r.filterKeys as StateFilterKeys | undefined)?.name || r.key)
                    .join(", ")
                : "No polygons"}
            </div>
          )}
          {/* Measurements panel for selected geometry */}
          {selectedGeometryKey && selectedGeometry && (
            <div
              style={{
                width: "100%",
                fontSize: "14px",
                backgroundColor: "#fdf4ff",
                padding: "12px 16px",
                borderRadius: "6px",
                border: "1px solid #ec4899",
                color: "#831843",
              }}
            >
              <div style={{ fontWeight: "bold", marginBottom: "8px" }}>
                📐 Measurements: {(selectedGeometry.filterKeys as StateFilterKeys | undefined)?.name || selectedGeometryKey}
              </div>
              {area !== null && perimeter !== null && centroid && (
                <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
                  <span>
                    Area: <strong>{formatArea(area)}</strong>
                  </span>
                  <span>
                    Perimeter: <strong>{formatDistance(perimeter)}</strong>
                  </span>
                  <span>
                    Centroid: <strong>({centroid.latitude.toFixed(4)}, {centroid.longitude.toFixed(4)})</strong>
                  </span>
                </div>
              )}
              <button
                onClick={() => setSelectedGeometryKey(null)}
                style={{
                  marginTop: "8px",
                  padding: "4px 12px",
                  fontSize: "12px",
                  backgroundColor: "#ec4899",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                }}
              >
                Clear Selection
              </button>
            </div>
          )}
        </div>
      )}

      {searchMode === "viewport" && (
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
          <p
            style={{
              margin: "0 0 16px 0",
              fontSize: "14px",
              color: "var(--text-primary)",
              textAlign: "center",
            }}
          >
            Right click on the map to add emojis. Pan/zoom to search within
            viewport.
          </p>
          <div style={{ marginBottom: "16px" }}>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                fontSize: "14px",
                cursor: "pointer",
                color: "var(--text-primary)",
              }}
            >
              <input
                type="checkbox"
                checked={showDebugCells}
                onChange={(e) => setShowDebugCells(e.target.checked)}
                style={{ cursor: "pointer" }}
              />
              Show S2 index cells
            </label>
          </div>
          <div
            style={{
              display: "flex",
              gap: "16px",
              flexWrap: "wrap",
            }}
          >
            <Select
              allowClear
              placeholder="Pick an emoji to require"
              defaultValue={undefined}
              options={emojiFilterItems}
              style={{
                width: "calc(50% - 8px)",
                fontSize: "14px",
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
                fontSize: "14px",
              }}
              onChange={setShouldFilter}
            />
          </div>
          {loading && (
            <div
              style={{
                position: "absolute",
                right: "16px",
                top: "16px",
                backgroundColor: "var(--bg-primary)",
                padding: "4px 12px",
                borderRadius: "16px",
                fontSize: "14px",
                color: "var(--text-secondary)",
              }}
            >
              Loading...
            </div>
          )}
        </div>
      )}
      <div
        style={{
          borderRadius: "12px",
          overflow: "hidden",
          boxShadow: "0 4px 12px var(--shadow-color-strong)",
        }}
      >
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
            searchMode={searchMode}
            nearestPoint={nearestPoint}
            setNearestPoint={setNearestPoint}
            polygonPoints={polygonPoints}
            setPolygonPoints={setPolygonPoints}
            polylinePoints={polylinePoints}
            setPolylinePoints={setPolylinePoints}
            bufferMeters={bufferMeters}
            maxResults={maxResults}
            showDebugCells={showDebugCells}
            geometryQueryPoint={geometryQueryPoint}
            setGeometryQueryPoint={setGeometryQueryPoint}
            storedGeometries={geometries}
            containsResults={containsResults}
            selectedGeometryKey={selectedGeometryKey}
            setSelectedGeometryKey={setSelectedGeometryKey}
            selectedCentroid={centroid}
          />
        </MapContainer>
      </div>
    </div>
  );
}

export default App;
