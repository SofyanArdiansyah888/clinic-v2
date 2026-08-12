package appointment

import (
	"time"

	"github.com/scaleup/clinic-v2/api/internal/modules/pasien"
	"github.com/scaleup/clinic-v2/api/internal/modules/staff"
)

type Appointment struct {
	ID         uint           `gorm:"primaryKey" json:"id"`
	Kode       string         `gorm:"size:50;uniqueIndex;not null" json:"kode"`
	PasienID   uint           `gorm:"not null;index" json:"pasien_id"`
	StaffID    uint           `gorm:"not null;index" json:"staff_id"`
	Tanggal    time.Time      `gorm:"type:date;not null" json:"tanggal"`
	Jam        string         `gorm:"size:20" json:"jam"`
	Status     string         `gorm:"size:50;default:scheduled" json:"status"`
	Keterangan string         `gorm:"type:text" json:"keterangan"`
	IsActive   bool           `gorm:"default:true" json:"is_active"`
	CreatedAt  time.Time      `json:"created_at"`
	UpdatedAt  time.Time      `json:"updated_at"`
	Pasien     *pasien.Pasien `gorm:"foreignKey:PasienID" json:"pasien,omitempty"`
	Staff      *staff.Staff   `gorm:"foreignKey:StaffID" json:"staff,omitempty"`
}

func (Appointment) TableName() string { return "appointments" }
