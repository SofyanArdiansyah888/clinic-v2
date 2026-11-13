package finance

import (
	"errors"
	"time"
)

type saldoRow struct {
	AkunID uint
	Debit  float64
	Kredit float64
}

// mutasi sums debit and kredit per account for journals dated within [dari, sampai].
// An empty bound is open.
func (s *Service) mutasi(dari, sampai string) (map[uint]saldoRow, error) {
	q := s.db.Table("jurnal_details d").
		Select("d.akun_id, COALESCE(SUM(d.debit),0) AS debit, COALESCE(SUM(d.kredit),0) AS kredit").
		Joins("JOIN jurnals j ON j.id = d.jurnal_id").
		Group("d.akun_id")
	if dari != "" {
		q = q.Where("j.tanggal >= ?", dari)
	}
	if sampai != "" {
		q = q.Where("j.tanggal <= ?", sampai)
	}
	var rows []saldoRow
	if err := q.Scan(&rows).Error; err != nil {
		return nil, err
	}
	out := make(map[uint]saldoRow, len(rows))
	for _, r := range rows {
		out[r.AkunID] = r
	}
	return out, nil
}

func (s *Service) postableAkuns() ([]Akun, error) {
	var akuns []Akun
	err := s.db.Where("is_header = ?", false).Order("kode ASC").Find(&akuns).Error
	return akuns, err
}

// saldo returns the balance on the account's normal side.
func saldo(a Akun, debit, kredit float64) float64 {
	if a.SaldoNormal == SaldoDebit {
		return Round(debit - kredit)
	}
	return Round(kredit - debit)
}

func checkDate(v string) error {
	if v == "" {
		return nil
	}
	_, err := parseDate(v)
	return err
}

// ── Neraca saldo ──

type NeracaSaldoRow struct {
	Akun   Akun    `json:"akun"`
	Debit  float64 `json:"debit"`
	Kredit float64 `json:"kredit"`
}

type NeracaSaldo struct {
	Sampai      string           `json:"sampai"`
	Rows        []NeracaSaldoRow `json:"rows"`
	TotalDebit  float64          `json:"total_debit"`
	TotalKredit float64          `json:"total_kredit"`
}

func (s *Service) NeracaSaldo(sampai string) (*NeracaSaldo, error) {
	if sampai == "" {
		sampai = time.Now().Format("2006-01-02")
	}
	if err := checkDate(sampai); err != nil {
		return nil, err
	}
	m, err := s.mutasi("", sampai)
	if err != nil {
		return nil, err
	}
	akuns, err := s.postableAkuns()
	if err != nil {
		return nil, err
	}
	res := &NeracaSaldo{Sampai: sampai, Rows: []NeracaSaldoRow{}}
	for _, a := range akuns {
		r, ok := m[a.ID]
		if !ok {
			continue
		}
		net := Round(r.Debit - r.Kredit)
		if net == 0 {
			continue
		}
		row := NeracaSaldoRow{Akun: a}
		if net > 0 {
			row.Debit = net
		} else {
			row.Kredit = -net
		}
		res.TotalDebit += row.Debit
		res.TotalKredit += row.Kredit
		res.Rows = append(res.Rows, row)
	}
	res.TotalDebit, res.TotalKredit = Round(res.TotalDebit), Round(res.TotalKredit)
	return res, nil
}

// ── Laba rugi ──

type AkunSaldo struct {
	Akun  Akun    `json:"akun"`
	Saldo float64 `json:"saldo"`
}

type LabaRugi struct {
	Dari            string      `json:"dari"`
	Sampai          string      `json:"sampai"`
	Pendapatan      []AkunSaldo `json:"pendapatan"`
	Beban           []AkunSaldo `json:"beban"`
	TotalPendapatan float64     `json:"total_pendapatan"`
	TotalBeban      float64     `json:"total_beban"`
	LabaBersih      float64     `json:"laba_bersih"`
}

