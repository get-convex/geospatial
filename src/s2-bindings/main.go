package main

import (
	"fmt"

	"github.com/golang/geo/s1"
	"github.com/golang/geo/s2"
)

// Point to S2 cells
// Rectangle to covering cells

//export cellIDFromLatLng
func cellIDFromLatLng(latDeg float64, lngDeg float64) uint64 {
	leaf := s2.CellIDFromLatLng(s2.LatLngFromDegrees(latDeg, lngDeg))
	return uint64(leaf)
}

//export cellIDParent
func cellIDParent(cellID uint64, level int) uint64 {
	return uint64(s2.CellID(cellID).Parent(level))
}

const TOKEN_BUFFER_SIZE int = 16

var tokenBuffer [TOKEN_BUFFER_SIZE]uint8

//export tokenBufferPtr
func tokenBufferPtr() *[TOKEN_BUFFER_SIZE]uint8 {
	return &tokenBuffer
}

//export cellIDToken
func cellIDToken(cellID uint64) int {
	token := s2.CellID(cellID).ToToken()
	if len(token) > TOKEN_BUFFER_SIZE {
		return -1
	}
	copy(tokenBuffer[:], token)
	return len(token)
}

//export cellIDLevel
func cellIDLevel(cellID uint64) int {
	return s2.CellID(cellID).Level()
}

const COVER_RECTANGLE_BUFFER_SIZE int = 1536

var coverRectangleBuffer [COVER_RECTANGLE_BUFFER_SIZE]uint64

//export coverRectangleBufferPtr
func coverRectangleBufferPtr() *[COVER_RECTANGLE_BUFFER_SIZE]uint64 {
	return &coverRectangleBuffer
}

//export coverRectangle
func coverRectangle(latDeg1 float64, lngDeg1 float64, latDeg2 float64, lngDeg2 float64, minLevel int, maxLevel int, levelMod int, maxCells int) int {
	rect := s2.RectFromLatLng(s2.LatLngFromDegrees(latDeg1, lngDeg1))
	rect = rect.AddPoint(s2.LatLngFromDegrees(latDeg2, lngDeg2))
	rc := s2.RegionCoverer{
		MinLevel: minLevel,
		MaxLevel: maxLevel,
		MaxCells: maxCells,
		LevelMod: levelMod,
	}
	covering := rc.Covering(s2.Region(rect))
	if len(covering) > COVER_RECTANGLE_BUFFER_SIZE {
		return -1
	}
	for i, cellID := range covering {
		coverRectangleBuffer[i] = uint64(cellID)
	}
	return len(covering)
}

//export rectangleContains
func rectangleContains(latDeg1 float64, lngDeg1 float64, latDeg2 float64, lngDeg2 float64, pLat float64, pLng float64) bool {
	rect := s2.RectFromLatLng(s2.LatLngFromDegrees(latDeg1, lngDeg1))
	rect = rect.AddPoint(s2.LatLngFromDegrees(latDeg2, lngDeg2))
	point := s2.LatLngFromDegrees(pLat, pLng)
	return rect.ContainsPoint(s2.PointFromLatLng(point))
}

// Polygon support: buffer holds interleaved lat/lng pairs (max 1000 vertices)
const POLYGON_BUFFER_SIZE int = 2000

var polygonBuffer [POLYGON_BUFFER_SIZE]float64

//export polygonBufferPtr
func polygonBufferPtr() *[POLYGON_BUFFER_SIZE]float64 {
	return &polygonBuffer
}

// buildPolygonFromBuffer creates a normalized polygon from the buffer.
// numPoints is the number of vertices (buffer contains numPoints*2 floats).
// Returns nil if numPoints is invalid (< 3 or would exceed buffer size).
func buildPolygonFromBuffer(numPoints int) *s2.Polygon {
	if numPoints < 3 || numPoints*2 > POLYGON_BUFFER_SIZE {
		return nil
	}
	points := make([]s2.Point, numPoints)
	for i := 0; i < numPoints; i++ {
		lat := polygonBuffer[i*2]
		lng := polygonBuffer[i*2+1]
		points[i] = s2.PointFromLatLng(s2.LatLngFromDegrees(lat, lng))
	}
	loop := s2.LoopFromPoints(points)
	loop.Normalize() // Ensure CCW orientation (interior on left side of edges)
	return s2.PolygonFromLoops([]*s2.Loop{loop})
}

