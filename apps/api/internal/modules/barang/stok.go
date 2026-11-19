package barang

import (
	"errors"
	"fmt"
	"time"

	"github.com/scaleup/clinic-v2/api/internal/platform/branch"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// Stok is a barang's stock in one branch; it is the source of truth for what a branch can
// sell or use. barangs.stok_aktual is kept as the total over all branches.
type Stok struct {
	BarangID  uint      `gorm:"primaryKey" json:"barang_id"`
	CabangID  uint      `gorm:"primaryKey;index" json:"cabang_id"`
	Stok      int       `gorm:"not null;default:0" json:"stok"`
	UpdatedAt time.Time `json:"updated_at"`
}

func (Stok) TableName() string { return "barang_stoks" }

// ErrCabangStok is returned when a stock change has no branch to apply to.
var ErrCabangStok = errors.New("stok harus dicatat di satu cabang; pilih cabang aktif terlebih dahulu")

// seedUtama gives a barang without any stock rows its whole stok_aktual in the main
// branch (barangs created before multi-branch, or inserted directly).
func seedUtama(tx *gorm.DB, barangID uint) error {
	return tx.Exec(`INSERT INTO barang_stoks (barang_id, cabang_id, stok, updated_at)
		SELECT b.id, c.id, b.stok_aktual, NOW() FROM barangs b
		JOIN cabangs c ON c.is_utama
		WHERE b.id = ? AND NOT EXISTS (SELECT 1 FROM barang_stoks s WHERE s.barang_id = b.id)
		ORDER BY c.id LIMIT 1`, barangID).Error
}

// AfterCreate puts a new barang's opening stok_aktual in the main branch, so stock rows
// and the total agree however the barang was created (API, seed, import).
func (b *Barang) AfterCreate(tx *gorm.DB) error {
	return seedUtama(tx.Session(&gorm.Session{NewDB: true}), b.ID)
}

// ensureRow makes sure the barang has a stock row in the branch.
func ensureRow(tx *gorm.DB, barangID, cabangID uint) error {
	if err := seedUtama(tx, barangID); err != nil {
		return err
	}
	return tx.Exec(`INSERT INTO barang_stoks (barang_id, cabang_id, stok, updated_at)
		VALUES (?, ?, 0, NOW()) ON CONFLICT DO NOTHING`, barangID, cabangID).Error
}

// LockStok returns the barang's stock in the branch, locking that row until the
// transaction ends.
func LockStok(tx *gorm.DB, barangID, cabangID uint) (int, error) {
	if cabangID == 0 {
		return 0, ErrCabangStok
	}
	if err := ensureRow(tx, barangID, cabangID); err != nil {
		return 0, err
	}
	var s Stok
	err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
		Where("barang_id = ? AND cabang_id = ?", barangID, cabangID).First(&s).Error
	return s.Stok, err
}

// AddStok moves the branch stock (and the barang total) by delta and returns the new
// branch stock. It refuses to go below zero.
func AddStok(tx *gorm.DB, barangID, cabangID uint, delta int) (int, error) {
	cur, err := LockStok(tx, barangID, cabangID)
	if err != nil {
		return 0, err
	}
	next := cur + delta
	if next < 0 {
		var b Barang
		tx.Select("kode, nama").First(&b, barangID)
		return cur, fmt.Errorf("stok %s (%s) tidak cukup: tersedia %d, dibutuhkan %d", b.Nama, b.Kode, cur, -delta)
	}
	if delta == 0 {
		return cur, nil
	}
	if err := tx.Model(&Stok{}).Where("barang_id = ? AND cabang_id = ?", barangID, cabangID).
		Updates(map[string]any{"stok": next, "updated_at": time.Now()}).Error; err != nil {
		return 0, err
	}
	return next, tx.Model(&Barang{}).Where("id = ?", barangID).
		Update("stok_aktual", gorm.Expr("stok_aktual + ?", delta)).Error
}

// SetStok sets the branch stock to an absolute value (manual edit or opname count).
func SetStok(tx *gorm.DB, barangID, cabangID uint, stok int) error {
	cur, err := LockStok(tx, barangID, cabangID)
	if err != nil {
		return err
	}
	_, err = AddStok(tx, barangID, cabangID, stok-cur)
	return err
}

// StokSQL is the SQL for a barang's stock as seen from b, for use in queries on barangs:
// the branch's own stock, or the total over all branches.
func StokSQL(b branch.Ctx) string {
	if b.All {
		return "barangs.stok_aktual"
	}
	return fmt.Sprintf("COALESCE((SELECT bs.stok FROM barang_stoks bs WHERE bs.barang_id = barangs.id AND bs.cabang_id = %d), 0)", b.ID)
}

// FillStok replaces StokAktual with the stock seen from b (the branch's own stock).
func FillStok(db *gorm.DB, b branch.Ctx, items []Barang) error {
	if b.All || len(items) == 0 {
		return nil
	}
	ids := make([]uint, len(items))
	for i, it := range items {
		ids[i] = it.ID
	}
	var rows []Stok
	if err := db.Where("cabang_id = ? AND barang_id IN ?", b.ID, ids).Find(&rows).Error; err != nil {
		return err
	}
	by := make(map[uint]int, len(rows))
	for _, r := range rows {
		by[r.BarangID] = r.Stok
	}
	for i := range items {
		items[i].StokAktual = by[items[i].ID]
	}
	return nil
}

// BackfillStok gives every barang without stock rows its stok_aktual in the main branch.
func BackfillStok(db *gorm.DB, utamaID uint) error {
	return db.Exec(`INSERT INTO barang_stoks (barang_id, cabang_id, stok, updated_at)
		SELECT b.id, ?, b.stok_aktual, NOW() FROM barangs b
		WHERE NOT EXISTS (SELECT 1 FROM barang_stoks s WHERE s.barang_id = b.id)`, utamaID).Error
}
