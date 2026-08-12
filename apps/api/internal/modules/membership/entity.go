package membership

import (
	"time"

	"github.com/scaleup/clinic-v2/api/internal/modules/pasien"
)

type Membership struct {
	ID        uint          `gorm:"primaryKey" json:"id"`
	Kode      string        `gorm:"size:50;uniqueIndex;not null" json:"kode"`
	PasienID  uint          `gorm:"index;not null" json:"pasien_id"`
	Pasien    *pasien.Pasien `gorm:"foreignKey:PasienID" json:"pasien,omitempty"`
	Tipe      string        `gorm:"size:50" json:"tipe"`
	Points    int           `gorm:"default:0" json:"points"`
	IsActive  bool          `gorm:"default:true" json:"is_active"`
	CreatedAt time.Time     `json:"created_at"`
	UpdatedAt time.Time     `json:"updated_at"`
}

func (Membership) TableName() string { return "memberships" }
