package promo

import (
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/scaleup/clinic-v2/api/internal/platform/generator"
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
	Nama           string     `json:"nama" binding:"required"`
	Deskripsi      string     `json:"deskripsi"`
	TipeDiskon     string     `json:"tipe_diskon"`
	NilaiDiskon    float64    `json:"nilai_diskon"`
	TanggalMulai   *time.Time `json:"tanggal_mulai"`
	TanggalSelesai *time.Time `json:"tanggal_selesai"`
	IsActive       *bool      `json:"is_active"`
}

type ValidateRequest struct {
	Kode string `json:"kode" binding:"required"`
}

type Handler struct{ svc *Service }

func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

func (s *Service) List(p pagination.Params) ([]Promo, pagination.Meta, error) {
	q := s.repo.db.Model(&Promo{})
	if p.Search != "" {
		like := "%" + p.Search + "%"
		q = q.Where("kode ILIKE ? OR nama ILIKE ?", like, like)
	}
	var items []Promo
	meta, err := pagination.Paginate(q, p, &items)
	return items, meta, err
}

func (s *Service) Get(id uint) (*Promo, error) {
	var item Promo
	if err := s.repo.db.First(&item, id).Error; err != nil {
		return nil, err
	}
	return &item, nil
}

func (s *Service) Create(req UpsertRequest) (*Promo, error) {
	kode, err := s.gen.Generate("PRM")
	if err != nil {
		return nil, err
	}
	item := &Promo{
		Kode: kode, Nama: req.Nama, Deskripsi: req.Deskripsi, TipeDiskon: req.TipeDiskon,
		NilaiDiskon: req.NilaiDiskon, TanggalMulai: req.TanggalMulai, TanggalSelesai: req.TanggalSelesai, IsActive: true,
	}
	if req.IsActive != nil {
		item.IsActive = *req.IsActive
	}
	if err := s.repo.db.Create(item).Error; err != nil {
		return nil, err
	}
	return item, nil
}

func (s *Service) Update(id uint, req UpsertRequest) (*Promo, error) {
	item, err := s.Get(id)
	if err != nil {
		return nil, err
	}
	item.Nama = req.Nama
	item.Deskripsi = req.Deskripsi
	item.TipeDiskon = req.TipeDiskon
	item.NilaiDiskon = req.NilaiDiskon
	item.TanggalMulai = req.TanggalMulai
	item.TanggalSelesai = req.TanggalSelesai
	if req.IsActive != nil {
		item.IsActive = *req.IsActive
	}
	if err := s.repo.db.Save(item).Error; err != nil {
		return nil, err
	}
	return item, nil
}

func (s *Service) Delete(id uint) error {
	return s.repo.db.Delete(&Promo{}, id).Error
}

func (s *Service) Validate(kode string) (*Promo, error) {
	var item Promo
	if err := s.repo.db.Where("kode = ? AND is_active = true", kode).First(&item).Error; err != nil {
		return nil, err
	}
	now := time.Now()
	if item.TanggalMulai != nil && now.Before(*item.TanggalMulai) {
		return nil, gorm.ErrInvalidData
	}
	if item.TanggalSelesai != nil && now.After(*item.TanggalSelesai) {
		return nil, gorm.ErrInvalidData
	}
	return &item, nil
}

func (h *Handler) Index(c *gin.Context) {
	items, meta, err := h.svc.List(pagination.FromContext(c))
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
		response.NotFound(c, "promo not found")
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

func (h *Handler) Validate(c *gin.Context) {
	var req ValidateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "validation failed", err.Error())
		return
	}
	item, err := h.svc.Validate(req.Kode)
	if err != nil {
		response.BadRequest(c, "promo invalid", err.Error())
		return
	}
	response.OK(c, item, "valid")
}

func RegisterRoutes(rg *gin.RouterGroup, db *gorm.DB, gen *generator.Service) {
	h := NewHandler(NewService(NewRepository(db), gen))
	g := rg.Group("/promo")
	{
		g.GET("", h.Index)
		g.POST("", h.Store)
		g.POST("/validate", h.Validate)
		g.GET("/:id", h.Show)
		g.PUT("/:id", h.Update)
		g.DELETE("/:id", h.Destroy)
	}
}
