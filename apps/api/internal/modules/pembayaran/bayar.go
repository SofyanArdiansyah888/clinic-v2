package pembayaran

import (
	"errors"
	"fmt"
	"math"
	"strings"
	"time"

	"github.com/scaleup/clinic-v2/api/internal/modules/finance"
	"github.com/scaleup/clinic-v2/api/internal/modules/kasir"
	"github.com/scaleup/clinic-v2/api/internal/modules/membership"
	"github.com/scaleup/clinic-v2/api/internal/modules/paket"
	"github.com/scaleup/clinic-v2/api/internal/modules/penjualan"
	"github.com/scaleup/clinic-v2/api/internal/modules/perawatan"
	"github.com/scaleup/clinic-v2/api/internal/modules/promo"
	"github.com/scaleup/clinic-v2/api/internal/modules/voucher"
	"github.com/scaleup/clinic-v2/api/internal/platform/branch"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// NilaiPoin is the rupiah value of one membership point (see membership.NilaiPoin).
const NilaiPoin = membership.NilaiPoin

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
	// UserID is the signed-in account (from the JWT), filled by the handler.
	UserID uint `json:"-"`
}

type TagihanItem struct {
	Nama     string  `json:"nama"`
	Jenis    string  `json:"jenis"`
	Qty      int     `json:"qty"`
	Harga    float64 `json:"harga"`
	Subtotal float64 `json:"subtotal"`
	// PakaiPaket: a session redeemed from a package, billed Rp 0. PaketKode / PaketSisa
	// name the package and the item's sessions left before this payment (PaketBaru when
	// it is the package bought in this same bill).
	PakaiPaket bool   `json:"pakai_paket"`
	PaketKode  string `json:"paket_kode,omitempty"`
	PaketSisa  *int   `json:"paket_sisa,omitempty"`
	PaketBaru  bool   `json:"paket_baru,omitempty"`
	// BeliPaket: the line buys a package; its price is held as paket.titipan until used.
	BeliPaket bool `json:"beli_paket"`

	paketItemID uint
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
	if err := s.checkSource(s.repo.db, req); err != nil {
		return nil, err
	}
	return s.hitungTagihan(s.repo.db, req, false)
}

