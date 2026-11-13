package pembelian

import (
	"time"

	"github.com/scaleup/clinic-v2/api/internal/modules/barang"
	"github.com/scaleup/clinic-v2/api/internal/modules/staff"
	"github.com/scaleup/clinic-v2/api/internal/modules/supplier"
)

type Pembelian struct {
	ID         uint               `gorm:"primaryKey" json:"id"`
	Kode       string             `gorm:"size:50;uniqueIndex;not null" json:"kode"`
	SupplierID uint               `gorm:"not null;index" json:"supplier_id"`
	StaffID    uint               `gorm:"not null;index" json:"staff_id"`
	Tanggal    time.Time          `gorm:"type:date;not null" json:"tanggal"`
	NoInvoice  string             `gorm:"size:50" json:"no_invoice"`
	TotalHarga float64            `gorm:"type:decimal(12,2);default:0" json:"total_harga"`
	Status     string             `gorm:"size:50;default:draft" json:"status"`
	// JumlahDibayar and StatusBayar track settlement of the supplier debt.
	JumlahDibayar float64          `gorm:"type:decimal(12,2);default:0" json:"jumlah_dibayar"`
	StatusBayar   string           `gorm:"size:20;default:belum" json:"status_bayar"`
	Keterangan string             `gorm:"type:text" json:"keterangan"`
	IsActive   bool               `gorm:"default:true" json:"is_active"`
	CreatedAt  time.Time          `json:"created_at"`
	UpdatedAt  time.Time          `json:"updated_at"`
	Supplier   *supplier.Supplier `gorm:"foreignKey:SupplierID" json:"supplier,omitempty"`
	Staff      *staff.Staff       `gorm:"foreignKey:StaffID" json:"staff,omitempty"`
	Details    []PembelianDetail  `gorm:"foreignKey:PembelianID" json:"details,omitempty"`
	Pembayarans []PembelianPembayaran `gorm:"foreignKey:PembelianID" json:"pembayarans,omitempty"`
}

func (Pembelian) TableName() string { return "pembelians" }

type PembelianDetail struct {
	ID          uint           `gorm:"primaryKey" json:"id"`
	Kode        string         `gorm:"size:50;uniqueIndex;not null" json:"kode"`
	PembelianID uint           `gorm:"not null;index" json:"pembelian_id"`
	BarangID    uint           `gorm:"not null;index" json:"barang_id"`
	Qty         int            `gorm:"not null" json:"qty"`
	HargaBeli   float64        `gorm:"type:decimal(12,2);not null" json:"harga_beli"`
	Subtotal    float64        `gorm:"type:decimal(12,2);not null" json:"subtotal"`
	IsActive    bool           `gorm:"default:true" json:"is_active"`
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
	Barang      *barang.Barang `gorm:"foreignKey:BarangID" json:"barang,omitempty"`
}

func (PembelianDetail) TableName() string { return "pembelian_details" }

// PembelianPembayaran is one settlement of a pembelian's supplier debt.
type PembelianPembayaran struct {
	ID              uint      `gorm:"primaryKey" json:"id"`
	Kode            string    `gorm:"size:50;uniqueIndex;not null" json:"kode"`
	PembelianID     uint      `gorm:"not null;index" json:"pembelian_id"`
	Tanggal         time.Time `gorm:"type:date;not null" json:"tanggal"`
	Jumlah          float64   `gorm:"type:decimal(12,2);not null" json:"jumlah"`
	JenisPembayaran string    `gorm:"size:50;not null" json:"jenis_pembayaran"`
	BankID          *uint     `gorm:"index" json:"bank_id"`
	Keterangan      string    `gorm:"type:text" json:"keterangan"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}

func (PembelianPembayaran) TableName() string { return "pembelian_pembayarans" }
