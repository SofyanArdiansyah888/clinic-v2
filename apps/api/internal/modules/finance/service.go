package finance

import (
	"errors"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/scaleup/clinic-v2/api/internal/platform/generator"
	"github.com/scaleup/clinic-v2/api/internal/platform/pagination"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type Service struct {
	db  *gorm.DB
	gen *generator.Service
}

func NewService(db *gorm.DB, gen *generator.Service) *Service { return &Service{db: db, gen: gen} }

// ── Akun ──

type AkunRequest struct {
	Kode        string `json:"kode" binding:"required"`
	Nama        string `json:"nama" binding:"required"`
	Tipe        string `json:"tipe" binding:"required,oneof=aset kewajiban ekuitas pendapatan beban"`
	SaldoNormal string `json:"saldo_normal" binding:"omitempty,oneof=debit kredit"`
	ParentID    *uint  `json:"parent_id"`
	IsHeader    bool   `json:"is_header"`
	IsActive    *bool  `json:"is_active"`
	Keterangan  string `json:"keterangan"`
}

type AkunFilter struct {
	Tipe     string
	Search   string
	Postable bool
}

func (s *Service) ListAkun(f AkunFilter) ([]Akun, error) {
	q := s.db.Model(&Akun{})
	if f.Tipe != "" {
		q = q.Where("tipe = ?", f.Tipe)
	}
	if f.Search != "" {
		like := "%" + f.Search + "%"
		q = q.Where("kode ILIKE ? OR nama ILIKE ?", like, like)
	}
	if f.Postable {
		q = q.Where("is_header = ? AND is_active = ?", false, true)
	}
	var items []Akun
	err := q.Order("kode ASC").Find(&items).Error
	return items, err
}

func (s *Service) GetAkun(id uint) (*Akun, error) {
	var a Akun
	if err := s.db.First(&a, id).Error; err != nil {
		return nil, err
	}
	return &a, nil
}

func (s *Service) akunDipakai(id uint) (bool, error) {
	var n int64
	err := s.db.Model(&JurnalDetail{}).Where("akun_id = ?", id).Count(&n).Error
	return n > 0, err
}

func (s *Service) applyAkun(a *Akun, req AkunRequest) error {
	a.Kode = strings.TrimSpace(req.Kode)
	a.Nama = strings.TrimSpace(req.Nama)
	a.Tipe = req.Tipe
	a.SaldoNormal = req.SaldoNormal
	if a.SaldoNormal == "" {
		a.SaldoNormal = NormalOf(req.Tipe)
	}
	a.IsHeader = req.IsHeader
	a.Keterangan = req.Keterangan
	if req.IsActive != nil {
		a.IsActive = *req.IsActive
	}
	a.ParentID = nil
	if req.ParentID != nil && *req.ParentID > 0 {
		if a.ID != 0 && *req.ParentID == a.ID {
			return errors.New("akun tidak bisa menjadi induk dirinya sendiri")
		}
		var p Akun
		if err := s.db.First(&p, *req.ParentID).Error; err != nil {
			return errors.New("akun induk tidak ditemukan")
		}
		if !p.IsHeader {
			return errors.New("akun induk harus akun header")
		}
		if p.Tipe != a.Tipe {
			return errors.New("tipe akun harus sama dengan akun induk")
		}
		pid := p.ID
		a.ParentID = &pid
	}
	return nil
}

func (s *Service) CreateAkun(req AkunRequest) (*Akun, error) {
	a := &Akun{IsActive: true}
	if err := s.applyAkun(a, req); err != nil {
		return nil, err
	}
	if err := s.db.Create(a).Error; err != nil {
		if strings.Contains(err.Error(), "duplicate") {
			return nil, fmt.Errorf("kode akun %s sudah dipakai", a.Kode)
		}
		return nil, err
	}
	return a, nil
}

func (s *Service) UpdateAkun(id uint, req AkunRequest) (*Akun, error) {
	a, err := s.GetAkun(id)
	if err != nil {
		return nil, err
	}
	used, err := s.akunDipakai(id)
	if err != nil {
		return nil, err
	}
	if used && (req.IsHeader || req.Tipe != a.Tipe) {
		return nil, errors.New("akun sudah dipakai di jurnal: tipe dan status header tidak bisa diubah")
	}
	if req.IsHeader && !a.IsHeader {
		var n int64
		s.db.Model(&AkunMapping{}).Where("akun_id = ?", id).Count(&n)
		if n > 0 {
			return nil, errors.New("akun dipakai di Pengaturan Akun, tidak bisa dijadikan header")
		}
	}
	if err := s.applyAkun(a, req); err != nil {
		return nil, err
	}
	if err := s.db.Save(a).Error; err != nil {
		if strings.Contains(err.Error(), "duplicate") {
			return nil, fmt.Errorf("kode akun %s sudah dipakai", a.Kode)
		}
		return nil, err
	}
	return a, nil
}

func (s *Service) DeleteAkun(id uint) error {
	a, err := s.GetAkun(id)
	if err != nil {
		return err
	}
	if a.IsSystem {
		return errors.New("akun bawaan sistem tidak bisa dihapus, nonaktifkan saja")
	}
	if used, err := s.akunDipakai(id); err != nil {
		return err
	} else if used {
		return errors.New("akun sudah dipakai di jurnal, nonaktifkan saja")
	}
	var n int64
	s.db.Model(&AkunMapping{}).Where("akun_id = ?", id).Count(&n)
	if n > 0 {
		return errors.New("akun masih dipakai di Pengaturan Akun")
	}
	s.db.Model(&Akun{}).Where("parent_id = ?", id).Count(&n)
	if n > 0 {
		return errors.New("akun masih memiliki sub-akun")
	}
	return s.db.Delete(a).Error
}

// ── Mapping ──

type MappingItem struct {
	MappingKey
	AkunID *uint `json:"akun_id"`
}

type BankMapping struct {
	BankID uint   `json:"bank_id"`
	Kode   string `json:"kode"`
	Nama   string `json:"nama"`
	Key    string `json:"key"`
	AkunID *uint  `json:"akun_id"`
}

type MappingResponse struct {
	Items []MappingItem `json:"items"`
	Banks []BankMapping `json:"banks"`
}

var bankKey = regexp.MustCompile(`^bank\.(\d+)$`)

func isFixedKey(key string) bool {
	for _, k := range MappingKeys {
		if k.Key == key {
			return true
		}
	}
	return false
}

func (s *Service) GetMapping() (*MappingResponse, error) {
	var maps []AkunMapping
	if err := s.db.Find(&maps).Error; err != nil {
		return nil, err
	}
	byKey := map[string]uint{}
	for _, m := range maps {
		byKey[m.Key] = m.AkunID
	}
	res := &MappingResponse{Items: []MappingItem{}, Banks: []BankMapping{}}
	for _, k := range MappingKeys {
		item := MappingItem{MappingKey: k}
		if id, ok := byKey[k.Key]; ok {
			id := id
			item.AkunID = &id
		}
		res.Items = append(res.Items, item)
	}
	var banks []struct {
		ID   uint
		Kode string
		Nama string
	}
	if err := s.db.Table("banks").Select("id, kode, nama").Where("is_active = ?", true).Order("nama").Scan(&banks).Error; err != nil {
		return nil, err
	}
	for _, b := range banks {
		key := fmt.Sprintf("%s%d", KeyBankPrefix, b.ID)
		bm := BankMapping{BankID: b.ID, Kode: b.Kode, Nama: b.Nama, Key: key}
		if id, ok := byKey[key]; ok {
			id := id
			bm.AkunID = &id
		}
		res.Banks = append(res.Banks, bm)
	}
	return res, nil
}

type MappingUpdate struct {
	Key    string `json:"key" binding:"required"`
	AkunID *uint  `json:"akun_id"`
}

type MappingRequest struct {
	Items []MappingUpdate `json:"items" binding:"required,dive"`
}

func (s *Service) UpdateMapping(req MappingRequest) (*MappingResponse, error) {
	err := s.db.Transaction(func(tx *gorm.DB) error {
		for _, it := range req.Items {
			fixed := isFixedKey(it.Key)
			if !fixed && !bankKey.MatchString(it.Key) {
				return fmt.Errorf("key %q tidak dikenal", it.Key)
			}
			if it.AkunID == nil || *it.AkunID == 0 {
				if fixed {
					return fmt.Errorf("akun untuk %q wajib diisi", it.Key)
				}
				if err := tx.Where("key = ?", it.Key).Delete(&AkunMapping{}).Error; err != nil {
					return err
				}
				continue
			}
			var a Akun
			if err := tx.First(&a, *it.AkunID).Error; err != nil {
				return fmt.Errorf("akun #%d tidak ditemukan", *it.AkunID)
			}
			if a.IsHeader {
				return fmt.Errorf("akun %s %s adalah akun header", a.Kode, a.Nama)
			}
			m := AkunMapping{Key: it.Key, AkunID: a.ID}
			if err := tx.Clauses(clause.OnConflict{
				Columns:   []clause.Column{{Name: "key"}},
				DoUpdates: clause.AssignmentColumns([]string{"akun_id", "updated_at"}),
			}).Create(&m).Error; err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.GetMapping()
}

// ── Jurnal ──

type JurnalFilter struct {
	Dari, Sampai string
	SourceType   string
	AkunID       uint
}

func (s *Service) ListJurnal(p pagination.Params, f JurnalFilter) ([]Jurnal, pagination.Meta, error) {
	q := s.db.Model(&Jurnal{}).Preload("Details", func(db *gorm.DB) *gorm.DB {
		return db.Order("debit DESC, id ASC")
	}).Preload("Details.Akun")
	if f.Dari != "" {
		q = q.Where("tanggal >= ?", f.Dari)
	}
	if f.Sampai != "" {
		q = q.Where("tanggal <= ?", f.Sampai)
	}
	if f.SourceType != "" {
		q = q.Where("source_type = ?", f.SourceType)
	}
	if f.AkunID > 0 {
		q = q.Where("id IN (?)", s.db.Model(&JurnalDetail{}).Select("jurnal_id").Where("akun_id = ?", f.AkunID))
	}
	if p.Search != "" {
		like := "%" + p.Search + "%"
		q = q.Where("kode ILIKE ? OR referensi ILIKE ? OR keterangan ILIKE ?", like, like, like)
	}
	var items []Jurnal
	meta, err := pagination.Paginate(q, p, &items)
	return items, meta, err
}

func (s *Service) GetJurnal(id uint) (*Jurnal, error) {
	var j Jurnal
	err := s.db.Preload("Details", func(db *gorm.DB) *gorm.DB {
		return db.Order("debit DESC, id ASC")
	}).Preload("Details.Akun").First(&j, id).Error
	if err != nil {
		return nil, err
	}
	return &j, nil
}

type JurnalLineRequest struct {
	AkunID     uint    `json:"akun_id" binding:"required"`
	Debit      float64 `json:"debit"`
	Kredit     float64 `json:"kredit"`
	Keterangan string  `json:"keterangan"`
}

type JurnalRequest struct {
	Tanggal    string              `json:"tanggal" binding:"required"`
	Keterangan string              `json:"keterangan" binding:"required"`
	Referensi  string              `json:"referensi"`
	Details    []JurnalLineRequest `json:"details" binding:"required,min=2,dive"`
}

func parseDate(s string) (time.Time, error) {
	t, err := time.Parse("2006-01-02", s)
	if err != nil {
		return time.Time{}, errors.New("format tanggal harus yyyy-mm-dd")
	}
	return t, nil
}

func (s *Service) CreateManual(req JurnalRequest, by *uint) (*Jurnal, error) {
	tgl, err := parseDate(req.Tanggal)
	if err != nil {
		return nil, err
	}
	lines := make([]Line, 0, len(req.Details))
	for i, d := range req.Details {
		if d.Debit < 0 || d.Kredit < 0 {
			return nil, fmt.Errorf("baris %d: nilai tidak boleh negatif", i+1)
		}
		if (d.Debit > 0) == (d.Kredit > 0) {
			return nil, fmt.Errorf("baris %d: isi debit atau kredit, salah satu saja", i+1)
		}
		lines = append(lines, Line{AkunID: d.AkunID, Debit: d.Debit, Kredit: d.Kredit, Ket: d.Keterangan})
	}
	var id uint
	err = s.db.Transaction(func(tx *gorm.DB) error {
		j, err := Post(tx, s.gen, Entry{
			Tanggal: tgl, SourceType: SourceManual, Referensi: req.Referensi,
			Keterangan: req.Keterangan, CreatedBy: by, Lines: lines,
		})
		if err != nil {
			return err
		}
		if j == nil {
			return errors.New("jurnal tidak memiliki nilai")
		}
		id = j.ID
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.GetJurnal(id)
}

func (s *Service) ReverseManual(id uint, tanggal string, by *uint) (*Jurnal, error) {
	tgl := time.Now()
	if tanggal != "" {
		t, err := parseDate(tanggal)
		if err != nil {
			return nil, err
		}
		tgl = t
	}
	err := s.db.Transaction(func(tx *gorm.DB) error {
		var j Jurnal
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&j, id).Error; err != nil {
			return err
		}
		if j.SourceType != SourceManual {
			return errors.New("jurnal otomatis hanya bisa dibalik dari dokumen sumbernya")
		}
		if j.ReversalOfID != nil {
			return errors.New("jurnal pembalik tidak bisa dibalik lagi")
		}
		if j.IsReversed {
			return errors.New("jurnal sudah dibalik")
		}
		return reverseOne(tx, s.gen, &j, tgl, "", by)
	})
	if err != nil {
		return nil, err
	}
	return s.GetJurnal(id)
}

func uintParam(v string) uint {
	n, _ := strconv.ParseUint(v, 10, 64)
	return uint(n)
}
