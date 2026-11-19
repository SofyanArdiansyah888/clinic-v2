package finance

import (
	"errors"
	"math"
	"sort"
	"strings"
	"time"
)

// ── Financial highlights ──
// One-page summary for owners: the period's results next to the previous period and the
// same period last year, the financial position, a 12-month trend and where income and
// costs come from. Everything is derived from journals, like the other reports.

type Ringkasan struct {
	Dari             string  `json:"dari"`
	Sampai           string  `json:"sampai"`
	Pendapatan       float64 `json:"pendapatan"`
	HPP              float64 `json:"hpp"`
	LabaKotor        float64 `json:"laba_kotor"`
	BebanOperasional float64 `json:"beban_operasional"`
	LabaBersih       float64 `json:"laba_bersih"`
	MarginKotor      float64 `json:"margin_kotor"`  // percent of pendapatan
	MarginBersih     float64 `json:"margin_bersih"` // percent of pendapatan
}

type Posisi struct {
	Per                string  `json:"per"`
	TotalAset          float64 `json:"total_aset"`
	TotalKewajiban     float64 `json:"total_kewajiban"`
	TotalEkuitas       float64 `json:"total_ekuitas"`
	KasBank            float64 `json:"kas_bank"`
	UtangDepositPasien float64 `json:"utang_deposit_pasien"`
	UtangUsaha         float64 `json:"utang_usaha"`
}

type TrenBulan struct {
	Bulan      string  `json:"bulan"` // YYYY-MM
	Pendapatan float64 `json:"pendapatan"`
	Beban      float64 `json:"beban"`
	LabaBersih float64 `json:"laba_bersih"`
}

type Highlights struct {
	Periode             Ringkasan   `json:"periode"`
	Pembanding          Ringkasan   `json:"pembanding"`
	TahunLalu           Ringkasan   `json:"tahun_lalu"`
	Posisi              Posisi      `json:"posisi"`
	PosisiPembanding    Posisi      `json:"posisi_pembanding"`
	Tren                []TrenBulan `json:"tren"`
	KomposisiPendapatan []AkunSaldo `json:"komposisi_pendapatan"`
	BebanTerbesar       []AkunSaldo `json:"beban_terbesar"`
}

const dateFmt = "2006-01-02"

// isHPP: cost of goods sold accounts sit under kode 5 in the chart of accounts.
func isHPP(a Akun) bool { return strings.HasPrefix(a.Kode, "5") }

func percent(part, whole float64) float64 {
	if whole == 0 {
		return 0
	}
	return math.Round(part/whole*1000) / 10
}

func endOfMonth(t time.Time) time.Time {
	return time.Date(t.Year(), t.Month()+1, 0, 0, 0, 0, 0, t.Location())
}

// shiftPeriod moves [dari, sampai] back. A period starting on the 1st moves by whole
// months (Nov 1–19 -> Oct 1–19, Nov 1–30 -> Oct 1–31); any other period moves back by
// its own length so the two periods touch.
func shiftPeriod(dari, sampai time.Time) (time.Time, time.Time) {
	if dari.Day() == 1 {
		months := (sampai.Year()-dari.Year())*12 + int(sampai.Month()-dari.Month()) + 1
		pd := dari.AddDate(0, -months, 0)
		ps := time.Date(sampai.Year(), sampai.Month()-time.Month(months), 1, 0, 0, 0, 0, sampai.Location())
		if sampai.Equal(endOfMonth(sampai)) || sampai.Day() > endOfMonth(ps).Day() {
			ps = endOfMonth(ps)
		} else {
			ps = ps.AddDate(0, 0, sampai.Day()-1)
		}
		return pd, ps
	}
	days := int(sampai.Sub(dari).Hours()/24) + 1
	return dari.AddDate(0, 0, -days), dari.AddDate(0, 0, -1)
}

// yearBack moves a date back one year, keeping month ends on month ends (Feb 29 -> Feb 28).
func yearBack(t time.Time) time.Time {
	y := time.Date(t.Year()-1, t.Month(), 1, 0, 0, 0, 0, t.Location())
	if t.Day() > endOfMonth(y).Day() || t.Equal(endOfMonth(t)) {
		return endOfMonth(y)
	}
	return y.AddDate(0, 0, t.Day()-1)
}

func (s *Service) ringkasan(dari, sampai string) (Ringkasan, *LabaRugi, error) {
	lr, err := s.LabaRugi(dari, sampai)
	if err != nil {
		return Ringkasan{}, nil, err
	}
	r := Ringkasan{Dari: lr.Dari, Sampai: lr.Sampai, Pendapatan: lr.TotalPendapatan, LabaBersih: lr.LabaBersih}
	for _, b := range lr.Beban {
		if isHPP(b.Akun) {
			r.HPP += b.Saldo
		} else {
			r.BebanOperasional += b.Saldo
		}
	}
	r.HPP, r.BebanOperasional = Round(r.HPP), Round(r.BebanOperasional)
	r.LabaKotor = Round(r.Pendapatan - r.HPP)
	r.MarginKotor = percent(r.LabaKotor, r.Pendapatan)
	r.MarginBersih = percent(r.LabaBersih, r.Pendapatan)
	return r, lr, nil
}

// mappedAkuns returns the account ids configured for mapping keys matching any prefix.
func (s *Service) mappedAkuns(match func(key string) bool) (map[uint]bool, error) {
	var maps []AkunMapping
	if err := s.db.Find(&maps).Error; err != nil {
		return nil, err
	}
	out := map[uint]bool{}
	for _, m := range maps {
		if match(m.Key) {
			out[m.AkunID] = true
		}
	}
	return out, nil
}

