package finance

import (
	"errors"
	"fmt"
	"math"
	"strings"
	"time"

	"github.com/scaleup/clinic-v2/api/internal/platform/generator"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// Line is one side of a journal entry. Give either Key (resolved through the
// account mapping) or AkunID.
type Line struct {
	Key    string
	AkunID uint
	Debit  float64
	Kredit float64
	Ket    string
}

type Entry struct {
	Tanggal    time.Time
	SourceType string
	SourceID   uint
	Referensi  string
	Keterangan string
	CreatedBy  *uint
	Lines      []Line
}

// ErrTidakSeimbang is returned when debit and kredit totals differ.
var ErrTidakSeimbang = errors.New("jurnal tidak seimbang")

func cents(v float64) int64 { return int64(math.Round(v * 100)) }

// Round rounds a rupiah amount to two decimals.
func Round(v float64) float64 { return float64(cents(v)) / 100 }

// Debit and Kredit are shorthands for building lines from mapping keys.
func Debit(key string, v float64) Line  { return Line{Key: key, Debit: v} }
func Kredit(key string, v float64) Line { return Line{Key: key, Kredit: v} }

// ResolveKey returns the account mapped to key.
func ResolveKey(tx *gorm.DB, key string) (uint, error) {
	var m AkunMapping
	err := tx.Where("key = ?", key).First(&m).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return 0, fmt.Errorf("akun untuk %q belum diatur di Pengaturan Akun", key)
	}
	return m.AkunID, err
}

// KasKey picks the mapping key for money received or paid: the bank's own
// account when one is mapped, otherwise the account for the payment method.
func KasKey(tx *gorm.DB, jenisPembayaran string, bankID *uint) string {
	if bankID != nil && *bankID > 0 {
		key := fmt.Sprintf("%s%d", KeyBankPrefix, *bankID)
		var n int64
		if tx.Model(&AkunMapping{}).Where("key = ?", key).Count(&n); n > 0 {
			return key
		}
	}
	jenis := strings.ToLower(strings.TrimSpace(jenisPembayaran))
	if jenis == "" {
		jenis = "tunai"
	}
	return KeyMetodePrefix + jenis
}

type side struct {
	akun   uint
	debit  bool
	amount int64
	ket    string
}

// Post records a balanced journal entry inside tx. Zero lines are dropped and
// lines on the same account and side are merged; an entry left with no lines
// is skipped and returns nil.
func Post(tx *gorm.DB, gen *generator.Service, e Entry) (*Jurnal, error) {
	var sides []side
	index := map[[2]uint]int{}
	var totalD, totalK int64
	for _, l := range e.Lines {
		// A negative amount is the same as the opposite side.
		if l.Debit < 0 {
			l.Kredit, l.Debit = l.Kredit-l.Debit, 0
		}
		if l.Kredit < 0 {
			l.Debit, l.Kredit = l.Debit-l.Kredit, 0
		}
		d, k := cents(l.Debit), cents(l.Kredit)
		if d == 0 && k == 0 {
			continue
		}
		akunID := l.AkunID
		if akunID == 0 {
			id, err := ResolveKey(tx, l.Key)
			if err != nil {
				return nil, err
			}
			akunID = id
		}
		for _, part := range []struct {
			amount int64
			debit  bool
		}{{d, true}, {k, false}} {
			if part.amount == 0 {
				continue
			}
			flag := uint(0)
			if part.debit {
				flag = 1
				totalD += part.amount
			} else {
				totalK += part.amount
			}
			if i, ok := index[[2]uint{akunID, flag}]; ok {
				sides[i].amount += part.amount
				continue
			}
			index[[2]uint{akunID, flag}] = len(sides)
			sides = append(sides, side{akun: akunID, debit: part.debit, amount: part.amount, ket: l.Ket})
		}
	}
	if len(sides) == 0 {
		return nil, nil
	}
	if totalD != totalK {
		return nil, fmt.Errorf("%w: debit %.2f, kredit %.2f", ErrTidakSeimbang, float64(totalD)/100, float64(totalK)/100)
	}

	ids := make([]uint, 0, len(sides))
	for _, s := range sides {
		ids = append(ids, s.akun)
	}
	var akuns []Akun
	if err := tx.Where("id IN ?", ids).Find(&akuns).Error; err != nil {
		return nil, err
	}
	byID := map[uint]Akun{}
	for _, a := range akuns {
		byID[a.ID] = a
	}
	for _, s := range sides {
		a, ok := byID[s.akun]
		switch {
		case !ok:
			return nil, fmt.Errorf("akun #%d tidak ditemukan", s.akun)
		case a.IsHeader:
			return nil, fmt.Errorf("akun %s %s adalah akun header dan tidak bisa diposting", a.Kode, a.Nama)
		case !a.IsActive:
			return nil, fmt.Errorf("akun %s %s tidak aktif", a.Kode, a.Nama)
		}
	}

	kode, err := gen.Generate("JRN")
	if err != nil {
		return nil, err
	}
	j := &Jurnal{
		Kode: kode, Tanggal: e.Tanggal, Keterangan: e.Keterangan, Referensi: e.Referensi,
		SourceType: e.SourceType, SourceID: e.SourceID, CreatedBy: e.CreatedBy,
		TotalDebit: float64(totalD) / 100, TotalKredit: float64(totalK) / 100,
	}
	if err := tx.Omit(clause.Associations).Create(j).Error; err != nil {
		return nil, err
	}
	for _, s := range sides {
		d := JurnalDetail{JurnalID: j.ID, AkunID: s.akun, Keterangan: s.ket}
		if s.debit {
			d.Debit = float64(s.amount) / 100
		} else {
			d.Kredit = float64(s.amount) / 100
		}
		if err := tx.Create(&d).Error; err != nil {
			return nil, err
		}
		j.Details = append(j.Details, d)
	}
	return j, nil
}

// Reverse posts the opposite of every journal recorded for a source document that
// has not been reversed yet, so the document's net effect on the books is zero.
func Reverse(tx *gorm.DB, gen *generator.Service, sourceType string, sourceID uint, tanggal time.Time, ket string) error {
	var jurnals []Jurnal
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
		Where("source_type = ? AND source_id = ? AND reversal_of_id IS NULL AND is_reversed = ?", sourceType, sourceID, false).
		Find(&jurnals).Error; err != nil {
		return err
	}
	for i := range jurnals {
		if err := reverseOne(tx, gen, &jurnals[i], tanggal, ket, nil); err != nil {
			return err
		}
	}
	return nil
}

func reverseOne(tx *gorm.DB, gen *generator.Service, j *Jurnal, tanggal time.Time, ket string, by *uint) error {
	var details []JurnalDetail
	if err := tx.Where("jurnal_id = ?", j.ID).Find(&details).Error; err != nil {
		return err
	}
	lines := make([]Line, 0, len(details))
	for _, d := range details {
		lines = append(lines, Line{AkunID: d.AkunID, Debit: d.Kredit, Kredit: d.Debit, Ket: d.Keterangan})
	}
	if ket == "" {
		ket = "Pembalik " + j.Kode
	}
	rev, err := Post(tx, gen, Entry{
		Tanggal: tanggal, SourceType: j.SourceType, SourceID: j.SourceID,
		Referensi: j.Referensi, Keterangan: ket, CreatedBy: by, Lines: lines,
	})
	if err != nil {
		return err
	}
	if rev != nil {
		if err := tx.Model(rev).Update("reversal_of_id", j.ID).Error; err != nil {
			return err
		}
	}
	return tx.Model(j).Update("is_reversed", true).Error
}
