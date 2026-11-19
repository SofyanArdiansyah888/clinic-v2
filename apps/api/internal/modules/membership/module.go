package membership

import (
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/scaleup/clinic-v2/api/internal/platform/generator"
	"github.com/scaleup/clinic-v2/api/internal/platform/filter"
	"github.com/scaleup/clinic-v2/api/internal/platform/pagination"
	"github.com/scaleup/clinic-v2/api/internal/platform/response"
	"gorm.io/gorm"
)

type Repository struct{ db *gorm.DB }

func NewRepository(db *gorm.DB) *Repository { return &Repository{db: db} }

type Service struct {
	repo *Repository
	gen  *generator.Service
}

func NewService(repo *Repository, gen *generator.Service) *Service {
	return &Service{repo: repo, gen: gen}
}

type UpsertRequest struct {
	PasienID uint    `json:"pasien_id" binding:"required"`
	Tipe     string  `json:"tipe"`
	Points   int     `json:"points"`
	IsActive *bool   `json:"is_active"`
}

type PointsRequest struct {
	Points int `json:"points" binding:"required"`
}

type Handler struct{ svc *Service }

func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

// ListFilters narrows the membership list; Periode filters by registration date.
type ListFilters struct {
	Tipe    string
	Status  string // aktif | nonaktif
	Periode filter.DateRange
}

func listFilters(c *gin.Context) (ListFilters, error) {
	r, err := filter.DateRangeFromContext(c)
	return ListFilters{Tipe: c.Query("tipe"), Status: c.Query("status"), Periode: r}, err
}

func applyFilters(q *gorm.DB, f ListFilters, search string) *gorm.DB {
	if f.Tipe != "" {
		// An empty tipe is shown as Silver, so it filters as Silver too.
		q = q.Where("COALESCE(NULLIF(tipe, ''), 'Silver') ILIKE ?", f.Tipe)
	}
	switch f.Status {
	case "aktif":
		q = q.Where("is_active = ?", true)
	case "nonaktif":
		q = q.Where("is_active = ?", false)
	}
	q = f.Periode.Apply(q, "created_at::date")
	if search != "" {
		like := "%" + search + "%"
		q = q.Where("kode ILIKE ? OR tipe ILIKE ? OR pasien_id IN (SELECT id FROM pasiens WHERE nama ILIKE ? OR kode ILIKE ?)", like, like, like, like)
	}
	return q
}

func (s *Service) List(p pagination.Params, f ListFilters) ([]Membership, pagination.Meta, error) {
	q := applyFilters(s.repo.db.Model(&Membership{}).Preload("Pasien"), f, p.Search)
	var items []Membership
	meta, err := pagination.Paginate(q, p, &items)
	return items, meta, err
}

// Summary is the overview shown above the membership list.
type Summary struct {
	Total      int64            `json:"total"`
	Aktif      int64            `json:"aktif"`
	TotalPoin  int64            `json:"total_poin"`
	PerTipe    map[string]int64 `json:"per_tipe"`
}

func (s *Service) Summary(f ListFilters, search string) (Summary, error) {
	out := Summary{PerTipe: map[string]int64{}}
	// Scan into the counts only; GORM cannot scan into the PerTipe map.
	var counts struct {
		Total     int64
		Aktif     int64
		TotalPoin int64
	}
	err := applyFilters(s.repo.db.Model(&Membership{}), f, search).
		Select("COUNT(*) AS total, COUNT(*) FILTER (WHERE is_active) AS aktif, COALESCE(SUM(points), 0) AS total_poin").
		Scan(&counts).Error
	if err != nil {
		return out, err
	}
	out.Total, out.Aktif, out.TotalPoin = counts.Total, counts.Aktif, counts.TotalPoin
	var rows []struct {
		Tipe  string
		Jumlah int64
	}
	err = applyFilters(s.repo.db.Model(&Membership{}), f, search).
		Select("COALESCE(NULLIF(tipe, ''), 'Silver') AS tipe, COUNT(*) AS jumlah").
		Group("COALESCE(NULLIF(tipe, ''), 'Silver')").Scan(&rows).Error
	for _, r := range rows {
		out.PerTipe[r.Tipe] += r.Jumlah
	}
	return out, err
}

func (s *Service) Get(id uint) (*Membership, error) {
	var item Membership
	if err := s.repo.db.Preload("Pasien").First(&item, id).Error; err != nil {
		return nil, err
	}
	return &item, nil
}

