package jadwaldokter

import (
	"errors"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/scaleup/clinic-v2/api/internal/platform/pagination"
	"github.com/scaleup/clinic-v2/api/internal/platform/response"
	"gorm.io/gorm"
)

var validHari = map[string]bool{
	"Senin": true, "Selasa": true, "Rabu": true, "Kamis": true,
	"Jumat": true, "Sabtu": true, "Minggu": true,
}

type Repository struct {
	db *gorm.DB
}

func NewRepository(db *gorm.DB) *Repository {
	return &Repository{db: db}
}

type Service struct {
	repo *Repository
}

func NewService(repo *Repository) *Service {
	return &Service{repo: repo}
}

type UpsertRequest struct {
	DokterNama string `json:"dokter_nama" binding:"required"`
	Hari       string `json:"hari" binding:"required"`
	JamMulai   string `json:"jam_mulai" binding:"required"`
	JamSelesai string `json:"jam_selesai" binding:"required"`
	IsActive   *bool  `json:"is_active"`
}

func (r UpsertRequest) validate() error {
	if !validHari[r.Hari] {
		return errors.New("hari tidak valid (Senin s/d Minggu)")
	}
	mulai, err := time.Parse("15:04", r.JamMulai)
	if err != nil {
		return errors.New("jam_mulai harus berformat HH:MM")
	}
	selesai, err := time.Parse("15:04", r.JamSelesai)
	if err != nil {
		return errors.New("jam_selesai harus berformat HH:MM")
	}
	if !selesai.After(mulai) {
		return errors.New("jam_selesai harus setelah jam_mulai")
	}
	return nil
}

type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

func (s *Service) List(p pagination.Params, hari string) ([]JadwalDokter, pagination.Meta, error) {
	q := s.repo.db.Model(&JadwalDokter{})
	if p.Search != "" {
		like := "%" + p.Search + "%"
		q = q.Where("dokter_nama ILIKE ? OR hari ILIKE ?", like, like)
	}
	if hari != "" {
		q = q.Where("hari = ?", hari)
	}
	var items []JadwalDokter
	meta, err := pagination.Paginate(q, p, &items)
	return items, meta, err
}

func (s *Service) Get(id uint) (*JadwalDokter, error) {
	var item JadwalDokter
	if err := s.repo.db.First(&item, id).Error; err != nil {
		return nil, err
	}
	return &item, nil
}

func (s *Service) Create(req UpsertRequest) (*JadwalDokter, error) {
	item := &JadwalDokter{IsActive: true}
	apply(item, req)
	if err := s.repo.db.Create(item).Error; err != nil {
		return nil, err
	}
	return item, nil
}

func (s *Service) Update(id uint, req UpsertRequest) (*JadwalDokter, error) {
	item, err := s.Get(id)
	if err != nil {
		return nil, err
	}
	apply(item, req)
	if err := s.repo.db.Save(item).Error; err != nil {
		return nil, err
	}
	return item, nil
}

func (s *Service) Delete(id uint) error {
	return s.repo.db.Delete(&JadwalDokter{}, id).Error
}

func apply(item *JadwalDokter, req UpsertRequest) {
	item.DokterNama = req.DokterNama
	item.Hari = req.Hari
	item.JamMulai = req.JamMulai
	item.JamSelesai = req.JamSelesai
	if req.IsActive != nil {
		item.IsActive = *req.IsActive
	}
}

func bindAndValidate(c *gin.Context) (UpsertRequest, bool) {
	var req UpsertRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "validation failed", err.Error())
		return req, false
	}
	if err := req.validate(); err != nil {
		response.BadRequest(c, "validation failed", err.Error())
		return req, false
	}
	return req, true
}

func (h *Handler) Index(c *gin.Context) {
	items, meta, err := h.svc.List(pagination.FromContext(c), c.Query("hari"))
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
		response.NotFound(c, "jadwal not found")
		return
	}
	response.OK(c, item, "ok")
}

func (h *Handler) Store(c *gin.Context) {
	req, ok := bindAndValidate(c)
	if !ok {
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
	req, ok := bindAndValidate(c)
	if !ok {
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

func RegisterRoutes(rg *gin.RouterGroup, db *gorm.DB) {
	h := NewHandler(NewService(NewRepository(db)))
	g := rg.Group("/jadwal-dokter")
	{
		g.GET("", h.Index)
		g.POST("", h.Store)
		g.GET("/:id", h.Show)
		g.PUT("/:id", h.Update)
		g.DELETE("/:id", h.Destroy)
	}
}
