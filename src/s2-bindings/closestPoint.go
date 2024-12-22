package main

import (
	"fmt"

	"github.com/golang/geo/s1"
	"github.com/golang/geo/s2"

	"container/heap"
)

type ClosestPointQuery struct {
	Point       s2.Point
	MaxDistance s1.ChordAngle
	MaxResults  int

	minLevel int
	maxLevel int
	levelMod int

	toProcess toProcessHeap
	results   resultHeap
}

func NewClosestPointQuery(point s2.LatLng, maxDistance s1.ChordAngle, maxResults int, minLevel int, maxLevel int, levelMod int) *ClosestPointQuery {
	r := ClosestPointQuery{
		Point:       s2.PointFromLatLng(point),
		MaxDistance: maxDistance,
		MaxResults:  maxResults,
		minLevel:    minLevel,
		maxLevel:    maxLevel,
		levelMod:    levelMod,
		toProcess:   make(toProcessHeap, 0, 256),
		results:     make(resultHeap, 0, maxResults),
	}
	// Initialize toProcess with all cells at minLevel
	for face := 0; face < 6; face++ {
		root := s2.CellIDFromFace(face)
		if minLevel == 0 {
			r.AddCandidate(root)
			continue
		}
		// Get all cells at minLevel that intersect with the search area
		for cellID := root.ChildBeginAtLevel(minLevel); cellID != root.ChildEndAtLevel(minLevel); cellID = cellID.Next() {
			r.AddCandidate(cellID)
		}
	}
	return &r
}

type StepInput struct {
	CellID    s2.CellID
	Subdivide bool
	Points    []InputPoint
}

type InputPoint struct {
	PointID string
	Point   s2.LatLng
}

type StepOutput struct {
	Done         bool // true if search is complete
	NextCell     *s2.CellID
	CanSubdivide *bool
}

func (q *ClosestPointQuery) Step(input *StepInput) StepOutput {
	if input != nil {
		// Check that the input matches the current candidate and pop it.
		candidate := q.PeekCandidate()
		if candidate == nil || *candidate != input.CellID {
			panic(fmt.Sprintf("Expected candidate %v but got %v", input.CellID, candidate))
		}
		heap.Pop(&q.toProcess)

		// If the layer above told us the cell has too many entries, subdivide it and
		// add the children to the queue.
		if input.Subdivide {
			nextLevel := input.CellID.Level() + q.levelMod
			if nextLevel > q.maxLevel {
				if input.CellID.Level() == q.maxLevel {
					panic(fmt.Sprintf("Already at max level: %d", q.maxLevel))
				}
				nextLevel = q.maxLevel
			}
			for cellID := input.CellID.ChildBeginAtLevel(nextLevel); cellID != input.CellID.ChildEndAtLevel(nextLevel); cellID = cellID.Next() {
				q.AddCandidate(cellID)
			}
		} else {
			// Otherwise, fold in the points into the result set.
			for _, point := range input.Points {
				q.AddResult(point.PointID, point.Point)
			}
		}
	}

	next := q.PeekCandidate()
	if next == nil {
		return StepOutput{Done: true}
	}
	canSubdivide := next.Level() < q.maxLevel
	return StepOutput{
		Done:         false,
		NextCell:     next,
		CanSubdivide: &canSubdivide,
	}
}

func (q *ClosestPointQuery) AddCandidate(cellID s2.CellID) {
	cell := s2.CellFromCellID(cellID)
	distance := s1.ChordAngle(cell.Distance(q.Point))
	if distance > q.MaxDistance {
		return
	}
	worst := q.WorstResult()
	if worst != nil && distance >= worst.distance {
		return
	}
	heap.Push(&q.toProcess, toProcess{cellID, distance})
}

func (q *ClosestPointQuery) PeekCandidate() *s2.CellID {
	worst := q.WorstResult()
	for q.toProcess.Len() > 0 {
		candidate := q.toProcess[0]
		if worst == nil || candidate.distance <= worst.distance {
			return &candidate.cellID
		}
		heap.Pop(&q.toProcess)
	}
	return nil
}

func (q *ClosestPointQuery) AddResult(pointID string, point s2.LatLng) {
	distance := s1.ChordAngle(s2.CellFromCellID(s2.CellIDFromLatLng(point)).Distance(q.Point))
	worst := q.WorstResult()
	if worst != nil && distance >= worst.distance {
		return
	}
	for q.results.Len() >= q.MaxResults {
		heap.Pop(&q.results)
	}
	heap.Push(&q.results, result{pointID, distance})
}

func (q *ClosestPointQuery) WorstResult() *result {
	if len(q.results) < q.MaxResults {
		return nil
	}
	return &q.results[0]
}

func (q *ClosestPointQuery) Results() []result {
	// Copy results into a slice, sorted by distance
	results := make([]result, q.results.Len())
	for i := len(results) - 1; i >= 0; i-- {
		results[i] = heap.Pop(&q.results).(result)
	}
	return results
}

type toProcess struct {
	cellID   s2.CellID
	distance s1.ChordAngle
}

type toProcessHeap []toProcess

// Heap interface implementation.
func (h toProcessHeap) Len() int           { return len(h) }
func (h toProcessHeap) Less(i, j int) bool { return h[i].distance < h[j].distance }
func (h toProcessHeap) Swap(i, j int)      { h[i], h[j] = h[j], h[i] }
func (h *toProcessHeap) Push(x any) {
	*h = append(*h, x.(toProcess))
}
func (h *toProcessHeap) Pop() any {
	old := *h
	n := len(old)
	x := old[n-1]
	*h = old[0 : n-1]
	return x
}

// Max heap of results (note that closer distances are better).
type result struct {
	pointID  string
	distance s1.ChordAngle
}

type resultHeap []result

// Heap interface implementation.
func (h resultHeap) Len() int           { return len(h) }
func (h resultHeap) Less(i, j int) bool { return h[i].distance > h[j].distance }
func (h resultHeap) Swap(i, j int)      { h[i], h[j] = h[j], h[i] }
func (h *resultHeap) Push(x any) {
	*h = append(*h, x.(result))
}
func (h *resultHeap) Pop() any {
	old := *h
	n := len(old)
	x := old[n-1]
	*h = old[0 : n-1]
	return x
}
