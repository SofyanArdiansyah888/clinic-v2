package pembayaran

import (
	"errors"
	"fmt"
	"github.com/scaleup/clinic-v2/api/internal/platform/actor"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/scaleup/clinic-v2/api/internal/modules/finance"
	"github.com/scaleup/clinic-v2/api/internal/modules/kasir"
	"github.com/scaleup/clinic-v2/api/internal/modules/membership"
	"github.com/scaleup/clinic-v2/api/internal/modules/paket"
	"github.com/scaleup/clinic-v2/api/internal/modules/penjualan"
	"github.com/scaleup/clinic-v2/api/internal/modules/perawatan"
	"github.com/scaleup/clinic-v2/api/internal/platform/branch"
	"github.com/scaleup/clinic-v2/api/internal/platform/filter"
	"github.com/scaleup/clinic-v2/api/internal/platform/generator"
	"github.com/scaleup/clinic-v2/api/internal/platform/middleware"
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
	cab  branch.Ctx
}

// For binds the service to the request's active branch.
func (s *Service) For(c *gin.Context) *Service {
	cp := *s
	cp.cab = branch.From(c)
	return &cp
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
	// UserID is the signed-in account (from the JWT), filled by the handler.
	UserID uint `json:"-"`
}

type BatalPaketRequest struct {
	Keterangan      string  `json:"keterangan"`
	Refund          float64 `json:"refund"`
	JenisPembayaran string  `json:"jenis_pembayaran"`
	BankID          *uint   `json:"bank_id"`
	Tanggal         string  `json:"tanggal"`
	// UserID is the signed-in account (from the JWT), filled by the handler.
	UserID uint `json:"-"`
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
	q := s.cab.Scope(s.repo.db.Model(&perawatan.Perawatan{}), "cabang_id").
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
	q := s.cab.Scope(s.repo.db.Model(&perawatan.Perawatan{}), "cabang_id").
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
	q := s.cab.Scope(s.repo.db.Model(&penjualan.Penjualan{}), "cabang_id").
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
	q := s.cab.Scope(s.repo.db.Model(&penjualan.Penjualan{}), "cabang_id").
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
	cabangID, err := s.cab.WriteID()
	if err != nil {
		return nil, err
	}
	kode, err := s.gen.GenerateCabang("DPS", cabangID)
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
			Kode: kode, CabangID: cabangID, PasienID: req.PasienID, StaffID: req.StaffID,
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
		// Deposit usage is not money at the counter; top-ups and member fees are.
		if item.Jenis != jenisPemakaianDeposit {
			if err := kasir.Catat(tx, req.UserID, cabangID, kasir.Mutasi{
				SourceType: kasir.SourceDeposit, SourceID: item.ID, Referensi: item.Kwitansi,
				JenisPembayaran: item.JenisPembayaran, BankID: item.BankID, Masuk: item.Jumlah,
				Keterangan: "Deposit " + item.Jenis + " " + item.Kode,
			}); err != nil {
				return err
			}
		}
		return s.jurnalDeposit(tx, item)
	})
	if err != nil {
		return nil, err
	}
	return s.GetDeposit(createdID)
}

// DefaultMemberTier is the tier a new member starts on; admin can change it later.
const DefaultMemberTier = "Silver"

