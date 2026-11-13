package warehouse

import (
	"fmt"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/scaleup/clinic-v2/api/internal/modules/barang"
	"github.com/scaleup/clinic-v2/api/internal/modules/finance"
	"github.com/scaleup/clinic-v2/api/internal/platform/generator"
	"github.com/scaleup/clinic-v2/api/internal/platform/pagination"
	"github.com/scaleup/clinic-v2/api/internal/platform/response"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
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

type DetailIO struct {
	BarangID uint   `json:"barang_id" binding:"required"`
	Qty      int    `json:"qty" binding:"required,gt=0"`
	Tipe     string `json:"tipe" binding:"required,oneof=masuk keluar input output"`
}

type OpnameDetailInput struct {
	BarangID   uint   `json:"barang_id" binding:"required"`
	StokFisik  *int   `json:"stok_fisik" binding:"required,min=0"`
	Keterangan string `json:"keterangan"`
}

type HeaderRequest struct {
	Tanggal    string     `json:"tanggal" binding:"required"`
	Keterangan string     `json:"keterangan"`
	IsActive   *bool      `json:"is_active"`
	Details    []DetailIO `json:"details" binding:"required,min=1,dive"`
}

type OpnameRequest struct {
	Tanggal    string              `json:"tanggal" binding:"required"`
	Keterangan string              `json:"keterangan"`
	IsActive   *bool               `json:"is_active"`
	Details    []OpnameDetailInput `json:"details" binding:"required,min=1,dive"`
}

type Handler struct{ svc *Service }

func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

func parseDate(s string) (time.Time, error) {
	if t, err := time.Parse("2006-01-02", s); err == nil {
		return t, nil
	}
	return time.Parse(time.RFC3339, s)
}

func (s *Service) applyStockMove(tx *gorm.DB, barangID uint, qty int, tipe, referensi, ket string, tanggal time.Time) error {
	return ApplyStockMove(tx, s.gen, barangID, qty, tipe, referensi, ket, tanggal)
}

func isMasuk(tipe string) bool { return tipe == "input" || tipe == "masuk" }

func balik(tipe string) string {
	if isMasuk(tipe) {
		return "keluar"
	}
	return "masuk"
}

// ApplyStockMove changes a barang's stock and records the movement in kartu stok.
// It refuses to take stock below zero.
func ApplyStockMove(tx *gorm.DB, gen *generator.Service, barangID uint, qty int, tipe, referensi, ket string, tanggal time.Time) error {
	var b barang.Barang
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&b, barangID).Error; err != nil {
		return fmt.Errorf("barang #%d tidak ditemukan", barangID)
	}
	masuk, keluar := 0, 0
	newStok := b.StokAktual
	if isMasuk(tipe) {
		masuk = qty
		newStok += qty
	} else {
		keluar = qty
		if b.StokAktual < qty {
			return fmt.Errorf("stok %s (%s) tidak cukup: tersedia %d, dibutuhkan %d", b.Nama, b.Kode, b.StokAktual, qty)
		}
		newStok -= qty
	}
	if err := tx.Model(&b).Update("stok_aktual", newStok).Error; err != nil {
		return err
	}
	kstKode, err := gen.Generate("KST")
	if err != nil {
		return err
	}
	return tx.Create(&KartuStok{
		Kode: kstKode, BarangID: barangID, Tanggal: tanggal, Keterangan: ket,
		QtyMasuk: masuk, QtyKeluar: keluar, Saldo: newStok, Referensi: referensi, IsActive: true,
	}).Error
}

// ── Konversi Stok ──

func (s *Service) ListKonversi(p pagination.Params) ([]KonversiStok, pagination.Meta, error) {
	q := s.repo.db.Model(&KonversiStok{}).Preload("Details.Barang")
	if p.Search != "" {
		like := "%" + p.Search + "%"
		q = q.Where("kode ILIKE ? OR keterangan ILIKE ?", like, like)
	}
	var items []KonversiStok
	meta, err := pagination.Paginate(q, p, &items)
	return items, meta, err
}

