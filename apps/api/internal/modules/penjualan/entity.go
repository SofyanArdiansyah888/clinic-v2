package penjualan

import (
	"time"

	"github.com/scaleup/clinic-v2/api/internal/modules/pasien"
	"github.com/scaleup/clinic-v2/api/internal/modules/staff"
)

type Penjualan struct {
	ID         uint              `gorm:"primaryKey" json:"id"`
	Kode       string            `gorm:"size:50;uniqueIndex;not null" json:"kode"`
	PasienID   uint              `gorm:"not null;index" json:"pasien_id"`
	StaffID    uint              `gorm:"not null;index" json:"staff_id"`
	Tanggal    time.Time         `gorm:"type:date;not null" json:"tanggal"`
	NoInvoice  string            `gorm:"size:50;uniqueIndex" json:"no_invoice"`
	TotalHarga float64           `gorm:"type:decimal(12,2);default:0" json:"total_harga"`
	Status     string            `gorm:"size:50;default:draft" json:"status"`
	Keterangan string            `gorm:"type:text" json:"keterangan"`
	IsActive   bool              `gorm:"default:true" json:"is_active"`
	CreatedAt  time.Time         `json:"created_at"`
	UpdatedAt  time.Time         `json:"updated_at"`
	Pasien     *pasien.Pasien    `gorm:"foreignKey:PasienID" json:"pasien,omitempty"`
	Staff      *staff.Staff      `gorm:"foreignKey:StaffID" json:"staff,omitempty"`
	Details    []PenjualanDetail `gorm:"foreignKey:PenjualanID" json:"details,omitempty"`
}

func (Penjualan) TableName() string { return "penjualans" }

type PenjualanDetail struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	Kode        string    `gorm:"size:50;uniqueIndex;not null" json:"kode"`
	PenjualanID uint      `gorm:"not null;index" json:"penjualan_id"`
	BarangID    uint      `gorm:"not null;index" json:"barang_id"`
	Qty         int       `gorm:"not null" json:"qty"`
	HargaJual   float64   `gorm:"type:decimal(12,2);not null" json:"harga_jual"`
	Subtotal    float64   `gorm:"type:decimal(12,2);not null" json:"subtotal"`
	IsActive    bool      `gorm:"default:true" json:"is_active"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

func (PenjualanDetail) TableName() string { return "penjualan_details" }
