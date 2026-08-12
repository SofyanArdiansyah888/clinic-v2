package generate

import (
	"github.com/gin-gonic/gin"
	"github.com/scaleup/clinic-v2/api/internal/platform/generator"
	"github.com/scaleup/clinic-v2/api/internal/platform/response"
)

type Handler struct{ gen *generator.Service }

func NewHandler(gen *generator.Service) *Handler { return &Handler{gen: gen} }

func (h *Handler) Keys(c *gin.Context) {
	response.OK(c, h.gen.AvailableKeys(), "ok")
}

func (h *Handler) Number(c *gin.Context) {
	key := c.Query("key")
	if key == "" {
		response.BadRequest(c, "key is required", nil)
		return
	}
	kode, err := h.gen.Generate(key)
	if err != nil {
		response.BadRequest(c, err.Error(), nil)
		return
	}
	response.OK(c, gin.H{"kode": kode}, "ok")
}

func RegisterRoutes(rg *gin.RouterGroup, gen *generator.Service) {
	h := NewHandler(gen)
	g := rg.Group("/generate-number")
	{
		g.GET("", h.Number)
		g.GET("/keys", h.Keys)
	}
}
