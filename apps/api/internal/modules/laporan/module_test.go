package laporan

import (
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestParsePeriode(t *testing.T) {
	gin.SetMode(gin.TestMode)
	cases := []struct {
		query   string
		wantErr bool
	}{
		{"", false},
		{"dari=2026-11-01&sampai=2026-11-30", false},
		{"dari=2026-11-30&sampai=2026-11-01", true},
		{"dari=2025-01-01&sampai=2026-11-01", true},
		{"dari=01-11-2026&sampai=2026-11-01", true},
	}
	for _, c := range cases {
		ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
		ctx.Request = httptest.NewRequest("GET", "/?"+c.query, nil)
		_, err := parsePeriode(ctx)
		if (err != nil) != c.wantErr {
			t.Errorf("%q: err = %v, wantErr %v", c.query, err, c.wantErr)
		}
	}
}