//export coverPolygon
func coverPolygon(numPoints int, minLevel int, maxLevel int, levelMod int, maxCells int) int {
	polygon := buildPolygonFromBuffer(numPoints)
	if polygon == nil {
		return -1 // Invalid polygon (too few points or buffer overflow)
	}

	rc := s2.RegionCoverer{
		MinLevel: minLevel,
		MaxLevel: maxLevel,
		MaxCells: maxCells,
		LevelMod: levelMod,
	}
	covering := rc.Covering(polygon)

	if len(covering) > COVER_RECTANGLE_BUFFER_SIZE {
		return -1
	}
	for i, cellID := range covering {
		coverRectangleBuffer[i] = uint64(cellID)
	}
	return len(covering)
}

//export polygonContainsPoint
func polygonContainsPoint(numPoints int, pLat float64, pLng float64) bool {
	polygon := buildPolygonFromBuffer(numPoints)
	if polygon == nil {
		return false
	}

	testPoint := s2.PointFromLatLng(s2.LatLngFromDegrees(pLat, pLng))
	return polygon.ContainsPoint(testPoint)
}

//export cellVertexLatDegrees
func cellVertexLatDegrees(cellID uint64, k int) float64 {
	cell := s2.CellFromCellID((s2.CellID(cellID)))
	point := cell.Vertex(k)
	return s2.LatLngFromPoint(point).Lat.Degrees()
}

//export cellVertexLngDegrees
func cellVertexLngDegrees(cellID uint64, k int) float64 {
	cell := s2.CellFromCellID((s2.CellID(cellID)))
	point := cell.Vertex(k)
	return s2.LatLngFromPoint(point).Lng.Degrees()
}

// The mean radius of the Earth in meters.
const EARTH_RADIUS_METERS float64 = 6371010.0

//export metersToChordAngle
func metersToChordAngle(meters float64) float64 {
	angle := s1.Angle(meters / EARTH_RADIUS_METERS)
	chordAngle := s1.ChordAngleFromAngle(angle)
	return float64(chordAngle)
}

//export chordAngleToMeters
func chordAngleToMeters(chordAngle float64) float64 {
	angle := s1.ChordAngle(chordAngle).Angle()
	meters := angle.Radians() * EARTH_RADIUS_METERS
	return meters
}

//export pointDistance
func pointDistance(latDeg1 float64, lngDeg1 float64, latDeg2 float64, lngDeg2 float64) float64 {
	point1 := s2.PointFromLatLng(s2.LatLngFromDegrees(latDeg1, lngDeg1))
	point2 := s2.PointFromLatLng(s2.LatLngFromDegrees(latDeg2, lngDeg2))
	angle := point1.Distance(point2)
	chordAngle := s1.ChordAngleFromAngle(angle)
	return float64(chordAngle)
}

const CELLS_BUFFER_SIZE int = 4096

var cellsBuffer [CELLS_BUFFER_SIZE]uint64

//export cellsBufferPtr
func cellsBufferPtr() *[CELLS_BUFFER_SIZE]uint64 {
	return &cellsBuffer
}

//export initialCells
func initialCells(minLevel int) int {
	count := 0
	for face := 0; face < 6; face++ {
		root := s2.CellIDFromFace(face)
		if minLevel == 0 {
			if count >= CELLS_BUFFER_SIZE {
				return -1
			}
			cellsBuffer[count] = uint64(root)
			count++
			continue
		}
		// Get all cells at minLevel that intersect with the search area
		for cellID := root.ChildBeginAtLevel(minLevel); cellID != root.ChildEndAtLevel(minLevel); cellID = cellID.Next() {
			if count >= CELLS_BUFFER_SIZE {
				return -1
			}
			cellsBuffer[count] = uint64(cellID)
			count++
		}
	}
	return count
}

