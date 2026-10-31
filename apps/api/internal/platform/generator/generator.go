package generator

import (
	"fmt"
	"sync"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var Keys = map[string]string{
	"PAS": "Pasien",
	"ANT": "Antrian",
	"TRT": "Treatment",
	"BRG": "Barang",
	"APT": "Appointment",
	"KVS": "Konversi Stok",
	"PRB": "Produksi Barang",
	"STO": "Stok Opname",
	"KST": "Kartu Stok",
	"PRM": "Promo",
	"MEM": "Membership",
	"CAB": "Cabang",
	"BNK": "Bank",
	"PRS": "Perusahaan",
	"SUP": "Supplier",
	"STF": "Staff",
	"PBL": "Pembelian",
	"PJL": "Penjualan",
	"PRW": "Perawatan",
	"RES": "Resep",
	"VCR": "Voucher",
	"DPS": "Deposit",
	"PKT": "Paket Perawatan",
}

type MonthlySequence struct {
	ID        uint   `gorm:"primaryKey"`
	Key       string `gorm:"size:10;uniqueIndex:idx_monthly_key_ym"`
	YearMonth string `gorm:"size:4;uniqueIndex:idx_monthly_key_ym"`
	Counter   int    `gorm:"not null;default:0"`
}

func (MonthlySequence) TableName() string { return "monthly_sequences" }

type Service struct {
	db *gorm.DB
	mu sync.Mutex
}

func New(db *gorm.DB) *Service {
	return &Service{db: db}
}

func (s *Service) AvailableKeys() map[string]string {
	return Keys
}

func (s *Service) Generate(key string) (string, error) {
	if _, ok := Keys[key]; !ok {
		return "", fmt.Errorf("invalid model key: %s", key)
	}
	s.mu.Lock()
	defer s.mu.Unlock()

	ym := time.Now().Format("0601")
	var seq MonthlySequence
	err := s.db.Transaction(func(tx *gorm.DB) error {
		res := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where(MonthlySequence{Key: key, YearMonth: ym}).
			Attrs(MonthlySequence{Counter: 0}).
			FirstOrCreate(&seq)
		if res.Error != nil {
			return res.Error
		}
		seq.Counter++
		return tx.Model(&seq).Update("counter", seq.Counter).Error
	})
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%s-%s%05d", key, ym, seq.Counter), nil
}
