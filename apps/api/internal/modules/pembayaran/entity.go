package pembayaran

import (
	"time"

	"github.com/scaleup/clinic-v2/api/internal/modules/bank"
	"github.com/scaleup/clinic-v2/api/internal/modules/pasien"
	"github.com/scaleup/clinic-v2/api/internal/modules/staff"
	"github.com/scaleup/clinic-v2/api/internal/modules/treatment"
)

type DepositTransaksi struct {
	ID              uint           `gorm:"primaryKey" json:"id"`
	Kode            string         `gorm:"size:50;uniqueIndex;not null" json:"kode"`
	PasienID        uint           `gorm:"not null;index" json:"pasien_id"`
	MembershipID    *uint          `gorm:"index" json:"membership_id"`
	TreatmentID     *uint          `gorm:"index" json:"treatment_id"`
	StaffID         uint           `gorm:"not null;index" json:"staff_id"`
	Tanggal         time.Time      `gorm:"type:date;not null" json:"tanggal"`
	Kwitansi        string         `gorm:"size:50" json:"kwitansi"`
	Jenis           string         `gorm:"size:50;not null" json:"jenis"`
	Jumlah          float64        `gorm:"type:decimal(12,2);not null" json:"jumlah"`
	JenisPembayaran string         `gorm:"size:50" json:"jenis_pembayaran"`
	BankID          *uint          `gorm:"index" json:"bank_id"`
	Keterangan      string         `gorm:"type:text" json:"keterangan"`
	IsActive        bool           `gorm:"default:true" json:"is_active"`
	CreatedAt       time.Time      `json:"created_at"`
	UpdatedAt       time.Time      `json:"updated_at"`
	Pasien          *pasien.Pasien `gorm:"foreignKey:PasienID" json:"pasien,omitempty"`
	Staff           *staff.Staff   `gorm:"foreignKey:StaffID" json:"staff,omitempty"`
	Bank            *bank.Bank     `gorm:"foreignKey:BankID" json:"bank,omitempty"`
	Treatment       *treatment.Treatment `gorm:"foreignKey:TreatmentID" json:"treatment,omitempty"`
}

func (DepositTransaksi) TableName() string { return "deposit_transaksis" }

type PaketPerawatan struct {
	ID          uint               `gorm:"primaryKey" json:"id"`
	Kode        string             `gorm:"size:50;uniqueIndex;not null" json:"kode"`
	PasienID    uint               `gorm:"not null;index" json:"pasien_id"`
	TreatmentID uint               `gorm:"not null;index" json:"treatment_id"`
	StaffID     uint               `gorm:"not null;index" json:"staff_id"`
	TanggalBeli time.Time          `gorm:"type:date;not null" json:"tanggal_beli"`
	TotalSesi   int                `gorm:"not null" json:"total_sesi"`
	SisaSesi    int                `gorm:"not null" json:"sisa_sesi"`
	HargaTotal       float64            `gorm:"type:decimal(12,2);default:0" json:"harga_total"`
	Status           string             `gorm:"size:50;default:aktif" json:"status"`
	KeteranganBatal  string             `gorm:"type:text" json:"keterangan_batal"`
	Refund           float64            `gorm:"type:decimal(12,2);default:0" json:"refund"`
	IsActive    bool               `gorm:"default:true" json:"is_active"`
	CreatedAt   time.Time          `json:"created_at"`
	UpdatedAt   time.Time          `json:"updated_at"`
	Pasien      *pasien.Pasien     `gorm:"foreignKey:PasienID" json:"pasien,omitempty"`
	Staff       *staff.Staff       `gorm:"foreignKey:StaffID" json:"staff,omitempty"`
	Treatment   *treatment.Treatment `gorm:"foreignKey:TreatmentID" json:"treatment,omitempty"`
}

func (PaketPerawatan) TableName() string { return "paket_perawatans" }
