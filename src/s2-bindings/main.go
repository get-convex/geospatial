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

// main is required for the `wasip1` target, even if it isn't used.
func main() {
}