// linkMembership creates or extends the pasien's membership for member payments.
// The tier is a membership level (Bronze/Silver/Gold/Platinum), never the payment type:
// registration starts on DefaultMemberTier and an extension keeps the current tier.
func (s *Service) linkMembership(tx *gorm.DB, req DepositRequest, item *DepositTransaksi) error {
	{
		jenis := strings.ToLower(req.Jenis)
		if strings.Contains(jenis, "member") {
			if strings.Contains(jenis, "perpanjangan") {
				var mem membership.Membership
				if err := tx.Where("pasien_id = ? AND is_active = ?", req.PasienID, true).
					Order("id DESC").First(&mem).Error; err == nil {
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
				Tipe: DefaultMemberTier, Points: int(req.Jumlah), IsActive: true,
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

// DepositFilter narrows the deposit & member log. Tanggal (a single day) is kept for
// older callers; Periode is the dari/sampai range the list page uses.
type DepositFilter struct {
	Jenis           string
	JenisPembayaran string
	Tanggal         string
	Periode         filter.DateRange
	PasienID        uint
}

func depositFilter(c *gin.Context) (DepositFilter, error) {
	r, err := filter.DateRangeFromContext(c)
	return DepositFilter{
		Jenis: c.Query("jenis"), JenisPembayaran: c.Query("jenis_pembayaran"), Tanggal: c.Query("tanggal"),
		Periode: r, PasienID: filter.UintQuery(c, "pasien_id"),
	}, err
}

func (s *Service) depositQuery(f DepositFilter, search string) *gorm.DB {
	q := s.cab.Scope(s.repo.db.Model(&DepositTransaksi{}), "cabang_id")
	if f.Jenis != "" {
		q = q.Where("jenis = ?", f.Jenis)
	}
	if f.JenisPembayaran != "" {
		q = q.Where("jenis_pembayaran = ?", f.JenisPembayaran)
	}
	if f.Tanggal != "" {
		q = q.Where("tanggal = ?", f.Tanggal)
	}
	q = f.Periode.Apply(q, "tanggal")
	if f.PasienID > 0 {
		q = q.Where("pasien_id = ?", f.PasienID)
	}
	if search != "" {
		like := "%" + search + "%"
		q = q.Where("kode ILIKE ? OR kwitansi ILIKE ? OR pasien_id IN (SELECT id FROM pasiens WHERE nama ILIKE ? OR kode ILIKE ?)", like, like, like, like)
	}
	return q
}

func (s *Service) ListDeposit(p pagination.Params, f DepositFilter) ([]DepositTransaksi, pagination.Meta, error) {
	q := s.depositQuery(f, p.Search).Preload("Pasien").Preload("Staff").Preload("Bank").Preload("Treatment")
	var items []DepositTransaksi
	meta, err := pagination.Paginate(q, p, &items)
	return items, meta, err
}

// DepositSummary totals the log for the overview cards: money received (every jenis
// except pemakaian_deposit), deposit used at the kasir, and member registrations/renewals.
type DepositSummary struct {
	Jumlah          int64   `json:"jumlah"`
	TotalMasuk      float64 `json:"total_masuk"`
	TotalPemakaian  float64 `json:"total_pemakaian"`
	TransaksiMember int64   `json:"transaksi_member"`
}

func (s *Service) DepositSummary(f DepositFilter, search string) (DepositSummary, error) {
	var out DepositSummary
	err := s.depositQuery(f, search).Select(`COUNT(*) AS jumlah,
		COALESCE(SUM(jumlah) FILTER (WHERE jenis <> 'pemakaian_deposit'), 0) AS total_masuk,
		COALESCE(SUM(jumlah) FILTER (WHERE jenis = 'pemakaian_deposit'), 0) AS total_pemakaian,
		COUNT(*) FILTER (WHERE jenis IN ('pendaftaran_member', 'perpanjangan_member')) AS transaksi_member`).
		Scan(&out).Error
	return out, err
}

func (s *Service) GetDeposit(id uint) (*DepositTransaksi, error) {
	var item DepositTransaksi
	if err := s.cab.Scope(s.repo.db, "cabang_id").Preload("Pasien").Preload("Staff").Preload("Bank").Preload("Treatment").
		First(&item, id).Error; err != nil {
		return nil, err
	}
	return &item, nil
}

// ListPaketSisa lists the active branch's packages that still have sessions, with
// their items and remaining value (the most that can be refunded).
func (s *Service) ListPaketSisa(p pagination.Params, pasienID uint) ([]PaketPerawatan, pagination.Meta, error) {
	q := s.cab.Scope(s.repo.db.Model(&PaketPerawatan{}), "cabang_id").
		Where("status = ? AND sisa_sesi > 0", paket.StatusAktif).
		Preload("Pasien").Preload("Staff").Preload("Treatment")
	if pasienID > 0 {
		q = q.Where("pasien_id = ?", pasienID)
	}
	if p.Search != "" {
		like := "%" + p.Search + "%"
		q = q.Where("kode ILIKE ? OR pasien_id IN (SELECT id FROM pasiens WHERE nama ILIKE ? OR kode ILIKE ?)", like, like, like)
	}
	items := []PaketPerawatan{}
	meta, err := pagination.Paginate(q, p, &items)
	if err != nil {
		return nil, meta, err
	}
	return items, meta, paket.Fill(s.repo.db, items)
}

// BatalPaket cancels a package and refunds at most the value of its unused sessions.
// For a package whose revenue is deferred the whole remaining value leaves
// paket.titipan: the refund goes out of kas and the part not refunded is revenue
// (pendapatan.paket_hangus). Packages sold before that keep the old refund journal.
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
		// Package first, then its items (both in id order), like the kasir does.
		if err := s.cab.Scope(tx, "cabang_id").Clauses(clause.Locking{Strength: "UPDATE"}).First(&item, id).Error; err != nil {
			return err
		}
		if item.Status == paket.StatusDibatalkan {
			return errors.New("paket sudah dibatalkan")
		}
		if err := paket.EnsureItems(tx, item.ID); err != nil {
			return err
		}
		var items []paket.Item
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("paket_perawatan_id = ?", item.ID).
			Order("id").Find(&items).Error; err != nil {
			return err
		}
		var nilaiSisa float64
		for _, it := range items {
			nilaiSisa += it.Sisa()
		}
		nilaiSisa = roundRp(nilaiSisa)
		// Only the unused sessions can be refunded.
		if req.Refund > nilaiSisa+0.005 {
			return fmt.Errorf("refund melebihi nilai sisa paket Rp %.0f (%d dari %d sesi)", nilaiSisa, item.SisaSesi, item.TotalSesi)
		}
		item.Status = paket.StatusDibatalkan
		item.KeteranganBatal = req.Keterangan
		item.Refund = req.Refund
		if err := tx.Omit(clause.Associations).Save(&item).Error; err != nil {
			return err
		}
		if req.Refund > 0 {
			if err := kasir.Catat(tx, req.UserID, item.CabangID, kasir.Mutasi{
				SourceType: kasir.SourcePaketRefund, SourceID: item.ID, Referensi: item.Kode,
				JenisPembayaran: req.JenisPembayaran, BankID: req.BankID, Keluar: req.Refund,
				Keterangan: "Refund batal paket " + item.Kode,
			}); err != nil {
				return err
			}
		}
		lines := []finance.Line{
			finance.Debit(finance.KeyPaketRefund, req.Refund),
			finance.Kredit(finance.KasKey(tx, req.JenisPembayaran, req.BankID), req.Refund),
		}
		if item.PendapatanDitunda {
			lines = []finance.Line{
				finance.Debit(finance.KeyPaketTitipan, nilaiSisa),
				finance.Kredit(finance.KasKey(tx, req.JenisPembayaran, req.BankID), req.Refund),
				finance.Kredit(finance.KeyPaketHangus, nilaiSisa-req.Refund),
			}
		}
		_, err := finance.Post(tx, s.gen, finance.Entry{
			Tanggal: tgl, SourceType: finance.SourcePaket, SourceID: item.ID, Referensi: item.Kode,
			Keterangan: "Batal paket " + item.Kode, Lines: lines,
		})
		return err
	})
	if err != nil {
		return nil, err
	}
	return paket.Load(s.repo.db, id)
}

func (h *Handler) PerawatanReguler(c *gin.Context) {
	items, meta, err := h.svc.For(c).ListPerawatanReguler(pagination.FromContext(c))
	if err != nil {
		response.Internal(c, err.Error())
		return
	}
	response.OKWithMeta(c, items, meta, "ok")
}

func (h *Handler) PerawatanPaket(c *gin.Context) {
	items, meta, err := h.svc.For(c).ListPerawatanPaket(pagination.FromContext(c))
	if err != nil {
		response.Internal(c, err.Error())
		return
	}
	response.OKWithMeta(c, items, meta, "ok")
}

func (h *Handler) ProdukLangsung(c *gin.Context) {
	items, meta, err := h.svc.For(c).ListProdukLangsung(pagination.FromContext(c))
	if err != nil {
		response.Internal(c, err.Error())
		return
	}
	response.OKWithMeta(c, items, meta, "ok")
}

func (h *Handler) ProdukOnline(c *gin.Context) {
	items, meta, err := h.svc.For(c).ListProdukOnline(pagination.FromContext(c))
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
	if !actor.OwnStaff(c, h.svc.repo.db, &req.StaffID) {
		return
	}
	req.UserID = c.GetUint(middleware.ContextUserID)
	item, err := h.svc.For(c).Bayar(req)
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
	item, err := h.svc.For(c).HitungTagihan(req)
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
	f, err := depositFilter(c)
	if err != nil {
		response.BadRequest(c, err.Error(), nil)
		return
	}
	items, meta, err := h.svc.For(c).ListDeposit(pagination.FromContext(c), f)
	if err != nil {
		response.Internal(c, err.Error())
		return
	}
	response.OKWithMeta(c, items, meta, "ok")
}

func (h *Handler) DepositSummary(c *gin.Context) {
	f, err := depositFilter(c)
	if err != nil {
		response.BadRequest(c, err.Error(), nil)
		return
	}
	out, err := h.svc.For(c).DepositSummary(f, c.Query("search"))
	if err != nil {
		response.Internal(c, err.Error())
		return
	}
	response.OK(c, out, "ok")
}

func (h *Handler) Deposit(c *gin.Context) {
	var req DepositRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "validation failed", err.Error())
		return
	}
	if !actor.OwnStaff(c, h.svc.repo.db, &req.StaffID) {
		return
	}
	req.UserID = c.GetUint(middleware.ContextUserID)
	item, err := h.svc.For(c).CreateDeposit(req)
	if errors.Is(err, kasir.ErrBelumBuka) {
		response.BadRequest(c, err.Error(), nil)
		return
	}
	if err != nil {
		response.BadRequest(c, "deposit failed", err.Error())
		return
	}
	response.Created(c, item, "deposit recorded")
}