func (s *Service) posisi(per string) (Posisi, error) {
	n, err := s.Neraca(per)
	if err != nil {
		return Posisi{}, err
	}
	kasBank, err := s.mappedAkuns(func(k string) bool {
		// Kartu kredit settles later through the card issuer, so it is a receivable, not cash.
		return (strings.HasPrefix(k, KeyMetodePrefix) && k != KeyMetodePrefix+"kartu_kredit") || strings.HasPrefix(k, KeyBankPrefix)
	})
	if err != nil {
		return Posisi{}, err
	}
	deposit, err := s.mappedAkuns(func(k string) bool { return k == KeyDepositTitipan })
	if err != nil {
		return Posisi{}, err
	}
	utang, err := s.mappedAkuns(func(k string) bool { return k == KeyPembelianUtang })
	if err != nil {
		return Posisi{}, err
	}
	p := Posisi{Per: n.Per, TotalAset: n.TotalAset, TotalKewajiban: n.TotalKewajiban, TotalEkuitas: n.TotalEkuitas}
	for _, a := range n.Aset {
		if kasBank[a.Akun.ID] {
			p.KasBank += a.Saldo
		}
	}
	for _, k := range n.Kewajiban {
		if deposit[k.Akun.ID] {
			p.UtangDepositPasien += k.Saldo
		}
		if utang[k.Akun.ID] {
			p.UtangUsaha += k.Saldo
		}
	}
	p.KasBank, p.UtangDepositPasien, p.UtangUsaha = Round(p.KasBank), Round(p.UtangDepositPasien), Round(p.UtangUsaha)
	return p, nil
}

// tren sums pendapatan and beban per calendar month for the 12 months ending at sampai.
func (s *Service) tren(sampai time.Time) ([]TrenBulan, error) {
	start := time.Date(sampai.Year(), sampai.Month()-11, 1, 0, 0, 0, 0, sampai.Location())
	type row struct {
		Bulan  string
		Tipe   string
		Debit  float64
		Kredit float64
	}
	var rows []row
	err := s.db.Table("jurnal_details d").
		Select("to_char(j.tanggal, 'YYYY-MM') AS bulan, a.tipe, COALESCE(SUM(d.debit),0) AS debit, COALESCE(SUM(d.kredit),0) AS kredit").
		Joins("JOIN jurnals j ON j.id = d.jurnal_id").
		Joins("JOIN akuns a ON a.id = d.akun_id").
		Where("j.tanggal >= ? AND j.tanggal <= ?", start.Format(dateFmt), sampai.Format(dateFmt)).
		Where("a.tipe IN ?", []string{TipePendapatan, TipeBeban}).
		Group("1, 2").
		Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	out := make([]TrenBulan, 12)
	index := map[string]int{}
	for i := range out {
		b := start.AddDate(0, i, 0).Format("2006-01")
		out[i] = TrenBulan{Bulan: b}
		index[b] = i
	}
	for _, r := range rows {
		i, ok := index[r.Bulan]
		if !ok {
			continue
		}
		if r.Tipe == TipePendapatan {
			out[i].Pendapatan += pendapatanSaldo(saldoRow{Debit: r.Debit, Kredit: r.Kredit})
		} else {
			out[i].Beban += bebanSaldo(saldoRow{Debit: r.Debit, Kredit: r.Kredit})
		}
	}
	for i := range out {
		out[i].Pendapatan, out[i].Beban = Round(out[i].Pendapatan), Round(out[i].Beban)
		out[i].LabaBersih = Round(out[i].Pendapatan - out[i].Beban)
	}
	return out, nil
}

func (s *Service) Highlights(dari, sampai string) (*Highlights, error) {
	now := time.Now()
	if dari == "" {
		dari = time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location()).Format(dateFmt)
	}
	if sampai == "" {
		sampai = now.Format(dateFmt)
	}
	d, err := parseDate(dari)
	if err != nil {
		return nil, err
	}
	sp, err := parseDate(sampai)
	if err != nil {
		return nil, err
	}
	if sp.Before(d) {
		return nil, errors.New("tanggal sampai harus setelah tanggal dari")
	}

	res := &Highlights{}
	var lr *LabaRugi
	if res.Periode, lr, err = s.ringkasan(d.Format(dateFmt), sp.Format(dateFmt)); err != nil {
		return nil, err
	}
	pd, ps := shiftPeriod(d, sp)
	if res.Pembanding, _, err = s.ringkasan(pd.Format(dateFmt), ps.Format(dateFmt)); err != nil {
		return nil, err
	}
	if res.TahunLalu, _, err = s.ringkasan(yearBack(d).Format(dateFmt), yearBack(sp).Format(dateFmt)); err != nil {
		return nil, err
	}
	if res.Posisi, err = s.posisi(sp.Format(dateFmt)); err != nil {
		return nil, err
	}
	if res.PosisiPembanding, err = s.posisi(ps.Format(dateFmt)); err != nil {
		return nil, err
	}
	if res.Tren, err = s.tren(sp); err != nil {
		return nil, err
	}

	res.KomposisiPendapatan = lr.Pendapatan
	beban := append([]AkunSaldo{}, lr.Beban...)
	sort.SliceStable(beban, func(i, j int) bool { return beban[i].Saldo > beban[j].Saldo })
	if len(beban) > 5 {
		beban = beban[:5]
	}
	res.BebanTerbesar = beban
	return res, nil
}
