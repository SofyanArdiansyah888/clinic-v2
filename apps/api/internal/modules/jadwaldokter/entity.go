package jadwaldokter

import "time"

type JadwalDokter struct {
	ID         uint      `gorm:"primaryKey" json:"id"`
	DokterNama string    `gorm:"size:150;not null" json:"dokter_nama"`
	Hari       string    `gorm:"size:10;not null;index" json:"hari"`
	JamMulai   string    `gorm:"size:5;not null" json:"jam_mulai"`
	JamSelesai string    `gorm:"size:5;not null" json:"jam_selesai"`
	IsActive   bool      `gorm:"default:true" json:"is_active"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}

func (JadwalDokter) TableName() string { return "jadwal_dokters" }
