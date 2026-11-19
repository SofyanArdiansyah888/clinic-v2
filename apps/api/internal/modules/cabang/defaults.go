package cabang

import (
	"fmt"
	"regexp"
	"strings"

	"github.com/scaleup/clinic-v2/api/internal/modules/barang"
	"gorm.io/gorm"
)

var singkatanRe = regexp.MustCompile(`^[A-Z0-9]{2,6}$`)

// NormalizeSingkatan uppercases and validates a branch abbreviation.
func NormalizeSingkatan(s string) (string, bool) {
	s = strings.ToUpper(strings.TrimSpace(s))
	return s, singkatanRe.MatchString(s)
}

// deriveSingkatan builds an abbreviation from the name: initials of up to three words,
// or the first three letters of a single word ("Cabang Pusat" -> "CP", "Kemang" -> "KEM").
func deriveSingkatan(nama string) string {
	var words []string
	for _, w := range strings.FieldsFunc(strings.ToUpper(nama), func(r rune) bool { return !(r >= 'A' && r <= 'Z' || r >= '0' && r <= '9') }) {
		words = append(words, w)
	}
	switch {
	case len(words) == 0:
		return "CB"
	case len(words) == 1:
		w := words[0]
		if len(w) > 3 {
			w = w[:3]
		}
		if len(w) < 2 {
			w += "X"
		}
		return w
	default:
		var b strings.Builder
		for i, w := range words {
			if i == 3 {
				break
			}
			b.WriteByte(w[0])
		}
		return b.String()
	}
}

// uniqueSingkatan returns base, or base with a number appended, not used by another branch.
func uniqueSingkatan(db *gorm.DB, base string, exceptID uint) string {
	cand := base
	for i := 2; ; i++ {
		var n int64
		db.Model(&Cabang{}).Where("singkatan = ? AND id <> ?", cand, exceptID).Count(&n)
		if n == 0 {
			return cand
		}
		suffix := fmt.Sprint(i)
		if len(base)+len(suffix) > 6 {
			cand = base[:6-len(suffix)] + suffix
		} else {
			cand = base + suffix
		}
	}
}

// EnsureDefaults prepares existing data for branches (idempotent): there is always a main
// branch, every branch has an abbreviation, and users and staff without a branch are
// linked to the main branch.
func EnsureDefaults(db *gorm.DB) error {
	var n, users int64
	if err := db.Model(&Cabang{}).Count(&n).Error; err != nil {
		return err
	}
	db.Table("users").Count(&users)
	if n == 0 && users == 0 {
		// A brand-new database: the seed creates the first branch and calls this again.
		return nil
	}
	if n == 0 {
		if err := db.Create(&Cabang{Kode: "CAB-UTAMA", Nama: "Cabang Utama", Singkatan: "UTM", IsUtama: true, IsActive: true}).Error; err != nil {
			return err
		}
	}

	var utama Cabang
	if err := db.Where("is_utama = ?", true).Order("id").First(&utama).Error; err != nil {
		if err := db.Where("is_active = ?", true).Order("id").First(&utama).Error; err != nil {
			if err := db.Order("id").First(&utama).Error; err != nil {
				return err
			}
		}
		if err := db.Model(&Cabang{}).Where("id = ?", utama.ID).Updates(map[string]any{"is_utama": true, "is_active": true}).Error; err != nil {
			return err
		}
	}

	var blank []Cabang
	if err := db.Where("singkatan IS NULL OR singkatan = ''").Order("id").Find(&blank).Error; err != nil {
		return err
	}
	for _, c := range blank {
		s := uniqueSingkatan(db, deriveSingkatan(c.Nama), c.ID)
		if err := db.Model(&Cabang{}).Where("id = ?", c.ID).Update("singkatan", s).Error; err != nil {
			return err
		}
	}

	if err := db.Exec(`INSERT INTO user_cabangs (user_id, cabang_id)
		SELECT u.id, ? FROM users u WHERE NOT EXISTS (SELECT 1 FROM user_cabangs uc WHERE uc.user_id = u.id)`, utama.ID).Error; err != nil {
		return err
	}
	if err := db.Exec(`INSERT INTO staff_cabangs (staff_id, cabang_id)
		SELECT s.id, ? FROM staffs s WHERE NOT EXISTS (SELECT 1 FROM staff_cabangs sc WHERE sc.staff_id = s.id)`, utama.ID).Error; err != nil {
		return err
	}
	if err := backfillTransaksi(db, utama.ID); err != nil {
		return err
	}
	// Stock from before multi-branch is the main branch's stock.
	if db.Migrator().HasTable("barang_stoks") {
		return barang.BackfillStok(db, utama.ID)
	}
	return nil
}

// TransaksiTables hold one branch's records in cabang_id; rows from before multi-branch
// (cabang_id 0) belong to the main branch.
var TransaksiTables = []string{
	"antrians", "appointments", "jadwal_dokters", "perawatans", "penjualans",
	"deposit_transaksis", "paket_perawatans", "pembelians", "kasir_shifts",
	"kartu_stoks", "konversi_stoks", "produksi_barangs", "stok_opnames",
}

func backfillTransaksi(db *gorm.DB, utamaID uint) error {
	for _, t := range TransaksiTables {
		if !db.Migrator().HasColumn(t, "cabang_id") {
			continue
		}
		if err := db.Exec("UPDATE "+t+" SET cabang_id = ? WHERE cabang_id = 0 OR cabang_id IS NULL", utamaID).Error; err != nil {
			return err
		}
	}
	return nil
}
