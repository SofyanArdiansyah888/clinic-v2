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
	"JRN": "Jurnal",
	"PLB": "Pelunasan Pembelian",
	"SHF": "Shift Kasir",
	"TRF": "Transfer Stok",
}

type MonthlySequence struct {
	ID        uint   `gorm:"primaryKey"`
	Key       string `gorm:"size:16;uniqueIndex:idx_monthly_key_ym"`
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
	n, ym, err := s.next(key)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%s-%s%05d", key, ym, n), nil
}

// GenerateCabang numbers a branch document as KEY-SINGKATAN-YYMM#####, counting per branch.
// Without a branch prefix it falls back to the plain KEY-YYMM##### sequence.
func (s *Service) GenerateCabang(key string, cabangID uint) (string, error) {
	if _, ok := Keys[key]; !ok {
		return "", fmt.Errorf("invalid model key: %s", key)
	}
	var singkatan string
	if cabangID != 0 {
		s.db.Table("cabangs").Where("id = ?", cabangID).Select("singkatan").Scan(&singkatan)
	}
	if singkatan == "" {
		return s.Generate(key)
	}
	seqKey := key + "-" + singkatan
	n, ym, err := s.next(seqKey)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%s-%s%05d", seqKey, ym, n), nil
}

// next bumps the monthly counter for a sequence key.
func (s *Service) next(key string) (int, string, error) {
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
		return 0, "", err
	}
	return seq.Counter, ym, nil
}
