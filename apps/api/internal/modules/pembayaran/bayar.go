package pembayaran

import (
	"errors"
	"fmt"
	"math"
	"strings"
	"time"

	"github.com/scaleup/clinic-v2/api/internal/modules/membership"
	"github.com/scaleup/clinic-v2/api/internal/modules/penjualan"
	"github.com/scaleup/clinic-v2/api/internal/modules/perawatan"
	"github.com/scaleup/clinic-v2/api/internal/modules/promo"
	"github.com/scaleup/clinic-v2/api/internal/modules/treatment"
	"github.com/scaleup/clinic-v2/api/internal/modules/voucher"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// NilaiPoin is the rupiah value of one membership point when redeemed at the cashier.
const NilaiPoin = 1.0

const (
	jenisTopUpDeposit     = "pembayaran_deposit"
	jenisPemakaianDeposit = "pemakaian_deposit"
)

var ErrSudahDibayar = errors.New("tagihan ini sudah dibayar")

type TagihanRequest struct {
	SourceType     string  `json:"source_type" binding:"required"`
	SourceID       uint    `json:"source_id" binding:"required"`
	PromoKode      string  `json:"promo_kode"`
	VoucherKode    string  `json:"voucher_kode"`
	PoinDipakai    int     `json:"poin_dipakai"`
	DepositDipakai float64 `json:"deposit_dipakai"`
}

type BayarRequest struct {
	TagihanRequest
	StaffID         uint    `json:"staff_id" binding:"required"`
	JenisPembayaran string  `json:"jenis_pembayaran"`
	BankID          *uint   `json:"bank_id"`
	JumlahBayar     float64 `json:"jumlah_bayar"`
	Tanggal         string  `json:"tanggal"`
}

type TagihanItem struct {
	Nama     string  `json:"nama"`
	Jenis    string  `json:"jenis"`
	Qty      int     `json:"qty"`
	Harga    float64 `json:"harga"`
	Subtotal float64 `json:"subtotal"`
}

type Tagihan struct {
	SourceType     string           `json:"source_type"`
	SourceID       uint             `json:"source_id"`
	Kode           string           `json:"kode"`
	PasienID       uint             `json:"pasien_id"`
	Items          []TagihanItem    `json:"items"`
	Subtotal       float64          `json:"subtotal"`
	Promo          *promo.Promo     `json:"promo,omitempty"`
	DiskonPromo    float64          `json:"diskon_promo"`
	Voucher        *voucher.Voucher `json:"voucher,omitempty"`
	DiskonVoucher  float64          `json:"diskon_voucher"`
	Total          float64          `json:"total"`
	MembershipID   *uint            `json:"membership_id"`
	PoinTersedia   int              `json:"poin_tersedia"`
	PoinDipakai    int              `json:"poin_dipakai"`
	NilaiPoin      float64          `json:"nilai_poin"`
	PotonganPoin   float64          `json:"potongan_poin"`
	SaldoDeposit   float64          `json:"saldo_deposit"`
	DepositDipakai float64          `json:"deposit_dipakai"`
	SisaBayar      float64          `json:"sisa_bayar"`

	// details are the penjualan lines to create for a perawatan bill.
	details []penjualan.DetailInput
	// reseps are the prescriptions billed with a perawatan.
	reseps []perawatan.PerawatanResep
}

func roundRp(v float64) float64 { return math.Round(v*100) / 100 }

// SaldoDeposit returns the pasien's general deposit balance: top-ups minus usage at the cashier.
func SaldoDeposit(db *gorm.DB, pasienID uint) (float64, error) {
	var saldo float64
	err := db.Model(&DepositTransaksi{}).
		Where("pasien_id = ? AND is_active = ?", pasienID, true).
		Select(`COALESCE(SUM(CASE WHEN jenis = ? THEN jumlah WHEN jenis = ? THEN -jumlah ELSE 0 END), 0)`,
			jenisTopUpDeposit, jenisPemakaianDeposit).
		Scan(&saldo).Error
	return saldo, err
}

func activeMembership(db *gorm.DB, pasienID uint) (*membership.Membership, error) {
	var mem membership.Membership
	err := db.Where("pasien_id = ? AND is_active = ?", pasienID, true).Order("id DESC").First(&mem).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &mem, nil
}

// HitungTagihan computes the bill without changing anything.
func (s *Service) HitungTagihan(req TagihanRequest) (*Tagihan, error) {
	return s.hitungTagihan(s.repo.db, req, false)
}

// hitungTagihan builds the bill for a source. With lock it takes row locks on the
// source and membership so a concurrent payment of the same bill has to wait.
func (s *Service) hitungTagihan(tx *gorm.DB, req TagihanRequest, lock bool) (*Tagihan, error) {
	q := tx
	if lock {
		// Session makes q safe to reuse; otherwise conditions from one query leak into the next.
		q = tx.Clauses(clause.Locking{Strength: "UPDATE"}).Session(&gorm.Session{})
	}
	t := &Tagihan{SourceType: strings.ToLower(req.SourceType), SourceID: req.SourceID, NilaiPoin: NilaiPoin}

	switch t.SourceType {
	case "penjualan":
		var pj penjualan.Penjualan
		if err := q.First(&pj, req.SourceID).Error; err != nil {
			return nil, fmt.Errorf("penjualan tidak ditemukan: %w", err)
		}
		if pj.Status == "paid" {
			return nil, ErrSudahDibayar
		}
		if pj.Status == "cancelled" {
			return nil, errors.New("penjualan sudah dibatalkan")
		}
		var details []penjualan.PenjualanDetail
		if err := tx.Preload("Barang").Preload("Treatment").Where("penjualan_id = ?", pj.ID).Find(&details).Error; err != nil {
			return nil, err
		}
		t.Kode, t.PasienID, t.Subtotal = pj.Kode, pj.PasienID, pj.TotalHarga
		for _, d := range details {
			nama := d.JenisPenjualan
			if d.Barang != nil {
				nama = d.Barang.Nama
			} else if d.Treatment != nil {
				nama = d.Treatment.Nama
			}
			t.Items = append(t.Items, TagihanItem{Nama: nama, Jenis: d.JenisPenjualan, Qty: d.Qty, Harga: d.HargaJual, Subtotal: d.Subtotal})
		}
	case "perawatan":
		var pw perawatan.Perawatan
		if err := q.First(&pw, req.SourceID).Error; err != nil {
			return nil, fmt.Errorf("perawatan tidak ditemukan: %w", err)
		}
		if pw.Status == "selesai" {
			return nil, ErrSudahDibayar
		}
		if pw.Status != "bayar" {
			return nil, fmt.Errorf("perawatan berstatus %q, belum dikirim ke kasir", pw.Status)
		}
		var paid int64
		if err := tx.Model(&penjualan.Penjualan{}).
			Where("perawatan_id = ? AND status = ?", pw.ID, "paid").Count(&paid).Error; err != nil {
			return nil, err
		}
		if paid > 0 {
			return nil, ErrSudahDibayar
		}
		if err := tx.Preload("Treatment").Where("perawatan_id = ?", pw.ID).Find(&pw.Tindakans).Error; err != nil {
			return nil, err
		}
		if err := tx.Preload("Barangs.Barang").Where("perawatan_id = ?", pw.ID).Find(&t.reseps).Error; err != nil {
			return nil, err
		}
		t.Kode, t.PasienID = pw.Kode, pw.PasienID
		t.details, t.Items = buildPerawatanBill(pw, t.reseps)
		for _, it := range t.Items {
			t.Subtotal += it.Subtotal
		}
	default:
		return nil, fmt.Errorf("source_type tidak dikenal: %s", req.SourceType)
	}

	t.Subtotal = roundRp(t.Subtotal)
	if t.Subtotal <= 0 {
		return nil, errors.New("tagihan tidak memiliki item yang dapat ditagihkan")
	}

	if kode := strings.TrimSpace(req.PromoKode); kode != "" {
		p, err := promo.NewService(promo.NewRepository(tx), s.gen).Validate(kode)
		if err != nil {
			return nil, err
		}
		t.Promo, t.DiskonPromo = p, roundRp(p.Potongan(t.Subtotal))
	}
	if kode := strings.TrimSpace(req.VoucherKode); kode != "" {
		v, err := voucher.NewService(voucher.NewRepository(tx), s.gen).Validate(kode, t.Subtotal)
		if err != nil {
			return nil, err
		}
		t.Voucher, t.DiskonVoucher = v, roundRp(v.Potongan(t.Subtotal-t.DiskonPromo))
	}
	t.Total = roundRp(t.Subtotal - t.DiskonPromo - t.DiskonVoucher)

	mem, err := activeMembership(q, t.PasienID)
	if err != nil {
		return nil, err
	}
	if mem != nil {
		id := mem.ID
		t.MembershipID, t.PoinTersedia = &id, mem.Points
	}
	if t.SaldoDeposit, err = SaldoDeposit(tx, t.PasienID); err != nil {
		return nil, err
	}

	if req.PoinDipakai < 0 || req.DepositDipakai < 0 {
		return nil, errors.New("poin dan deposit yang dipakai tidak boleh negatif")
	}
	if req.PoinDipakai > t.PoinTersedia {
		return nil, fmt.Errorf("poin tidak cukup: tersedia %d", t.PoinTersedia)
	}
	if req.DepositDipakai > t.SaldoDeposit+0.005 {
		return nil, fmt.Errorf("saldo deposit tidak cukup: tersedia Rp %.0f", t.SaldoDeposit)
	}
	t.PoinDipakai = req.PoinDipakai
	t.PotonganPoin = roundRp(float64(req.PoinDipakai) * NilaiPoin)
	t.DepositDipakai = roundRp(req.DepositDipakai)
	if t.PotonganPoin+t.DepositDipakai > t.Total+0.005 {
		return nil, errors.New("poin dan deposit yang dipakai melebihi total tagihan")
	}
	t.SisaBayar = roundRp(t.Total - t.PotonganPoin - t.DepositDipakai)
	return t, nil
}

// buildPerawatanBill turns tindakan and resep rows into penjualan details plus display items.
func buildPerawatanBill(pw perawatan.Perawatan, reseps []perawatan.PerawatanResep) ([]penjualan.DetailInput, []TagihanItem) {
	var details []penjualan.DetailInput
	var items []TagihanItem
	for _, t := range pw.Tindakans {
		qty := t.Jumlah
		if qty <= 0 {
			qty = 1
		}
		nama := "Layanan"
		if t.Treatment != nil {
			nama = t.Treatment.Nama
		}
		if t.TreatmentID > 0 {
			harga := t.Total / float64(qty)
			if harga == 0 {
				harga = t.Harga
			}
			details = append(details, penjualan.DetailInput{TreatmentID: t.TreatmentID, JenisPenjualan: "treatment", Qty: qty, HargaJual: harga})
			items = append(items, TagihanItem{Nama: nama, Jenis: "treatment", Qty: qty, Harga: harga, Subtotal: harga * float64(qty)})
		} else if t.Total > 0 {
			details = append(details, penjualan.DetailInput{JenisPenjualan: "layanan", Qty: qty, HargaJual: t.Total})
			items = append(items, TagihanItem{Nama: nama, Jenis: "layanan", Qty: qty, Harga: t.Total, Subtotal: t.Total * float64(qty)})
		}
	}
	if len(details) == 0 && pw.Biaya > 0 {
		jenis := "layanan"
		var tid uint
		if pw.TreatmentID != nil && *pw.TreatmentID > 0 {
			jenis, tid = "treatment", *pw.TreatmentID
		}
		nama := pw.Diagnosa
		if nama == "" {
			nama = "Biaya perawatan"
		}
		details = append(details, penjualan.DetailInput{TreatmentID: tid, JenisPenjualan: jenis, Qty: 1, HargaJual: pw.Biaya})
		items = append(items, TagihanItem{Nama: nama, Jenis: jenis, Qty: 1, Harga: pw.Biaya, Subtotal: pw.Biaya})
	}
	for _, r := range reseps {
		if r.Status == "batal" {
			continue
		}
		for _, b := range r.Barangs {
			if b.BarangID == 0 || b.Jumlah <= 0 {
				continue
			}
			// Stock is kept in whole units, so a fractional prescription takes a full unit.
			qty := int(math.Ceil(b.Jumlah))
			harga := b.Harga
			if harga == 0 && b.Barang != nil {
				harga = b.Barang.HargaJual
			}
			nama := b.NamaBarang
			if nama == "" && b.Barang != nil {
				nama = b.Barang.Nama
			}
			details = append(details, penjualan.DetailInput{BarangID: b.BarangID, JenisPenjualan: "barang", Qty: qty, HargaJual: harga})
			items = append(items, TagihanItem{Nama: nama, Jenis: "barang", Qty: qty, Harga: harga, Subtotal: harga * float64(qty)})
		}
	}
	return details, items
}

// Bayar settles a bill in one transaction: penjualan, discounts, points, deposit,
// resep stock out and perawatan/antrian status all commit or roll back together.
func (s *Service) Bayar(req BayarRequest) (*penjualan.Penjualan, error) {
	tanggal := req.Tanggal
	if tanggal == "" {
		tanggal = time.Now().Format("2006-01-02")
	}
	tgl, err := parseDate(tanggal)
	if err != nil {
		return nil, err
	}

	var penjualanID uint
	err = s.repo.db.Transaction(func(tx *gorm.DB) error {
		t, err := s.hitungTagihan(tx, req.TagihanRequest, true)
		if err != nil {
			return err
		}

		jenis := req.JenisPembayaran
		if t.SisaBayar > 0 {
			if jenis == "" {
				return errors.New("jenis pembayaran wajib dipilih")
			}
			if req.JumlahBayar+0.005 < t.SisaBayar {
				return fmt.Errorf("jumlah bayar kurang: sisa tagihan Rp %.0f", t.SisaBayar)
			}
		} else if jenis == "" {
			jenis = "deposit_poin"
		}
		jumlahBayar := req.JumlahBayar
		if t.SisaBayar == 0 {
			jumlahBayar = 0
		}

		var pj penjualan.Penjualan
		if t.SourceType == "perawatan" {
			pid := t.SourceID
			var pw perawatan.Perawatan
			if err := tx.Preload("Tindakans").First(&pw, pid).Error; err != nil {
				return err
			}
			created, err := penjualan.NewService(penjualan.NewRepository(tx), s.gen).CreateTx(tx, penjualan.UpsertRequest{
				PasienID: pw.PasienID, StaffID: req.StaffID, PerawatanID: &pid, AntrianID: pw.AntrianID,
				Tanggal: tanggal, Status: "paid", Keterangan: "Pembayaran perawatan " + pw.Kode,
				Details: t.details,
			})
			if err != nil {
				return err
			}
			pj = *created
			if err := s.finalizePerawatan(tx, &pw, t.reseps); err != nil {
				return err
			}
			if err := s.createPaketRecords(tx, &pw, req.StaffID, tgl); err != nil {
				return err
			}
		} else if err := tx.First(&pj, t.SourceID).Error; err != nil {
			return err
		}

		pj.Status = "paid"
		pj.StaffID = req.StaffID
		pj.JenisPembayaran = jenis
		pj.BankID = req.BankID
		pj.JumlahBayar = jumlahBayar
		pj.Kembalian = roundRp(math.Max(jumlahBayar-t.SisaBayar, 0))
		pj.DiskonPromo, pj.DiskonVoucher = t.DiskonPromo, t.DiskonVoucher
		pj.PoinDipakai, pj.DepositDipakai = t.PoinDipakai, t.DepositDipakai
		if t.Promo != nil {
			pj.PromoID = &t.Promo.ID
		}
		if t.Voucher != nil {
			pj.VoucherID = &t.Voucher.ID
		}
		if err := tx.Omit(clause.Associations).Save(&pj).Error; err != nil {
			return err
		}
		penjualanID = pj.ID

		if t.PoinDipakai > 0 {
			if err := tx.Model(&membership.Membership{}).Where("id = ?", *t.MembershipID).
				Update("points", gorm.Expr("points - ?", t.PoinDipakai)).Error; err != nil {
				return err
			}
		}
		if t.DepositDipakai > 0 {
			kode, err := s.gen.Generate("DPS")
			if err != nil {
				return err
			}
			if err := tx.Create(&DepositTransaksi{
				Kode: kode, PasienID: t.PasienID, StaffID: req.StaffID, Tanggal: tgl, Kwitansi: pj.NoInvoice,
				Jenis: jenisPemakaianDeposit, Jumlah: t.DepositDipakai, JenisPembayaran: "deposit",
				Keterangan: "Pemakaian deposit untuk " + pj.Kode, IsActive: true,
			}).Error; err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	var result penjualan.Penjualan
	if err := s.repo.db.Preload("Pasien").Preload("Staff").Preload("Bank").Preload("Details.Treatment").
		First(&result, penjualanID).Error; err != nil {
		return nil, err
	}
	return &result, nil
}

func (s *Service) createPaketRecords(tx *gorm.DB, pw *perawatan.Perawatan, staffID uint, tgl time.Time) error {
	for _, t := range pw.Tindakans {
		if t.TreatmentID == 0 {
			continue
		}
		var tr treatment.Treatment
		if err := tx.First(&tr, t.TreatmentID).Error; err != nil {
			continue
		}
		if !strings.Contains(strings.ToLower(tr.Kategori), "paket") {
			continue
		}
		sesi := tr.SesiPaket
		if sesi <= 0 {
			sesi = tr.Durasi
		}
		if sesi <= 0 {
			sesi = 1
		}
		kode, err := s.gen.Generate("PKT")
		if err != nil {
			return err
		}
		harga := t.Total
		if harga == 0 {
			harga = tr.Harga
		}
		paket := PaketPerawatan{
			Kode: kode, PasienID: pw.PasienID, TreatmentID: tr.ID, StaffID: staffID,
			TanggalBeli: tgl, TotalSesi: sesi, SisaSesi: sesi, HargaTotal: harga,
			Status: "aktif", IsActive: true,
		}
		if err := tx.Create(&paket).Error; err != nil {
			return err
		}
	}
	return nil
}

func (s *Service) finalizePerawatan(tx *gorm.DB, pw *perawatan.Perawatan, reseps []perawatan.PerawatanResep) error {
	if err := tx.Model(pw).Update("status", "selesai").Error; err != nil {
		return err
	}
	if pw.AntrianID != nil {
		if err := tx.Table("antrians").Where("id = ?", *pw.AntrianID).Update("status", "selesai").Error; err != nil {
			return err
		}
	}
	for _, r := range reseps {
		if r.Status == "batal" {
			continue
		}
		// Paid prescriptions wait at the depo to be handed over to the pasien.
		if err := tx.Model(&perawatan.PerawatanResep{}).Where("id = ?", r.ID).
			Update("status", perawatan.ResepStatusDibayar).Error; err != nil {
			return err
		}
	}
	return nil
}