//export minDistanceToCell
func minDistanceToCell(latDeg float64, lngDeg float64, cellID uint64) float64 {
	point := s2.PointFromLatLng(s2.LatLngFromDegrees(latDeg, lngDeg))
	cell := s2.CellFromCellID((s2.CellID(cellID)))
	distance := cell.Distance(point)
	return float64(distance)
}

//export cellIDChildren
func cellIDChildren(cellIDInt uint64, level int) int {
	cellID := s2.CellID(cellIDInt)
	count := 0
	for childCellID := cellID.ChildBeginAtLevel(level); childCellID != cellID.ChildEndAtLevel(level); childCellID = childCellID.Next() {
		if count >= CELLS_BUFFER_SIZE {
			fmt.Printf("cellIDChildren: buffer overflow for cellID %d at level %d, count %d\n", cellIDInt, level, count)
			return -1
		}
		cellsBuffer[count] = uint64(childCellID)
		count++
	}
	return count
}

// Polyline support: buffer holds interleaved lat/lng pairs (max 1000 vertices)
const POLYLINE_BUFFER_SIZE int = 2000

var polylineBuffer [POLYLINE_BUFFER_SIZE]float64

//export polylineBufferPtr
func polylineBufferPtr() *[POLYLINE_BUFFER_SIZE]float64 {
	return &polylineBuffer
}

// buildPolylineFromBuffer creates a polyline from the buffer.
// numPoints is the number of vertices (buffer contains numPoints*2 floats).
func buildPolylineFromBuffer(numPoints int) *s2.Polyline {
	points := make([]s2.LatLng, numPoints)
	for i := 0; i < numPoints; i++ {
		lat := polylineBuffer[i*2]
		lng := polylineBuffer[i*2+1]
		points[i] = s2.LatLngFromDegrees(lat, lng)
	}
	polyline := s2.PolylineFromLatLngs(points)
	return polyline
}

//export coverPolylineBuffered
func coverPolylineBuffered(numPoints int, bufferMeters float64, minLevel, maxLevel, levelMod, maxCells, maxLevelDiff int) int {
	if numPoints < 2 {
		return -1 // Need at least 2 points for a polyline
	}
	if numPoints*2 > POLYLINE_BUFFER_SIZE {
		return -1 // Too many points
	}
	if bufferMeters < 0 {
		return -1 // Buffer must be non-negative
	}

	polyline := buildPolylineFromBuffer(numPoints)

	// Get initial covering of the polyline
	rc := s2.RegionCoverer{
		MinLevel: minLevel,
		MaxLevel: maxLevel,
		MaxCells: maxCells,
		LevelMod: levelMod,
	}
	covering := rc.CellUnion(polyline)

	// Expand the covering by the buffer radius
	// Convert meters to s1.Angle (radians)
	minRadius := s1.Angle(bufferMeters / EARTH_RADIUS_METERS)
	// ExpandByRadius modifies in place
	covering.ExpandByRadius(minRadius, maxLevelDiff)

	if len(covering) > COVER_RECTANGLE_BUFFER_SIZE {
		return -1
	}
	for i, cellID := range covering {
		coverRectangleBuffer[i] = uint64(cellID)
	}
	return len(covering)
}

//export distanceToPolyline
func distanceToPolyline(numPoints int, pLat, pLng float64) float64 {
	if numPoints < 2 || numPoints*2 > POLYLINE_BUFFER_SIZE {
		return -1 // Invalid polyline
	}

	polyline := buildPolylineFromBuffer(numPoints)

	// Create a ShapeIndex and add the polyline
	index := s2.NewShapeIndex()
	index.Add(polyline)

	// Create closest edge query
	query := s2.NewClosestEdgeQuery(index, s2.NewClosestEdgeQueryOptions())

	// Find the closest edge to the target point
	target := s2.NewMinDistanceToPointTarget(s2.PointFromLatLng(s2.LatLngFromDegrees(pLat, pLng)))
	result := query.FindEdges(target)

	if len(result) == 0 {
		return -1 // No edges found (shouldn't happen with valid polyline)
	}

	// Return the distance as a chord angle
	return float64(result[0].Distance())
}

