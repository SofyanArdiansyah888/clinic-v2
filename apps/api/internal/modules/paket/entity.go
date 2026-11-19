// Package paket keeps treatment packages bought by pasien: what each package contains
// (per treatment item, with its remaining sessions and value per session) and every
// session redeemed. It only depends on treatment so perawatan and pembayaran can use it.
package paket

import (
	"math"
	"time"

	"github.com/scaleup/clinic-v2/api/internal/modules/pasien"
	"github.com/scaleup/clinic-v2/api/internal/modules/staff"
	"github.com/scaleup/clinic-v2/api/internal/modules/treatment"
)

const (
	StatusAktif      = "aktif"
	StatusHabis      = "habis"
	StatusDibatalkan = "dibatalkan"

	PemakaianAktif      = "aktif"
	PemakaianDibatalkan = "dibatalkan"
)

// PaketPerawatan is a package bought by a pasien. TotalSesi / SisaSesi are the sums
// over its items, kept for lists and older screens.
type PaketPerawatan struct {
	ID              uint      `gorm:"primaryKey" json:"id"`
	Kode            string    `gorm:"size:50;uniqueIndex;not null" json:"kode"`
	CabangID        uint      `gorm:"not null;default:0;index" json:"cabang_id"`
	PasienID        uint      `gorm:"not null;index" json:"pasien_id"`
	TreatmentID     uint      `gorm:"not null;index" json:"treatment_id"`
	StaffID         uint      `gorm:"not null;index" json:"staff_id"`
	PenjualanID     *uint     `gorm:"index" json:"penjualan_id"`
	PerawatanID     *uint     `gorm:"index" json:"perawatan_id"`
	TindakanID      *uint     `gorm:"index" json:"tindakan_id"`
	TanggalBeli     time.Time `gorm:"type:date;not null" json:"tanggal_beli"`
	TotalSesi       int       `gorm:"not null" json:"total_sesi"`
	SisaSesi        int       `gorm:"not null" json:"sisa_sesi"`
	HargaTotal      float64   `gorm:"type:decimal(12,2);default:0" json:"harga_total"`
	Status          string    `gorm:"size:50;default:aktif" json:"status"`
	KeteranganBatal string    `gorm:"type:text" json:"keterangan_batal"`
	Refund          float64   `gorm:"type:decimal(12,2);default:0" json:"refund"`
	// PendapatanDitunda: the price was booked as a liability (paket.titipan) and becomes
	// revenue per redeemed session. Packages sold before that booked revenue up front.
	PendapatanDitunda bool                 `gorm:"not null;default:false" json:"pendapatan_ditunda"`
	IsActive          bool                 `gorm:"default:true" json:"is_active"`
	CreatedAt         time.Time            `json:"created_at"`
	UpdatedAt         time.Time            `json:"updated_at"`
	Pasien            *pasien.Pasien       `gorm:"foreignKey:PasienID" json:"pasien,omitempty"`
	Staff             *staff.Staff         `gorm:"foreignKey:StaffID" json:"staff,omitempty"`
	Treatment         *treatment.Treatment `gorm:"foreignKey:TreatmentID" json:"treatment,omitempty"`
	Items             []Item               `gorm:"foreignKey:PaketPerawatanID" json:"items,omitempty"`
	// NilaiSisa is the value of the unused sessions: the most that can be refunded.
	NilaiSisa float64 `gorm:"-" json:"nilai_sisa"`
}

func (PaketPerawatan) TableName() string { return "paket_perawatans" }

// Item is one treatment inside a bought package. NilaiTotal is this item's share of
// the package price (by treatment price x sessions); every session is worth
// NilaiPerSesi except the item's last one, which takes the rounding remainder.
type Item struct {
	ID               uint                 `gorm:"primaryKey" json:"id"`
	PaketPerawatanID uint                 `gorm:"not null;index" json:"paket_perawatan_id"`
	TreatmentID      uint                 `gorm:"not null;index" json:"treatment_id"`
	TotalSesi        int                  `gorm:"not null" json:"total_sesi"`
	SisaSesi         int                  `gorm:"not null" json:"sisa_sesi"`
	NilaiTotal       float64              `gorm:"type:decimal(14,2);not null;default:0" json:"nilai_total"`
	NilaiPerSesi     float64              `gorm:"type:decimal(14,2);not null;default:0" json:"nilai_per_sesi"`
	CreatedAt        time.Time            `json:"created_at"`
	UpdatedAt        time.Time            `json:"updated_at"`
	Treatment        *treatment.Treatment `gorm:"foreignKey:TreatmentID" json:"treatment,omitempty"`
	NilaiSisa        float64              `gorm:"-" json:"nilai_sisa"`
}

func (Item) TableName() string { return "paket_perawatan_items" }

// Pemakaian is a session (or several, Qty) redeemed from a package item.
type Pemakaian struct {
	ID                  uint      `gorm:"primaryKey" json:"id"`
	PaketPerawatanID    uint      `gorm:"not null;index" json:"paket_perawatan_id"`
	PaketItemID         uint      `gorm:"not null;index" json:"paket_item_id"`
	CabangID            uint      `gorm:"not null;default:0;index" json:"cabang_id"`
	PasienID            uint      `gorm:"not null;index" json:"pasien_id"`
	PerawatanID         *uint     `gorm:"index" json:"perawatan_id"`
	PerawatanTindakanID *uint     `gorm:"index" json:"perawatan_tindakan_id"`
	PenjualanID         *uint     `gorm:"index" json:"penjualan_id"`
	Tanggal             time.Time `gorm:"type:date;not null" json:"tanggal"`
	Qty                 int       `gorm:"not null" json:"qty"`
	Nilai               float64   `gorm:"type:decimal(14,2);not null;default:0" json:"nilai"`
	Status              string    `gorm:"size:20;not null;default:aktif;index" json:"status"`
	CreatedAt           time.Time `json:"created_at"`
	UpdatedAt           time.Time `json:"updated_at"`
}

func (Pemakaian) TableName() string { return "paket_pemakaians" }

func round2(v float64) float64 { return math.Round(v*100) / 100 }

// Terpakai is the value already redeemed from the item.
func (i Item) Terpakai() float64 {
	if i.SisaSesi <= 0 {
		return i.NilaiTotal
	}
	return round2(i.NilaiPerSesi * float64(i.TotalSesi-i.SisaSesi))
}

// Sisa is the value of the item's unused sessions.
func (i Item) Sisa() float64 {
	if i.SisaSesi <= 0 {
		return 0
	}
	return round2(i.NilaiTotal - i.Terpakai())
}

// nilaiPakai is what redeeming qty sessions is worth: the per-session value, or the
// whole remainder when they are the item's last sessions.
func (i Item) nilaiPakai(qty int) float64 {
	if qty >= i.SisaSesi {
		return i.Sisa()
	}
	return round2(i.NilaiPerSesi * float64(qty))
}

// fill sets the computed values for JSON.
func (p *PaketPerawatan) fill() {
	p.NilaiSisa = 0
	for k := range p.Items {
		p.Items[k].NilaiSisa = p.Items[k].Sisa()
		p.NilaiSisa += p.Items[k].NilaiSisa
	}
	p.NilaiSisa = round2(p.NilaiSisa)
}
