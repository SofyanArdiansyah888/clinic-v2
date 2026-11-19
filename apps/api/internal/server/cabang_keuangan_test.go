package server_test

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/scaleup/clinic-v2/api/internal/modules/cabang"
	"github.com/scaleup/clinic-v2/api/internal/modules/kasir"
)

// getCabang reads an endpoint from one branch into out.
func (e *env) getCabang(path, cab string, out any) {
	e.t.Helper()
	r := e.callCabang("admin", "GET", path, cab, nil)
	if r.Code != http.StatusOK {
		e.t.Fatalf("GET %s [%s] = %d %s", path, cab, r.Code, r.Message)
	}
	_ = json.Unmarshal(r.Data, out)
}

func TestCabangKeuanganDanLaporan(t *testing.T) {
	e := newEnv(t)
	f := e.fixtures(5)
	var kemang struct{ ID uint }
	e.must("POST", "/cabang", map[string]any{"nama": "Klinik Kemang", "singkatan": "KMG", "alamat": "Jl. Kemang Raya 1", "no_telp": "021-777"}, &kemang)
	kmg := fmt.Sprint(kemang.ID)

	// Main: one paid perawatan (350.000 + resep 2 x 10.000). Admin's shift is open in main.
	bayar := func(cab string, pw uint, jumlah float64) {
		r := e.callCabang("admin", "POST", "/pembayaran/bayar", cab, map[string]any{
			"source_type": "perawatan", "source_id": pw, "staff_id": f.staff, "jenis_pembayaran": "tunai", "jumlah_bayar": jumlah, "tanggal": tanggal,
		})
		if r.Code != http.StatusOK && r.Code != http.StatusCreated {
			t.Fatalf("bayar [%s] = %d %s", cab, r.Code, r.Message)
		}
	}
	bayar("", e.perawatan(f), 370000)

	// Kemang: one paid perawatan of 350.000, on a shift opened there.
	if err := e.db.Model(&kasir.Shift{}).Where("status = ?", kasir.StatusOpen).Update("status", kasir.StatusClosed).Error; err != nil {
		t.Fatal(err)
	}
	if r := e.callCabang("admin", "POST", "/kasir/shift/buka", kmg, map[string]any{"saldo_awal": 0}); r.Code != http.StatusCreated {
		t.Fatalf("open kemang shift = %d %s", r.Code, r.Message)
	}
	var pw struct{ ID uint }
	r := e.callCabang("admin", "POST", "/perawatan", kmg, map[string]any{
		"pasien_id": f.pasien, "staff_id": f.staff, "tanggal": tanggal, "status": "bayar",
		"tindakans": []map[string]any{{"treatment_id": f.treatment, "jumlah": 1, "harga": 350000, "total": 350000, "tanggal": tanggal}},
	})
	_ = json.Unmarshal(r.Data, &pw)
	bayar(kmg, pw.ID, 350000)

	// Journals are booked in the source document's branch and numbered per branch.
	var jurnals []struct {
		Kode     string
		CabangID uint `json:"cabang_id"`
	}
	e.getCabang("/finance/jurnal?per_page=100", kmg, &jurnals)
	if len(jurnals) == 0 {
		t.Fatal("no kemang journals")
	}
	for _, j := range jurnals {
		if j.CabangID != kemang.ID || !strings.HasPrefix(j.Kode, "JRN-KMG-") {
			t.Errorf("kemang journal %s in branch %d", j.Kode, j.CabangID)
		}
	}
	var all []struct{ ID uint }
	e.getCabang("/finance/jurnal?per_page=100", "all", &all)
	var main []struct{ ID uint }
	e.getCabang("/finance/jurnal?per_page=100", "", &main)
	if len(main)+len(jurnals) != len(all) {
		t.Errorf("journals main %d + kemang %d != all %d", len(main), len(jurnals), len(all))
	}

	// Laba rugi per branch adds up to the combined one.
	type lr struct {
		TotalPendapatan float64 `json:"total_pendapatan"`
		LabaBersih      float64 `json:"laba_bersih"`
	}
	q := "/finance/laporan/laba-rugi?dari=2026-11-01&sampai=2026-11-30"
	var lrMain, lrKmg, lrAll lr
	e.getCabang(q, "", &lrMain)
	e.getCabang(q, kmg, &lrKmg)
	e.getCabang(q, "all", &lrAll)
	if lrKmg.TotalPendapatan != 350000 {
		t.Errorf("kemang pendapatan = %v, want 350000", lrKmg.TotalPendapatan)
	}
	if lrMain.TotalPendapatan != 370000 || lrAll.TotalPendapatan != 720000 || lrMain.LabaBersih+lrKmg.LabaBersih != lrAll.LabaBersih {
		t.Errorf("laba rugi main %+v kemang %+v all %+v", lrMain, lrKmg, lrAll)
	}

	// The neraca is one entity: the same from every branch.
	type neraca struct {
		TotalAset float64 `json:"total_aset"`
		Seimbang  bool    `json:"seimbang"`
	}
	var nMain, nKmg, nAll neraca
	e.getCabang("/finance/laporan/neraca?per=2026-11-30", "", &nMain)
	e.getCabang("/finance/laporan/neraca?per=2026-11-30", kmg, &nKmg)
	e.getCabang("/finance/laporan/neraca?per=2026-11-30", "all", &nAll)
	if nMain != nAll || nKmg != nAll || !nAll.Seimbang {
		t.Errorf("neraca main %+v kemang %+v all %+v, want equal and balanced", nMain, nKmg, nAll)
	}

	// Front office report per branch.
	var fo struct {
		Ringkasan struct {
			Transaksi        int64   `json:"transaksi"`
			PendapatanBersih float64 `json:"pendapatan_bersih"`
		} `json:"ringkasan"`
	}
	e.getCabang("/laporan/fo?dari=2026-11-01&sampai=2026-11-30", kmg, &fo)
	if fo.Ringkasan.Transaksi != 1 || fo.Ringkasan.PendapatanBersih != 350000 {
		t.Errorf("kemang fo = %+v", fo.Ringkasan)
	}
	e.getCabang("/laporan/fo?dari=2026-11-01&sampai=2026-11-30", "all", &fo)
	if fo.Ringkasan.Transaksi != 2 {
		t.Errorf("all fo transaksi = %d, want 2", fo.Ringkasan.Transaksi)
	}
	var dm struct {
		Ringkasan struct{ Perawatan int64 } `json:"ringkasan"`
	}
	e.getCabang("/laporan/dm?dari=2026-11-01&sampai=2026-11-30", "", &dm)
	if dm.Ringkasan.Perawatan != 1 {
		t.Errorf("main dm perawatan = %d, want 1", dm.Ringkasan.Perawatan)
	}

	// A manual journal needs one branch.
	if r := e.callCabang("admin", "POST", "/finance/jurnal", "all", map[string]any{
		"tanggal": tanggal, "keterangan": "Uji", "details": []map[string]any{{"akun_id": 1, "debit": 1000}, {"akun_id": 2, "kredit": 1000}},
	}); r.Code != http.StatusBadRequest {
		t.Errorf("manual journal in all branches = %d, want 400", r.Code)
	}

	// Letterheads and receipts carry the branch identity.
	var k struct{ Nama, Alamat, Telepon, Cabang string }
	e.getCabang("/pengaturan/klinik?cabang=aktif", kmg, &k)
	if k.Cabang != "Klinik Kemang" || k.Alamat != "Jl. Kemang Raya 1" || k.Telepon != "021-777" {
		t.Errorf("kemang letterhead = %+v", k)
	}
	k.Cabang = ""
	e.getCabang("/pengaturan/klinik", kmg, &k)
	if k.Cabang != "" {
		t.Errorf("settings form got branch %q", k.Cabang)
	}

	// Journals from before multi-branch go back to their source document's branch.
	if err := e.db.Exec("UPDATE jurnals SET cabang_id = 0").Error; err != nil {
		t.Fatal(err)
	}
	if err := cabang.EnsureDefaults(e.db); err != nil {
		t.Fatal(err)
	}
	var again []struct{ ID uint }
	e.getCabang("/finance/jurnal?per_page=100", kmg, &again)
	if len(again) != len(jurnals) {
		t.Errorf("kemang journals after backfill = %d, want %d", len(again), len(jurnals))
	}
}
