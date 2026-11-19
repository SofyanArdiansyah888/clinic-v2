// Package filter parses the list filters shared by several modules (date range, ids).
package filter

import (
	"errors"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

const layout = "2006-01-02"

// DateRange is an inclusive period from the ?dari= and ?sampai= query params; empty ends are open.
type DateRange struct {
	Dari   string
	Sampai string
}

var ErrDateRange = errors.New("periode tidak valid: gunakan format YYYY-MM-DD dan dari <= sampai")

// DateRangeFromContext reads ?dari= and ?sampai=, rejecting malformed dates and reversed ranges.
func DateRangeFromContext(c *gin.Context) (DateRange, error) {
	r := DateRange{Dari: c.Query("dari"), Sampai: c.Query("sampai")}
	var from, to time.Time
	var err error
	if r.Dari != "" {
		if from, err = time.Parse(layout, r.Dari); err != nil {
			return DateRange{}, ErrDateRange
		}
	}
	if r.Sampai != "" {
		if to, err = time.Parse(layout, r.Sampai); err != nil {
			return DateRange{}, ErrDateRange
		}
	}
	if r.Dari != "" && r.Sampai != "" && from.After(to) {
		return DateRange{}, ErrDateRange
	}
	return r, nil
}

// Apply limits q to rows whose column falls inside the range.
func (r DateRange) Apply(q *gorm.DB, column string) *gorm.DB {
	if r.Dari != "" {
		q = q.Where(column+" >= ?", r.Dari)
	}
	if r.Sampai != "" {
		q = q.Where(column+" <= ?", r.Sampai)
	}
	return q
}

// UintQuery reads a positive id query param; anything else is 0 (no filter).
func UintQuery(c *gin.Context, key string) uint {
	v, err := strconv.ParseUint(c.Query(key), 10, 64)
	if err != nil {
		return 0
	}
	return uint(v)
}