func (h *Handler) PaketSisa(c *gin.Context) {
	items, meta, err := h.svc.For(c).ListPaketSisa(pagination.FromContext(c), filter.UintQuery(c, "pasien_id"))
	if err != nil {
		response.Internal(c, err.Error())
		return
	}
	response.OKWithMeta(c, items, meta, "ok")
}

// PaketAktif lists the pasien's packages with sessions left, in every branch, for
// redeeming sessions on a perawatan.
func (h *Handler) PaketAktif(c *gin.Context) {
	pasienID := filter.UintQuery(c, "pasien_id")
	if pasienID == 0 {
		response.BadRequest(c, "pasien_id wajib diisi", nil)
		return
	}
	items, err := paket.Aktif(h.svc.repo.db, pasienID)
	if err != nil {
		response.Internal(c, err.Error())
		return
	}
	response.OK(c, items, "ok")
}

func (h *Handler) BatalPaket(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	var req BatalPaketRequest
	_ = c.ShouldBindJSON(&req)
	req.UserID = c.GetUint(middleware.ContextUserID)
	item, err := h.svc.For(c).BatalPaket(uint(id), req)
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
		g.GET("/deposit/summary", h.DepositSummary)
		g.POST("/deposit", h.Deposit)
		g.GET("/paket/sisa", h.PaketSisa)
		g.GET("/paket/aktif", h.PaketAktif)
		g.POST("/paket/:id/batal", h.BatalPaket)
		g.GET("/penjualan/:id/batal", h.DampakVoid)
		g.POST("/penjualan/:id/batal", h.VoidPenjualan)
	}
}
