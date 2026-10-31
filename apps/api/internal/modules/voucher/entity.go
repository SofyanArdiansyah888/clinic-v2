package voucher

import "time"

type Voucher struct {
	ID             uint       `gorm:"primaryKey" json:"id"`
	Kode           string     `gorm:"size:50;uniqueIndex;not null" json:"kode"`
	Nama           string     `gorm:"size:150;not null" json:"nama"`
	TipeDiskon     string     `gorm:"size:20" json:"tipe_diskon"`
	NilaiDiskon    float64    `gorm:"type:decimal(12,2);default:0" json:"nilai_diskon"`
	MinPembelian   float64    `gorm:"type:decimal(12,2);default:0" json:"min_pembelian"`
	TanggalMulai   *time.Time `gorm:"type:date" json:"tanggal_mulai"`
	TanggalSelesai *time.Time `gorm:"type:date" json:"tanggal_selesai"`
	IsActive       bool       `gorm:"default:true" json:"is_active"`
	CreatedAt      time.Time  `json:"created_at"`
	UpdatedAt      time.Time  `json:"updated_at"`
}

func (Voucher) TableName() string { return "vouchers" }

// Potongan returns the discount amount for the given total, never more than the total.
func (x *Voucher) Potongan(total float64) float64 {
	potongan := x.NilaiDiskon
	if x.TipeDiskon == "percent" {
		potongan = total * x.NilaiDiskon / 100
	}
	if potongan > total {
		return total
	}
	if potongan < 0 {
		return 0
	}
	return potongan
}
