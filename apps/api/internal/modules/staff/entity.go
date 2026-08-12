package staff

import "time"

type Staff struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	Kode      string    `gorm:"size:50;uniqueIndex;not null" json:"kode"`
	Nama      string    `gorm:"size:150;not null" json:"nama"`
	Jabatan string `gorm:"size:100" json:"jabatan"`
	NoTelp  string `gorm:"size:30" json:"no_telp"`
	Email   string `gorm:"size:150" json:"email"`
	IsActive  bool      `gorm:"default:true" json:"is_active"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

func (Staff) TableName() string { return "staffs" }
