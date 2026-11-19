package treatment

import (
	"strings"
	"time"
)

type Treatment struct {
	ID            uint      `gorm:"primaryKey" json:"id"`
	Kode          string    `gorm:"size:50;uniqueIndex;not null" json:"kode"`
	Nama          string    `gorm:"size:150;not null" json:"nama"`
	Kategori      string    `gorm:"size:100" json:"kategori"`
	Harga         float64   `gorm:"type:decimal(12,2);default:0" json:"harga"`
	Durasi        int       `gorm:"default:0" json:"durasi"`
	SesiPaket     int       `gorm:"default:0" json:"sesi_paket"`
	KomisiDokter  float64   `gorm:"type:decimal(12,2);default:0" json:"komisi_dokter"`
	KomisiTerapis float64   `gorm:"type:decimal(12,2);default:0" json:"komisi_terapis"`
	Deskripsi     string    `gorm:"type:text" json:"deskripsi"`
	IsActive      bool      `gorm:"default:true" json:"is_active"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
	// Items is what a paket treatment contains (e.g. 3x Facial + 2x Peeling); empty for
	// other treatments.
	Items []PaketItem `gorm:"foreignKey:PaketTreatmentID" json:"items,omitempty"`
}

func (Treatment) TableName() string { return "treatments" }

// IsPaket reports whether the treatment is sold as a package of sessions.
func (t Treatment) IsPaket() bool { return IsPaketKategori(t.Kategori) }

// IsPaketKategori is the one rule for "this kategori is a package".
func IsPaketKategori(kategori string) bool {
	return strings.Contains(strings.ToLower(kategori), "paket")
}

// PaketItem is one treatment inside a paket in the catalog. A paket that predates
// multi-treatment packages has a single item pointing at itself.
type PaketItem struct {
	ID               uint       `gorm:"primaryKey" json:"id"`
	PaketTreatmentID uint       `gorm:"not null;index" json:"paket_treatment_id"`
	TreatmentID      uint       `gorm:"not null;index" json:"treatment_id"`
	Sesi             int        `gorm:"not null" json:"sesi"`
	CreatedAt        time.Time  `json:"created_at"`
	UpdatedAt        time.Time  `json:"updated_at"`
	Treatment        *Treatment `gorm:"foreignKey:TreatmentID" json:"treatment,omitempty"`
}

func (PaketItem) TableName() string { return "paket_treatment_items" }
