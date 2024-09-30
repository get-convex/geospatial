package main

import (
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

const COVER_RECTANGLE_BUFFER_SIZE int = 64

var coverRectangleBuffer [COVER_RECTANGLE_BUFFER_SIZE]uint64

//export coverRectangleBufferPtr
func coverRectangleBufferPtr() *[COVER_RECTANGLE_BUFFER_SIZE]uint64 {
	return &coverRectangleBuffer
}

//export coverRectangle
func coverRectangle(latDeg1 float64, lngDeg1 float64, latDeg2 float64, lngDeg2 float64) int {
	rect := s2.RectFromLatLng(s2.LatLngFromDegrees(latDeg1, lngDeg1))
	rect = rect.AddPoint(s2.LatLngFromDegrees(latDeg2, lngDeg2))
	rc := s2.RegionCoverer{
		MaxLevel: 30,
		MaxCells: 64,
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

// main is required for the `wasip1` target, even if it isn't used.
func main() {
}