const (
	MIN_CELL_LEVEL = 4
	MAX_CELL_LEVEL = 16
)

var polygonBuffer2 [POLYGON_BUFFER_SIZE]float64

//export polygonBuffer2Ptr
func polygonBuffer2Ptr() *[POLYGON_BUFFER_SIZE]float64 {
	return &polygonBuffer2
}

// buildPolygonFromBuffer2 creates a normalized polygon from the second buffer.
func buildPolygonFromBuffer2(numPoints int) *s2.Polygon {
	if numPoints < 3 || numPoints*2 > POLYGON_BUFFER_SIZE {
		return nil
	}

	points := make([]s2.Point, numPoints)
	for i := 0; i < numPoints; i++ {
		lat := polygonBuffer2[i*2]
		lng := polygonBuffer2[i*2+1]
		points[i] = s2.PointFromLatLng(s2.LatLngFromDegrees(lat, lng))
	}

	loop := s2.LoopFromPoints(points)
	loop.Normalize()
	return s2.PolygonFromLoops([]*s2.Loop{loop})
}

//export polygonIntersectsPolygon
func polygonIntersectsPolygon(numPoints1 int, numPoints2 int) bool {
	polygon1 := buildPolygonFromBuffer(numPoints1)
	polygon2 := buildPolygonFromBuffer2(numPoints2)

	if polygon1 == nil || polygon2 == nil {
		return false
	}

	// S2's Intersects() includes internal bounding box optimization
	return polygon1.Intersects(polygon2)
}

//export polygonContainsPolygon
func polygonContainsPolygon(numPoints1 int, numPoints2 int) bool {
	polygon1 := buildPolygonFromBuffer(numPoints1)
	polygon2 := buildPolygonFromBuffer2(numPoints2)

	if polygon1 == nil || polygon2 == nil {
		return false
	}

	return polygon1.Contains(polygon2)
}

//export polylineIntersectsPolygon
func polylineIntersectsPolygon(numPolylinePoints int, numPolygonPoints int) bool {
	// Build polyline from polyline buffer
	if numPolylinePoints < 2 || numPolylinePoints*2 > POLYLINE_BUFFER_SIZE {
		return false
	}

	polylinePoints := make([]s2.Point, numPolylinePoints)
	for i := 0; i < numPolylinePoints; i++ {
		lat := polylineBuffer[i*2]
		lng := polylineBuffer[i*2+1]
		polylinePoints[i] = s2.PointFromLatLng(s2.LatLngFromDegrees(lat, lng))
	}

	// Build polygon from polygon buffer
	polygon := buildPolygonFromBuffer(numPolygonPoints)
	if polygon == nil {
		return false
	}

	// Check if any polyline vertex is inside polygon
	for _, pt := range polylinePoints {
		if polygon.ContainsPoint(pt) {
			return true
		}
	}

	// Check if any polyline edge crosses any polygon edge
	for i := 0; i < len(polylinePoints)-1; i++ {
		a := polylinePoints[i]
		b := polylinePoints[i+1]

		// Check against each polygon edge
		for li := 0; li < polygon.NumLoops(); li++ {
			loop := polygon.Loop(li)
			crosser := s2.NewEdgeCrosser(a, b)
			for j := 0; j < loop.NumVertices(); j++ {
				c := loop.Vertex(j)
				d := loop.Vertex((j + 1) % loop.NumVertices())
				if crosser.CrossingSign(c, d) != s2.DoNotCross {
					return true
				}
			}
		}
	}

	// Check if polyline lies exactly on polygon boundary (edge case)
	// Use ClosestEdgeQuery to detect zero-distance overlap
	index := s2.NewShapeIndex()
	index.Add(polygon)
	query := s2.NewClosestEdgeQuery(index, s2.NewClosestEdgeQueryOptions())
	for _, pt := range polylinePoints {
		target := s2.NewMinDistanceToPointTarget(pt)
		result := query.FindEdges(target)
		if len(result) > 0 && result[0].Distance() < 1e-15 {
			return true
		}
	}

	return false
}