// pendapatanSaldo is the contribution of a pendapatan account to income: kredit
// minus debit, so contra accounts such as Diskon Penjualan come out negative.
func pendapatanSaldo(r saldoRow) float64 { return Round(r.Kredit - r.Debit) }
func bebanSaldo(r saldoRow) float64      { return Round(r.Debit - r.Kredit) }

func (s *Service) LabaRugi(dari, sampai string) (*LabaRugi, error) {
	now := time.Now()
	if dari == "" {
		dari = time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location()).Format("2006-01-02")
	}
	if sampai == "" {
		sampai = now.Format("2006-01-02")
	}
	if err := checkDate(dari); err != nil {
		return nil, err
	}
	if err := checkDate(sampai); err != nil {
		return nil, err
	}
	if sampai < dari {
		return nil, errors.New("tanggal sampai harus setelah tanggal dari")
	}
	m, err := s.mutasi(dari, sampai)
	if err != nil {
		return nil, err
	}
	akuns, err := s.postableAkuns()
	if err != nil {
		return nil, err
	}
	res := &LabaRugi{Dari: dari, Sampai: sampai, Pendapatan: []AkunSaldo{}, Beban: []AkunSaldo{}}
	for _, a := range akuns {
		r, ok := m[a.ID]
		if !ok {
			continue
		}
		switch a.Tipe {
		case TipePendapatan:
			v := pendapatanSaldo(r)
			res.Pendapatan = append(res.Pendapatan, AkunSaldo{a, v})
			res.TotalPendapatan += v
		case TipeBeban:
			v := bebanSaldo(r)
			res.Beban = append(res.Beban, AkunSaldo{a, v})
			res.TotalBeban += v
		}
	}
	res.TotalPendapatan, res.TotalBeban = Round(res.TotalPendapatan), Round(res.TotalBeban)
	res.LabaBersih = Round(res.TotalPendapatan - res.TotalBeban)
	return res, nil
}

// ── Neraca ──

type Neraca struct {
	Per              string      `json:"per"`
	Aset             []AkunSaldo `json:"aset"`
	Kewajiban        []AkunSaldo `json:"kewajiban"`
	Ekuitas          []AkunSaldo `json:"ekuitas"`
	LabaBerjalan     float64     `json:"laba_berjalan"`
	TotalAset        float64     `json:"total_aset"`
	TotalKewajiban   float64     `json:"total_kewajiban"`
	TotalEkuitas     float64     `json:"total_ekuitas"`
	TotalPasiva      float64     `json:"total_pasiva"`
	Seimbang         bool        `json:"seimbang"`
}

// Neraca reports balances as of a date. Without period closing, all pendapatan and
// beban to date are shown as laba berjalan inside ekuitas.
func (s *Service) Neraca(per string) (*Neraca, error) {
	if per == "" {
		per = time.Now().Format("2006-01-02")
	}
	if err := checkDate(per); err != nil {
		return nil, err
	}
	m, err := s.mutasi("", per)
	if err != nil {
		return nil, err
	}
	akuns, err := s.postableAkuns()
	if err != nil {
		return nil, err
	}
	res := &Neraca{Per: per, Aset: []AkunSaldo{}, Kewajiban: []AkunSaldo{}, Ekuitas: []AkunSaldo{}}
	for _, a := range akuns {
		r, ok := m[a.ID]
		if !ok {
			continue
		}
		switch a.Tipe {
		case TipeAset:
			v := Round(r.Debit - r.Kredit)
			res.Aset = append(res.Aset, AkunSaldo{a, v})
			res.TotalAset += v
		case TipeKewajiban:
			v := Round(r.Kredit - r.Debit)
			res.Kewajiban = append(res.Kewajiban, AkunSaldo{a, v})
			res.TotalKewajiban += v
		case TipeEkuitas:
			v := Round(r.Kredit - r.Debit)
			res.Ekuitas = append(res.Ekuitas, AkunSaldo{a, v})
			res.TotalEkuitas += v
		case TipePendapatan:
			res.LabaBerjalan += pendapatanSaldo(r)
		case TipeBeban:
			res.LabaBerjalan -= bebanSaldo(r)
		}
	}
	res.LabaBerjalan = Round(res.LabaBerjalan)
	res.TotalAset = Round(res.TotalAset)
	res.TotalKewajiban = Round(res.TotalKewajiban)
	res.TotalEkuitas = Round(res.TotalEkuitas + res.LabaBerjalan)
	res.TotalPasiva = Round(res.TotalKewajiban + res.TotalEkuitas)
	res.Seimbang = cents(res.TotalAset) == cents(res.TotalPasiva)
	return res, nil
}