// checkSource makes sure the bill being paid belongs to the active branch.
func (s *Service) checkSource(db *gorm.DB, req TagihanRequest) error {
	table := map[string]string{"penjualan": "penjualans", "perawatan": "perawatans"}[strings.ToLower(req.SourceType)]
	if table == "" || s.cab.All {
		return nil
	}
	var n int64
	if err := db.Table(table).Where("id = ? AND cabang_id = ?", req.SourceID, s.cab.ID).Count(&n).Error; err != nil {
		return err
	}
	if n == 0 {
		return fmt.Errorf("%s tidak ditemukan di cabang aktif", strings.ToLower(req.SourceType))
	}
	return nil
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
		if err := cekPaketTagihan(tx, pw, t.Items, lock); err != nil {
			return nil, err
		}
	default:
		return nil, fmt.Errorf("source_type tidak dikenal: %s", req.SourceType)
	}

	t.Subtotal = roundRp(t.Subtotal)
	adaPaket := false
	for _, it := range t.Items {
		adaPaket = adaPaket || it.PakaiPaket
	}
	// A visit fully covered by package sessions is a Rp 0 bill, still settled at the kasir.
	if t.Subtotal < 0 || (t.Subtotal == 0 && !adaPaket) {
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

// hargaTindakan is the unit price billed for a tindakan: its total per unit, else its
// harga, else the treatment's price. A session redeemed from a package is Rp 0.
func hargaTindakan(t perawatan.PerawatanTindakan) float64 {
	if t.PakaiPaket() {
		return 0
	}
	qty := t.Jumlah
	if qty <= 0 {
		qty = 1
	}
	harga := t.Total / float64(qty)
	if harga == 0 {
		harga = t.Harga
	}
	if harga == 0 && t.Treatment != nil {
		harga = t.Treatment.Harga
	}
	return harga
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
			harga := hargaTindakan(t)
			item := TagihanItem{Nama: nama, Jenis: "treatment", Qty: qty, Harga: harga, Subtotal: harga * float64(qty)}
			if t.PakaiPaket() {
				item.PakaiPaket = true
				if t.PaketItemID != nil && *t.PaketItemID > 0 {
					item.paketItemID = *t.PaketItemID
				} else {
					item.PaketBaru = true
				}
			} else if t.Treatment != nil && t.Treatment.IsPaket() {
				item.BeliPaket = true
			}
			details = append(details, penjualan.DetailInput{TreatmentID: t.TreatmentID, JenisPenjualan: "treatment", Qty: qty, HargaJual: harga, PakaiPaket: item.PakaiPaket})
			items = append(items, item)
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
		if err := s.checkSource(tx, req.TagihanRequest); err != nil {
			return err
		}
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
			if t.Total == 0 {
				jenis = "paket"
			}
		}
		jumlahBayar := req.JumlahBayar
		if t.SisaBayar == 0 {
			jumlahBayar = 0
		}

		var pj penjualan.Penjualan
		if t.SourceType == "perawatan" {
			pid := t.SourceID
			var pw perawatan.Perawatan
			if err := tx.Preload("Tindakans", func(q *gorm.DB) *gorm.DB { return q.Order("id") }).
				Preload("Tindakans.Treatment").First(&pw, pid).Error; err != nil {
				return err
			}
			created, err := penjualan.NewService(penjualan.NewRepository(tx), s.gen).In(branch.Ctx{ID: pw.CabangID}).CreateTx(tx, penjualan.UpsertRequest{
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
			dibeli, err := s.createPaketRecords(tx, &pw, pj.ID, req.StaffID, tgl)
			if err != nil {
				return err
			}
			if err := s.pakaiPaket(tx, &pw, dibeli, &pj, tgl); err != nil {
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

		// The money actually kept at the counter is the remaining bill; change goes back to the pasien.
		if err := kasir.Catat(tx, req.UserID, pj.CabangID, kasir.Mutasi{
			SourceType: kasir.SourcePenjualan, SourceID: pj.ID, Referensi: pj.NoInvoice,
			JenisPembayaran: jenis, BankID: req.BankID, Masuk: t.SisaBayar,
			Keterangan: "Pembayaran " + pj.Kode,
		}); err != nil {
			return err
		}

		if t.PoinDipakai > 0 {
			if err := tx.Model(&membership.Membership{}).Where("id = ?", *t.MembershipID).
				Update("points", gorm.Expr("points - ?", t.PoinDipakai)).Error; err != nil {
				return err
			}
		}
		if t.DepositDipakai > 0 {
			kode, err := s.gen.GenerateCabang("DPS", pj.CabangID)
			if err != nil {
				return err
			}
			if err := tx.Create(&DepositTransaksi{
				Kode: kode, CabangID: pj.CabangID, PasienID: t.PasienID, StaffID: req.StaffID, Tanggal: tgl, Kwitansi: pj.NoInvoice,
				Jenis: jenisPemakaianDeposit, Jumlah: t.DepositDipakai, JenisPembayaran: "deposit",
				Keterangan: "Pemakaian deposit untuk " + pj.Kode, PenjualanID: &penjualanID, IsActive: true,
			}).Error; err != nil {
				return err
			}
		}
		return s.jurnalPenjualan(tx, &pj, t, tgl)
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

// cekPaketTagihan checks the package sessions a perawatan redeems: items the pasien
// already owns are validated (and locked when paying) and labelled on the bill; a
// same-visit session must point at a paket tindakan of this perawatan that contains it.
func cekPaketTagihan(tx *gorm.DB, pw perawatan.Perawatan, items []TagihanItem, lock bool) error {
	var req []paket.Pakai
	byID := map[uint]perawatan.PerawatanTindakan{}
	for _, t := range pw.Tindakans {
		byID[t.ID] = t
	}
	for _, t := range pw.Tindakans {
		qty := t.Jumlah
		if qty <= 0 {
			qty = 1
		}
		if t.PaketItemID != nil && *t.PaketItemID > 0 {
			req = append(req, paket.Pakai{ItemID: *t.PaketItemID, TreatmentID: t.TreatmentID, Qty: qty})
			continue
		}
		if t.PaketBeliTindakanID == nil || *t.PaketBeliTindakanID == 0 {
			continue
		}
		src, ok := byID[*t.PaketBeliTindakanID]
		if !ok || src.Treatment == nil || !src.Treatment.IsPaket() || src.PakaiPaket() {
			return errors.New("sesi paket di kunjungan ini merujuk ke pembelian paket yang tidak ada")
		}
		katalog, err := paket.KatalogItems(tx, *src.Treatment)
		if err != nil {
			return err
		}
		found := false
		for _, k := range katalog {
			found = found || k.TreatmentID == t.TreatmentID
		}
		if !found {
			return fmt.Errorf("treatment tindakan tidak termasuk dalam %s", src.Treatment.Nama)
		}
	}
	info, err := paket.Cek(tx, pw.PasienID, req, lock)
	if err != nil {
		return err
	}
	for k := range items {
		if items[k].paketItemID == 0 {
			continue
		}
		if it, ok := info[items[k].paketItemID]; ok {
			sisa := it.SisaSesi
			items[k].PaketKode, items[k].PaketSisa = it.PaketKode, &sisa
		}
	}
	return nil
}

// createPaketRecords creates the packages bought in this perawatan (one per unit of a
// paket tindakan), priced as billed. It returns them by the tindakan that bought them.
func (s *Service) createPaketRecords(tx *gorm.DB, pw *perawatan.Perawatan, penjualanID, staffID uint, tgl time.Time) (map[uint]*paket.PaketPerawatan, error) {
	out := map[uint]*paket.PaketPerawatan{}
	for _, t := range pw.Tindakans {
		if t.TreatmentID == 0 || t.Treatment == nil || !t.Treatment.IsPaket() || t.PakaiPaket() {
			continue
		}
		qty := t.Jumlah
		if qty <= 0 {
			qty = 1
		}
		tid, pid, pjid := t.ID, pw.ID, penjualanID
		for n := 0; n < qty; n++ {
			p, err := paket.Beli(tx, s.gen, paket.BeliInput{
				CabangID: pw.CabangID, PasienID: pw.PasienID, StaffID: staffID,
				PerawatanID: &pid, TindakanID: &tid, PenjualanID: &pjid, Tanggal: tgl,
				Treatment: *t.Treatment, Harga: hargaTindakan(t),
			})
			if err != nil {
				return nil, err
			}
			if n == 0 {
				out[t.ID] = p
			}
		}
	}
	return out, nil
}

// pakaiPaket redeems the package sessions of a paid perawatan and, for packages whose
// revenue is deferred, books each one: Debit paket.titipan / Kredit pendapatan.treatment
// for the session value, even though the bill line is Rp 0.
func (s *Service) pakaiPaket(tx *gorm.DB, pw *perawatan.Perawatan, dibeli map[uint]*paket.PaketPerawatan, pj *penjualan.Penjualan, tgl time.Time) error {
	for _, t := range pw.Tindakans {
		qty := t.Jumlah
		if qty <= 0 {
			qty = 1
		}
		var itemID uint
		switch {
		case t.PaketItemID != nil && *t.PaketItemID > 0:
			itemID = *t.PaketItemID
		case t.PaketBeliTindakanID != nil && *t.PaketBeliTindakanID > 0:
			p := dibeli[*t.PaketBeliTindakanID]
			if p == nil {
				return errors.New("paket yang dibeli di kunjungan ini tidak ditemukan")
			}
			for _, it := range p.Items {
				if it.TreatmentID == t.TreatmentID {
					itemID = it.ID
					break
				}
			}
			if itemID == 0 {
				return fmt.Errorf("treatment tindakan tidak termasuk dalam paket %s", p.Kode)
			}
		default:
			continue
		}
		tid, pid, pjid := t.ID, pw.ID, pj.ID
		pm, p, err := paket.PakaiSesi(tx, paket.PakaiInput{
			ItemID: itemID, Qty: qty, CabangID: pj.CabangID,
			PerawatanID: &pid, TindakanID: &tid, PenjualanID: &pjid, Tanggal: tgl,
		})
		if err != nil {
			return err
		}
		if !p.PendapatanDitunda {
			continue // sold before deferred revenue: booked as revenue when it was bought
		}
		nama := "treatment"
		if t.Treatment != nil {
			nama = t.Treatment.Nama
		}
		if _, err := finance.Post(tx, s.gen, finance.Entry{
			Tanggal: tgl, SourceType: finance.SourcePaketPemakaian, SourceID: pm.ID,
			Referensi: pj.NoInvoice, Keterangan: fmt.Sprintf("Pemakaian %d sesi %s paket %s", qty, nama, p.Kode),
			Lines: []finance.Line{
				finance.Debit(finance.KeyPaketTitipan, pm.Nilai),
				finance.Kredit(finance.KeyPendapatanTreatment, pm.Nilai),
			},
		}); err != nil {
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

// jurnalPenjualan books a paid bill: money received, deposit and points used and
// discounts on the debit side against revenue per line type, plus HPP for barang.
func (s *Service) jurnalPenjualan(tx *gorm.DB, pj *penjualan.Penjualan, t *Tagihan, tgl time.Time) error {
	pendapatan := map[string]float64{}
	for _, it := range t.Items {
		key := finance.KeyPendapatanBarang
		switch {
		case it.BeliPaket:
			// A package is paid in advance: revenue comes per session redeemed.
			key = finance.KeyPaketTitipan
		case it.Jenis == "treatment":
			key = finance.KeyPendapatanTreatment
		case it.Jenis == "layanan":
			key = finance.KeyPendapatanLayanan
		}
		pendapatan[key] += it.Subtotal
	}
	lines := []finance.Line{
		finance.Debit(finance.KasKey(tx, pj.JenisPembayaran, pj.BankID), t.SisaBayar),
		finance.Debit(finance.KeyDepositTitipan, t.DepositDipakai),
		finance.Debit(finance.KeyPenjualanPoin, t.PotonganPoin),
		finance.Debit(finance.KeyPenjualanDiskon, t.DiskonPromo+t.DiskonVoucher),
	}
	for _, key := range []string{finance.KeyPendapatanTreatment, finance.KeyPendapatanLayanan, finance.KeyPendapatanBarang, finance.KeyPaketTitipan} {
		lines = append(lines, finance.Kredit(key, pendapatan[key]))
	}

	var hpp float64
	if err := tx.Table("penjualan_details d").
		Select("COALESCE(SUM(d.qty * b.harga_beli), 0)").
		Joins("JOIN barangs b ON b.id = d.barang_id").
		Where("d.penjualan_id = ?", pj.ID).
		Scan(&hpp).Error; err != nil {
		return err
	}
	lines = append(lines, finance.Debit(finance.KeyHPP, hpp), finance.Kredit(finance.KeyPersediaan, hpp))

	_, err := finance.Post(tx, s.gen, finance.Entry{
		Tanggal: tgl, SourceType: finance.SourcePenjualan, SourceID: pj.ID, Referensi: pj.NoInvoice,
		Keterangan: "Penjualan " + pj.Kode, Lines: lines,
	})
	return err
}
