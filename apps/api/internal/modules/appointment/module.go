package appointment

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
	PasienID   uint   `json:"pasien_id" binding:"required"`
	StaffID    uint   `json:"staff_id" binding:"required"`
	Tanggal    string `json:"tanggal" binding:"required"`
	Jam        string `json:"jam"`
	Status     string `json:"status"`
	Keterangan string `json:"keterangan"`
	IsActive   *bool  `json:"is_active"`
}

type StatusRequest struct {
	Status string `json:"status" binding:"required"`
}

type Handler struct{ svc *Service }

func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

func parseDate(s string) (time.Time, error) {
	if t, err := time.Parse("2006-01-02", s); err == nil {
		return t, nil
	}
	return time.Parse(time.RFC3339, s)
}

func (s *Service) List(p pagination.Params) ([]Appointment, pagination.Meta, error) {
	q := s.repo.db.Model(&Appointment{}).Preload("Pasien").Preload("Staff")
	if p.Search != "" {
		like := "%" + p.Search + "%"
		q = q.Where("kode ILIKE ? OR status ILIKE ?", like, like)
	}
	var items []Appointment
	meta, err := pagination.Paginate(q, p, &items)
	return items, meta, err
}

func (s *Service) Get(id uint) (*Appointment, error) {
	var item Appointment
	if err := s.repo.db.Preload("Pasien").Preload("Staff").First(&item, id).Error; err != nil {
		return nil, err
	}
	return &item, nil
}

// checkRefs turns a dangling pasien/staff id into a clear 400 instead of a foreign-key 500.
func (s *Service) checkRefs(pasienID, staffID uint) error {
	var n int64
	if err := s.repo.db.Table("pasiens").Where("id = ?", pasienID).Count(&n).Error; err != nil {
		return err
	}
	if n == 0 {
		return fmt.Errorf("pasien #%d tidak ditemukan", pasienID)
	}
	if staffID > 0 {
		if err := s.repo.db.Table("staffs").Where("id = ?", staffID).Count(&n).Error; err != nil {
			return err
		}
		if n == 0 {
			return fmt.Errorf("staff #%d tidak ditemukan", staffID)
		}
	}
	return nil
}

func (s *Service) Create(req UpsertRequest) (*Appointment, error) {
	if err := s.checkRefs(req.PasienID, req.StaffID); err != nil {
		return nil, errBadRequest{err}
	}
	kode, err := s.gen.Generate("APT")
	if err != nil {
		return nil, err
	}
	tanggal, err := parseDate(req.Tanggal)
	if err != nil {
		return nil, err
	}
	status := req.Status
	if status == "" {
		status = "scheduled"
	}
	item := &Appointment{
		Kode: kode, PasienID: req.PasienID, StaffID: req.StaffID,
		Tanggal: tanggal, Jam: req.Jam, Status: status, Keterangan: req.Keterangan, IsActive: true,
	}
	if req.IsActive != nil {
		item.IsActive = *req.IsActive
	}
	if err := s.repo.db.Create(item).Error; err != nil {
		return nil, err
	}
	return s.Get(item.ID)
}

func (s *Service) Update(id uint, req UpsertRequest) (*Appointment, error) {
	item, err := s.Get(id)
	if err != nil {
		return nil, err
	}
	tanggal, err := parseDate(req.Tanggal)
	if err != nil {
		return nil, err
	}
	item.PasienID = req.PasienID
	item.StaffID = req.StaffID
	item.Tanggal = tanggal
	item.Jam = req.Jam
	if req.Status != "" {
		item.Status = req.Status
	}
	item.Keterangan = req.Keterangan
	if req.IsActive != nil {
		item.IsActive = *req.IsActive
	}
	if err := s.repo.db.Save(item).Error; err != nil {
		return nil, err
	}
	return s.Get(id)
}

func (s *Service) UpdateStatus(id uint, status string) (*Appointment, error) {
	item, err := s.Get(id)
	if err != nil {
		return nil, err
	}
	item.Status = status
	if err := s.repo.db.Save(item).Error; err != nil {
		return nil, err
	}
	return s.Get(id)
}

func (s *Service) Delete(id uint) error {
	return s.repo.db.Delete(&Appointment{}, id).Error
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
		response.NotFound(c, "appointment not found")
		return
	}
	response.OK(c, item, "ok")
}

type errBadRequest struct{ error }

func (h *Handler) Store(c *gin.Context) {
	var req UpsertRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "validation failed", err.Error())
		return
	}
	item, err := h.svc.Create(req)
	var bad errBadRequest
	if errors.As(err, &bad) {
		response.BadRequest(c, bad.Error(), nil)
		return
	}
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

func (h *Handler) UpdateStatus(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	var req StatusRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "validation failed", err.Error())
		return
	}
	item, err := h.svc.UpdateStatus(uint(id), req.Status)
	if err != nil {
		response.Internal(c, err.Error())
		return
	}
	response.OK(c, item, "status updated")
}

func RegisterRoutes(rg *gin.RouterGroup, db *gorm.DB, gen *generator.Service) {
	h := NewHandler(NewService(NewRepository(db), gen))
	g := rg.Group("/appointment")
	{
		g.GET("", h.Index)
		g.POST("", h.Store)
		g.GET("/:id", h.Show)
		g.PUT("/:id", h.Update)
		g.DELETE("/:id", h.Destroy)
		g.PATCH("/:id/status", h.UpdateStatus)
	}
}
