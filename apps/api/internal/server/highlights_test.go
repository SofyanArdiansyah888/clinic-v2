package server_test

import (
	"net/http"
	"testing"

	"github.com/scaleup/clinic-v2/api/internal/modules/finance"
)

func TestFinancialHighlights(t *testing.T) {
	e := newEnv(t)

	var akuns []finance.Akun
	e.must("GET", "/finance/akun", nil, &akuns)
	id := map[string]uint{}
	for _, a := range akuns {
		id[a.Kode] = a.ID
	}
	jurnal := func(tgl, debit, kredit string, nilai float64) {
		t.Helper()
		r := e.call("finance", "POST", "/finance/jurnal", map[string]any{
			"tanggal": tgl, "keterangan": "uji highlights",
			"details": []map[string]any{{"akun_id": id[debit], "debit": nilai}, {"akun_id": id[kredit], "kredit": nilai}},
		})
		if r.Code != http.StatusCreated {
			t.Fatalf("jurnal %s %s/%s: %d %s", tgl, debit, kredit, r.Code, r.Message)
		}
	}
	// Same month last year.
	jurnal("2025-11-10", "1-1101", "4-1101", 1000000)
	// Previous month: inside the comparison window (Oct 1-19) and after it.
	jurnal("2026-10-05", "1-1201", "4-1101", 2000000)
	jurnal("2026-10-06", "6-1101", "1-1101", 500000)
	jurnal("2026-10-25", "1-1201", "4-1101", 700000)
	// The period itself (Nov 1-19).
	jurnal("2026-11-03", "1-1101", "4-1101", 3000000)
	jurnal("2026-11-03", "5-1101", "1-1401", 600000)
	jurnal("2026-11-04", "6-1101", "1-1101", 900000)
	jurnal("2026-11-05", "1-1101", "2-1201", 200000)
	jurnal("2026-11-06", "1-1401", "2-1101", 400000)
	// After the period: must not count.
	jurnal("2026-11-25", "1-1101", "3-1101", 5000000)

	if r := e.call("staff", "GET", "/finance/laporan/highlights", nil); r.Code != http.StatusForbidden {
		t.Fatalf("staff reads highlights: %d, want 403", r.Code)
	}

	var h finance.Highlights
	e.must("GET", "/finance/laporan/highlights?dari=2026-11-01&sampai=2026-11-19", nil, &h)

	want := finance.Ringkasan{Dari: "2026-11-01", Sampai: "2026-11-19", Pendapatan: 3000000, HPP: 600000, LabaKotor: 2400000,
		BebanOperasional: 900000, LabaBersih: 1500000, MarginKotor: 80, MarginBersih: 50}
	if h.Periode != want {
		t.Errorf("periode = %+v\nwant      %+v", h.Periode, want)
	}
	want = finance.Ringkasan{Dari: "2026-10-01", Sampai: "2026-10-19", Pendapatan: 2000000, LabaKotor: 2000000,
		BebanOperasional: 500000, LabaBersih: 1500000, MarginKotor: 100, MarginBersih: 75}
	if h.Pembanding != want {
		t.Errorf("pembanding = %+v\nwant         %+v", h.Pembanding, want)
	}
	if h.TahunLalu.Dari != "2025-11-01" || h.TahunLalu.Sampai != "2025-11-19" || h.TahunLalu.Pendapatan != 1000000 {
		t.Errorf("tahun lalu = %+v", h.TahunLalu)
	}

	// Kas 1.000.000 - 500.000 + 3.000.000 - 900.000 + 200.000; bank 2.000.000 + 700.000.
	if p := h.Posisi; p.Per != "2026-11-19" || p.KasBank != 5500000 || p.UtangDepositPasien != 200000 || p.UtangUsaha != 400000 {
		t.Errorf("posisi = %+v", p)
	}
	if p := h.PosisiPembanding; p.Per != "2026-10-19" || p.KasBank != 2500000 {
		t.Errorf("posisi pembanding = %+v", p)
	}

	if len(h.Tren) != 12 || h.Tren[0].Bulan != "2025-12" || h.Tren[11].Bulan != "2026-11" {
		t.Fatalf("tren months = %+v", h.Tren)
	}
	if okt := h.Tren[10]; okt.Pendapatan != 2700000 || okt.Beban != 500000 || okt.LabaBersih != 2200000 {
		t.Errorf("tren oktober = %+v", okt)
	}
	if nov := h.Tren[11]; nov.Pendapatan != 3000000 || nov.Beban != 1500000 || nov.LabaBersih != 1500000 {
		t.Errorf("tren november = %+v", nov)
	}

	if len(h.KomposisiPendapatan) != 1 || h.KomposisiPendapatan[0].Akun.Kode != "4-1101" || h.KomposisiPendapatan[0].Saldo != 3000000 {
		t.Errorf("komposisi pendapatan = %+v", h.KomposisiPendapatan)
	}
	if len(h.BebanTerbesar) != 2 || h.BebanTerbesar[0].Akun.Kode != "6-1101" || h.BebanTerbesar[1].Akun.Kode != "5-1101" {
		t.Errorf("beban terbesar = %+v", h.BebanTerbesar)
	}

	if r := e.call("finance", "GET", "/finance/laporan/highlights?dari=2026-11-19&sampai=2026-11-01", nil); r.Code != http.StatusBadRequest {
		t.Errorf("reversed range: %d, want 400", r.Code)
	}
}
