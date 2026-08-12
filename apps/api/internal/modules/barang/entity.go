package barang

import "time"

type Barang struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	Kode         string    `gorm:"size:50;uniqueIndex;not null" json:"kode"`
	Nama         string    `gorm:"size:150;not null" json:"nama"`
	Kategori     string    `gorm:"size:100" json:"kategori"`
	Satuan       string    `gorm:"size:50" json:"satuan"`
	HargaBeli    float64   `gorm:"type:decimal(12,2);default:0" json:"harga_beli"`
	HargaJual    float64   `gorm:"type:decimal(12,2);default:0" json:"harga_jual"`
	StokMinimal  int       `gorm:"default:0" json:"stok_minimal"`
	StokAktual   int       `gorm:"default:0" json:"stok_aktual"`
	LokasiBarang string    `gorm:"size:150" json:"lokasi_barang"`
	IsActive     bool      `gorm:"default:true" json:"is_active"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

func (Barang) TableName() string { return "barangs" }
