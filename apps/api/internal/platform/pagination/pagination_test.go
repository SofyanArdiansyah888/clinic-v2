package pagination

import (
	"net/http/httptest"
	"net/url"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestFromContextSortBy(t *testing.T) {
	gin.SetMode(gin.TestMode)
	cases := map[string]string{
		"":                                "id",
		"nama":                            "nama",
		"created_at":                      "created_at",
		"id; DROP TABLE pasiens":          "id",
		"(SELECT 1)":                      "id",
		"nama desc, (select pg_sleep(5))": "id",
		"Nama":                            "id",
	}
	for in, want := range cases {
		c, _ := gin.CreateTestContext(httptest.NewRecorder())
		c.Request = httptest.NewRequest("GET", "/?sort_by="+url.QueryEscape(in), nil)
		if in == "" {
			c.Request = httptest.NewRequest("GET", "/", nil)
		}
		if got := FromContext(c).SortBy; got != want {
			t.Errorf("sort_by %q -> %q, want %q", in, got, want)
		}
	}
}
