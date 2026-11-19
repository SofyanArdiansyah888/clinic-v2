package user

import (
	"time"

	"gorm.io/datatypes"
)

type User struct {
	ID       uint           `gorm:"primaryKey" json:"id"`
	Name     string         `gorm:"size:150;not null" json:"name"`
	Email    string         `gorm:"size:150;uniqueIndex;not null" json:"email"`
	Username string         `gorm:"size:100;uniqueIndex;not null" json:"username"`
	Password string         `gorm:"size:255;not null" json:"-"`
	Role     string         `gorm:"size:20;not null;default:staff" json:"role"`
	HakAkses datatypes.JSON `gorm:"type:jsonb" json:"hak_akses"`
	IsActive bool           `gorm:"default:true" json:"is_active"`
	// StaffID links the login to the employee it acts as; non-admin transactions are
	// recorded under this staff only.
	StaffID *uint `gorm:"index" json:"staff_id"`
	// CabangIDs are the branches this record belongs to (filled from the link table).
	CabangIDs []uint    `gorm:"-" json:"cabang_ids"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

func (User) TableName() string { return "users" }
