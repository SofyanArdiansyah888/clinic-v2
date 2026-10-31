package pembelian

import (
	"fmt"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/scaleup/clinic-v2/api/internal/modules/barang"
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
	BarangID  uint    `json:"barang_id" binding:"required"`
	Qty       int     `json:"qty" binding:"required,gt=0"`
	HargaBeli float64 `json:"harga_beli"`
}

type UpsertRequest struct {
	SupplierID uint          `json:"supplier_id" binding:"required"`
	StaffID    uint          `json:"staff_id" binding:"required"`
	Tanggal    string        `json:"tanggal" binding:"required"`
	NoInvoice  string        `json:"no_invoice"`
	Status     string        `json:"status"`
	Keterangan string        `json:"keterangan"`
	IsActive   *bool         `json:"is_active"`
	Details    []DetailInput `json:"details" binding:"required,min=1,dive"`
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

func (s *Service) List(p pagination.Params) ([]Pembelian, pagination.Meta, error) {
	q := s.repo.db.Model(&Pembelian{}).Preload("Supplier").Preload("Staff").Preload("Details.Barang")
	if p.Search != "" {
		like := "%" + p.Search + "%"
		q = q.Where("kode ILIKE ? OR no_invoice ILIKE ? OR status ILIKE ?", like, like, like)
	}
	var items []Pembelian
	meta, err := pagination.Paginate(q, p, &items)
	return items, meta, err
}

func (s *Service) Get(id uint) (*Pembelian, error) {
	var item Pembelian
	if err := s.repo.db.Preload("Supplier").Preload("Staff").Preload("Details.Barang").First(&item, id).Error; err != nil {
		return nil, err
	}
	return &item, nil
}

func (s *Service) Create(req UpsertRequest) (*Pembelian, error) {
	kode, err := s.gen.Generate("PBL")
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

	var createdID uint
	err = s.repo.db.Transaction(func(tx *gorm.DB) error {
		var total float64
		item := &Pembelian{
			Kode: kode, SupplierID: req.SupplierID, StaffID: req.StaffID, Tanggal: tanggal,
			NoInvoice: req.NoInvoice, Status: status, Keterangan: req.Keterangan, IsActive: true,
		}
		if req.IsActive != nil {
			item.IsActive = *req.IsActive
		}
		if err := tx.Create(item).Error; err != nil {
			return err
		}
		createdID = item.ID

		for i, d := range req.Details {
			var b barang.Barang
			if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&b, d.BarangID).Error; err != nil {
				return err
			}
			harga := d.HargaBeli
			if harga == 0 {
				harga = b.HargaBeli
			}
			subtotal := harga * float64(d.Qty)
			total += subtotal
			detailKode := fmt.Sprintf("%s-D%03d", kode, i+1)
			detail := PembelianDetail{
				Kode: detailKode, PembelianID: item.ID, BarangID: d.BarangID,
				Qty: d.Qty, HargaBeli: harga, Subtotal: subtotal, IsActive: true,
			}
			if err := tx.Create(&detail).Error; err != nil {
				return err
			}
			newStok := b.StokAktual + d.Qty
			if err := tx.Model(&b).Update("stok_aktual", newStok).Error; err != nil {
				return err
			}
			kstKode, err := s.gen.Generate("KST")
			if err != nil {
				return err
			}
			ks := warehouse.KartuStok{
				Kode: kstKode, BarangID: b.ID, Tanggal: tanggal,
				Keterangan: "Pembelian " + kode, QtyMasuk: d.Qty, QtyKeluar: 0,
				Saldo: newStok, Referensi: kode, IsActive: true,
			}
			if err := tx.Create(&ks).Error; err != nil {
				return err
			}
		}
		return tx.Model(item).Update("total_harga", total).Error
	})
	if err != nil {
		return nil, err
	}
	return s.Get(createdID)
}

func (s *Service) UpdateStatus(id uint, status string) (*Pembelian, error) {
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

// Delete removes the pembelian and takes its received stock back out. It fails
// when part of that stock has already been used.
func (s *Service) Delete(id uint) error {
	return s.repo.db.Transaction(func(tx *gorm.DB) error {
		var item Pembelian
		if err := tx.Preload("Details").First(&item, id).Error; err != nil {
			return err
		}
		for _, d := range item.Details {
			if err := warehouse.ApplyStockMove(tx, s.gen, d.BarangID, d.Qty, "keluar", item.Kode, "Hapus pembelian "+item.Kode, time.Now()); err != nil {
				return err
			}
		}
		if err := tx.Where("pembelian_id = ?", id).Delete(&PembelianDetail{}).Error; err != nil {
			return err
		}
		return tx.Delete(&item).Error
	})
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
		response.NotFound(c, "pembelian not found")
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
		response.BadRequest(c, err.Error(), nil)
		return
	}
	response.Created(c, item, "created")
}

func (h *Handler) Destroy(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	if err := h.svc.Delete(uint(id)); err != nil {
		response.BadRequest(c, err.Error(), nil)
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
	g := rg.Group("/pembelian")
	{
		g.GET("", h.Index)
		g.POST("", h.Store)
		g.GET("/:id", h.Show)
		g.DELETE("/:id", h.Destroy)
		g.PATCH("/:id/status", h.UpdateStatus)
	}
}
