package cabang

import "time"

type Cabang struct {
	ID     uint   `gorm:"primaryKey" json:"id"`
	Kode   string `gorm:"size:50;uniqueIndex;not null" json:"kode"`
	Nama   string `gorm:"size:150;not null" json:"nama"`
	Alamat string `gorm:"type:text" json:"alamat"`
	NoTelp string `gorm:"size:30" json:"no_telp"`
	// Singkatan prefixes the branch's document numbers (e.g. ANT-JKS-2611…); unique.
	Singkatan string `gorm:"size:10;index" json:"singkatan"`
	// IsUtama marks the main branch: the default for users and where existing data was moved.
	IsUtama   bool      `gorm:"default:false" json:"is_utama"`
	IsActive  bool      `gorm:"default:true" json:"is_active"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

func (Cabang) TableName() string { return "cabangs" }

// UserCabang links a login to a branch it may work in (admin may work in every branch).
type UserCabang struct {
	UserID   uint `gorm:"primaryKey" json:"user_id"`
	CabangID uint `gorm:"primaryKey;index" json:"cabang_id"`
}

func (UserCabang) TableName() string { return "user_cabangs" }

// StaffCabang links an employee to a branch they serve; pickers list only that branch's staff.
type StaffCabang struct {
	StaffID  uint `gorm:"primaryKey" json:"staff_id"`
	CabangID uint `gorm:"primaryKey;index" json:"cabang_id"`
}

func (StaffCabang) TableName() string { return "staff_cabangs" }