func (s *Service) GetKonversi(id uint) (*KonversiStok, error) {
	var item KonversiStok
	if err := s.repo.db.Preload("Details.Barang").First(&item, id).Error; err != nil {
		return nil, err
	}
	return &item, nil
}

func (s *Service) CreateKonversi(req HeaderRequest) (*KonversiStok, error) {
	kode, err := s.gen.Generate("KVS")
	if err != nil {
		return nil, err
	}
	tanggal, err := parseDate(req.Tanggal)
	if err != nil {
		return nil, err
	}
	var id uint
	err = s.repo.db.Transaction(func(tx *gorm.DB) error {
		item := &KonversiStok{Kode: kode, Tanggal: tanggal, Keterangan: req.Keterangan, IsActive: true}
		if req.IsActive != nil {
			item.IsActive = *req.IsActive
		}
		if err := tx.Create(item).Error; err != nil {
			return err
		}
		id = item.ID
		for i, d := range req.Details {
			dk := fmt.Sprintf("%s-D%03d", kode, i+1)
			if err := tx.Create(&KonversiStokDetail{
				Kode: dk, KonversiStokID: item.ID, BarangID: d.BarangID, Qty: d.Qty, Tipe: d.Tipe, IsActive: true,
			}).Error; err != nil {
				return err
			}
			if err := s.applyStockMove(tx, d.BarangID, d.Qty, d.Tipe, kode, "Konversi "+kode, tanggal); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.GetKonversi(id)
}

// DeleteKonversi removes the document and reverses its stock movements.
func (s *Service) DeleteKonversi(id uint) error {
	return s.repo.db.Transaction(func(tx *gorm.DB) error {
		var item KonversiStok
		if err := tx.Preload("Details").First(&item, id).Error; err != nil {
			return err
		}
		for _, d := range item.Details {
			if err := s.applyStockMove(tx, d.BarangID, d.Qty, balik(d.Tipe), item.Kode, "Hapus konversi "+item.Kode, time.Now()); err != nil {
				return err
			}
		}
		if err := tx.Where("konversi_stok_id = ?", id).Delete(&KonversiStokDetail{}).Error; err != nil {
			return err
		}
		return tx.Delete(&item).Error
	})
}

// ── Produksi Barang ──

func (s *Service) ListProduksi(p pagination.Params) ([]ProduksiBarang, pagination.Meta, error) {
	q := s.repo.db.Model(&ProduksiBarang{}).Preload("Details.Barang")
	if p.Search != "" {
		like := "%" + p.Search + "%"
		q = q.Where("kode ILIKE ? OR keterangan ILIKE ?", like, like)
	}
	var items []ProduksiBarang
	meta, err := pagination.Paginate(q, p, &items)
	return items, meta, err
}

func (s *Service) GetProduksi(id uint) (*ProduksiBarang, error) {
	var item ProduksiBarang
	if err := s.repo.db.Preload("Details.Barang").First(&item, id).Error; err != nil {
		return nil, err
	}
	return &item, nil
}

func (s *Service) CreateProduksi(req HeaderRequest) (*ProduksiBarang, error) {
	kode, err := s.gen.Generate("PRB")
	if err != nil {
		return nil, err
	}
	tanggal, err := parseDate(req.Tanggal)
	if err != nil {
		return nil, err
	}
	var id uint
	err = s.repo.db.Transaction(func(tx *gorm.DB) error {
		item := &ProduksiBarang{Kode: kode, Tanggal: tanggal, Keterangan: req.Keterangan, IsActive: true}
		if req.IsActive != nil {
			item.IsActive = *req.IsActive
		}
		if err := tx.Create(item).Error; err != nil {
			return err
		}
		id = item.ID
		for i, d := range req.Details {
			dk := fmt.Sprintf("%s-D%03d", kode, i+1)
			if err := tx.Create(&ProduksiBarangDetail{
				Kode: dk, ProduksiBarangID: item.ID, BarangID: d.BarangID, Qty: d.Qty, Tipe: d.Tipe, IsActive: true,
			}).Error; err != nil {
				return err
			}
			if err := s.applyStockMove(tx, d.BarangID, d.Qty, d.Tipe, kode, "Produksi "+kode, tanggal); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.GetProduksi(id)
}

// DeleteProduksi removes the document and reverses its stock movements.
func (s *Service) DeleteProduksi(id uint) error {
	return s.repo.db.Transaction(func(tx *gorm.DB) error {
		var item ProduksiBarang
		if err := tx.Preload("Details").First(&item, id).Error; err != nil {
			return err
		}
		for _, d := range item.Details {
			if err := s.applyStockMove(tx, d.BarangID, d.Qty, balik(d.Tipe), item.Kode, "Hapus produksi "+item.Kode, time.Now()); err != nil {
				return err
			}
		}
		if err := tx.Where("produksi_barang_id = ?", id).Delete(&ProduksiBarangDetail{}).Error; err != nil {
			return err
		}
		return tx.Delete(&item).Error
	})
}

// ── Stok Opname ──

func (s *Service) ListOpname(p pagination.Params) ([]StokOpname, pagination.Meta, error) {
	q := s.repo.db.Model(&StokOpname{}).Preload("Details.Barang")
	if p.Search != "" {
		like := "%" + p.Search + "%"
		q = q.Where("kode ILIKE ? OR keterangan ILIKE ?", like, like)
	}
	var items []StokOpname
	meta, err := pagination.Paginate(q, p, &items)
	return items, meta, err
}

func (s *Service) GetOpname(id uint) (*StokOpname, error) {
	var item StokOpname
	if err := s.repo.db.Preload("Details.Barang").First(&item, id).Error; err != nil {
		return nil, err
	}
	return &item, nil
}

func (s *Service) CreateOpname(req OpnameRequest) (*StokOpname, error) {
	kode, err := s.gen.Generate("STO")
	if err != nil {
		return nil, err
	}
	tanggal, err := parseDate(req.Tanggal)
	if err != nil {
		return nil, err
	}
	var id uint
	err = s.repo.db.Transaction(func(tx *gorm.DB) error {
		item := &StokOpname{Kode: kode, Tanggal: tanggal, Keterangan: req.Keterangan, IsActive: true}
		if req.IsActive != nil {
			item.IsActive = *req.IsActive
		}
		if err := tx.Create(item).Error; err != nil {
			return err
		}
		id = item.ID
		var nilaiLebih, nilaiKurang float64
		for i, d := range req.Details {
			var b barang.Barang
			if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&b, d.BarangID).Error; err != nil {
				return err
			}
			// Stok sistem is read under lock here, not taken from the client, so the
			// selisih reflects movements that happened while the count was in progress.
			sistem := b.StokAktual
			fisik := *d.StokFisik
			selisih := fisik - sistem
			dk := fmt.Sprintf("%s-D%03d", kode, i+1)
			if err := tx.Create(&StokOpnameDetail{
				Kode: dk, StokOpnameID: item.ID, BarangID: d.BarangID,
				StokSistem: sistem, StokFisik: fisik, Selisih: selisih,
				Keterangan: d.Keterangan, IsActive: true,
			}).Error; err != nil {
				return err
			}
			if err := tx.Model(&b).Update("stok_aktual", fisik).Error; err != nil {
				return err
			}
			kstKode, err := s.gen.Generate("KST")
			if err != nil {
				return err
			}
			masuk, keluar := 0, 0
			if selisih > 0 {
				masuk = selisih
				nilaiLebih += float64(selisih) * b.HargaBeli
			} else if selisih < 0 {
				keluar = -selisih
				nilaiKurang += float64(-selisih) * b.HargaBeli
			}
			if err := tx.Create(&KartuStok{
				Kode: kstKode, BarangID: b.ID, Tanggal: tanggal, Keterangan: "Stok Opname " + kode,
				QtyMasuk: masuk, QtyKeluar: keluar, Saldo: fisik, Referensi: kode, IsActive: true,
			}).Error; err != nil {
				return err
			}
		}
		// Stock differences are valued at the barang's purchase price.
		_, err := finance.Post(tx, s.gen, finance.Entry{
			Tanggal: tanggal, SourceType: finance.SourceStokOpname, SourceID: item.ID, Referensi: kode,
			Keterangan: "Selisih stok opname " + kode,
			Lines: []finance.Line{
				finance.Debit(finance.KeyPersediaan, nilaiLebih),
				finance.Kredit(finance.KeyStokSelisihLebih, nilaiLebih),
				finance.Debit(finance.KeyStokSelisihKurang, nilaiKurang),
				finance.Kredit(finance.KeyPersediaan, nilaiKurang),
			},
		})
		return err
	})
	if err != nil {
		return nil, err
	}
	return s.GetOpname(id)
}

// DeleteOpname removes the document and undoes each adjustment (the selisih),
// leaving movements made after the opname in place.
func (s *Service) DeleteOpname(id uint) error {
	return s.repo.db.Transaction(func(tx *gorm.DB) error {
		var item StokOpname
		if err := tx.Preload("Details").First(&item, id).Error; err != nil {
			return err
		}
		if err := finance.Reverse(tx, s.gen, finance.SourceStokOpname, item.ID, time.Now(), "Hapus stok opname "+item.Kode); err != nil {
			return err
		}
		for _, d := range item.Details {
			if d.Selisih == 0 {
				continue
			}
			tipe, qty := "keluar", d.Selisih
			if d.Selisih < 0 {
				tipe, qty = "masuk", -d.Selisih
			}
			if err := s.applyStockMove(tx, d.BarangID, qty, tipe, item.Kode, "Hapus stok opname "+item.Kode, time.Now()); err != nil {
				return err
			}
		}
		if err := tx.Where("stok_opname_id = ?", id).Delete(&StokOpnameDetail{}).Error; err != nil {
			return err
		}
		return tx.Delete(&item).Error
	})
}

// ── Kartu Stok ──

type KartuStokFilter struct {
	BarangID uint
	Dari     string
	Sampai   string
}

func (s *Service) ListKartuStok(p pagination.Params, f KartuStokFilter) ([]KartuStok, pagination.Meta, error) {
	q := s.repo.db.Model(&KartuStok{}).Preload("Barang")
	if f.BarangID > 0 {
		q = q.Where("barang_id = ?", f.BarangID)
	}
	if f.Dari != "" {
		q = q.Where("tanggal >= ?", f.Dari)
	}
	if f.Sampai != "" {
		q = q.Where("tanggal <= ?", f.Sampai)
	}
	if p.Search != "" {
		like := "%" + p.Search + "%"
		q = q.Where("kode ILIKE ? OR keterangan ILIKE ? OR referensi ILIKE ?", like, like, like)
	}
	var items []KartuStok
	meta, err := pagination.Paginate(q, p, &items)
	return items, meta, err
}

func (s *Service) GetKartuStok(id uint) (*KartuStok, error) {
	var item KartuStok
	if err := s.repo.db.First(&item, id).Error; err != nil {
		return nil, err
	}
	return &item, nil
}

// ── Handlers ──

func (h *Handler) IndexKonversi(c *gin.Context) {
	items, meta, err := h.svc.ListKonversi(pagination.FromContext(c))
	if err != nil {
		response.Internal(c, err.Error())
		return
	}
	response.OKWithMeta(c, items, meta, "ok")
}

func (h *Handler) ShowKonversi(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	item, err := h.svc.GetKonversi(uint(id))
	if err != nil {
		response.NotFound(c, "konversi stok not found")
		return
	}
	response.OK(c, item, "ok")
}

func (h *Handler) StoreKonversi(c *gin.Context) {
	var req HeaderRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "validation failed", err.Error())
		return
	}
	item, err := h.svc.CreateKonversi(req)
	if err != nil {
		response.BadRequest(c, err.Error(), nil)
		return
	}
	response.Created(c, item, "created")
}

func (h *Handler) DestroyKonversi(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	if err := h.svc.DeleteKonversi(uint(id)); err != nil {
		response.BadRequest(c, err.Error(), nil)
		return
	}
	response.OK(c, nil, "deleted")
}

func (h *Handler) IndexProduksi(c *gin.Context) {
	items, meta, err := h.svc.ListProduksi(pagination.FromContext(c))
	if err != nil {
		response.Internal(c, err.Error())
		return
	}
	response.OKWithMeta(c, items, meta, "ok")
}

func (h *Handler) ShowProduksi(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	item, err := h.svc.GetProduksi(uint(id))
	if err != nil {
		response.NotFound(c, "produksi barang not found")
		return
	}
	response.OK(c, item, "ok")
}

func (h *Handler) StoreProduksi(c *gin.Context) {
	var req HeaderRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "validation failed", err.Error())
		return
	}
	item, err := h.svc.CreateProduksi(req)
	if err != nil {
		response.BadRequest(c, err.Error(), nil)
		return
	}
	response.Created(c, item, "created")
}

func (h *Handler) DestroyProduksi(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	if err := h.svc.DeleteProduksi(uint(id)); err != nil {
		response.BadRequest(c, err.Error(), nil)
		return
	}
	response.OK(c, nil, "deleted")
}

func (h *Handler) IndexOpname(c *gin.Context) {
	items, meta, err := h.svc.ListOpname(pagination.FromContext(c))
	if err != nil {
		response.Internal(c, err.Error())
		return
	}
	response.OKWithMeta(c, items, meta, "ok")
}

func (h *Handler) ShowOpname(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	item, err := h.svc.GetOpname(uint(id))
	if err != nil {
		response.NotFound(c, "stok opname not found")
		return
	}
	response.OK(c, item, "ok")
}

func (h *Handler) StoreOpname(c *gin.Context) {
	var req OpnameRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "validation failed", err.Error())
		return
	}
	item, err := h.svc.CreateOpname(req)
	if err != nil {
		response.BadRequest(c, err.Error(), nil)
		return
	}
	response.Created(c, item, "created")
}

