package informedconsent

import (
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/scaleup/clinic-v2/api/internal/platform/pagination"
	"github.com/scaleup/clinic-v2/api/internal/platform/response"
	"gorm.io/gorm"
)

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
	Judul    string `json:"judul" binding:"required"`
	Kategori string `json:"kategori"`
	Isi      string `json:"isi" binding:"required"`
	IsActive *bool  `json:"is_active"`
}

type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

func (s *Service) List(p pagination.Params, kategori, isActive string) ([]Template, pagination.Meta, error) {
	q := s.repo.db.Model(&Template{})
	if p.Search != "" {
		like := "%" + p.Search + "%"
		q = q.Where("judul ILIKE ? OR kategori ILIKE ?", like, like)
	}
	if kategori != "" {
		q = q.Where("kategori = ?", kategori)
	}
	if isActive != "" {
		q = q.Where("is_active = ?", isActive == "true" || isActive == "1")
	}
	var items []Template
	meta, err := pagination.Paginate(q, p, &items)
	return items, meta, err
}

func (s *Service) Get(id uint) (*Template, error) {
	var item Template
	if err := s.repo.db.First(&item, id).Error; err != nil {
		return nil, err
	}
	return &item, nil
}

func (s *Service) Create(req UpsertRequest) (*Template, error) {
	item := &Template{IsActive: true}
	apply(item, req)
	if err := s.repo.db.Create(item).Error; err != nil {
		return nil, err
	}
	return item, nil
}

func (s *Service) Update(id uint, req UpsertRequest) (*Template, error) {
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
	return s.repo.db.Delete(&Template{}, id).Error
}

func apply(item *Template, req UpsertRequest) {
	item.Judul = req.Judul
	item.Kategori = req.Kategori
	item.Isi = req.Isi
	if req.IsActive != nil {
		item.IsActive = *req.IsActive
	}
}

func (h *Handler) Index(c *gin.Context) {
	items, meta, err := h.svc.List(pagination.FromContext(c), c.Query("kategori"), c.Query("is_active"))
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
		response.NotFound(c, "template not found")
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

func RegisterRoutes(rg *gin.RouterGroup, db *gorm.DB) {
	h := NewHandler(NewService(NewRepository(db)))
	g := rg.Group("/template-informed-consent")
	{
		g.GET("", h.Index)
		g.POST("", h.Store)
		g.GET("/:id", h.Show)
		g.PUT("/:id", h.Update)
		g.DELETE("/:id", h.Destroy)
	}
}
