package server_test

import (
	"encoding/json"
	"fmt"
	"net/http"
	"testing"
)

// The list pages show KPI cards from /<resource>/summary and filter the list by period
// and related ids; these tests pin both against real transactions.

func (e *env) get(path string, out any) {
	e.t.Helper()
	e.must("GET", path, nil, out)
}

func contains(xs []string, x string) bool {
	for _, v := range xs {
		if v == x {
			return true
		}
	}
	return false
}

func (e *env) listLen(path string) int {
	e.t.Helper()
	var rows []json.RawMessage
	e.get(path, &rows)
	return len(rows)
}

func TestRingkasanResepMengikutiAlurKasir(t *testing.T) {
	e := newEnv(t)
	f := e.fixtures(10)

	// A perawatan the doctor is still working on (not yet sent to the kasir).
	var draft struct{ ID uint }
	e.must("POST", "/perawatan", map[string]any{
		"pasien_id": f.pasien, "staff_id": f.staff, "tanggal": tanggal, "status": "proses",
		"reseps": []map[string]any{{"tanggal": tanggal, "barangs": []map[string]any{{"barang_id": f.barang, "nama_barang": "Obat Uji", "jumlah": 1, "harga": 10000}}}},
	}, &draft)
	// And one sent to the kasir.
	pw := e.perawatan(f)

	var s struct {
		Draft         int `json:"draft"`
		MenungguKasir int `json:"menunggu_kasir"`
		Dibayar       int `json:"dibayar"`
		Diserahkan    int `json:"diserahkan"`
	}
	e.get("/resep/summary", &s)
	if s.Draft != 2 || s.MenungguKasir != 1 || s.Dibayar != 0 {
		t.Fatalf("before payment summary = %+v, want draft 2, menunggu_kasir 1", s)
	}

	var rows []struct {
		PerawatanID     uint   `json:"perawatan_id"`
		PerawatanStatus string `json:"perawatan_status"`
	}
	e.get("/resep?status=draft", &rows)
	posisi := map[uint]string{}
	for _, r := range rows {
		posisi[r.PerawatanID] = r.PerawatanStatus
	}
	if posisi[pw] != "bayar" || posisi[draft.ID] != "proses" {
		t.Fatalf("perawatan_status per resep = %v", posisi)
	}

	// Paying at Kasir › Pembayaran Perawatan moves the resep to "dibayar".
	if r := e.call("staff", "POST", "/pembayaran/bayar", map[string]any{
		"source_type": "perawatan", "source_id": pw, "staff_id": f.staff, "jenis_pembayaran": "tunai", "jumlah_bayar": 370000, "tanggal": tanggal,
	}); r.Code != http.StatusOK {
		t.Fatalf("bayar perawatan: %d %s", r.Code, r.Message)
	}
	e.get("/resep/summary", &s)
	if s.Draft != 1 || s.MenungguKasir != 0 || s.Dibayar != 1 {
		t.Fatalf("after payment summary = %+v, want draft 1, dibayar 1", s)
	}

	// Period and dokter filters apply to the list and the summary alike.
	e.get("/resep/summary?dari=2026-12-01", &s)
	if s.Draft+s.Dibayar != 0 {
		t.Errorf("summary outside the period = %+v, want empty", s)
	}
	if n := e.listLen(fmt.Sprintf("/resep?staff_id=%d&status=draft,dibayar", f.staff)); n != 2 {
		t.Errorf("resep by dokter = %d, want 2", n)
	}
	if r := e.call("admin", "GET", "/resep?dari=2026-12-01&sampai=2026-11-01", nil); r.Code != http.StatusBadRequest {
		t.Errorf("reversed period = %d, want 400", r.Code)
	}
}

