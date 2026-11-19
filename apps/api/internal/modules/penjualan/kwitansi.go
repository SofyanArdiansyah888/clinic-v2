package penjualan

import (
	"errors"
	"math"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/scaleup/clinic-v2/api/internal/modules/finance"
	"github.com/scaleup/clinic-v2/api/internal/modules/membership"
	"github.com/scaleup/clinic-v2/api/internal/modules/pengaturan"
	"github.com/scaleup/clinic-v2/api/internal/modules/promo"
	"github.com/scaleup/clinic-v2/api/internal/modules/voucher"
	"github.com/scaleup/clinic-v2/api/internal/platform/response"
	"gorm.io/gorm"
)

// ErrBelumLunas means a kwitansi was asked for a sale the cashier has not settled.
var ErrBelumLunas = errors.New("penjualan belum lunas; kwitansi hanya untuk transaksi yang sudah dibayar")

type KwitansiItem struct {
	Nama     string  `json:"nama"`
	Jenis    string  `json:"jenis"`
	Qty      int     `json:"qty"`
	Harga    float64 `json:"harga"`
	Subtotal float64 `json:"subtotal"`
}

// KwitansiPaket summarises a treatment package bought in this transaction.
type KwitansiPaket struct {
	Kode      string `json:"kode"`
	Nama      string `json:"nama"`
	TotalSesi int    `json:"total_sesi"`
	SisaSesi  int    `json:"sisa_sesi"`
	Status    string `json:"status"`
}

// Kwitansi is everything the receipt prints: the sale, how its total was reduced and
// paid, and the clinic identity and notes. Amounts are computed here so the receipt
// never re-derives cashier math in the browser.
type Kwitansi struct {
	ID              uint      `json:"id"`
	Kode            string    `json:"kode"`
	NoInvoice       string    `json:"no_invoice"`
	Tanggal         time.Time `json:"tanggal"`
	DibayarAt       time.Time `json:"dibayar_at"`
	Status          string    `json:"status"`
	Keterangan      string    `json:"keterangan"`
	PasienNama      string    `json:"pasien_nama"`
	PasienKode      string    `json:"pasien_kode"`
	PasienTelp      string    `json:"pasien_telp"`
	KasirNama       string    `json:"kasir_nama"`
	PerawatanKode   string    `json:"perawatan_kode"`
	JenisPembayaran string    `json:"jenis_pembayaran"`
	BankNama        string    `json:"bank_nama"`

	Items          []KwitansiItem `json:"items"`
	Subtotal       float64        `json:"subtotal"`
	PromoKode      string         `json:"promo_kode"`
	PromoNama      string         `json:"promo_nama"`
	DiskonPromo    float64        `json:"diskon_promo"`
	VoucherKode    string         `json:"voucher_kode"`
	VoucherNama    string         `json:"voucher_nama"`
	DiskonVoucher  float64        `json:"diskon_voucher"`
	Total          float64        `json:"total"`
	PoinDipakai    int            `json:"poin_dipakai"`
	PotonganPoin   float64        `json:"potongan_poin"`
	DepositDipakai float64        `json:"deposit_dipakai"`
	SisaBayar      float64        `json:"sisa_bayar"`
	JumlahBayar    float64        `json:"jumlah_bayar"`
	Kembalian      float64        `json:"kembalian"`

	// Paket lists packages bought here so the pasien sees their sessions on paper.
	Paket []KwitansiPaket `json:"paket"`
	// AlasanBatal is filled once a paid sale is voided (status cancelled).
	AlasanBatal string `json:"alasan_batal"`

	Klinik pengaturan.Klinik `json:"klinik"`
}

func round2(v float64) float64 { return math.Round(v*100) / 100 }

// dibayarAt returns when the cashier settled this sale: the time its penjualan journal
// was posted. A voided sale keeps that journal (plus its reversal), while a draft that
// was simply dropped never had one, so nil means it was never paid.
func dibayarAt(db *gorm.DB, id uint) (*time.Time, error) {
	var j finance.Jurnal
	err := db.Where("source_type = ? AND source_id = ? AND reversal_of_id IS NULL", finance.SourcePenjualan, id).
		Order("id").First(&j).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &j.CreatedAt, nil
}

