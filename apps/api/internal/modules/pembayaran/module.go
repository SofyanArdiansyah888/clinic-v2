package pembayaran

import (
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/scaleup/clinic-v2/api/internal/modules/membership"
	"github.com/scaleup/clinic-v2/api/internal/modules/penjualan"
	"github.com/scaleup/clinic-v2/api/internal/modules/perawatan"
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

type Handler struct{ svc *Service }

func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

type BayarRequest struct {
	SourceType      string  `json:"source_type" binding:"required"`
	SourceID        uint    `json:"source_id" binding:"required"`
	StaffID         uint    `json:"staff_id" binding:"required"`
	JenisPembayaran string  `json:"jenis_pembayaran" binding:"required"`
	BankID          *uint   `json:"bank_id"`
	JumlahBayar     float64 `json:"jumlah_bayar" binding:"required"`
	Tanggal         string  `json:"tanggal"`
}

type DepositRequest struct {
	PasienID        uint    `json:"pasien_id" binding:"required"`
	StaffID         uint    `json:"staff_id" binding:"required"`
	TreatmentID     *uint   `json:"treatment_id"`
	Tanggal         string  `json:"tanggal" binding:"required"`
	Kwitansi        string  `json:"kwitansi"`
	Jenis           string  `json:"jenis" binding:"required"`
	Jumlah          float64 `json:"jumlah" binding:"required"`
	JenisPembayaran string  `json:"jenis_pembayaran" binding:"required"`
	BankID          *uint   `json:"bank_id"`
	Keterangan      string  `json:"keterangan"`
}

type BatalPaketRequest struct {
	Keterangan string  `json:"keterangan"`
	Refund     float64 `json:"refund"`
}

type PerawatanQueueItem struct {
	ID         uint                   `json:"id"`
	Kode       string                 `json:"kode"`
	Tanggal    time.Time              `json:"tanggal"`
	Status     string                 `json:"status"`
	Biaya      float64                `json:"biaya"`
	Diagnosa   string                 `json:"diagnosa"`
	AntrianID  *uint                  `json:"antrian_id"`
	Pasien     interface{}            `json:"pasien,omitempty"`
	Staff      interface{}            `json:"staff,omitempty"`
	Tindakans  []perawatan.PerawatanTindakan `json:"tindakans,omitempty"`
	AntrianJam string                 `json:"antrian_jam,omitempty"`
}

func parseDate(s string) (time.Time, error) {
	if t, err := time.Parse("2006-01-02", s); err == nil {
		return t, nil
	}
	return time.Parse(time.RFC3339, s)
}

func (s *Service) ListPerawatanReguler(p pagination.Params) ([]PerawatanQueueItem, pagination.Meta, error) {
	q := s.repo.db.Model(&perawatan.Perawatan{}).
		Where("status = ?", "bayar").
		Where("(diagnosa NOT ILIKE ? OR diagnosa = '' OR diagnosa IS NULL)", "%paket%").
		Preload("Pasien").Preload("Staff").Preload("Tindakans")
	if p.Search != "" {
		like := "%" + p.Search + "%"
		q = q.Where("kode ILIKE ? OR diagnosa ILIKE ?", like, like)
	}
	var raw []perawatan.Perawatan
	meta, err := pagination.Paginate(q, p, &raw)
	if err != nil {
		return nil, meta, err
	}
	items := make([]PerawatanQueueItem, 0, len(raw))
	for _, r := range raw {
		item := PerawatanQueueItem{
			ID: r.ID, Kode: r.Kode, Tanggal: r.Tanggal, Status: r.Status,
			Biaya: r.Biaya, Diagnosa: r.Diagnosa, AntrianID: r.AntrianID,
			Pasien: r.Pasien, Staff: r.Staff, Tindakans: r.Tindakans,
		}
		if r.AntrianID != nil {
			var ant struct{ Jam string }
			s.repo.db.Table("antrians").Select("jam").Where("id = ?", *r.AntrianID).Scan(&ant)
			item.AntrianJam = ant.Jam
		}
		items = append(items, item)
	}
	return items, meta, nil
}

func (s *Service) ListPerawatanPaket(p pagination.Params) ([]PerawatanQueueItem, pagination.Meta, error) {
	q := s.repo.db.Model(&perawatan.Perawatan{}).
		Where("status = ?", "bayar").
		Where("diagnosa ILIKE ?", "%paket%").
		Preload("Pasien").Preload("Staff").Preload("Tindakans")
	if p.Search != "" {
		like := "%" + p.Search + "%"
		q = q.Where("kode ILIKE ? OR diagnosa ILIKE ?", like, like)
	}
	var raw []perawatan.Perawatan
	meta, err := pagination.Paginate(q, p, &raw)
	if err != nil {
		return nil, meta, err
	}
	items := make([]PerawatanQueueItem, 0, len(raw))
	for _, r := range raw {
		items = append(items, PerawatanQueueItem{
			ID: r.ID, Kode: r.Kode, Tanggal: r.Tanggal, Status: r.Status,
			Biaya: r.Biaya, Diagnosa: r.Diagnosa, AntrianID: r.AntrianID,
			Pasien: r.Pasien, Staff: r.Staff, Tindakans: r.Tindakans,
		})
	}
	return items, meta, nil
}

func (s *Service) ListProdukLangsung(p pagination.Params) ([]penjualan.Penjualan, pagination.Meta, error) {
	q := s.repo.db.Model(&penjualan.Penjualan{}).
		Where("status NOT IN ?", []string{"paid", "cancelled"}).
		Where("keterangan ILIKE ?", "%langsung%").
		Preload("Pasien").Preload("Staff").Preload("Details.Treatment")
	if p.Search != "" {
		like := "%" + p.Search + "%"
		q = q.Where("kode ILIKE ? OR no_invoice ILIKE ?", like, like)
	}
	var items []penjualan.Penjualan
	meta, err := pagination.Paginate(q, p, &items)
	return items, meta, err
}

func (s *Service) ListProdukOnline(p pagination.Params) ([]penjualan.Penjualan, pagination.Meta, error) {
	q := s.repo.db.Model(&penjualan.Penjualan{}).
		Where("status NOT IN ?", []string{"paid", "cancelled"}).
		Where("keterangan ILIKE ?", "%online%").
		Preload("Pasien").Preload("Staff").Preload("Details.Treatment")
	if p.Search != "" {
		like := "%" + p.Search + "%"
		q = q.Where("kode ILIKE ? OR no_invoice ILIKE ?", like, like)
	}
	var items []penjualan.Penjualan
	meta, err := pagination.Paginate(q, p, &items)
	return items, meta, err
}

func (s *Service) Bayar(req BayarRequest) (*penjualan.Penjualan, error) {
	tanggal := req.Tanggal
	if tanggal == "" {
		tanggal = time.Now().Format("2006-01-02")
	}

	switch strings.ToLower(req.SourceType) {
	case "penjualan":
		return s.bayarPenjualan(req)
	case "perawatan":
		return s.bayarPerawatan(req, tanggal)
	default:
		return nil, fmt.Errorf("unsupported source_type: %s", req.SourceType)
	}
}

func (s *Service) bayarPenjualan(req BayarRequest) (*penjualan.Penjualan, error) {
	var item penjualan.Penjualan
	if err := s.repo.db.First(&item, req.SourceID).Error; err != nil {
		return nil, err
	}
	item.Status = "paid"
	item.JenisPembayaran = req.JenisPembayaran
	item.BankID = req.BankID
	item.JumlahBayar = req.JumlahBayar
	if err := s.repo.db.Save(&item).Error; err != nil {
		return nil, err
	}
	var result penjualan.Penjualan
	s.repo.db.Preload("Pasien").Preload("Staff").Preload("Bank").Preload("Details.Treatment").
		First(&result, item.ID)
	return &result, nil
}

func (s *Service) bayarPerawatan(req BayarRequest, tanggal string) (*penjualan.Penjualan, error) {
	var pw perawatan.Perawatan
	if err := s.repo.db.Preload("Tindakans").First(&pw, req.SourceID).Error; err != nil {
		return nil, err
	}

	var existing penjualan.Penjualan
	if err := s.repo.db.Where("perawatan_id = ? AND status != ?", pw.ID, "cancelled").First(&existing).Error; err == nil {
		existing.Status = "paid"
		existing.JenisPembayaran = req.JenisPembayaran
		existing.BankID = req.BankID
		existing.JumlahBayar = req.JumlahBayar
		existing.StaffID = req.StaffID
		if err := s.repo.db.Save(&existing).Error; err != nil {
			return nil, err
		}
		if err := s.finalizePerawatan(&pw); err != nil {
			return nil, err
		}
		var result penjualan.Penjualan
		s.repo.db.Preload("Pasien").Preload("Staff").Preload("Bank").Preload("Details.Treatment").
			First(&result, existing.ID)
		return &result, nil
	}

	details := make([]penjualan.DetailInput, 0, len(pw.Tindakans))
	for _, t := range pw.Tindakans {
		details = append(details, penjualan.DetailInput{
			TreatmentID:    t.TreatmentID,
			JenisPenjualan: "treatment",
			Qty:            t.Jumlah,
			HargaJual:      t.Total / float64(max(t.Jumlah, 1)),
		})
	}
	if len(details) == 0 && pw.Biaya > 0 {
		details = append(details, penjualan.DetailInput{
			JenisPenjualan: "treatment",
			Qty:            1,
			HargaJual:      pw.Biaya,
		})
	}
	if len(details) == 0 {
		return nil, fmt.Errorf("perawatan has no billable items")
	}

	penSvc := penjualan.NewService(penjualan.NewRepository(s.repo.db), s.gen)
	pid := pw.ID
	aid := pw.AntrianID
	created, err := penSvc.Create(penjualan.UpsertRequest{
		PasienID:        pw.PasienID,
		StaffID:         req.StaffID,
		PerawatanID:     &pid,
		AntrianID:       aid,
		Tanggal:         tanggal,
		Status:          "paid",
		Keterangan:      "Pembayaran perawatan " + pw.Kode,
		JenisPembayaran: req.JenisPembayaran,
		BankID:          req.BankID,
		JumlahBayar:     req.JumlahBayar,
		Details:         details,
	})
	if err != nil {
		return nil, err
	}
	if err := s.finalizePerawatan(&pw); err != nil {
		return nil, err
	}
	return created, nil
}

func (s *Service) finalizePerawatan(pw *perawatan.Perawatan) error {
	return s.repo.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(pw).Update("status", "selesai").Error; err != nil {
			return err
		}
		if pw.AntrianID != nil {
			if err := tx.Table("antrians").Where("id = ?", *pw.AntrianID).Update("status", "selesai").Error; err != nil {
				return err
			}
		}
		return nil
	})
}

