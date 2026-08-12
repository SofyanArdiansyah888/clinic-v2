package barang

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
	Nama         string  `json:"nama" binding:"required"`
	Kategori     string  `json:"kategori"`
	Satuan       string  `json:"satuan"`
	HargaBeli    float64 `json:"harga_beli"`
	HargaJual    float64 `json:"harga_jual"`
	StokMinimal  int     `json:"stok_minimal"`
	StokAktual   int     `json:"stok_aktual"`
	LokasiBarang string  `json:"lokasi_barang"`
	IsActive     *bool   `json:"is_active"`
}

type StockRequest struct {
	StokAktual int `json:"stok_aktual"`
}

type Handler struct{ svc *Service }

func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

func (s *Service) List(p pagination.Params) ([]Barang, pagination.Meta, error) {
	q := s.repo.db.Model(&Barang{})
	if p.Search != "" {
		like := "%" + p.Search + "%"
		q = q.Where("nama ILIKE ? OR kode ILIKE ? OR kategori ILIKE ?", like, like, like)
	}
	var items []Barang
	meta, err := pagination.Paginate(q, p, &items)
	return items, meta, err
}

func (s *Service) Get(id uint) (*Barang, error) {
	var item Barang
	if err := s.repo.db.First(&item, id).Error; err != nil {
		return nil, err
	}
	return &item, nil
}

func (s *Service) Create(req UpsertRequest) (*Barang, error) {
	kode, err := s.gen.Generate("BRG")
	if err != nil {
		return nil, err
	}
	item := &Barang{
		Kode: kode, Nama: req.Nama, Kategori: req.Kategori, Satuan: req.Satuan,
		HargaBeli: req.HargaBeli, HargaJual: req.HargaJual, StokMinimal: req.StokMinimal,
		StokAktual: req.StokAktual, LokasiBarang: req.LokasiBarang, IsActive: true,
	}
	if req.IsActive != nil {
		item.IsActive = *req.IsActive
	}
	if err := s.repo.db.Create(item).Error; err != nil {
		return nil, err
	}
	return item, nil
}

func (s *Service) Update(id uint, req UpsertRequest) (*Barang, error) {
	item, err := s.Get(id)
	if err != nil {
		return nil, err
	}
	item.Nama = req.Nama
	item.Kategori = req.Kategori
	item.Satuan = req.Satuan
	item.HargaBeli = req.HargaBeli
	item.HargaJual = req.HargaJual
	item.StokMinimal = req.StokMinimal
	item.StokAktual = req.StokAktual
	item.LokasiBarang = req.LokasiBarang
	if req.IsActive != nil {
		item.IsActive = *req.IsActive
	}
	if err := s.repo.db.Save(item).Error; err != nil {
		return nil, err
	}
	return item, nil
}

func (s *Service) UpdateStock(id uint, stok int) (*Barang, error) {
	item, err := s.Get(id)
	if err != nil {
		return nil, err
	}
	item.StokAktual = stok
	if err := s.repo.db.Save(item).Error; err != nil {
		return nil, err
	}
	return item, nil
}

func (s *Service) Delete(id uint) error {
	return s.repo.db.Delete(&Barang{}, id).Error
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
		response.NotFound(c, "barang not found")
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

func (h *Handler) UpdateStock(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	var req StockRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "validation failed", err.Error())
		return
	}
	item, err := h.svc.UpdateStock(uint(id), req.StokAktual)
	if err != nil {
		response.Internal(c, err.Error())
		return
	}
	response.OK(c, item, "stock updated")
}

func RegisterRoutes(rg *gin.RouterGroup, db *gorm.DB, gen *generator.Service) {
	h := NewHandler(NewService(NewRepository(db), gen))
	g := rg.Group("/barang")
	{
		g.GET("", h.Index)
		g.POST("", h.Store)
		g.GET("/:id", h.Show)
		g.PUT("/:id", h.Update)
		g.DELETE("/:id", h.Destroy)
		g.PATCH("/:id/stock", h.UpdateStock)
	}
}
