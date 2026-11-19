package barang

import (
	"errors"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/scaleup/clinic-v2/api/internal/platform/branch"
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
	cab  branch.Ctx
}

// For binds the service to the request's active branch.
func (s *Service) For(c *gin.Context) *Service {
	cp := *s
	cp.cab = branch.From(c)
	return &cp
}

// failWrite answers stock rule errors with 400 and anything else with 500.
func failWrite(c *gin.Context, err error) {
	var bad stokError
	if errors.Is(err, ErrCabangStok) || errors.As(err, &bad) {
		response.BadRequest(c, err.Error(), nil)
		return
	}
	response.Internal(c, err.Error())
}

type stokError struct{ error }

// setStok applies a stock value typed on the barang form to the active branch.
func (s *Service) setStok(tx *gorm.DB, barangID uint, stok int) error {
	if stok < 0 {
		return stokError{errors.New("stok tidak boleh negatif")}
	}
	if s.cab.ID == 0 {
		return ErrCabangStok
	}
	return SetStok(tx, barangID, s.cab.ID, stok)
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

// sqlHabis and sqlMenipis classify stock given its SQL expression (see StokSQL).
func sqlHabis(stok string) string   { return stok + " <= 0" }
func sqlMenipis(stok string) string { return stok + " > 0 AND " + stok + " <= stok_minimal" }

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
	stok := StokSQL(s.cab)
	switch f.Stok {
	case "habis":
		q = q.Where(sqlHabis(stok))
	case "menipis":
		q = q.Where(sqlMenipis(stok))
	case "aman":
		q = q.Where(stok + " > stok_minimal")
	}
	var items []Barang
	meta, err := pagination.Paginate(q, p, &items)
	if err == nil {
		err = FillStok(s.repo.db, s.cab, items)
	}
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
	stok := StokSQL(s.cab)
	err := applyMasterFilters(s.repo.db.Model(&Barang{}), f, search).
		Select(`COUNT(*) AS total,
			COUNT(*) FILTER (WHERE is_active) AS aktif,
			COUNT(*) FILTER (WHERE ` + sqlMenipis(stok) + `) AS menipis,
			COUNT(*) FILTER (WHERE ` + sqlHabis(stok) + `) AS habis,
			COALESCE(SUM(GREATEST(` + stok + `, 0) * harga_beli), 0) AS nilai_stok`).
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
	list := []Barang{item}
	if err := FillStok(s.repo.db, s.cab, list); err != nil {
		return nil, err
	}
	return &list[0], nil
}

func (s *Service) Create(req UpsertRequest) (*Barang, error) {
	kode, err := s.gen.Generate("BRG")
	if err != nil {
		return nil, err
	}
	item := &Barang{
		Kode: kode, Nama: req.Nama, Kategori: req.Kategori, Satuan: req.Satuan,
		HargaBeli: req.HargaBeli, HargaJual: req.HargaJual, StokMinimal: req.StokMinimal,
		LokasiBarang: req.LokasiBarang, IsActive: true,
	}
	if req.IsActive != nil {
		item.IsActive = *req.IsActive
	}
	// Opening stock belongs to the active branch.
	if req.StokAktual != 0 && s.cab.ID == 0 {
		return nil, ErrCabangStok
	}
	err = s.repo.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(item).Error; err != nil {
			return err
		}
		if req.StokAktual == 0 {
			return nil
		}
		return s.setStok(tx, item.ID, req.StokAktual)
	})
	if err != nil {
		return nil, err
	}
	return s.Get(item.ID)
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
	item.LokasiBarang = req.LokasiBarang
	if req.IsActive != nil {
		item.IsActive = *req.IsActive
	}
	// The form shows the active branch's stock; a changed value adjusts that branch.
	// With all branches selected it shows the total, which cannot be edited.
	changed := !s.cab.All && req.StokAktual != item.StokAktual
	err = s.repo.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Omit("stok_aktual").Save(item).Error; err != nil {
			return err
		}
		if !changed {
			return nil
		}
		return s.setStok(tx, id, req.StokAktual)
	})
	if err != nil {
		return nil, err
	}
	return s.Get(id)
}

func (s *Service) UpdateStock(id uint, stok int) (*Barang, error) {
	if _, err := s.Get(id); err != nil {
		return nil, err
	}
	if err := s.repo.db.Transaction(func(tx *gorm.DB) error { return s.setStok(tx, id, stok) }); err != nil {
		return nil, err
	}
	return s.Get(id)
}

func (s *Service) Delete(id uint) error {
	return s.repo.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("barang_id = ?", id).Delete(&Stok{}).Error; err != nil {
			return err
		}
		return tx.Delete(&Barang{}, id).Error
	})
}

func (h *Handler) Index(c *gin.Context) {
	items, meta, err := h.svc.For(c).List(pagination.FromContext(c), filtersFromContext(c))
	if err != nil {
		response.Internal(c, err.Error())
		return
	}
	response.OKWithMeta(c, items, meta, "ok")
}

func (h *Handler) Summary(c *gin.Context) {
	out, err := h.svc.For(c).Summary(filtersFromContext(c), c.Query("search"))
	if err != nil {
		response.Internal(c, err.Error())
		return
	}
	response.OK(c, out, "ok")
}

func (h *Handler) Show(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	item, err := h.svc.For(c).Get(uint(id))
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
	item, err := h.svc.For(c).Create(req)
	if err != nil {
		failWrite(c, err)
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
	item, err := h.svc.For(c).Update(uint(id), req)
	if err != nil {
		failWrite(c, err)
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
	item, err := h.svc.For(c).UpdateStock(uint(id), req.StokAktual)
	if err != nil {
		failWrite(c, err)
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