// ── Buku besar ──

type BukuBesarRow struct {
	JurnalID   uint      `json:"jurnal_id"`
	Kode       string    `json:"kode"`
	Tanggal    time.Time `json:"tanggal"`
	Referensi  string    `json:"referensi"`
	SourceType string    `json:"source_type"`
	Keterangan string    `json:"keterangan"`
	Debit      float64   `json:"debit"`
	Kredit     float64   `json:"kredit"`
	Saldo      float64   `json:"saldo"`
}

type BukuBesar struct {
	Akun        Akun           `json:"akun"`
	Dari        string         `json:"dari"`
	Sampai      string         `json:"sampai"`
	SaldoAwal   float64        `json:"saldo_awal"`
	Rows        []BukuBesarRow `json:"rows"`
	TotalDebit  float64        `json:"total_debit"`
	TotalKredit float64        `json:"total_kredit"`
	SaldoAkhir  float64        `json:"saldo_akhir"`
}

func (s *Service) BukuBesar(akunID uint, dari, sampai string) (*BukuBesar, error) {
	if akunID == 0 {
		return nil, errors.New("akun_id wajib diisi")
	}
	a, err := s.GetAkun(akunID)
	if err != nil {
		return nil, errors.New("akun tidak ditemukan")
	}
	now := time.Now()
	if dari == "" {
		dari = time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location()).Format("2006-01-02")
	}
	if sampai == "" {
		sampai = now.Format("2006-01-02")
	}
	if err := checkDate(dari); err != nil {
		return nil, err
	}
	if err := checkDate(sampai); err != nil {
		return nil, err
	}
	if sampai < dari {
		return nil, errors.New("tanggal sampai harus setelah tanggal dari")
	}

	var awal saldoRow
	if err := s.db.Table("jurnal_details d").
		Select("COALESCE(SUM(d.debit),0) AS debit, COALESCE(SUM(d.kredit),0) AS kredit").
		Joins("JOIN jurnals j ON j.id = d.jurnal_id").
		Where("d.akun_id = ? AND j.tanggal < ?", akunID, dari).
		Scan(&awal).Error; err != nil {
		return nil, err
	}
	res := &BukuBesar{Akun: *a, Dari: dari, Sampai: sampai, SaldoAwal: saldo(*a, awal.Debit, awal.Kredit), Rows: []BukuBesarRow{}}

	var rows []BukuBesarRow
	if err := s.db.Table("jurnal_details d").
		Select("j.id AS jurnal_id, j.kode, j.tanggal, j.referensi, j.source_type, COALESCE(NULLIF(d.keterangan, ''), j.keterangan) AS keterangan, d.debit, d.kredit").
		Joins("JOIN jurnals j ON j.id = d.jurnal_id").
		Where("d.akun_id = ? AND j.tanggal BETWEEN ? AND ?", akunID, dari, sampai).
		Order("j.tanggal ASC, j.id ASC, d.id ASC").
		Scan(&rows).Error; err != nil {
		return nil, err
	}
	run := res.SaldoAwal
	for _, r := range rows {
		if a.SaldoNormal == SaldoDebit {
			run += r.Debit - r.Kredit
		} else {
			run += r.Kredit - r.Debit
		}
		r.Saldo = Round(run)
		res.TotalDebit += r.Debit
		res.TotalKredit += r.Kredit
		res.Rows = append(res.Rows, r)
	}
	res.TotalDebit, res.TotalKredit = Round(res.TotalDebit), Round(res.TotalKredit)
	res.SaldoAkhir = Round(run)
	return res, nil
}
