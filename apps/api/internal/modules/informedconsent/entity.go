package informedconsent

import "time"

type Template struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	Judul     string    `gorm:"size:200;not null" json:"judul"`
	Kategori  string    `gorm:"size:100" json:"kategori"`
	Isi       string    `gorm:"type:text;not null" json:"isi"`
	IsActive  bool      `gorm:"default:true" json:"is_active"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

func (Template) TableName() string { return "template_informed_consents" }