//export distanceToPolygonEdge
func distanceToPolygonEdge(numPoints int, pLat, pLng float64) float64 {
	polygon := buildPolygonFromBuffer(numPoints)
	if polygon == nil {
		return -1
	}

	// Create shape index for efficient edge queries
	index := s2.NewShapeIndex()
	index.Add(polygon)

	query := s2.NewClosestEdgeQuery(index, s2.NewClosestEdgeQueryOptions())
	target := s2.NewMinDistanceToPointTarget(
		s2.PointFromLatLng(s2.LatLngFromDegrees(pLat, pLng)),
	)

	result := query.FindEdges(target)
	if len(result) == 0 {
		return -1
	}

	// Return as ChordAngle (caller converts to meters)
	return float64(result[0].Distance())
}

// Result buffer for covering cells (standard inverted index)
// 200 cells × 8 bytes = 1.6KB - sufficient for most geometries
const COVERING_BUFFER_SIZE = 200

var coveringBuffer [COVERING_BUFFER_SIZE]uint64

//export coveringBufferPtr
func coveringBufferPtr() *[COVERING_BUFFER_SIZE]uint64 {
	return &coveringBuffer
}

// coverRegion generates a standard S2 covering for indexing.
// Returns cells at their natural levels (no ancestor projection).
func coverRegion(region s2.Region, maxCells int) []s2.CellID {
	rc := s2.RegionCoverer{
		MinLevel: MIN_CELL_LEVEL,
		MaxLevel: MAX_CELL_LEVEL,
		MaxCells: maxCells,
	}
	return rc.Covering(region)
}

//export coverPolygonForIndex
func coverPolygonForIndex(numPoints int, maxCells int) int {
	polygon := buildPolygonFromBuffer(numPoints)
	if polygon == nil {
		return -1
	}

	cells := coverRegion(polygon, maxCells)

	if len(cells) > COVERING_BUFFER_SIZE {
		return -1 // Buffer overflow
	}

	for i, cellID := range cells {
		coveringBuffer[i] = uint64(cellID)
	}

	return len(cells)
}

//export coverPolylineForIndex
func coverPolylineForIndex(numPoints int, maxCells int) int {
	if numPoints < 2 || numPoints*2 > POLYLINE_BUFFER_SIZE {
		return -1
	}

	polyline := buildPolylineFromBuffer(numPoints)
	if polyline == nil {
		return -1
	}

	cells := coverRegion(polyline, maxCells)

	if len(cells) > COVERING_BUFFER_SIZE {
		return -1
	}

	for i, cellID := range cells {
		coveringBuffer[i] = uint64(cellID)
	}

	return len(cells)
}

// Buffer for point ancestor cells (one per level from MIN to MAX)
const POINT_ANCESTORS_SIZE = MAX_CELL_LEVEL - MIN_CELL_LEVEL + 1 // 13 levels

var pointAncestorsBuffer [POINT_ANCESTORS_SIZE]uint64

//export pointAncestorsBufferPtr
func pointAncestorsBufferPtr() *[POINT_ANCESTORS_SIZE]uint64 {
	return &pointAncestorsBuffer
}

