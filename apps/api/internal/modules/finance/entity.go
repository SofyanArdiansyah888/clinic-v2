package finance

import "time"

const (
	TipeAset       = "aset"
	TipeKewajiban  = "kewajiban"
	TipeEkuitas    = "ekuitas"
	TipePendapatan = "pendapatan"
	TipeBeban      = "beban"

	SaldoDebit  = "debit"
	SaldoKredit = "kredit"
)

// Source types recorded on jurnals so a document's entries can be found and reversed.
const (
	SourcePenjualan          = "penjualan"
	SourceDeposit            = "deposit"
	SourcePaket              = "paket"
	SourcePembelian          = "pembelian"
	SourcePelunasanPembelian = "pelunasan_pembelian"
	SourceStokOpname         = "stok_opname"
	SourceManual             = "manual"
)

// Akun is one account in the chart of accounts. Header accounts only group others
// and cannot be posted to.
type Akun struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	Kode        string    `gorm:"size:30;uniqueIndex;not null" json:"kode"`
	Nama        string    `gorm:"size:150;not null" json:"nama"`
	Tipe        string    `gorm:"size:20;not null;index" json:"tipe"`
	SaldoNormal string    `gorm:"size:10;not null" json:"saldo_normal"`
	ParentID    *uint     `gorm:"index" json:"parent_id"`
	IsHeader    bool      `gorm:"default:false" json:"is_header"`
	IsSystem    bool      `gorm:"default:false" json:"is_system"`
	IsActive    bool      `gorm:"default:true" json:"is_active"`
	Keterangan  string    `gorm:"type:text" json:"keterangan"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

func (Akun) TableName() string { return "akuns" }

// AkunMapping links a transaction key (see mapping.go) to the account it posts to.
type AkunMapping struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	Key       string    `gorm:"size:100;uniqueIndex;not null" json:"key"`
	AkunID    uint      `gorm:"not null;index" json:"akun_id"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
	Akun      *Akun     `gorm:"foreignKey:AkunID" json:"akun,omitempty"`
}

func (AkunMapping) TableName() string { return "akun_mappings" }

type Jurnal struct {
	ID           uint           `gorm:"primaryKey" json:"id"`
	Kode         string         `gorm:"size:50;uniqueIndex;not null" json:"kode"`
	Tanggal      time.Time      `gorm:"type:date;not null;index" json:"tanggal"`
	Keterangan   string         `gorm:"type:text" json:"keterangan"`
	Referensi    string         `gorm:"size:100;index" json:"referensi"`
	SourceType   string         `gorm:"size:30;not null;index:idx_jurnal_source" json:"source_type"`
	SourceID     uint           `gorm:"index:idx_jurnal_source" json:"source_id"`
	ReversalOfID *uint          `gorm:"index" json:"reversal_of_id"`
	IsReversed   bool           `gorm:"default:false" json:"is_reversed"`
	CreatedBy    *uint          `json:"created_by"`
	TotalDebit   float64        `gorm:"type:decimal(14,2);default:0" json:"total_debit"`
	TotalKredit  float64        `gorm:"type:decimal(14,2);default:0" json:"total_kredit"`
	CreatedAt    time.Time      `json:"created_at"`
	UpdatedAt    time.Time      `json:"updated_at"`
	Details      []JurnalDetail `gorm:"foreignKey:JurnalID" json:"details,omitempty"`
}

func (Jurnal) TableName() string { return "jurnals" }

type JurnalDetail struct {
	ID         uint      `gorm:"primaryKey" json:"id"`
	JurnalID   uint      `gorm:"not null;index" json:"jurnal_id"`
	AkunID     uint      `gorm:"not null;index" json:"akun_id"`
	Debit      float64   `gorm:"type:decimal(14,2);default:0" json:"debit"`
	Kredit     float64   `gorm:"type:decimal(14,2);default:0" json:"kredit"`
	Keterangan string    `gorm:"type:text" json:"keterangan"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
	Akun       *Akun     `gorm:"foreignKey:AkunID" json:"akun,omitempty"`
}

func (JurnalDetail) TableName() string { return "jurnal_details" }