func (s *Service) Create(req UpsertRequest) (*Membership, error) {
	kode, err := s.gen.Generate("MEM")
	if err != nil {
		return nil, err
	}
	item := &Membership{Kode: kode, PasienID: req.PasienID, Tipe: req.Tipe, Points: req.Points, IsActive: true}
	if req.IsActive != nil {
		item.IsActive = *req.IsActive
	}
	if err := s.repo.db.Create(item).Error; err != nil {
		return nil, err
	}
	return s.Get(item.ID)
}

func (s *Service) Update(id uint, req UpsertRequest) (*Membership, error) {
	item, err := s.Get(id)
	if err != nil {
		return nil, err
	}
	item.PasienID = req.PasienID
	item.Tipe = req.Tipe
	item.Points = req.Points
	if req.IsActive != nil {
		item.IsActive = *req.IsActive
	}
	if err := s.repo.db.Save(item).Error; err != nil {
		return nil, err
	}
	return s.Get(id)
}

func (s *Service) Delete(id uint) error {
	return s.repo.db.Delete(&Membership{}, id).Error
}

func (s *Service) AddPoints(id uint, points int) (*Membership, error) {
	item, err := s.Get(id)
	if err != nil {
		return nil, err
	}
	item.Points += points
	if err := s.repo.db.Save(item).Error; err != nil {
		return nil, err
	}
	return item, nil
}

func (s *Service) UsePoints(id uint, points int) (*Membership, error) {
	item, err := s.Get(id)
	if err != nil {
		return nil, err
	}
	if item.Points < points {
		return nil, gorm.ErrInvalidData
	}
	item.Points -= points
	if err := s.repo.db.Save(item).Error; err != nil {
		return nil, err
	}
	return item, nil
}

func (h *Handler) Index(c *gin.Context) {
	f, err := listFilters(c)
	if err != nil {
		response.BadRequest(c, err.Error(), nil)
		return
	}
	items, meta, err := h.svc.List(pagination.FromContext(c), f)
	if err != nil {
		response.Internal(c, err.Error())
		return
	}
	response.OKWithMeta(c, items, meta, "ok")
}

func (h *Handler) Show(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	item, err := h.svc.Get(uint(id))
	if err != nil {
		response.NotFound(c, "membership not found")
		return
	}
	response.OK(c, item, "ok")
}

func (h *Handler) Store(c *gin.Context) {
	var req UpsertRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "validation failed", err.Error())
		return
	}
	item, err := h.svc.Create(req)
	if err != nil {
		response.Internal(c, err.Error())
		return
	}
	response.Created(c, item, "created")
}

func (h *Handler) Update(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	var req UpsertRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "validation failed", err.Error())
		return
	}
	item, err := h.svc.Update(uint(id), req)
	if err != nil {
		response.Internal(c, err.Error())
		return
	}
	response.OK(c, item, "updated")
}

func (h *Handler) Destroy(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	if err := h.svc.Delete(uint(id)); err != nil {
		response.Internal(c, err.Error())
		return
	}
	response.OK(c, nil, "deleted")
}

func (h *Handler) AddPoints(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	var req PointsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "validation failed", err.Error())
		return
	}
	item, err := h.svc.AddPoints(uint(id), req.Points)
	if err != nil {
		response.Internal(c, err.Error())
		return
	}
	response.OK(c, item, "points added")
}

func (h *Handler) UsePoints(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	var req PointsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "validation failed", err.Error())
		return
	}
	item, err := h.svc.UsePoints(uint(id), req.Points)
	if err != nil {
		response.BadRequest(c, "insufficient points", err.Error())
		return
	}
	response.OK(c, item, "points used")
}

func (h *Handler) Summary(c *gin.Context) {
	f, err := listFilters(c)
	if err != nil {
		response.BadRequest(c, err.Error(), nil)
		return
	}
	out, err := h.svc.Summary(f, c.Query("search"))
	if err != nil {
		response.Internal(c, err.Error())
		return
	}
	response.OK(c, out, "ok")
}

func RegisterRoutes(rg *gin.RouterGroup, db *gorm.DB, gen *generator.Service) {
	h := NewHandler(NewService(NewRepository(db), gen))
	g := rg.Group("/membership")
	{
		g.GET("", h.Index)
		g.GET("/summary", h.Summary)
		g.POST("", h.Store)
		g.GET("/:id", h.Show)
		g.PUT("/:id", h.Update)
		g.DELETE("/:id", h.Destroy)
		g.POST("/:id/add-points", h.AddPoints)
		g.POST("/:id/use-points", h.UsePoints)
	}
}
