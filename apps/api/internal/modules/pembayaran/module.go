package pembayaran

import (
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/scaleup/clinic-v2/api/internal/modules/finance"
	"github.com/scaleup/clinic-v2/api/internal/modules/membership"
	"github.com/scaleup/clinic-v2/api/internal/modules/penjualan"
	"github.com/scaleup/clinic-v2/api/internal/modules/perawatan"
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

type Handler struct{ svc *Service }

func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

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
	Keterangan      string  `json:"keterangan"`
	Refund          float64 `json:"refund"`
	JenisPembayaran string  `json:"jenis_pembayaran"`
	BankID          *uint   `json:"bank_id"`
	Tanggal         string  `json:"tanggal"`
}

type PerawatanQueueItem struct {
	ID         uint                          `json:"id"`
	Kode       string                        `json:"kode"`
	Tanggal    time.Time                     `json:"tanggal"`
	Status     string                        `json:"status"`
	Biaya      float64                       `json:"biaya"`
	Diagnosa   string                        `json:"diagnosa"`
	AntrianID  *uint                         `json:"antrian_id"`
	Pasien     interface{}                   `json:"pasien,omitempty"`
	Staff      interface{}                   `json:"staff,omitempty"`
	Tindakans  []perawatan.PerawatanTindakan `json:"tindakans,omitempty"`
	AntrianJam string                        `json:"antrian_jam,omitempty"`
	// Total is what the cashier will bill: tindakan plus resep, same as /pembayaran/tagihan before discounts.
	Total float64 `json:"total"`
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
		Where(`NOT (
			diagnosa ILIKE '%paket%' OR id IN (
				SELECT DISTINCT pt.perawatan_id FROM perawatan_tindakan pt
				INNER JOIN treatments t ON t.id = pt.treatment_id
				WHERE t.kategori ILIKE '%paket%'
			)
		)`).
		Preload("Pasien").Preload("Staff").Preload("Tindakans.Treatment").Preload("Reseps.Barangs.Barang")
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
		item := toQueueItem(r)
		if r.AntrianID != nil {
			var ant struct{ Jam string }
			s.repo.db.Table("antrians").Select("jam").Where("id = ?", *r.AntrianID).Scan(&ant)
			item.AntrianJam = ant.Jam
		}
		items = append(items, item)
	}
	return items, meta, nil
}

func toQueueItem(r perawatan.Perawatan) PerawatanQueueItem {
	item := PerawatanQueueItem{
		ID: r.ID, Kode: r.Kode, Tanggal: r.Tanggal, Status: r.Status,
		Biaya: r.Biaya, Diagnosa: r.Diagnosa, AntrianID: r.AntrianID,
		Pasien: r.Pasien, Staff: r.Staff, Tindakans: r.Tindakans,
	}
	_, lines := buildPerawatanBill(r, r.Reseps)
	for _, l := range lines {
		item.Total += l.Subtotal
	}
	return item
}

func (s *Service) ListPerawatanPaket(p pagination.Params) ([]PerawatanQueueItem, pagination.Meta, error) {
	q := s.repo.db.Model(&perawatan.Perawatan{}).
		Where("status = ?", "bayar").
		Where(`(
			diagnosa ILIKE '%paket%' OR id IN (
				SELECT DISTINCT pt.perawatan_id FROM perawatan_tindakan pt
				INNER JOIN treatments t ON t.id = pt.treatment_id
				WHERE t.kategori ILIKE '%paket%'
			)
		)`).
		Preload("Pasien").Preload("Staff").Preload("Tindakans.Treatment").Preload("Reseps.Barangs.Barang")
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
		items = append(items, toQueueItem(r))
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
		if err := s.linkMembership(tx, req, item); err != nil {
			return err
		}
		return s.jurnalDeposit(tx, item)
	})
	if err != nil {
		return nil, err
	}
	return s.GetDeposit(createdID)
}