func (s *Service) CreateDeposit(req DepositRequest) (*DepositTransaksi, error) {
	kode, err := s.gen.Generate("DPS")
	if err != nil {
		return nil, err
	}
	tanggal, err := parseDate(req.Tanggal)
	if err != nil {
		return nil, err
	}
	kwitansi := req.Kwitansi
	if kwitansi == "" {
		kwitansi = kode
	}

	var createdID uint
	err = s.repo.db.Transaction(func(tx *gorm.DB) error {
		item := &DepositTransaksi{
			Kode: kode, PasienID: req.PasienID, StaffID: req.StaffID,
			TreatmentID: req.TreatmentID, Tanggal: tanggal, Kwitansi: kwitansi,
			Jenis: req.Jenis, Jumlah: req.Jumlah, JenisPembayaran: req.JenisPembayaran,
			BankID: req.BankID, Keterangan: req.Keterangan, IsActive: true,
		}
		if err := tx.Create(item).Error; err != nil {
			return err
		}
		createdID = item.ID

		jenis := strings.ToLower(req.Jenis)
		if strings.Contains(jenis, "member") {
			memKode, err := s.gen.Generate("MEM")
			if err != nil {
				return err
			}
			mem := membership.Membership{
				Kode: memKode, PasienID: req.PasienID,
				Tipe: req.Jenis, Points: int(req.Jumlah), IsActive: true,
			}
			if err := tx.Create(&mem).Error; err != nil {
				return err
			}
			mid := mem.ID
			item.MembershipID = &mid
			return tx.Save(item).Error
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.GetDeposit(createdID)
}

func (s *Service) GetDeposit(id uint) (*DepositTransaksi, error) {
	var item DepositTransaksi
	if err := s.repo.db.Preload("Pasien").Preload("Staff").Preload("Bank").Preload("Treatment").
		First(&item, id).Error; err != nil {
		return nil, err
	}
	return &item, nil
}

func (s *Service) ListPaketSisa(p pagination.Params) ([]PaketPerawatan, pagination.Meta, error) {
	q := s.repo.db.Model(&PaketPerawatan{}).
		Where("status = ? AND sisa_sesi > 0", "aktif").
		Preload("Pasien").Preload("Staff").Preload("Treatment")
	if p.Search != "" {
		like := "%" + p.Search + "%"
		q = q.Where("kode ILIKE ?", like)
	}
	var items []PaketPerawatan
	meta, err := pagination.Paginate(q, p, &items)
	return items, meta, err
}

func (s *Service) BatalPaket(id uint, req BatalPaketRequest) (*PaketPerawatan, error) {
	var item PaketPerawatan
	if err := s.repo.db.First(&item, id).Error; err != nil {
		return nil, err
	}
	item.Status = "dibatalkan"
	if err := s.repo.db.Save(&item).Error; err != nil {
		return nil, err
	}
	s.repo.db.Preload("Pasien").Preload("Staff").Preload("Treatment").First(&item, id)
	return &item, nil
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func (h *Handler) PerawatanReguler(c *gin.Context) {
	items, meta, err := h.svc.ListPerawatanReguler(pagination.FromContext(c))
	if err != nil {
		response.Internal(c, err.Error())
		return
	}
	response.OKWithMeta(c, items, meta, "ok")
}

func (h *Handler) PerawatanPaket(c *gin.Context) {
	items, meta, err := h.svc.ListPerawatanPaket(pagination.FromContext(c))
	if err != nil {
		response.Internal(c, err.Error())
		return
	}
	response.OKWithMeta(c, items, meta, "ok")
}

func (h *Handler) ProdukLangsung(c *gin.Context) {
	items, meta, err := h.svc.ListProdukLangsung(pagination.FromContext(c))
	if err != nil {
		response.Internal(c, err.Error())
		return
	}
	response.OKWithMeta(c, items, meta, "ok")
}

func (h *Handler) ProdukOnline(c *gin.Context) {
	items, meta, err := h.svc.ListProdukOnline(pagination.FromContext(c))
	if err != nil {
		response.Internal(c, err.Error())
		return
	}
	response.OKWithMeta(c, items, meta, "ok")
}

func (h *Handler) Bayar(c *gin.Context) {
	var req BayarRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "validation failed", err.Error())
		return
	}
	item, err := h.svc.Bayar(req)
	if err != nil {
		response.BadRequest(c, "payment failed", err.Error())
		return
	}
	response.OK(c, item, "payment completed")
}

func (h *Handler) Deposit(c *gin.Context) {
	var req DepositRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "validation failed", err.Error())
		return
	}
	item, err := h.svc.CreateDeposit(req)
	if err != nil {
		response.BadRequest(c, "deposit failed", err.Error())
		return
	}
	response.Created(c, item, "deposit recorded")
}

