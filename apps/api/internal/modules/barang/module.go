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

// ListFilters narrows the barang list; Stok is "menipis" (at or below stok_minimal but
// not empty), "habis" (zero or below) or "aman".
type ListFilters struct {
	Kategori string
	Status   string // aktif | nonaktif
	Stok     string
}

func filtersFromContext(c *gin.Context) ListFilters {
	return ListFilters{Kategori: c.Query("kategori"), Status: c.Query("status"), Stok: c.Query("stok")}
}

const (
	sqlHabis   = "stok_aktual <= 0"
	sqlMenipis = "stok_aktual > 0 AND stok_aktual <= stok_minimal"
)

// applyMasterFilters applies the kategori and status filters shared by the list and its summary.
func applyMasterFilters(q *gorm.DB, f ListFilters, search string) *gorm.DB {
	if f.Kategori != "" {
		q = q.Where("kategori = ?", f.Kategori)
	}
	switch f.Status {
	case "aktif":
		q = q.Where("is_active = ?", true)
	case "nonaktif":
		q = q.Where("is_active = ?", false)
	}
	if search != "" {
		like := "%" + search + "%"
		q = q.Where("nama ILIKE ? OR kode ILIKE ? OR kategori ILIKE ?", like, like, like)
	}
	return q
}

func (s *Service) List(p pagination.Params, f ListFilters) ([]Barang, pagination.Meta, error) {
	q := applyMasterFilters(s.repo.db.Model(&Barang{}), f, p.Search)
	switch f.Stok {
	case "habis":
		q = q.Where(sqlHabis)
	case "menipis":
		q = q.Where(sqlMenipis)
	case "aman":
		q = q.Where("stok_aktual > stok_minimal")
	}
	var items []Barang
	meta, err := pagination.Paginate(q, p, &items)
	return items, meta, err
}

// Summary is the stock overview for the barang page.
type Summary struct {
	Total     int64    `json:"total"`
	Aktif     int64    `json:"aktif"`
	Menipis   int64    `json:"menipis"`
	Habis     int64    `json:"habis"`
	NilaiStok float64  `json:"nilai_stok"` // stok on hand valued at harga_beli
	Kategoris []string `json:"kategoris"`  // every kategori in use, for the filter
}

// Summary counts the barang matching the kategori, status and search filters (the stok
// filter is ignored so the cards keep showing the whole breakdown).
func (s *Service) Summary(f ListFilters, search string) (Summary, error) {
	var out Summary
	// Scan into the counts only; GORM cannot scan into the Kategoris slice.
	var counts struct {
		Total     int64
		Aktif     int64
		Menipis   int64
		Habis     int64
		NilaiStok float64
	}
	err := applyMasterFilters(s.repo.db.Model(&Barang{}), f, search).
		Select(`COUNT(*) AS total,
			COUNT(*) FILTER (WHERE is_active) AS aktif,
			COUNT(*) FILTER (WHERE ` + sqlMenipis + `) AS menipis,
			COUNT(*) FILTER (WHERE ` + sqlHabis + `) AS habis,
			COALESCE(SUM(GREATEST(stok_aktual, 0) * harga_beli), 0) AS nilai_stok`).
		Scan(&counts).Error
	if err != nil {
		return out, err
	}
	out.Total, out.Aktif, out.Menipis, out.Habis, out.NilaiStok = counts.Total, counts.Aktif, counts.Menipis, counts.Habis, counts.NilaiStok
	out.Kategoris = []string{}
	err = s.repo.db.Model(&Barang{}).Where("kategori <> ''").
		Distinct("kategori").Order("kategori").Pluck("kategori", &out.Kategoris).Error
	return out, err
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
	items, meta, err := h.svc.List(pagination.FromContext(c), filtersFromContext(c))
	if err != nil {
		response.Internal(c, err.Error())
		return
	}
	response.OKWithMeta(c, items, meta, "ok")
}

func (h *Handler) Summary(c *gin.Context) {
	out, err := h.svc.Summary(filtersFromContext(c), c.Query("search"))
	if err != nil {
		response.Internal(c, err.Error())
		return
	}
	response.OK(c, out, "ok")
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
		g.GET("/summary", h.Summary)
		g.POST("", h.Store)
		g.GET("/:id", h.Show)
		g.PUT("/:id", h.Update)
		g.DELETE("/:id", h.Destroy)
		g.PATCH("/:id/stock", h.UpdateStock)
	}
}