// linkMembership creates or extends the pasien's membership for member payments.
func (s *Service) linkMembership(tx *gorm.DB, req DepositRequest, item *DepositTransaksi) error {
	{
		jenis := strings.ToLower(req.Jenis)
		if strings.Contains(jenis, "member") {
			if strings.Contains(jenis, "perpanjangan") {
				var mem membership.Membership
				if err := tx.Where("pasien_id = ? AND is_active = ?", req.PasienID, true).
					Order("id DESC").First(&mem).Error; err == nil {
					mem.Tipe = req.Jenis
					mem.Points += int(req.Jumlah)
					if err := tx.Save(&mem).Error; err != nil {
						return err
					}
					mid := mem.ID
					item.MembershipID = &mid
					return tx.Save(item).Error
				}
			}
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
	}
}

// jurnalDeposit books money received at the deposit counter: member fees are
// revenue, everything else is held for the pasien until used at the cashier.
func (s *Service) jurnalDeposit(tx *gorm.DB, item *DepositTransaksi) error {
	if item.Jumlah <= 0 {
		return nil
	}
	lawan := finance.KeyDepositTitipan
	if strings.Contains(strings.ToLower(item.Jenis), "member") {
		lawan = finance.KeyPendapatanMembership
	}
	_, err := finance.Post(tx, s.gen, finance.Entry{
		Tanggal: item.Tanggal, SourceType: finance.SourceDeposit, SourceID: item.ID, Referensi: item.Kwitansi,
		Keterangan: "Deposit " + item.Jenis + " " + item.Kode,
		Lines: []finance.Line{
			finance.Debit(finance.KasKey(tx, item.JenisPembayaran, item.BankID), item.Jumlah),
			finance.Kredit(lawan, item.Jumlah),
		},
	})
	return err
}

func (s *Service) ListDeposit(p pagination.Params, jenis, tanggal string, pasienID uint) ([]DepositTransaksi, pagination.Meta, error) {
	q := s.repo.db.Model(&DepositTransaksi{}).
		Preload("Pasien").Preload("Staff").Preload("Bank").Preload("Treatment")
	if jenis != "" {
		q = q.Where("jenis = ?", jenis)
	}
	if tanggal != "" {
		q = q.Where("tanggal = ?", tanggal)
	}
	if pasienID > 0 {
		q = q.Where("pasien_id = ?", pasienID)
	}
	if p.Search != "" {
		like := "%" + p.Search + "%"
		q = q.Where("kode ILIKE ? OR kwitansi ILIKE ?", like, like)
	}
	var items []DepositTransaksi
	meta, err := pagination.Paginate(q, p, &items)
	return items, meta, err
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
	if req.Refund < 0 {
		return nil, errors.New("refund tidak boleh negatif")
	}
	tgl := time.Now()
	if req.Tanggal != "" {
		t, err := parseDate(req.Tanggal)
		if err != nil {
			return nil, err
		}
		tgl = t
	}
	var item PaketPerawatan
	err := s.repo.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&item, id).Error; err != nil {
			return err
		}
		if item.Status == "dibatalkan" {
			return errors.New("paket sudah dibatalkan")
		}
		// Only the unused sessions can be refunded.
		maxRefund := item.HargaTotal
		if item.TotalSesi > 0 {
			maxRefund = roundRp(item.HargaTotal * float64(item.SisaSesi) / float64(item.TotalSesi))
		}
		if req.Refund > maxRefund+0.005 {
			return fmt.Errorf("refund melebihi nilai sisa paket Rp %.0f (%d dari %d sesi)", maxRefund, item.SisaSesi, item.TotalSesi)
		}
		item.Status = "dibatalkan"
		item.KeteranganBatal = req.Keterangan
		item.Refund = req.Refund
		if err := tx.Omit(clause.Associations).Save(&item).Error; err != nil {
			return err
		}
		if req.Refund == 0 {
			return nil
		}
		_, err := finance.Post(tx, s.gen, finance.Entry{
			Tanggal: tgl, SourceType: finance.SourcePaket, SourceID: item.ID, Referensi: item.Kode,
			Keterangan: "Refund batal paket " + item.Kode,
			Lines: []finance.Line{
				finance.Debit(finance.KeyPaketRefund, req.Refund),
				finance.Kredit(finance.KasKey(tx, req.JenisPembayaran, req.BankID), req.Refund),
			},
		})
		return err
	})
	if err != nil {
		return nil, err
	}
	s.repo.db.Preload("Pasien").Preload("Staff").Preload("Treatment").First(&item, id)
	return &item, nil
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
	if errors.Is(err, ErrSudahDibayar) {
		response.Fail(c, http.StatusConflict, err.Error(), nil)
		return
	}
	if err != nil {
		response.BadRequest(c, err.Error(), nil)
		return
	}
	response.OK(c, item, "payment completed")
}

func (h *Handler) Tagihan(c *gin.Context) {
	var req TagihanRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "validation failed", err.Error())
		return
	}
	item, err := h.svc.HitungTagihan(req)
	if errors.Is(err, ErrSudahDibayar) {
		response.Fail(c, http.StatusConflict, err.Error(), nil)
		return
	}
	if err != nil {
		response.BadRequest(c, err.Error(), nil)
		return
	}
	response.OK(c, item, "ok")
}

func (h *Handler) SaldoPasien(c *gin.Context) {
	pasienID, err := strconv.ParseUint(c.Query("pasien_id"), 10, 64)
	if err != nil || pasienID == 0 {
		response.BadRequest(c, "pasien_id wajib diisi", nil)
		return
	}
	saldo, err := SaldoDeposit(h.svc.repo.db, uint(pasienID))
	if err != nil {
		response.Internal(c, err.Error())
		return
	}
	mem, err := activeMembership(h.svc.repo.db, uint(pasienID))
	if err != nil {
		response.Internal(c, err.Error())
		return
	}
	out := gin.H{"saldo_deposit": saldo, "membership_id": nil, "poin": 0, "nilai_poin": NilaiPoin}
	if mem != nil {
		out["membership_id"], out["poin"] = mem.ID, mem.Points
	}
	response.OK(c, out, "ok")
}

func (h *Handler) ListDeposit(c *gin.Context) {
	var pasienID uint
	if v := c.Query("pasien_id"); v != "" {
		if id, err := strconv.ParseUint(v, 10, 64); err == nil {
			pasienID = uint(id)
		}
	}
	items, meta, err := h.svc.ListDeposit(pagination.FromContext(c), c.Query("jenis"), c.Query("tanggal"), pasienID)
	if err != nil {
		response.Internal(c, err.Error())
		return
	}
	response.OKWithMeta(c, items, meta, "ok")
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
		response.BadRequest(c, err.Error(), nil)
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
		g.POST("/tagihan", h.Tagihan)
		g.POST("/bayar", h.Bayar)
		g.GET("/deposit/saldo", h.SaldoPasien)
		g.GET("/deposit", h.ListDeposit)
		g.POST("/deposit", h.Deposit)
		g.GET("/paket/sisa", h.PaketSisa)
		g.POST("/paket/:id/batal", h.BatalPaket)
	}
}
