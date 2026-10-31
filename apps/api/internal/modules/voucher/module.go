package voucher

import (
	"errors"
	"fmt"
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
	TipeDiskon     string     `json:"tipe_diskon"`
	NilaiDiskon    float64    `json:"nilai_diskon"`
	MinPembelian   float64    `json:"min_pembelian"`
	TanggalMulai   *time.Time `json:"tanggal_mulai"`
	TanggalSelesai *time.Time `json:"tanggal_selesai"`
	IsActive       *bool      `json:"is_active"`
}

type ValidateRequest struct {
	Kode         string  `json:"kode" binding:"required"`
	TotalBelanja float64 `json:"total_belanja"`
}

type Handler struct{ svc *Service }

func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

func (s *Service) List(p pagination.Params) ([]Voucher, pagination.Meta, error) {
	q := s.repo.db.Model(&Voucher{})
	if p.Search != "" {
		like := "%" + p.Search + "%"
		q = q.Where("kode ILIKE ? OR nama ILIKE ?", like, like)
	}
	var items []Voucher
	meta, err := pagination.Paginate(q, p, &items)
	return items, meta, err
}

func (s *Service) Get(id uint) (*Voucher, error) {
	var item Voucher
	if err := s.repo.db.First(&item, id).Error; err != nil {
		return nil, err
	}
	return &item, nil
}

func (s *Service) Create(req UpsertRequest) (*Voucher, error) {
	kode, err := s.gen.Generate("VCR")
	if err != nil {
		return nil, err
	}
	item := &Voucher{
		Kode: kode, Nama: req.Nama, TipeDiskon: req.TipeDiskon, NilaiDiskon: req.NilaiDiskon,
		MinPembelian: req.MinPembelian, TanggalMulai: req.TanggalMulai, TanggalSelesai: req.TanggalSelesai, IsActive: true,
	}
	if req.IsActive != nil {
		item.IsActive = *req.IsActive
	}
	if err := s.repo.db.Create(item).Error; err != nil {
		return nil, err
	}
	return item, nil
}

func (s *Service) Update(id uint, req UpsertRequest) (*Voucher, error) {
	item, err := s.Get(id)
	if err != nil {
		return nil, err
	}
	item.Nama = req.Nama
	item.TipeDiskon = req.TipeDiskon
	item.NilaiDiskon = req.NilaiDiskon
	item.MinPembelian = req.MinPembelian
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
	return s.repo.db.Delete(&Voucher{}, id).Error
}

func (s *Service) Validate(kode string, total float64) (*Voucher, error) {
	var item Voucher
	if err := s.repo.db.Where("kode = ? AND is_active = true", kode).First(&item).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errors.New("kode voucher tidak ditemukan atau tidak aktif")
		}
		return nil, err
	}
	now := time.Now()
	if item.TanggalMulai != nil && now.Before(*item.TanggalMulai) {
		return nil, errors.New("voucher belum berlaku")
	}
	// tanggal_selesai is a date; the voucher stays valid through the end of that day.
	if item.TanggalSelesai != nil && !now.Before(item.TanggalSelesai.AddDate(0, 0, 1)) {
		return nil, errors.New("voucher sudah kedaluwarsa")
	}
	if total < item.MinPembelian {
		return nil, fmt.Errorf("minimal pembelian untuk voucher ini Rp %.0f", item.MinPembelian)
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
		response.NotFound(c, "voucher not found")
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
	item, err := h.svc.Validate(req.Kode, req.TotalBelanja)
	if err != nil {
		response.BadRequest(c, "voucher invalid", err.Error())
		return
	}
	response.OK(c, item, "valid")
}

func RegisterRoutes(rg *gin.RouterGroup, db *gorm.DB, gen *generator.Service) {
	h := NewHandler(NewService(NewRepository(db), gen))
	g := rg.Group("/voucher")
	{
		g.GET("", h.Index)
		g.POST("", h.Store)
		g.POST("/validate", h.Validate)
		g.GET("/:id", h.Show)
		g.PUT("/:id", h.Update)
		g.DELETE("/:id", h.Destroy)
	}
}
