package paket

import (
	"errors"
	"fmt"
	"sort"
	"time"

	"github.com/scaleup/clinic-v2/api/internal/modules/treatment"
	"github.com/scaleup/clinic-v2/api/internal/platform/generator"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// ErrSisaKurang means a package item has fewer sessions left than requested.
var ErrSisaKurang = errors.New("sisa sesi paket tidak cukup")

// KatalogItems returns what a paket treatment contains. A paket without catalog
// items (older data) contains itself, sesi_paket times.
func KatalogItems(tx *gorm.DB, tr treatment.Treatment) ([]treatment.PaketItem, error) {
	var items []treatment.PaketItem
	if err := tx.Preload("Treatment").Where("paket_treatment_id = ?", tr.ID).Order("id").Find(&items).Error; err != nil {
		return nil, err
	}
	if len(items) == 0 {
		sesi := tr.SesiPaket
		if sesi <= 0 {
			sesi = 1
		}
		self := tr
		items = []treatment.PaketItem{{PaketTreatmentID: tr.ID, TreatmentID: tr.ID, Sesi: sesi, Treatment: &self}}
	}
	return items, nil
}

// BeliInput describes a package bought at the cashier.
type BeliInput struct {
	CabangID    uint
	PasienID    uint
	StaffID     uint
	PerawatanID *uint
	TindakanID  *uint
	PenjualanID *uint
	Tanggal     time.Time
	Treatment   treatment.Treatment
	Harga       float64
}

// Bagi splits a package price over its items by weight (treatment price x sessions,
// or sessions alone when no item has a price). Every item's share is rounded to the
// cent and the last item takes the remainder, so the shares add up to harga exactly.
func Bagi(harga float64, katalog []treatment.PaketItem) []Item {
	weights := make([]float64, len(katalog))
	var total float64
	for k, it := range katalog {
		if it.Treatment != nil {
			weights[k] = it.Treatment.Harga * float64(it.Sesi)
		}
		total += weights[k]
	}
	if total <= 0 {
		total = 0
		for k, it := range katalog {
			weights[k] = float64(it.Sesi)
			total += weights[k]
		}
	}
	out := make([]Item, len(katalog))
	var dibagi float64
	for k, it := range katalog {
		nilai := round2(harga * weights[k] / total)
		if k == len(katalog)-1 {
			nilai = round2(harga - dibagi)
		}
		dibagi = round2(dibagi + nilai)
		out[k] = Item{
			TreatmentID: it.TreatmentID, TotalSesi: it.Sesi, SisaSesi: it.Sesi,
			NilaiTotal: nilai, NilaiPerSesi: round2(nilai / float64(it.Sesi)),
		}
	}
	return out
}

// Beli creates the package with one item per catalog item, inside the caller's transaction.
func Beli(tx *gorm.DB, gen *generator.Service, in BeliInput) (*PaketPerawatan, error) {
	katalog, err := KatalogItems(tx, in.Treatment)
	if err != nil {
		return nil, err
	}
	kode, err := gen.GenerateCabang("PKT", in.CabangID)
	if err != nil {
		return nil, err
	}
	items := Bagi(in.Harga, katalog)
	total := 0
	for _, it := range items {
		total += it.TotalSesi
	}
	p := PaketPerawatan{
		Kode: kode, CabangID: in.CabangID, PasienID: in.PasienID, TreatmentID: in.Treatment.ID, StaffID: in.StaffID,
		PenjualanID: in.PenjualanID, PerawatanID: in.PerawatanID, TindakanID: in.TindakanID,
		TanggalBeli: in.Tanggal, TotalSesi: total, SisaSesi: total, HargaTotal: round2(in.Harga),
		Status: StatusAktif, PendapatanDitunda: true, IsActive: true,
	}
	if err := tx.Omit(clause.Associations).Create(&p).Error; err != nil {
		return nil, err
	}
	for k := range items {
		items[k].PaketPerawatanID = p.ID
		if err := tx.Omit(clause.Associations).Create(&items[k]).Error; err != nil {
			return nil, err
		}
	}
	p.Items = items
	return &p, nil
}

// backfillPaketSQL gives every package without items one item: its own treatment, the
// same sessions, and value per session = price / sessions.
const backfillPaketSQL = `INSERT INTO paket_perawatan_items
	(paket_perawatan_id, treatment_id, total_sesi, sisa_sesi, nilai_total, nilai_per_sesi, created_at, updated_at)
	SELECT p.id, p.treatment_id, GREATEST(p.total_sesi, 1), GREATEST(LEAST(p.sisa_sesi, GREATEST(p.total_sesi, 1)), 0),
		p.harga_total, ROUND(p.harga_total / GREATEST(p.total_sesi, 1), 2), NOW(), NOW()
	FROM paket_perawatans p
	WHERE NOT EXISTS (SELECT 1 FROM paket_perawatan_items i WHERE i.paket_perawatan_id = p.id)`

// EnsureItems gives one package from before multi-treatment packages its single item.
func EnsureItems(tx *gorm.DB, paketID uint) error {
	return tx.Exec(backfillPaketSQL+" AND p.id = ?", paketID).Error
}

// Backfill brings data from before multi-treatment packages into the new tables. It
// only inserts what is missing, so it is safe on every start:
//   - a paket treatment without catalog items gets one item pointing at itself;
//   - a bought package without items gets one item with the same sessions left.
//
// Those older packages keep PendapatanDitunda = false: their revenue was booked when
// sold, so redeeming them posts no journal and a refund uses the old refund account.
func Backfill(db *gorm.DB) error {
	if err := db.Exec(`INSERT INTO paket_treatment_items (paket_treatment_id, treatment_id, sesi, created_at, updated_at)
		SELECT t.id, t.id, GREATEST(t.sesi_paket, 1), NOW(), NOW() FROM treatments t
		WHERE t.kategori ILIKE '%paket%'
		AND NOT EXISTS (SELECT 1 FROM paket_treatment_items i WHERE i.paket_treatment_id = t.id)`).Error; err != nil {
		return err
	}
	if err := db.Exec(`UPDATE treatments t SET sesi_paket = s.total FROM
		(SELECT paket_treatment_id, SUM(sesi) AS total FROM paket_treatment_items GROUP BY paket_treatment_id) s
		WHERE s.paket_treatment_id = t.id AND t.sesi_paket <> s.total`).Error; err != nil {
		return err
	}
	if err := db.Exec(backfillPaketSQL).Error; err != nil {
		return err
	}
	// Older packages did not record their sale: take the paid perawatan sale of the same
	// pasien on the purchase date that billed the paket treatment (as the kwitansi did).
	if err := db.Exec(`UPDATE paket_perawatans p SET penjualan_id = x.pj_id, perawatan_id = x.perawatan_id FROM (
			SELECT DISTINCT ON (p2.id) p2.id AS paket_id, pj.id AS pj_id, pj.perawatan_id
			FROM paket_perawatans p2
			JOIN penjualans pj ON pj.pasien_id = p2.pasien_id AND pj.tanggal = p2.tanggal_beli AND pj.perawatan_id IS NOT NULL
			JOIN penjualan_details d ON d.penjualan_id = pj.id AND d.treatment_id = p2.treatment_id
			WHERE p2.penjualan_id IS NULL
			ORDER BY p2.id, pj.id) x
		WHERE p.id = x.paket_id AND p.penjualan_id IS NULL`).Error; err != nil {
		return err
	}
	return db.Exec(`UPDATE paket_perawatans SET status = ? WHERE status = ? AND sisa_sesi <= 0`, StatusHabis, StatusAktif).Error
}

// Pakai is a request for qty sessions of a package item, for a tindakan of TreatmentID.
type Pakai struct {
	ItemID      uint
	TreatmentID uint
	Qty         int
}

// ItemInfo is a package item with the package fields the bill needs.
type ItemInfo struct {
	Item
	PaketKode         string `json:"paket_kode"`
	PaketStatus       string `json:"paket_status"`
	PasienID          uint   `json:"pasien_id"`
	PendapatanDitunda bool   `json:"pendapatan_ditunda"`
	TreatmentNama     string `json:"treatment_nama"`
}

// Cek checks that every requested item belongs to the pasien, is in an active package,
// is for the same treatment and has enough sessions left (requests on the same item are
// added up). With lock, the packages and then the items are locked FOR UPDATE in id
// order, so concurrent payments using the same package wait for each other.
func Cek(tx *gorm.DB, pasienID uint, req []Pakai, lock bool) (map[uint]ItemInfo, error) {
	out := map[uint]ItemInfo{}
	if len(req) == 0 {
		return out, nil
	}
	need := map[uint]int{}
	ids := []uint{}
	for _, r := range req {
		if r.Qty <= 0 {
			return nil, errors.New("jumlah sesi paket harus lebih dari 0")
		}
		if _, ok := need[r.ItemID]; !ok {
			ids = append(ids, r.ItemID)
		}
		need[r.ItemID] += r.Qty
	}
	sort.Slice(ids, func(a, b int) bool { return ids[a] < ids[b] })

	if lock {
		var paketIDs []uint
		if err := tx.Model(&Item{}).Where("id IN ?", ids).Distinct("paket_perawatan_id").
			Order("paket_perawatan_id").Pluck("paket_perawatan_id", &paketIDs).Error; err != nil {
			return nil, err
		}
		if len(paketIDs) > 0 {
			var locked []PaketPerawatan
			if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Select("id").
				Where("id IN ?", paketIDs).Order("id").Find(&locked).Error; err != nil {
				return nil, err
			}
		}
		var items []Item
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Select("id").
			Where("id IN ?", ids).Order("id").Find(&items).Error; err != nil {
			return nil, err
		}
	}

	var rows []ItemInfo
	if err := tx.Table("paket_perawatan_items i").
		Select(`i.*, p.kode AS paket_kode, p.status AS paket_status, p.pasien_id, p.pendapatan_ditunda, t.nama AS treatment_nama`).
		Joins("JOIN paket_perawatans p ON p.id = i.paket_perawatan_id").
		Joins("LEFT JOIN treatments t ON t.id = i.treatment_id").
		Where("i.id IN ?", ids).Scan(&rows).Error; err != nil {
		return nil, err
	}
	for _, r := range rows {
		out[r.ID] = r
	}
	for _, r := range req {
		it, ok := out[r.ItemID]
		switch {
		case !ok:
			return nil, fmt.Errorf("item paket #%d tidak ditemukan", r.ItemID)
		case it.PasienID != pasienID:
			return nil, fmt.Errorf("paket %s bukan milik pasien ini", it.PaketKode)
		case it.PaketStatus != StatusAktif:
			return nil, fmt.Errorf("paket %s berstatus %s, tidak bisa dipakai", it.PaketKode, it.PaketStatus)
		case r.TreatmentID != 0 && it.TreatmentID != r.TreatmentID:
			return nil, fmt.Errorf("paket %s: item %s tidak sesuai dengan treatment tindakan", it.PaketKode, it.TreatmentNama)
		case it.SisaSesi < need[r.ItemID]:
			return nil, fmt.Errorf("%w: %s di paket %s tersisa %d sesi, diminta %d", ErrSisaKurang, it.TreatmentNama, it.PaketKode, it.SisaSesi, need[r.ItemID])
		}
	}
	return out, nil
}

// PakaiInput redeems qty sessions of a package item.
type PakaiInput struct {
	ItemID      uint
	Qty         int
	CabangID    uint
	PerawatanID *uint
	TindakanID  *uint
	PenjualanID *uint
	Tanggal     time.Time
}

// PakaiSesi takes sessions off the item with a guarded update (never below zero, only
// while the package is active), records the pemakaian with its value, keeps the package
// totals in sync and marks the package habis at zero. It returns the pemakaian and the
// package (whose PendapatanDitunda says whether a journal is needed).
func PakaiSesi(tx *gorm.DB, in PakaiInput) (*Pemakaian, *PaketPerawatan, error) {
	if in.Qty <= 0 {
		return nil, nil, errors.New("jumlah sesi paket harus lebih dari 0")
	}
	var it Item
	if err := tx.First(&it, in.ItemID).Error; err != nil {
		return nil, nil, fmt.Errorf("item paket #%d tidak ditemukan: %w", in.ItemID, err)
	}
	res := tx.Exec(`UPDATE paket_perawatan_items SET sisa_sesi = sisa_sesi - ?, updated_at = NOW()
		WHERE id = ? AND sisa_sesi >= ?
		AND EXISTS (SELECT 1 FROM paket_perawatans p WHERE p.id = paket_perawatan_id AND p.status = ?)`,
		in.Qty, in.ItemID, in.Qty, StatusAktif)
	if res.Error != nil {
		return nil, nil, res.Error
	}
	if res.RowsAffected == 0 {
		return nil, nil, ErrSisaKurang
	}
	// it still holds the values from before this update.
	nilai := it.nilaiPakai(in.Qty)

	var p PaketPerawatan
	if err := tx.First(&p, it.PaketPerawatanID).Error; err != nil {
		return nil, nil, err
	}
	pm := Pemakaian{
		PaketPerawatanID: p.ID, PaketItemID: it.ID, CabangID: in.CabangID, PasienID: p.PasienID,
		PerawatanID: in.PerawatanID, PerawatanTindakanID: in.TindakanID, PenjualanID: in.PenjualanID,
		Tanggal: in.Tanggal, Qty: in.Qty, Nilai: nilai, Status: PemakaianAktif,
	}
	if err := tx.Create(&pm).Error; err != nil {
		return nil, nil, err
	}
	if err := tx.Exec(`UPDATE paket_perawatans SET
			sisa_sesi = s.sisa,
			status = CASE WHEN s.sisa <= 0 THEN ? ELSE status END,
			updated_at = NOW()
		FROM (SELECT COALESCE(SUM(sisa_sesi), 0) AS sisa FROM paket_perawatan_items WHERE paket_perawatan_id = ?) s
		WHERE id = ?`, StatusHabis, p.ID, p.ID).Error; err != nil {
		return nil, nil, err
	}
	return &pm, &p, nil
}

// Load returns a package with its items (and their treatments) and computed values.
func Load(db *gorm.DB, id uint) (*PaketPerawatan, error) {
	var p PaketPerawatan
	if err := db.Preload("Pasien").Preload("Staff").Preload("Treatment").First(&p, id).Error; err != nil {
		return nil, err
	}
	list := []PaketPerawatan{p}
	if err := Fill(db, list); err != nil {
		return nil, err
	}
	return &list[0], nil
}

// Fill loads the items of a page of packages and computes their remaining value.
func Fill(db *gorm.DB, list []PaketPerawatan) error {
	if len(list) == 0 {
		return nil
	}
	ids := make([]uint, len(list))
	for k, p := range list {
		ids[k] = p.ID
	}
	var items []Item
	if err := db.Preload("Treatment").Where("paket_perawatan_id IN ?", ids).Order("id").Find(&items).Error; err != nil {
		return err
	}
	by := map[uint][]Item{}
	for _, it := range items {
		by[it.PaketPerawatanID] = append(by[it.PaketPerawatanID], it)
	}
	for k := range list {
		list[k].Items = by[list[k].ID]
		list[k].fill()
	}
	return nil
}

// Aktif lists the pasien's packages that still have sessions, oldest first, in every
// branch (like the deposit balance, a package belongs to the pasien, not a branch).
func Aktif(db *gorm.DB, pasienID uint) ([]PaketPerawatan, error) {
	list := []PaketPerawatan{}
	if err := db.Preload("Treatment").
		Where("pasien_id = ? AND status = ? AND sisa_sesi > 0", pasienID, StatusAktif).
		Order("tanggal_beli, id").Find(&list).Error; err != nil {
		return nil, err
	}
	if err := Fill(db, list); err != nil {
		return nil, err
	}
	return list, nil
}