func (h *Handler) PaketSisa(c *gin.Context) {
	items, meta, err := h.svc.ListPaketSisa(pagination.FromContext(c))
	if err != nil {
		response.Internal(c, err.Error())
		return
	}
	response.OKWithMeta(c, items, meta, "ok")
}

func (h *Handler) BatalPaket(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	var req BatalPaketRequest
	_ = c.ShouldBindJSON(&req)
	item, err := h.svc.BatalPaket(uint(id), req)
	if err != nil {
		response.BadRequest(c, "cancellation failed", err.Error())
		return
	}
	response.OK(c, item, "package cancelled")
}

func RegisterRoutes(rg *gin.RouterGroup, db *gorm.DB, gen *generator.Service) {
	h := NewHandler(NewService(NewRepository(db), gen))
	g := rg.Group("/pembayaran")
	{
		g.GET("/perawatan/reguler", h.PerawatanReguler)
		g.GET("/perawatan/paket", h.PerawatanPaket)
		g.GET("/produk/langsung", h.ProdukLangsung)
		g.GET("/produk/online", h.ProdukOnline)
		g.POST("/bayar", h.Bayar)
		g.POST("/deposit", h.Deposit)
		g.GET("/paket/sisa", h.PaketSisa)
		g.POST("/paket/:id/batal", h.BatalPaket)
	}
}
