#!/usr/bin/env python3
"""Complete missing API modules, server, main, env."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def w(rel: str, content: str) -> None:
    p = ROOT / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content.strip() + "\n", encoding="utf-8")
    print("wrote", rel)

# ── membership ──
w("internal/modules/membership/module.go", r'''
package membership

import (
	"strconv"

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

func (s *Service) List(p pagination.Params) ([]Membership, pagination.Meta, error) {
	q := s.repo.db.Model(&Membership{}).Preload("Pasien")
	if p.Search != "" {
		like := "%" + p.Search + "%"
		q = q.Where("kode ILIKE ? OR tipe ILIKE ?", like, like)
	}
	var items []Membership
	meta, err := pagination.Paginate(q, p, &items)
	return items, meta, err
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

func RegisterRoutes(rg *gin.RouterGroup, db *gorm.DB, gen *generator.Service) {
	h := NewHandler(NewService(NewRepository(db), gen))
	g := rg.Group("/membership")
	{
		g.GET("", h.Index)
		g.POST("", h.Store)
		g.GET("/:id", h.Show)
		g.PUT("/:id", h.Update)
		g.DELETE("/:id", h.Destroy)
		g.POST("/:id/add-points", h.AddPoints)
		g.POST("/:id/use-points", h.UsePoints)
	}
}
''')

# Fix membership entity if missing relations
w("internal/modules/membership/entity.go", r'''
package membership

import (
	"time"

	"github.com/scaleup/clinic-v2/api/internal/modules/pasien"
)

type Membership struct {
	ID        uint          `gorm:"primaryKey" json:"id"`
	Kode      string        `gorm:"size:50;uniqueIndex;not null" json:"kode"`
	PasienID  uint          `gorm:"index;not null" json:"pasien_id"`
	Pasien    *pasien.Pasien `gorm:"foreignKey:PasienID" json:"pasien,omitempty"`
	Tipe      string        `gorm:"size:50" json:"tipe"`
	Points    int           `gorm:"default:0" json:"points"`
	IsActive  bool          `gorm:"default:true" json:"is_active"`
	CreatedAt time.Time     `json:"created_at"`
	UpdatedAt time.Time     `json:"updated_at"`
}

func (Membership) TableName() string { return "memberships" }
''')

w("internal/modules/voucher/entity.go", r'''
package voucher

import "time"

type Voucher struct {
	ID             uint       `gorm:"primaryKey" json:"id"`
	Kode           string     `gorm:"size:50;uniqueIndex;not null" json:"kode"`
	Nama           string     `gorm:"size:150;not null" json:"nama"`
	TipeDiskon     string     `gorm:"size:20" json:"tipe_diskon"`
	NilaiDiskon    float64    `gorm:"type:decimal(12,2);default:0" json:"nilai_diskon"`
	MinPembelian   float64    `gorm:"type:decimal(12,2);default:0" json:"min_pembelian"`
	TanggalMulai   *time.Time `gorm:"type:date" json:"tanggal_mulai"`
	TanggalSelesai *time.Time `gorm:"type:date" json:"tanggal_selesai"`
	IsActive       bool       `gorm:"default:true" json:"is_active"`
	CreatedAt      time.Time  `json:"created_at"`
	UpdatedAt      time.Time  `json:"updated_at"`
}

func (Voucher) TableName() string { return "vouchers" }
''')

w("internal/modules/voucher/module.go", r'''
package voucher

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
		return nil, err
	}
	now := time.Now()
	if item.TanggalMulai != nil && now.Before(*item.TanggalMulai) {
		return nil, gorm.ErrInvalidData
	}
	if item.TanggalSelesai != nil && now.After(*item.TanggalSelesai) {
		return nil, gorm.ErrInvalidData
	}
	if total < item.MinPembelian {
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
''')

w("internal/modules/promo/entity.go", r'''
package promo

import "time"

type Promo struct {
	ID             uint       `gorm:"primaryKey" json:"id"`
	Kode           string     `gorm:"size:50;uniqueIndex;not null" json:"kode"`
	Nama           string     `gorm:"size:150;not null" json:"nama"`
	Deskripsi      string     `gorm:"type:text" json:"deskripsi"`
	TipeDiskon     string     `gorm:"size:20" json:"tipe_diskon"`
	NilaiDiskon    float64    `gorm:"type:decimal(12,2);default:0" json:"nilai_diskon"`
	TanggalMulai   *time.Time `gorm:"type:date" json:"tanggal_mulai"`
	TanggalSelesai *time.Time `gorm:"type:date" json:"tanggal_selesai"`
	IsActive       bool       `gorm:"default:true" json:"is_active"`
	CreatedAt      time.Time  `json:"created_at"`
	UpdatedAt      time.Time  `json:"updated_at"`
}

func (Promo) TableName() string { return "promos" }
''')

w("internal/modules/promo/module.go", r'''
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
''')

w("internal/modules/dashboard/module.go", r'''
package dashboard

import (
	"time"

	"github.com/gin-gonic/gin"
	"github.com/scaleup/clinic-v2/api/internal/platform/response"
	"gorm.io/gorm"
)

type KPI struct {
	RevenueToday     float64 `json:"revenue_today"`
	VisitsToday      int64   `json:"visits_today"`
	NewPatientsToday int64   `json:"new_patients_today"`
	PendingQueue     int64   `json:"pending_queue"`
}

type Handler struct{ db *gorm.DB }

func NewHandler(db *gorm.DB) *Handler { return &Handler{db: db} }

func (h *Handler) KPI(c *gin.Context) {
	today := time.Now().Format("2006-01-02")
	var kpi KPI
	h.db.Table("penjualans").
		Where("DATE(tanggal) = ? AND status = ?", today, "paid").
		Select("COALESCE(SUM(total_harga),0)").Scan(&kpi.RevenueToday)
	h.db.Table("antrians").Where("DATE(tanggal) = ?", today).Count(&kpi.VisitsToday)
	h.db.Table("pasiens").Where("DATE(created_at) = ?", today).Count(&kpi.NewPatientsToday)
	h.db.Table("antrians").Where("DATE(tanggal) = ? AND status = ?", today, "menunggu").Count(&kpi.PendingQueue)
	response.OK(c, kpi, "ok")
}

func RegisterRoutes(rg *gin.RouterGroup, db *gorm.DB) {
	h := NewHandler(db)
	g := rg.Group("/dashboard")
	{
		g.GET("/kpi", h.KPI)
	}
}
''')

w("internal/modules/generate/module.go", r'''
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
''')

print("modules done")
