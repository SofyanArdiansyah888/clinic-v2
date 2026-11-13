package penjualan

import (
	"fmt"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/scaleup/clinic-v2/api/internal/modules/barang"
	"github.com/scaleup/clinic-v2/api/internal/modules/finance"
	"github.com/scaleup/clinic-v2/api/internal/modules/treatment"
	"github.com/scaleup/clinic-v2/api/internal/modules/warehouse"
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

type DetailInput struct {
	BarangID       uint    `json:"barang_id"`
	TreatmentID    uint    `json:"treatment_id"`
	JenisPenjualan string  `json:"jenis_penjualan"`
	Qty            int     `json:"qty" binding:"required"`
	HargaJual      float64 `json:"harga_jual"`
}

type UpsertRequest struct {
	PasienID        uint          `json:"pasien_id" binding:"required"`
	StaffID         uint          `json:"staff_id" binding:"required"`
	PerawatanID     *uint         `json:"perawatan_id"`
	AntrianID       *uint         `json:"antrian_id"`
	Tanggal         string        `json:"tanggal" binding:"required"`
	NoInvoice       string        `json:"no_invoice"`
	Status          string        `json:"status"`
	Keterangan      string        `json:"keterangan"`
	JenisPembayaran string        `json:"jenis_pembayaran"`
	BankID          *uint         `json:"bank_id"`
	JumlahBayar     float64       `json:"jumlah_bayar"`
	IsActive        *bool         `json:"is_active"`
	Details         []DetailInput `json:"details" binding:"required,min=1"`
}

type StatusRequest struct {
	Status          string  `json:"status" binding:"required"`
	JenisPembayaran string  `json:"jenis_pembayaran"`
	BankID          *uint   `json:"bank_id"`
	JumlahBayar     float64 `json:"jumlah_bayar"`
}

type ListFilters struct {
	Status     string
	Tanggal    string
	PasienID   uint
	Keterangan string
}

type Handler struct{ svc *Service }

func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

func parseDate(s string) (time.Time, error) {
	if t, err := time.Parse("2006-01-02", s); err == nil {
		return t, nil
	}
	return time.Parse(time.RFC3339, s)
}

func filtersFromContext(c *gin.Context) ListFilters {
	var pasienID uint
	if v := c.Query("pasien_id"); v != "" {
		if id, err := strconv.ParseUint(v, 10, 64); err == nil {
			pasienID = uint(id)
		}
	}
	return ListFilters{
		Status:     c.Query("status"),
		Tanggal:    c.Query("tanggal"),
		PasienID:   pasienID,
		Keterangan: c.Query("keterangan"),
	}
}

func applyListFilters(q *gorm.DB, f ListFilters) *gorm.DB {
	if f.Status != "" {
		q = q.Where("status = ?", f.Status)
	}
	if f.Tanggal != "" {
		q = q.Where("tanggal = ?", f.Tanggal)
	}
	if f.PasienID > 0 {
		q = q.Where("pasien_id = ?", f.PasienID)
	}
	if f.Keterangan != "" {
		q = q.Where("keterangan ILIKE ?", "%"+f.Keterangan+"%")
	}
	return q
}

func (s *Service) List(p pagination.Params, f ListFilters) ([]Penjualan, pagination.Meta, error) {
	q := s.repo.db.Model(&Penjualan{}).Preload("Pasien").Preload("Staff").Preload("Bank").Preload("Details.Treatment")
	q = applyListFilters(q, f)
	if p.Search != "" {
		like := "%" + p.Search + "%"
		q = q.Where("kode ILIKE ? OR no_invoice ILIKE ? OR status ILIKE ?", like, like, like)
	}
	var items []Penjualan
	meta, err := pagination.Paginate(q, p, &items)
	return items, meta, err
}

func (s *Service) Get(id uint) (*Penjualan, error) {
	var item Penjualan
	if err := s.repo.db.Preload("Pasien").Preload("Staff").Preload("Bank").
		Preload("Details.Treatment").First(&item, id).Error; err != nil {
		return nil, err
	}
	return &item, nil
}

func (s *Service) Create(req UpsertRequest) (*Penjualan, error) {
	var createdID uint
	err := s.repo.db.Transaction(func(tx *gorm.DB) error {
		item, err := s.CreateTx(tx, req)
		if err != nil {
			return err
		}
		createdID = item.ID
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.Get(createdID)
}

// CreateTx creates a penjualan with its details inside the caller's transaction,
// taking barang stock out and writing kartu stok rows.
func (s *Service) CreateTx(tx *gorm.DB, req UpsertRequest) (*Penjualan, error) {
	kode, err := s.gen.Generate("PJL")
	if err != nil {
		return nil, err
	}
	tanggal, err := parseDate(req.Tanggal)
	if err != nil {
		return nil, err
	}
	status := req.Status
	if status == "" {
		status = "confirmed"
	}
	noInvoice := req.NoInvoice
	if noInvoice == "" {
		noInvoice = kode
	}

	var total float64
	item := &Penjualan{
		Kode: kode, PasienID: req.PasienID, StaffID: req.StaffID,
		PerawatanID: req.PerawatanID, AntrianID: req.AntrianID,
		Tanggal: tanggal, NoInvoice: noInvoice, Status: status,
		Keterangan: req.Keterangan, JenisPembayaran: req.JenisPembayaran,
		BankID: req.BankID, JumlahBayar: req.JumlahBayar, IsActive: true,
	}
	if req.IsActive != nil {
		item.IsActive = *req.IsActive
	}
	if err := tx.Create(item).Error; err != nil {
		return nil, err
	}

	for i, d := range req.Details {
		jenis := d.JenisPenjualan
		if jenis == "" {
			if d.TreatmentID > 0 {
				jenis = "treatment"
			} else {
				jenis = "barang"
			}
		}

		harga := d.HargaJual
		subtotal := harga * float64(d.Qty)
		detailKode := fmt.Sprintf("%s-D%03d", kode, i+1)
		detail := PenjualanDetail{
			Kode: detailKode, PenjualanID: item.ID,
			JenisPenjualan: jenis, Qty: d.Qty, HargaJual: harga, Subtotal: subtotal, IsActive: true,
		}

		if jenis == "treatment" {
			if d.TreatmentID == 0 {
				return nil, fmt.Errorf("treatment_id required for treatment detail")
			}
			var tr treatment.Treatment
			if err := tx.First(&tr, d.TreatmentID).Error; err != nil {
				return nil, err
			}
			if harga == 0 {
				harga = tr.Harga
				subtotal = harga * float64(d.Qty)
				detail.HargaJual = harga
				detail.Subtotal = subtotal
			}
			tid := d.TreatmentID
			detail.TreatmentID = &tid
		} else if jenis == "layanan" {
			if harga == 0 {
				return nil, fmt.Errorf("harga_jual required for layanan detail")
			}
		} else {
			if d.BarangID == 0 {
				return nil, fmt.Errorf("barang_id required for barang detail")
			}
			var b barang.Barang
			if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&b, d.BarangID).Error; err != nil {
				return nil, err
			}
			if b.StokAktual < d.Qty {
				return nil, fmt.Errorf("stok %s (%s) tidak cukup: tersedia %d, dibutuhkan %d", b.Nama, b.Kode, b.StokAktual, d.Qty)
			}
			if harga == 0 {
				harga = b.HargaJual
				subtotal = harga * float64(d.Qty)
				detail.HargaJual = harga
				detail.Subtotal = subtotal
			}
			bid := d.BarangID
			detail.BarangID = &bid
			newStok := b.StokAktual - d.Qty
			if err := tx.Model(&b).Update("stok_aktual", newStok).Error; err != nil {
				return nil, err
			}
			kstKode, err := s.gen.Generate("KST")
			if err != nil {
				return nil, err
			}
			ks := warehouse.KartuStok{
				Kode: kstKode, BarangID: b.ID, Tanggal: tanggal,
				Keterangan: "Penjualan " + kode, QtyMasuk: 0, QtyKeluar: d.Qty,
				Saldo: newStok, Referensi: kode, IsActive: true,
			}
			if err := tx.Create(&ks).Error; err != nil {
				return nil, err
			}
		}

		total += subtotal
		if err := tx.Create(&detail).Error; err != nil {
			return nil, err
		}
	}
	if err := tx.Model(item).Update("total_harga", total).Error; err != nil {
		return nil, err
	}
	return item, nil
}

func (s *Service) UpdateStatus(id uint, req StatusRequest) (*Penjualan, error) {
	item, err := s.Get(id)
	if err != nil {
		return nil, err
	}
	wasPaid := item.Status == "paid"
	item.Status = req.Status
	if req.JenisPembayaran != "" {
		item.JenisPembayaran = req.JenisPembayaran
	}
	if req.BankID != nil {
		item.BankID = req.BankID
	}
	if req.JumlahBayar > 0 {
		item.JumlahBayar = req.JumlahBayar
	}
	err = s.repo.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Omit(clause.Associations).Save(item).Error; err != nil {
			return err
		}
		// Taking a paid sale out of paid undoes its journal.
		if wasPaid && item.Status != "paid" {
			return finance.Reverse(tx, s.gen, finance.SourcePenjualan, item.ID, time.Now(), "Pembatalan penjualan "+item.Kode)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.Get(id)
}

func (s *Service) Delete(id uint) error {
	return s.repo.db.Transaction(func(tx *gorm.DB) error {
		var item Penjualan
		if err := tx.First(&item, id).Error; err != nil {
			return err
		}
		if err := finance.Reverse(tx, s.gen, finance.SourcePenjualan, item.ID, time.Now(), "Hapus penjualan "+item.Kode); err != nil {
			return err
		}
		if err := tx.Where("penjualan_id = ?", id).Delete(&PenjualanDetail{}).Error; err != nil {
			return err
		}
		return tx.Delete(&Penjualan{}, id).Error
	})
}

func (h *Handler) Index(c *gin.Context) {
	items, meta, err := h.svc.List(pagination.FromContext(c), filtersFromContext(c))
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
		response.NotFound(c, "penjualan not found")
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
		response.BadRequest(c, "failed to create penjualan", err.Error())
		return
	}
	response.Created(c, item, "created")
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
	item, err := h.svc.UpdateStatus(uint(id), req)
	if err != nil {
		response.Internal(c, err.Error())
		return
	}
	response.OK(c, item, "status updated")
}

func RegisterRoutes(rg *gin.RouterGroup, db *gorm.DB, gen *generator.Service) {
	h := NewHandler(NewService(NewRepository(db), gen))
	g := rg.Group("/penjualan")
	{
		g.GET("", h.Index)
		g.POST("", h.Store)
		g.GET("/:id", h.Show)
		g.DELETE("/:id", h.Destroy)
		g.PATCH("/:id/status", h.UpdateStatus)
	}
}
