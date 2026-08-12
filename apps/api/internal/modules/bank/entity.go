package bank

import "time"

type Bank struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	Kode      string    `gorm:"size:50;uniqueIndex;not null" json:"kode"`
	Nama      string    `gorm:"size:150;not null" json:"nama"`
	NoRekening string `gorm:"size:50" json:"no_rekening"`
	AtasNama   string `gorm:"size:150" json:"atas_nama"`
	IsActive  bool      `gorm:"default:true" json:"is_active"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

func (Bank) TableName() string { return "banks" }
