// Package kasir keeps the cashier shift: every rupiah received or paid out at the
// counter is recorded as a mutasi on the open shift of the signed-in account, and
// closing the shift compares the counted cash with what the drawer should hold.
package kasir

import (
	"errors"
	"fmt"
	"math"
	"strings"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const (
	StatusOpen   = "open"
	StatusClosed = "closed"

	SourcePenjualan   = "penjualan"
	SourceDeposit     = "deposit"
	SourcePaketRefund = "paket_refund"
	SourceVoid        = "void"

	// MetodeTunai is the payment method that goes into the cash drawer.
	MetodeTunai = "tunai"
)

// ErrBelumBuka means the account has no open shift; money cannot be recorded.
var ErrBelumBuka = errors.New("Kasir belum dibuka. Buka kasir dulu di Kasir › Buka/Tutup Kasir")

type Shift struct {
	ID              uint       `gorm:"primaryKey" json:"id"`
	Kode            string     `gorm:"size:50;uniqueIndex;not null" json:"kode"`
	CabangID        uint       `gorm:"not null;default:0;index" json:"cabang_id"`
	UserID          uint       `gorm:"not null;index" json:"user_id"`
	StaffID         *uint      `gorm:"index" json:"staff_id"`
	SaldoAwal       float64    `gorm:"type:decimal(14,2);not null;default:0" json:"saldo_awal"`
	OpenedAt        time.Time  `gorm:"not null;index" json:"opened_at"`
	CatatanBuka     string     `gorm:"type:text" json:"catatan_buka"`
	Status          string     `gorm:"size:20;not null;default:open;index" json:"status"`
	ClosedAt        *time.Time `json:"closed_at"`
	ClosedByUserID  *uint      `json:"closed_by_user_id"`
	SaldoAkhirFisik *float64   `gorm:"type:decimal(14,2)" json:"saldo_akhir_fisik"`
	ExpectedTunai   *float64   `gorm:"type:decimal(14,2)" json:"expected_tunai"`
	Selisih         *float64   `gorm:"type:decimal(14,2)" json:"selisih"`
	CatatanTutup    string     `gorm:"type:text" json:"catatan_tutup"`
	CreatedAt       time.Time  `json:"created_at"`
	UpdatedAt       time.Time  `json:"updated_at"`

	// Read-only names filled by the list/detail queries.
	KasirNama    string `gorm:"->;-:migration" json:"kasir_nama"`
	ClosedByNama string `gorm:"->;-:migration" json:"closed_by_nama"`
	CabangNama   string `gorm:"->;-:migration" json:"cabang_nama"`
}

func (Shift) TableName() string { return "kasir_shifts" }

// Mutasi is one movement of money on a shift. Masuk is money received, Keluar money paid out.
type Mutasi struct {
	ID              uint      `gorm:"primaryKey" json:"id"`
	ShiftID         uint      `gorm:"not null;index" json:"shift_id"`
	Waktu           time.Time `gorm:"not null" json:"waktu"`
	SourceType      string    `gorm:"size:30;not null;index:idx_kasir_mutasi_source" json:"source_type"`
	SourceID        uint      `gorm:"index:idx_kasir_mutasi_source" json:"source_id"`
	Referensi       string    `gorm:"size:100" json:"referensi"`
	JenisPembayaran string    `gorm:"size:50;not null" json:"jenis_pembayaran"`
	BankID          *uint     `json:"bank_id"`
	Masuk           float64   `gorm:"type:decimal(14,2);not null;default:0" json:"masuk"`
	Keluar          float64   `gorm:"type:decimal(14,2);not null;default:0" json:"keluar"`
	Keterangan      string    `gorm:"type:text" json:"keterangan"`
	CreatedAt       time.Time `json:"created_at"`

	BankNama string `gorm:"->;-:migration" json:"bank_nama"`
}

func (Mutasi) TableName() string { return "kasir_mutasis" }

// UniqueOpenIndexSQL allows at most one open shift per account; AutoMigrate cannot express a partial index.
const UniqueOpenIndexSQL = `CREATE UNIQUE INDEX IF NOT EXISTS uniq_kasir_shift_open_user ON kasir_shifts (user_id) WHERE status = 'open'`

func normalizeMetode(jenis string) string {
	j := strings.ToLower(strings.TrimSpace(jenis))
	if j == "" {
		return MetodeTunai
	}
	return j
}

func roundRp(v float64) float64 { return math.Round(v*100) / 100 }

// Catat records m on the signed-in account's open shift inside the caller's transaction.
// cabangID is the branch the money belongs to; the shift must be open in that branch.
// The shift row is locked so a close cannot slip between the check and the insert.
// It returns ErrBelumBuka when the account has no open shift; a zero movement is skipped.
func Catat(tx *gorm.DB, userID, cabangID uint, m Mutasi) error {
	if roundRp(m.Masuk) == 0 && roundRp(m.Keluar) == 0 {
		return nil
	}
	if m.Masuk < 0 || m.Keluar < 0 {
		return errors.New("mutasi kasir tidak boleh negatif")
	}
	var sh Shift
	err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
		Where("user_id = ? AND status = ?", userID, StatusOpen).First(&sh).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return ErrBelumBuka
	}
	if err != nil {
		return err
	}
	if cabangID != 0 && sh.CabangID != cabangID {
		var nama string
		tx.Table("cabangs").Where("id = ?", sh.CabangID).Select("nama").Scan(&nama)
		return fmt.Errorf("Kasir Anda terbuka di cabang %s. Tutup kasir itu dulu atau pindah ke cabang tersebut", nama)
	}
	m.ID = 0
	m.ShiftID = sh.ID
	m.JenisPembayaran = normalizeMetode(m.JenisPembayaran)
	m.Masuk, m.Keluar = roundRp(m.Masuk), roundRp(m.Keluar)
	if m.Waktu.IsZero() {
		m.Waktu = time.Now()
	}
	return tx.Create(&m).Error
}

