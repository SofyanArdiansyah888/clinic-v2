package finance

import (
	"errors"

	"github.com/gin-gonic/gin"
	"github.com/scaleup/clinic-v2/api/internal/platform/generator"
	"github.com/scaleup/clinic-v2/api/internal/platform/middleware"
	"github.com/scaleup/clinic-v2/api/internal/platform/pagination"
	"github.com/scaleup/clinic-v2/api/internal/platform/response"
	"gorm.io/gorm"
)

type Handler struct{ svc *Service }

func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

func fail(c *gin.Context, err error) {
	if errors.Is(err, gorm.ErrRecordNotFound) {
		response.NotFound(c, "data tidak ditemukan")
		return
	}
	response.BadRequest(c, err.Error(), nil)
}

func userID(c *gin.Context) *uint {
	v, ok := c.Get(middleware.ContextUserID)
	if !ok {
		return nil
	}
	if id, ok := v.(uint); ok && id > 0 {
		return &id
	}
	return nil
}

func (h *Handler) ListAkun(c *gin.Context) {
	items, err := h.svc.ListAkun(AkunFilter{
		Tipe: c.Query("tipe"), Search: c.Query("search"), Postable: c.Query("postable") == "1",
	})
	if err != nil {
		response.Internal(c, err.Error())
		return
	}
	response.OK(c, items, "ok")
}

func (h *Handler) ShowAkun(c *gin.Context) {
	item, err := h.svc.GetAkun(uintParam(c.Param("id")))
	if err != nil {
		fail(c, err)
		return
	}
	response.OK(c, item, "ok")
}

func (h *Handler) StoreAkun(c *gin.Context) {
	var req AkunRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "validation failed", err.Error())
		return
	}
	item, err := h.svc.CreateAkun(req)
	if err != nil {
		fail(c, err)
		return
	}
	response.Created(c, item, "created")
}

func (h *Handler) UpdateAkun(c *gin.Context) {
	var req AkunRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "validation failed", err.Error())
		return
	}
	item, err := h.svc.UpdateAkun(uintParam(c.Param("id")), req)
	if err != nil {
		fail(c, err)
		return
	}
	response.OK(c, item, "updated")
}

func (h *Handler) DestroyAkun(c *gin.Context) {
	if err := h.svc.DeleteAkun(uintParam(c.Param("id"))); err != nil {
		fail(c, err)
		return
	}
	response.OK(c, nil, "deleted")
}

func (h *Handler) ShowMapping(c *gin.Context) {
	res, err := h.svc.GetMapping()
	if err != nil {
		response.Internal(c, err.Error())
		return
	}
	response.OK(c, res, "ok")
}

func (h *Handler) UpdateMapping(c *gin.Context) {
	var req MappingRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "validation failed", err.Error())
		return
	}
	res, err := h.svc.UpdateMapping(req)
	if err != nil {
		fail(c, err)
		return
	}
	response.OK(c, res, "updated")
}

func (h *Handler) ListJurnal(c *gin.Context) {
	p := pagination.FromContext(c)
	if p.SortBy != "id" && p.SortBy != "tanggal" && p.SortBy != "kode" {
		p.SortBy = "id"
	}
	items, meta, err := h.svc.ListJurnal(p, JurnalFilter{
		Dari: c.Query("dari"), Sampai: c.Query("sampai"),
		SourceType: c.Query("source_type"), AkunID: uintParam(c.Query("akun_id")),
	})
	if err != nil {
		response.Internal(c, err.Error())
		return
	}
	response.OKWithMeta(c, items, meta, "ok")
}

func (h *Handler) ShowJurnal(c *gin.Context) {
	item, err := h.svc.GetJurnal(uintParam(c.Param("id")))
	if err != nil {
		fail(c, err)
		return
	}
	response.OK(c, item, "ok")
}

func (h *Handler) StoreJurnal(c *gin.Context) {
	var req JurnalRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "validation failed", err.Error())
		return
	}
	item, err := h.svc.CreateManual(req, userID(c))
	if err != nil {
		fail(c, err)
		return
	}
	response.Created(c, item, "created")
}

func (h *Handler) ReverseJurnal(c *gin.Context) {
	var req struct {
		Tanggal string `json:"tanggal"`
	}
	_ = c.ShouldBindJSON(&req)
	item, err := h.svc.ReverseManual(uintParam(c.Param("id")), req.Tanggal, userID(c))
	if err != nil {
		fail(c, err)
		return
	}
	response.OK(c, item, "reversed")
}

func (h *Handler) BukuBesar(c *gin.Context) {
	res, err := h.svc.BukuBesar(uintParam(c.Query("akun_id")), c.Query("dari"), c.Query("sampai"))
	if err != nil {
		fail(c, err)
		return
	}
	response.OK(c, res, "ok")
}

func (h *Handler) NeracaSaldo(c *gin.Context) {
	res, err := h.svc.NeracaSaldo(c.Query("sampai"))
	if err != nil {
		fail(c, err)
		return
	}
	response.OK(c, res, "ok")
}

func (h *Handler) LabaRugi(c *gin.Context) {
	res, err := h.svc.LabaRugi(c.Query("dari"), c.Query("sampai"))
	if err != nil {
		fail(c, err)
		return
	}
	response.OK(c, res, "ok")
}

func (h *Handler) Neraca(c *gin.Context) {
	res, err := h.svc.Neraca(c.Query("per"))
	if err != nil {
		fail(c, err)
		return
	}
	response.OK(c, res, "ok")
}

func RegisterRoutes(rg *gin.RouterGroup, db *gorm.DB, gen *generator.Service) {
	h := NewHandler(NewService(db, gen))
	g := rg.Group("/finance")
	{
		g.GET("/akun", h.ListAkun)
		g.GET("/akun/:id", h.ShowAkun)
		g.POST("/akun", h.StoreAkun)
		g.PUT("/akun/:id", h.UpdateAkun)
		g.DELETE("/akun/:id", h.DestroyAkun)

		g.GET("/mapping", h.ShowMapping)
		g.PUT("/mapping", h.UpdateMapping)

		g.GET("/jurnal", h.ListJurnal)
		g.GET("/jurnal/:id", h.ShowJurnal)
		g.POST("/jurnal", h.StoreJurnal)
		g.POST("/jurnal/:id/reverse", h.ReverseJurnal)

		g.GET("/laporan/buku-besar", h.BukuBesar)
		g.GET("/laporan/neraca-saldo", h.NeracaSaldo)
		g.GET("/laporan/laba-rugi", h.LabaRugi)
		g.GET("/laporan/neraca", h.Neraca)
	}
}
