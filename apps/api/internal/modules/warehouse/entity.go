package warehouse

import "time"

type KartuStok struct {
	ID         uint      `gorm:"primaryKey" json:"id"`
	Kode       string    `gorm:"size:50;uniqueIndex;not null" json:"kode"`
	BarangID   uint      `gorm:"not null;index" json:"barang_id"`
	Tanggal    time.Time `gorm:"type:date;not null" json:"tanggal"`
	Keterangan string    `gorm:"type:text" json:"keterangan"`
	QtyMasuk   int       `gorm:"default:0" json:"qty_masuk"`
	QtyKeluar  int       `gorm:"default:0" json:"qty_keluar"`
	Saldo      int       `gorm:"not null" json:"saldo"`
	Referensi  string    `gorm:"size:100" json:"referensi"`
	IsActive   bool      `gorm:"default:true" json:"is_active"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}

func (KartuStok) TableName() string { return "kartu_stoks" }

type KonversiStok struct {
	ID         uint                 `gorm:"primaryKey" json:"id"`
	Kode       string               `gorm:"size:50;uniqueIndex;not null" json:"kode"`
	Tanggal    time.Time            `gorm:"type:date;not null" json:"tanggal"`
	Keterangan string               `gorm:"type:text" json:"keterangan"`
	IsActive   bool                 `gorm:"default:true" json:"is_active"`
	CreatedAt  time.Time            `json:"created_at"`
	UpdatedAt  time.Time            `json:"updated_at"`
	Details    []KonversiStokDetail `gorm:"foreignKey:KonversiStokID" json:"details,omitempty"`
}

func (KonversiStok) TableName() string { return "konversi_stoks" }

type KonversiStokDetail struct {
	ID             uint      `gorm:"primaryKey" json:"id"`
	Kode           string    `gorm:"size:50;uniqueIndex;not null" json:"kode"`
	KonversiStokID uint      `gorm:"not null;index" json:"konversi_stok_id"`
	BarangID       uint      `gorm:"not null;index" json:"barang_id"`
	Qty            int       `gorm:"not null" json:"qty"`
	Tipe           string    `gorm:"size:20;not null" json:"tipe"`
	IsActive       bool      `gorm:"default:true" json:"is_active"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

func (KonversiStokDetail) TableName() string { return "konversi_stok_details" }

type ProduksiBarang struct {
	ID         uint                   `gorm:"primaryKey" json:"id"`
	Kode       string                 `gorm:"size:50;uniqueIndex;not null" json:"kode"`
	Tanggal    time.Time              `gorm:"type:date;not null" json:"tanggal"`
	Keterangan string                 `gorm:"type:text" json:"keterangan"`
	IsActive   bool                   `gorm:"default:true" json:"is_active"`
	CreatedAt  time.Time              `json:"created_at"`
	UpdatedAt  time.Time              `json:"updated_at"`
	Details    []ProduksiBarangDetail `gorm:"foreignKey:ProduksiBarangID" json:"details,omitempty"`
}

func (ProduksiBarang) TableName() string { return "produksi_barangs" }

type ProduksiBarangDetail struct {
	ID               uint      `gorm:"primaryKey" json:"id"`
	Kode             string    `gorm:"size:50;uniqueIndex;not null" json:"kode"`
	ProduksiBarangID uint      `gorm:"not null;index" json:"produksi_barang_id"`
	BarangID         uint      `gorm:"not null;index" json:"barang_id"`
	Qty              int       `gorm:"not null" json:"qty"`
	Tipe             string    `gorm:"size:20;not null" json:"tipe"`
	IsActive         bool      `gorm:"default:true" json:"is_active"`
	CreatedAt        time.Time `json:"created_at"`
	UpdatedAt        time.Time `json:"updated_at"`
}

func (ProduksiBarangDetail) TableName() string { return "produksi_barang_details" }

type StokOpname struct {
	ID         uint               `gorm:"primaryKey" json:"id"`
	Kode       string             `gorm:"size:50;uniqueIndex;not null" json:"kode"`
	Tanggal    time.Time          `gorm:"type:date;not null" json:"tanggal"`
	Keterangan string             `gorm:"type:text" json:"keterangan"`
	IsActive   bool               `gorm:"default:true" json:"is_active"`
	CreatedAt  time.Time          `json:"created_at"`
	UpdatedAt  time.Time          `json:"updated_at"`
	Details    []StokOpnameDetail `gorm:"foreignKey:StokOpnameID" json:"details,omitempty"`
}

func (StokOpname) TableName() string { return "stok_opnames" }

type StokOpnameDetail struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	Kode         string    `gorm:"size:50;uniqueIndex;not null" json:"kode"`
	StokOpnameID uint      `gorm:"not null;index" json:"stok_opname_id"`
	BarangID     uint      `gorm:"not null;index" json:"barang_id"`
	StokSistem   int       `gorm:"not null" json:"stok_sistem"`
	StokFisik    int       `gorm:"not null" json:"stok_fisik"`
	Selisih      int       `gorm:"not null" json:"selisih"`
	Keterangan   string    `gorm:"type:text" json:"keterangan"`
	IsActive     bool      `gorm:"default:true" json:"is_active"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

func (StokOpnameDetail) TableName() string { return "stok_opname_details" }