// Ringkasan totals a shift's movements for one payment method.
type Ringkasan struct {
	JenisPembayaran string  `json:"jenis_pembayaran"`
	Jumlah          int     `json:"jumlah"`
	Masuk           float64 `json:"masuk"`
	Keluar          float64 `json:"keluar"`
	Net             float64 `json:"net"`
}

// Detail is a shift with its per-method summary and movements. ExpectedTunai is
// live for an open shift and the value fixed at close for a closed one.
type Detail struct {
	Shift         Shift       `json:"shift"`
	Ringkasan     []Ringkasan `json:"ringkasan"`
	TotalMasuk    float64     `json:"total_masuk"`
	TotalKeluar   float64     `json:"total_keluar"`
	TunaiMasuk    float64     `json:"tunai_masuk"`
	TunaiKeluar   float64     `json:"tunai_keluar"`
	ExpectedTunai float64     `json:"expected_tunai"`
	Mutasi        []Mutasi    `json:"mutasi"`
}

// ringkas summarises mutasi per method (tunai first) and returns the expected cash in the drawer.
func ringkas(sh Shift, mutasi []Mutasi) Detail {
	d := Detail{Shift: sh, Mutasi: mutasi, Ringkasan: []Ringkasan{}}
	idx := map[string]int{}
	for _, m := range mutasi {
		i, ok := idx[m.JenisPembayaran]
		if !ok {
			i = len(d.Ringkasan)
			idx[m.JenisPembayaran] = i
			d.Ringkasan = append(d.Ringkasan, Ringkasan{JenisPembayaran: m.JenisPembayaran})
		}
		r := &d.Ringkasan[i]
		r.Jumlah++
		r.Masuk += m.Masuk
		r.Keluar += m.Keluar
		d.TotalMasuk += m.Masuk
		d.TotalKeluar += m.Keluar
		if m.JenisPembayaran == MetodeTunai {
			d.TunaiMasuk += m.Masuk
			d.TunaiKeluar += m.Keluar
		}
	}
	for i := range d.Ringkasan {
		r := &d.Ringkasan[i]
		r.Masuk, r.Keluar = roundRp(r.Masuk), roundRp(r.Keluar)
		r.Net = roundRp(r.Masuk - r.Keluar)
	}
	// Tunai first so the drawer total is always the first card.
	if i, ok := idx[MetodeTunai]; ok && i > 0 {
		t := d.Ringkasan[i]
		copy(d.Ringkasan[1:i+1], d.Ringkasan[:i])
		d.Ringkasan[0] = t
	}
	d.TotalMasuk, d.TotalKeluar = roundRp(d.TotalMasuk), roundRp(d.TotalKeluar)
	d.TunaiMasuk, d.TunaiKeluar = roundRp(d.TunaiMasuk), roundRp(d.TunaiKeluar)
	d.ExpectedTunai = roundRp(sh.SaldoAwal + d.TunaiMasuk - d.TunaiKeluar)
	if sh.Status == StatusClosed && sh.ExpectedTunai != nil {
		d.ExpectedTunai = *sh.ExpectedTunai
	}
	return d
}
