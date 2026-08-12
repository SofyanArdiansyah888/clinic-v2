package treatment

import "time"

type Treatment struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	Kode      string    `gorm:"size:50;uniqueIndex;not null" json:"kode"`
	Nama      string    `gorm:"size:150;not null" json:"nama"`
	Kategori  string  `gorm:"size:100" json:"kategori"`
	Harga     float64 `gorm:"type:decimal(12,2);default:0" json:"harga"`
	Durasi    int     `gorm:"default:0" json:"durasi"`
	SesiPaket int     `gorm:"default:0" json:"sesi_paket"`
	Deskripsi string  `gorm:"type:text" json:"deskripsi"`
	IsActive  bool      `gorm:"default:true" json:"is_active"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

func (Treatment) TableName() string { return "treatments" }