func TestRingkasanPenjualanDanPembelian(t *testing.T) {
	e := newEnv(t)
	f := e.fixtures(10)

	paid := e.penjualanLangsung(f, 2) // 2 x 10.000
	e.penjualanLangsung(f, 1)         // still waiting at the kasir
	if r := e.call("staff", "POST", "/pembayaran/bayar", map[string]any{
		"source_type": "penjualan", "source_id": paid, "staff_id": f.staff, "jenis_pembayaran": "tunai", "jumlah_bayar": 20000, "tanggal": tanggal,
	}); r.Code != http.StatusOK {
		t.Fatalf("bayar penjualan: %d %s", r.Code, r.Message)
	}

	var pj struct {
		Jumlah          int     `json:"jumlah"`
		NilaiLunas      float64 `json:"nilai_lunas"`
		BelumLunas      int     `json:"belum_lunas"`
		NilaiBelumLunas float64 `json:"nilai_belum_lunas"`
	}
	e.get("/penjualan/summary", &pj)
	if pj.Jumlah != 2 || pj.NilaiLunas != 20000 || pj.BelumLunas != 1 || pj.NilaiBelumLunas != 10000 {
		t.Fatalf("penjualan summary = %+v", pj)
	}
	if n := e.listLen("/penjualan?search=Pasien%20Uji&dari=" + tanggal + "&sampai=" + tanggal); n != 2 {
		t.Errorf("penjualan by pasien name and period = %d, want 2", n)
	}
	if n := e.listLen("/penjualan?dari=2026-12-01"); n != 0 {
		t.Errorf("penjualan after the period = %d, want 0", n)
	}

	var sup struct{ ID uint }
	e.must("POST", "/supplier", map[string]any{"nama": "Supplier Ringkasan"}, &sup)
	var pbl struct{ ID uint }
	e.must("POST", "/pembelian", map[string]any{
		"supplier_id": sup.ID, "staff_id": f.staff, "tanggal": tanggal,
		"details": []map[string]any{{"barang_id": f.barang, "qty": 10, "harga_beli": 1000}},
	}, &pbl)
	e.must("POST", fmt.Sprintf("/pembelian/%d/bayar", pbl.ID), map[string]any{"tanggal": tanggal, "jumlah": 4000, "jenis_pembayaran": "tunai"}, nil)

	var pb struct {
		Jumlah     int     `json:"jumlah"`
		Nilai      float64 `json:"nilai"`
		Dibayar    float64 `json:"dibayar"`
		Utang      float64 `json:"utang"`
		BelumLunas int     `json:"belum_lunas"`
	}
	e.get(fmt.Sprintf("/pembelian/summary?supplier_id=%d", sup.ID), &pb)
	if pb.Jumlah != 1 || pb.Nilai != 10000 || pb.Dibayar != 4000 || pb.Utang != 6000 || pb.BelumLunas != 1 {
		t.Fatalf("pembelian summary = %+v", pb)
	}
	if n := e.listLen("/pembelian?status_bayar=utang&search=Ringkasan"); n != 1 {
		t.Errorf("pembelian utang by supplier name = %d, want 1", n)
	}
	if n := e.listLen("/pembelian?status_bayar=lunas"); n != 0 {
		t.Errorf("pembelian lunas = %d, want 0", n)
	}
}

func TestRingkasanGudangDanMembership(t *testing.T) {
	e := newEnv(t)
	f := e.fixtures(10)
	// Add one barang below its minimum and one empty.
	e.must("POST", "/barang", map[string]any{"nama": "Masker Menipis", "kategori": "Uji Ringkasan", "harga_beli": 5000, "stok_minimal": 5, "stok_aktual": 3}, nil)
	e.must("POST", "/barang", map[string]any{"nama": "Serum Habis", "kategori": "Uji Ringkasan", "stok_aktual": 0}, nil)

	var b struct {
		Total     int      `json:"total"`
		Menipis   int      `json:"menipis"`
		Habis     int      `json:"habis"`
		NilaiStok float64  `json:"nilai_stok"`
		Kategoris []string `json:"kategoris"`
	}
	// The test database is seeded with sample barang, so narrow to this test's kategori.
	e.get("/barang/summary?kategori=Uji%20Ringkasan", &b)
	if b.Total != 2 || b.Menipis != 1 || b.Habis != 1 || b.NilaiStok != 15000 || !contains(b.Kategoris, "Uji Ringkasan") {
		t.Fatalf("barang summary = %+v", b)
	}
	if n := e.listLen("/barang?kategori=Uji%20Ringkasan&stok=menipis"); n != 1 {
		t.Errorf("barang menipis = %d, want 1", n)
	}
	if n := e.listLen("/barang?kategori=Uji%20Ringkasan&stok=habis"); n != 1 {
		t.Errorf("barang Skincare habis = %d, want 1", n)
	}

	e.must("POST", "/stok-opname", map[string]any{"tanggal": tanggal, "details": []map[string]any{{"barang_id": f.barang, "stok_fisik": 7}}}, nil)
	var so struct {
		JumlahDokumen int `json:"jumlah_dokumen"`
		SelisihMinus  int `json:"selisih_minus"`
		ItemSelisih   int `json:"item_selisih"`
	}
	e.get(fmt.Sprintf("/stok-opname/summary?barang_id=%d&dari=%s", f.barang, tanggal), &so)
	if so.JumlahDokumen != 1 || so.SelisihMinus != 3 || so.ItemSelisih != 1 {
		t.Fatalf("stok opname summary = %+v", so)
	}
	if n := e.listLen("/stok-opname?dari=2026-12-01"); n != 0 {
		t.Errorf("stok opname after the period = %d, want 0", n)
	}

	var ks struct {
		JumlahMutasi int `json:"jumlah_mutasi"`
		TotalKeluar  int `json:"total_keluar"`
	}
	e.get(fmt.Sprintf("/kartu-stok/summary?barang_id=%d", f.barang), &ks)
	if ks.JumlahMutasi < 1 || ks.TotalKeluar != 3 {
		t.Fatalf("kartu stok summary = %+v", ks)
	}

	e.must("POST", "/membership", map[string]any{"pasien_id": f.pasien, "tipe": "Gold", "points": 120}, nil)
	var m struct {
		Total     int            `json:"total"`
		TotalPoin int            `json:"total_poin"`
		PerTipe   map[string]int `json:"per_tipe"`
	}
	e.get("/membership/summary?tipe=gold", &m)
	if m.Total != 1 || m.TotalPoin != 120 || m.PerTipe["Gold"] != 1 {
		t.Fatalf("membership summary = %+v", m)
	}
	if n := e.listLen("/membership?search=Pasien%20Uji"); n != 1 {
		t.Errorf("membership by pasien name = %d, want 1", n)
	}
}
