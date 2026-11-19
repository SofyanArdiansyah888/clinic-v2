package pembayaran

import (
	"time"

	"github.com/scaleup/clinic-v2/api/internal/modules/bank"
	"github.com/scaleup/clinic-v2/api/internal/modules/paket"
	"github.com/scaleup/clinic-v2/api/internal/modules/pasien"
	"github.com/scaleup/clinic-v2/api/internal/modules/staff"
	"github.com/scaleup/clinic-v2/api/internal/modules/treatment"
)

type DepositTransaksi struct {
	ID              uint                 `gorm:"primaryKey" json:"id"`
	Kode            string               `gorm:"size:50;uniqueIndex;not null" json:"kode"`
	CabangID        uint                 `gorm:"not null;default:0;index" json:"cabang_id"`
	PasienID        uint                 `gorm:"not null;index" json:"pasien_id"`
	MembershipID    *uint                `gorm:"index" json:"membership_id"`
	TreatmentID     *uint                `gorm:"index" json:"treatment_id"`
	StaffID         uint                 `gorm:"not null;index" json:"staff_id"`
	Tanggal         time.Time            `gorm:"type:date;not null" json:"tanggal"`
	Kwitansi        string               `gorm:"size:50" json:"kwitansi"`
	Jenis           string               `gorm:"size:50;not null" json:"jenis"`
	Jumlah          float64              `gorm:"type:decimal(12,2);not null" json:"jumlah"`
	JenisPembayaran string               `gorm:"size:50" json:"jenis_pembayaran"`
	BankID          *uint                `gorm:"index" json:"bank_id"`
	Keterangan      string               `gorm:"type:text" json:"keterangan"`
	IsActive        bool                 `gorm:"default:true" json:"is_active"`
	CreatedAt       time.Time            `json:"created_at"`
	UpdatedAt       time.Time            `json:"updated_at"`
	Pasien          *pasien.Pasien       `gorm:"foreignKey:PasienID" json:"pasien,omitempty"`
	Staff           *staff.Staff         `gorm:"foreignKey:StaffID" json:"staff,omitempty"`
	Bank            *bank.Bank           `gorm:"foreignKey:BankID" json:"bank,omitempty"`
	Treatment       *treatment.Treatment `gorm:"foreignKey:TreatmentID" json:"treatment,omitempty"`

	// PenjualanID links deposit used at the kasir to the sale it paid, so a void can give it back.
	PenjualanID *uint `gorm:"index" json:"penjualan_id"`
}

func (DepositTransaksi) TableName() string { return "deposit_transaksis" }

// PaketPerawatan moved to the paket module; the alias keeps older callers compiling.
type PaketPerawatan = paket.PaketPerawatan