func (s *Service) Kwitansi(id uint) (*Kwitansi, error) {
	db := s.repo.db
	var pj Penjualan
	if err := s.cab.Scope(db, "cabang_id").Preload("Pasien").Preload("Staff").Preload("Bank").Preload("Perawatan").
		Preload("Details", func(q *gorm.DB) *gorm.DB { return q.Order("id") }).
		Preload("Details.Treatment").Preload("Details.Barang").First(&pj, id).Error; err != nil {
		return nil, err
	}
	// Paid sales print normally; a voided one is reprinted with a DIBATALKAN stamp.
	if pj.Status != "paid" && pj.Status != "cancelled" {
		return nil, ErrBelumLunas
	}
	paidAt, err := dibayarAt(db, pj.ID)
	if err != nil {
		return nil, err
	}
	if paidAt == nil {
		return nil, ErrBelumLunas
	}

	k := &Kwitansi{
		ID: pj.ID, Kode: pj.Kode, NoInvoice: pj.NoInvoice, Tanggal: pj.Tanggal, DibayarAt: *paidAt,
		Status: pj.Status, Keterangan: pj.Keterangan, JenisPembayaran: pj.JenisPembayaran,
		Subtotal: round2(pj.TotalHarga), DiskonPromo: pj.DiskonPromo, DiskonVoucher: pj.DiskonVoucher,
		PoinDipakai: pj.PoinDipakai, DepositDipakai: pj.DepositDipakai,
		JumlahBayar: pj.JumlahBayar, Kembalian: pj.Kembalian, Items: []KwitansiItem{}, Paket: []KwitansiPaket{},
	}
	if pj.Pasien != nil {
		k.PasienNama, k.PasienKode, k.PasienTelp = pj.Pasien.Nama, pj.Pasien.Kode, pj.Pasien.NoTelp
	}
	if pj.Staff != nil {
		k.KasirNama = pj.Staff.Nama
	}
	if pj.Bank != nil {
		k.BankNama = pj.Bank.Nama
	}
	if pj.Perawatan != nil {
		k.PerawatanKode = pj.Perawatan.Kode
	}
	for _, d := range pj.Details {
		nama := "Layanan"
		if d.Barang != nil {
			nama = d.Barang.Nama
		} else if d.Treatment != nil {
			nama = d.Treatment.Nama
		}
		k.Items = append(k.Items, KwitansiItem{Nama: nama, Jenis: d.JenisPenjualan, Qty: d.Qty, Harga: d.HargaJual, Subtotal: d.Subtotal})
	}
	if pj.PromoID != nil {
		var p promo.Promo
		if db.First(&p, *pj.PromoID).Error == nil {
			k.PromoKode, k.PromoNama = p.Kode, p.Nama
		}
	}
	if pj.VoucherID != nil {
		var v voucher.Voucher
		if db.First(&v, *pj.VoucherID).Error == nil {
			k.VoucherKode, k.VoucherNama = v.Kode, v.Nama
		}
	}
	k.Total = round2(k.Subtotal - k.DiskonPromo - k.DiskonVoucher)
	k.PotonganPoin = round2(float64(k.PoinDipakai) * membership.NilaiPoin)
	k.SisaBayar = round2(math.Max(k.Total-k.PotonganPoin-k.DepositDipakai, 0))

	if k.Paket, err = s.paketRingkasan(&pj); err != nil {
		return nil, err
	}

	klinik, err := pengaturan.NewService(db).Get()
	if err != nil {
		return nil, err
	}
	k.Klinik = *klinik
	return k, nil
}

// paketRingkasan finds packages created when this perawatan was paid: same pasien,
// bought on the sale date, for a treatment billed on it.
// TODO(paket): switch to paket_perawatans.penjualan_id once packages record their sale.
func (s *Service) paketRingkasan(pj *Penjualan) ([]KwitansiPaket, error) {
	out := []KwitansiPaket{}
	if pj.PerawatanID == nil {
		return out, nil
	}
	var treatmentIDs []uint
	for _, d := range pj.Details {
		if d.TreatmentID != nil {
			treatmentIDs = append(treatmentIDs, *d.TreatmentID)
		}
	}
	if len(treatmentIDs) == 0 {
		return out, nil
	}
	err := s.repo.db.Table("paket_perawatans p").
		Select("p.kode, t.nama, p.total_sesi, p.sisa_sesi, p.status").
		Joins("JOIN treatments t ON t.id = p.treatment_id").
		Where("p.pasien_id = ? AND p.tanggal_beli = ? AND p.treatment_id IN ?", pj.PasienID, pj.Tanggal.Format("2006-01-02"), treatmentIDs).
		Order("p.id").Scan(&out).Error
	return out, err
}

func (h *Handler) Kwitansi(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	k, err := h.svc.For(c).Kwitansi(uint(id))
	if errors.Is(err, ErrBelumLunas) {
		response.Fail(c, http.StatusConflict, err.Error(), nil)
		return
	}
	if err != nil {
		fail(c, err)
		return
	}
	response.OK(c, k, "ok")
}
