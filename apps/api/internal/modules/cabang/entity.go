package cabang

import "time"

type Cabang struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	Kode      string    `gorm:"size:50;uniqueIndex;not null" json:"kode"`
	Nama      string    `gorm:"size:150;not null" json:"nama"`
	Alamat string `gorm:"type:text" json:"alamat"`
	NoTelp string `gorm:"size:30" json:"no_telp"`
	IsActive  bool      `gorm:"default:true" json:"is_active"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

func (Cabang) TableName() string { return "cabangs" }
