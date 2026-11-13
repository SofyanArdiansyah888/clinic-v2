package perawatan

import (
	"time"

	"github.com/scaleup/clinic-v2/api/internal/modules/barang"
	"github.com/scaleup/clinic-v2/api/internal/modules/pasien"
	"github.com/scaleup/clinic-v2/api/internal/modules/staff"
	"github.com/scaleup/clinic-v2/api/internal/modules/treatment"
	"gorm.io/datatypes"
)

type Perawatan struct {
	ID                  uint                 `gorm:"primaryKey" json:"id"`
	Kode                string               `gorm:"size:50;uniqueIndex;not null" json:"kode"`
	PasienID            uint                 `gorm:"not null;index" json:"pasien_id"`
	TreatmentID         *uint                `gorm:"index" json:"treatment_id"`
	StaffID             uint                 `gorm:"not null;index" json:"staff_id"`
	AntrianID           *uint                `gorm:"index" json:"antrian_id"`
	Tanggal             time.Time            `gorm:"type:date" json:"tanggal"`
	JamMulai            string               `gorm:"size:20" json:"jam_mulai"`
	JamSelesai          string               `gorm:"size:20" json:"jam_selesai"`
	Status              string               `gorm:"size:50;default:draft" json:"status"`
	Anamnesis           string               `gorm:"type:text" json:"anamnesis"`
	PemeriksaanAwal     string               `gorm:"type:text" json:"pemeriksaan_awal"`
	Pemeriksaan         string               `gorm:"type:text" json:"pemeriksaan"`
	Diagnosa            string               `gorm:"type:text" json:"diagnosa"`
	Tindakan            string               `gorm:"type:text" json:"tindakan"`
	Catatan             string               `gorm:"type:text" json:"catatan"`
	Biaya               float64              `gorm:"type:decimal(12,2);default:0" json:"biaya"`
	KunjunganBerikutnya *time.Time           `gorm:"type:date" json:"kunjungan_berikutnya"`
	FotoPerawatan       datatypes.JSON       `gorm:"type:jsonb" json:"foto_perawatan"`
	FotoSebelum         datatypes.JSON       `gorm:"type:jsonb" json:"foto_sebelum"`
	FotoSesudah         datatypes.JSON       `gorm:"type:jsonb" json:"foto_sesudah"`
	IsActive            bool                 `gorm:"default:true" json:"is_active"`
	CreatedAt           time.Time            `json:"created_at"`
	UpdatedAt           time.Time            `json:"updated_at"`
	Pasien              *pasien.Pasien       `gorm:"foreignKey:PasienID" json:"pasien,omitempty"`
	Staff               *staff.Staff         `gorm:"foreignKey:StaffID" json:"staff,omitempty"`
	Treatment           *treatment.Treatment `gorm:"foreignKey:TreatmentID" json:"treatment,omitempty"`
	Tindakans           []PerawatanTindakan  `gorm:"foreignKey:PerawatanID" json:"tindakans,omitempty"`
	Reseps              []PerawatanResep     `gorm:"foreignKey:PerawatanID" json:"reseps,omitempty"`
}

func (Perawatan) TableName() string { return "perawatans" }

type PerawatanTindakan struct {
	ID           uint                 `gorm:"primaryKey" json:"id"`
	PerawatanID  uint                 `gorm:"not null;index" json:"perawatan_id"`
	TreatmentID  uint                 `gorm:"not null;index" json:"treatment_id"`
	Tanggal      time.Time            `gorm:"type:date" json:"tanggal"`
	Jumlah       int                  `gorm:"default:1" json:"jumlah"`
	BeauticianID *uint                `gorm:"index" json:"beautician_id"`
	Harga        float64              `gorm:"type:decimal(12,2);default:0" json:"harga"`
	Diskon       float64              `gorm:"type:decimal(12,2);default:0" json:"diskon"`
	RpPercent    float64              `gorm:"type:decimal(12,2);default:0" json:"rp_percent"`
	Total        float64              `gorm:"type:decimal(12,2);default:0" json:"total"`
	Status       string               `gorm:"size:50;default:draft" json:"status"`
	Catatan      string               `gorm:"type:text" json:"catatan"`
	IsActive     bool                 `gorm:"default:true" json:"is_active"`
	CreatedAt    time.Time            `json:"created_at"`
	UpdatedAt    time.Time            `json:"updated_at"`
	Treatment    *treatment.Treatment `gorm:"foreignKey:TreatmentID" json:"treatment,omitempty"`
	Beautician   *staff.Staff         `gorm:"foreignKey:BeauticianID" json:"beautician,omitempty"`
}

func (PerawatanTindakan) TableName() string { return "perawatan_tindakan" }

type PerawatanResep struct {
	ID          uint                   `gorm:"primaryKey" json:"id"`
	PerawatanID uint                   `gorm:"not null;index" json:"perawatan_id"`
	AntrianID   *uint                  `gorm:"index" json:"antrian_id"`
	PasienID    *uint                  `gorm:"index" json:"pasien_id"`
	StaffID     *uint                  `gorm:"index" json:"staff_id"`
	Kode        string                 `gorm:"size:50" json:"kode"`
	Tanggal     time.Time              `gorm:"type:date" json:"tanggal"`
	Status      string                 `gorm:"size:50;default:draft" json:"status"`
	IsActive    bool                   `gorm:"default:true" json:"is_active"`
	CreatedAt   time.Time              `json:"created_at"`
	UpdatedAt   time.Time              `json:"updated_at"`
	Pasien      *pasien.Pasien         `gorm:"foreignKey:PasienID" json:"pasien,omitempty"`
	Staff       *staff.Staff           `gorm:"foreignKey:StaffID" json:"staff,omitempty"`
	Barangs     []PerawatanResepBarang `gorm:"foreignKey:PerawatanResepID" json:"barangs,omitempty"`
}

func (PerawatanResep) TableName() string { return "perawatan_resep" }

// Resep lifecycle: draft while the doctor edits it, dibayar once the cashier has
// billed it (stock is taken out then), diserahkan after the depo hands it over.
const (
	ResepStatusDibayar    = "dibayar"
	ResepStatusDiserahkan = "diserahkan"
)

type PerawatanResepBarang struct {
	ID               uint           `gorm:"primaryKey" json:"id"`
	PerawatanResepID uint           `gorm:"not null;index" json:"perawatan_resep_id"`
	BarangID         uint           `gorm:"not null;index" json:"barang_id"`
	KodeBarang       string         `gorm:"size:50" json:"kode_barang"`
	NamaBarang       string         `gorm:"size:150" json:"nama_barang"`
	Jumlah           float64        `gorm:"type:decimal(12,2);default:0" json:"jumlah"`
	Unit             string         `gorm:"size:50" json:"unit"`
	Harga            float64        `gorm:"type:decimal(12,2);default:0" json:"harga"`
	Total            float64        `gorm:"type:decimal(12,2);default:0" json:"total"`
	IsActive         bool           `gorm:"default:true" json:"is_active"`
	CreatedAt        time.Time      `json:"created_at"`
	UpdatedAt        time.Time      `json:"updated_at"`
	Barang           *barang.Barang `gorm:"foreignKey:BarangID" json:"barang,omitempty"`
}

func (PerawatanResepBarang) TableName() string { return "perawatan_resep_barang" }