func (h *Handler) DestroyOpname(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	if err := h.svc.DeleteOpname(uint(id)); err != nil {
		response.BadRequest(c, err.Error(), nil)
		return
	}
	response.OK(c, nil, "deleted")
}

func (h *Handler) IndexKartuStok(c *gin.Context) {
	barangID, _ := strconv.ParseUint(c.Query("barang_id"), 10, 64)
	items, meta, err := h.svc.ListKartuStok(pagination.FromContext(c), KartuStokFilter{
		BarangID: uint(barangID), Dari: c.Query("dari"), Sampai: c.Query("sampai"),
	})
	if err != nil {
		response.Internal(c, err.Error())
		return
	}
	response.OKWithMeta(c, items, meta, "ok")
}

func (h *Handler) ShowKartuStok(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	item, err := h.svc.GetKartuStok(uint(id))
	if err != nil {
		response.NotFound(c, "kartu stok not found")
		return
	}
	response.OK(c, item, "ok")
}

func RegisterRoutes(rg *gin.RouterGroup, db *gorm.DB, gen *generator.Service) {
	h := NewHandler(NewService(NewRepository(db), gen))

	ks := rg.Group("/konversi-stok")
	{
		ks.GET("", h.IndexKonversi)
		ks.POST("", h.StoreKonversi)
		ks.GET("/:id", h.ShowKonversi)
		ks.DELETE("/:id", h.DestroyKonversi)
	}
	pb := rg.Group("/produksi-barang")
	{
		pb.GET("", h.IndexProduksi)
		pb.POST("", h.StoreProduksi)
		pb.GET("/:id", h.ShowProduksi)
		pb.DELETE("/:id", h.DestroyProduksi)
	}
	so := rg.Group("/stok-opname")
	{
		so.GET("", h.IndexOpname)
		so.POST("", h.StoreOpname)
		so.GET("/:id", h.ShowOpname)
		so.DELETE("/:id", h.DestroyOpname)
	}
	kst := rg.Group("/kartu-stok")
	{
		kst.GET("", h.IndexKartuStok)
		kst.GET("/:id", h.ShowKartuStok)
	}
}
