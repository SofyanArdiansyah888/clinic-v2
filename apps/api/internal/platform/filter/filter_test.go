package filter

import (
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func ctxWith(query string) *gin.Context {
	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest("GET", "/?"+query, nil)
	return c
}

func TestDateRangeFromContext(t *testing.T) {
	cases := []struct {
		query   string
		want    DateRange
		wantErr bool
	}{
		{"", DateRange{}, false},
		{"dari=2026-11-01", DateRange{Dari: "2026-11-01"}, false},
		{"sampai=2026-11-30", DateRange{Sampai: "2026-11-30"}, false},
		{"dari=2026-11-01&sampai=2026-11-30", DateRange{Dari: "2026-11-01", Sampai: "2026-11-30"}, false},
		{"dari=2026-11-30&sampai=2026-11-30", DateRange{Dari: "2026-11-30", Sampai: "2026-11-30"}, false},
		{"dari=2026-11-30&sampai=2026-11-01", DateRange{}, true},
		{"dari=01-11-2026", DateRange{}, true},
		{"sampai=2026-13-01", DateRange{}, true},
	}
	for _, tc := range cases {
		got, err := DateRangeFromContext(ctxWith(tc.query))
		if (err != nil) != tc.wantErr {
			t.Errorf("%q: err = %v, wantErr %v", tc.query, err, tc.wantErr)
			continue
		}
		if got != tc.want {
			t.Errorf("%q: got %+v, want %+v", tc.query, got, tc.want)
		}
	}
}

func TestUintQuery(t *testing.T) {
	cases := map[string]uint{"": 0, "id=7": 7, "id=abc": 0, "id=-3": 0, "id=0": 0}
	for q, want := range cases {
		if got := UintQuery(ctxWith(q), "id"); got != want {
			t.Errorf("%q: got %d, want %d", q, got, want)
		}
	}
}