// pointCellsAllLevels returns a point's cell ID at every level from MIN to MAX.
// This is used for containsPoint queries - query-side ancestor traversal.
// Returns 13 cells (levels 4 through 16).
//
//export pointCellsAllLevels
func pointCellsAllLevels(lat, lng float64) int {
	leafCell := s2.CellIDFromLatLng(s2.LatLngFromDegrees(lat, lng))

	for i := 0; i < POINT_ANCESTORS_SIZE; i++ {
		level := MIN_CELL_LEVEL + i
		pointAncestorsBuffer[i] = uint64(leafCell.Parent(level))
	}

	return POINT_ANCESTORS_SIZE
}

// cellAncestors returns all ancestors of a cell from its level up to MIN_CELL_LEVEL.
// Used for intersects queries to find larger geometries.
// Returns ancestors in coveringBuffer, returns count.
//
//export cellAncestors
func cellAncestors(cellID uint64) int {
	cell := s2.CellID(cellID)
	cellLevel := cell.Level()

	// No ancestors if cell is at or below MIN_CELL_LEVEL
	if cellLevel <= MIN_CELL_LEVEL {
		return 0
	}

	count := 0
	// Start at cellLevel - 1 to exclude the cell itself (only return true ancestors)
	for level := cellLevel - 1; level >= MIN_CELL_LEVEL; level-- {
		if count >= COVERING_BUFFER_SIZE {
			break
		}
		coveringBuffer[count] = uint64(cell.Parent(level))
		count++
	}

	return count
}

var centroidBuffer [2]float64

//export centroidBufferPtr
func centroidBufferPtr() *[2]float64 {
	return &centroidBuffer
}

//export polygonArea
func polygonArea(numPoints int) float64 {
	polygon := buildPolygonFromBuffer(numPoints)
	if polygon == nil {
		return -1
	}
	areaSteradians := polygon.Area()
	return areaSteradians * EARTH_RADIUS_METERS * EARTH_RADIUS_METERS
}

//export polylineLength
func polylineLength(numPoints int) float64 {
	if numPoints < 2 || numPoints*2 > POLYLINE_BUFFER_SIZE {
		return -1
	}
	polyline := buildPolylineFromBuffer(numPoints)
	if polyline == nil {
		return -1
	}
	lengthAngle := polyline.Length()
	return lengthAngle.Radians() * EARTH_RADIUS_METERS
}

//export polygonPerimeter
func polygonPerimeter(numPoints int) float64 {
	polygon := buildPolygonFromBuffer(numPoints)
	if polygon == nil || polygon.NumLoops() == 0 {
		return -1
	}
	loop := polygon.Loop(0)
	var perimeter s1.Angle
	for i := 0; i < loop.NumVertices(); i++ {
		a := loop.Vertex(i)
		b := loop.Vertex((i + 1) % loop.NumVertices())
		perimeter += a.Distance(b)
	}
	return perimeter.Radians() * EARTH_RADIUS_METERS
}

//export polygonCentroid
func polygonCentroid(numPoints int) bool {
	polygon := buildPolygonFromBuffer(numPoints)
	if polygon == nil {
		return false
	}
	centroid := polygon.Centroid()
	if centroid == (s2.Point{}) {
		return false
	}
	normalized := s2.Point{Vector: centroid.Normalize()}
	latLng := s2.LatLngFromPoint(normalized)
	centroidBuffer[0] = latLng.Lat.Degrees()
	centroidBuffer[1] = latLng.Lng.Degrees()
	return true
}

//export polylineCentroid
func polylineCentroid(numPoints int) bool {
	if numPoints < 2 || numPoints*2 > POLYLINE_BUFFER_SIZE {
		return false
	}
	polyline := buildPolylineFromBuffer(numPoints)
	if polyline == nil {
		return false
	}
	centroid := polyline.Centroid()
	if centroid == (s2.Point{}) {
		return false
	}
	normalized := s2.Point{Vector: centroid.Normalize()}
	latLng := s2.LatLngFromPoint(normalized)
	centroidBuffer[0] = latLng.Lat.Degrees()
	centroidBuffer[1] = latLng.Lng.Degrees()
	return true
}

// main is required for the `wasip1` target, even if it isn't used.
func main() {
}
