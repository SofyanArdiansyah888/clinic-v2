package server_test

import (
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"sort"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/scaleup/clinic-v2/api/internal/modules/paket"
	"github.com/scaleup/clinic-v2/api/internal/modules/treatment"
	"github.com/scaleup/clinic-v2/api/internal/platform/branch"
	"github.com/scaleup/clinic-v2/api/internal/server"
)

// Full-flow tests for the parts of the clinic not already covered by
// integration_test.go and finance_test.go.

func TestKunjunganPasienBaruDanStatusAntrian(t *testing.T) {
	e := newEnv(t)
	f := e.fixtures(5)

	// Front office registers a brand-new patient and queues them in one step.
	r := e.call("staff", "POST", "/antrian/create-pasien-antrian", map[string]any{
		"nama": "Pasien Walk In", "no_telp": "0811000111", "staff_id": f.staff, "tanggal": tanggal, "jam": "09:00",
	})
	if r.Code != http.StatusCreated {
		t.Fatalf("create-pasien-antrian: %d %s", r.Code, r.Message)
	}
	var out struct {
		Pasien  struct{ ID uint }
		Antrian struct {
			ID     uint
			Status string
		}
	}
	_ = json.Unmarshal(r.Data, &out)
	if out.Pasien.ID == 0 || out.Antrian.ID == 0 || out.Antrian.Status != "menunggu" {
		t.Fatalf("create-pasien-antrian data = %+v", out)
	}

	// Missing nama/no_telp for a new patient is a client error, not a crash.
	if r := e.call("staff", "POST", "/antrian/create-pasien-antrian", map[string]any{"staff_id": f.staff, "tanggal": tanggal}); r.Code != http.StatusBadRequest {
		t.Errorf("create-pasien-antrian without nama: %d, want 400", r.Code)
	}

	// Queue an existing patient.
	if r := e.call("staff", "POST", "/antrian/create-pasien-antrian", map[string]any{"pasien_id": f.pasien, "staff_id": f.staff, "tanggal": tanggal}); r.Code != http.StatusCreated {
		t.Errorf("antrian for existing pasien: %d %s", r.Code, r.Message)
	}

	path := fmt.Sprintf("/antrian/%d/status", out.Antrian.ID)
	for _, c := range []struct {
		role string
		want int
	}{{"doctor", 200}, {"nurse", 200}, {"apoteker", 403}, {"finance", 403}} {
		if r := e.call(c.role, "PATCH", path, map[string]any{"status": "dipanggil"}); r.Code != c.want {
			t.Errorf("%s PATCH antrian status = %d (%s), want %d", c.role, r.Code, r.Message, c.want)
		}
	}

	// A status that is not part of the queue's lifecycle should be refused.
	if r := e.call("staff", "PATCH", path, map[string]any{"status": "asal-asalan"}); r.Code != http.StatusBadRequest {
		t.Errorf("antrian status 'asal-asalan' = %d, want 400", r.Code)
	}

	// Appointment: front office may book, doctor may not write.
	appt := map[string]any{"pasien_id": f.pasien, "staff_id": f.staff, "tanggal": tanggal, "jam": "10:00"}
	if r := e.call("staff", "POST", "/appointment", appt); r.Code != http.StatusCreated {
		t.Errorf("staff book appointment: %d %s", r.Code, r.Message)
	}
	if r := e.call("doctor", "POST", "/appointment", appt); r.Code != http.StatusForbidden {
		t.Errorf("doctor book appointment: %d, want 403", r.Code)
	}
	// Booking for a patient that does not exist is a client error.
	if r := e.call("staff", "POST", "/appointment", map[string]any{"pasien_id": 999999, "staff_id": f.staff, "tanggal": tanggal}); r.Code != http.StatusBadRequest && r.Code != http.StatusNotFound {
		t.Errorf("appointment for unknown pasien: %d, want 400/404", r.Code)
	}
}

func (e *env) penjualanLangsung(f fixtures, qty int) uint {
	e.t.Helper()
	r := e.call("apoteker", "POST", "/penjualan", map[string]any{
		"pasien_id": f.pasien, "staff_id": f.staff, "tanggal": tanggal, "keterangan": "Penjualan langsung",
		"details": []map[string]any{{"barang_id": f.barang, "qty": qty}},
	})
	if r.Code != http.StatusCreated {
		e.t.Fatalf("penjualan langsung: %d %s", r.Code, r.Message)
	}
	var pj struct{ ID uint }
	_ = json.Unmarshal(r.Data, &pj)
	return pj.ID
}

func TestPenjualanLangsungDibayarLaluDibatalkan(t *testing.T) {
	e := newEnv(t)
	f := e.fixtures(5)
	pj := e.penjualanLangsung(f, 2)
	if got := e.stok(f.barang); got != 3 {
		t.Fatalf("stok after penjualan = %d, want 3", got)
	}

	var antre []struct{ ID uint }
	e.must("GET", "/pembayaran/produk/langsung", nil, &antre)
	if len(antre) != 1 || antre[0].ID != pj {
		t.Fatalf("produk langsung queue = %+v, want penjualan %d", antre, pj)
	}

	r := e.call("staff", "POST", "/pembayaran/bayar", map[string]any{
		"source_type": "penjualan", "source_id": pj, "staff_id": f.staff, "jenis_pembayaran": "tunai", "jumlah_bayar": 25000, "tanggal": tanggal,
	})
	if r.Code != http.StatusOK {
		t.Fatalf("bayar penjualan: %d %s", r.Code, r.Message)
	}
	e.expectBalanced()
	e.expectSaldo(map[string]float64{"1-1101": 20000, "4-1201": -20000})
	if got := e.stok(f.barang); got != 3 {
		t.Fatalf("stok after bayar = %d, want 3 (taken at penjualan, not again)", got)
	}

	var fo struct {
		Ringkasan struct {
			Transaksi int64 `json:"transaksi"`
		} `json:"ringkasan"`
	}
	e.must("GET", "/laporan/fo?dari="+tanggal+"&sampai="+tanggal, nil, &fo)
	if fo.Ringkasan.Transaksi != 1 {
		t.Errorf("laporan fo transaksi = %d, want 1", fo.Ringkasan.Transaksi)
	}
	var ap struct {
		BarangTerjual []struct {
			Qty int64 `json:"qty"`
		} `json:"barang_terjual"`
	}
	e.must("GET", "/laporan/apotek?dari="+tanggal+"&sampai="+tanggal, nil, &ap)
	if len(ap.BarangTerjual) != 1 {
		t.Errorf("laporan apotek barang terjual = %+v, want 1 row", ap.BarangTerjual)
	}

	// A paid sale is not cancelled through the status or delete endpoints, only by the void.
	if r := e.call("admin", "PATCH", fmt.Sprintf("/penjualan/%d/status", pj), map[string]any{"status": "cancelled"}); r.Code != http.StatusBadRequest || !strings.Contains(r.Message, "/pembayaran/penjualan/:id/batal") {
		t.Errorf("PATCH cancelled on a paid sale: %d %s, want 400 pointing at the void", r.Code, r.Message)
	}
	if r := e.call("admin", "DELETE", fmt.Sprintf("/penjualan/%d", pj), nil); r.Code != http.StatusBadRequest {
		t.Errorf("DELETE a paid sale: %d %s, want 400", r.Code, r.Message)
	}
	// Voiding the paid sale reverses the journal and brings the goods back.
	e.must("POST", fmt.Sprintf("/pembayaran/penjualan/%d/batal", pj), map[string]any{"alasan": "Salah input"}, nil)
	e.expectBalanced()
	e.expectSaldo(map[string]float64{"1-1101": 0, "4-1201": 0})
	if got := e.stok(f.barang); got != 5 {
		t.Errorf("stok after cancelling paid penjualan = %d, want 5 (returned)", got)
	}
}

func TestPenjualanBelumBayarDibatalkanAtauDihapusMengembalikanStok(t *testing.T) {
	e := newEnv(t)
	f := e.fixtures(5)

	pj := e.penjualanLangsung(f, 2)
	e.must("PATCH", fmt.Sprintf("/penjualan/%d/status", pj), map[string]any{"status": "cancelled"}, nil)
	if got := e.stok(f.barang); got != 5 {
		t.Errorf("stok after cancelling unpaid penjualan = %d, want 5", got)
	}
	if r := e.call("staff", "POST", "/pembayaran/bayar", map[string]any{"source_type": "penjualan", "source_id": pj, "staff_id": f.staff, "jenis_pembayaran": "tunai", "jumlah_bayar": 20000}); r.Code != http.StatusBadRequest {
		t.Errorf("paying a cancelled penjualan: %d, want 400", r.Code)
	}

	before := e.stok(f.barang)
	pj2 := e.penjualanLangsung(f, 1)
	e.must("DELETE", fmt.Sprintf("/penjualan/%d", pj2), nil, nil)
	if got := e.stok(f.barang); got != before {
		t.Errorf("stok after deleting penjualan = %d, want %d", got, before)
	}
}

func TestPenjualanQtyTidakValid(t *testing.T) {
	e := newEnv(t)
	f := e.fixtures(5)
	for _, qty := range []int{-3, 0} {
		r := e.call("apoteker", "POST", "/penjualan", map[string]any{
			"pasien_id": f.pasien, "staff_id": f.staff, "tanggal": tanggal, "keterangan": "Penjualan langsung",
			"details": []map[string]any{{"barang_id": f.barang, "qty": qty}},
		})
		if r.Code != http.StatusBadRequest {
			t.Errorf("penjualan qty %d = %d, want 400", qty, r.Code)
		}
	}
	if got := e.stok(f.barang); got != 5 {
		t.Errorf("stok after invalid penjualan = %d, want 5", got)
	}
}

func TestPaketPerawatanDibeliDanDibatalkan(t *testing.T) {
	e := newEnv(t)
	f := e.fixtures(5)
	var tr struct{ ID uint }
	e.must("POST", "/treatment", map[string]any{"nama": "Paket Facial 5x", "kategori": "Paket", "harga": 1000000, "sesi_paket": 5}, &tr)

	var pw struct{ ID uint }
	e.must("POST", "/perawatan", map[string]any{
		"pasien_id": f.pasien, "staff_id": f.staff, "tanggal": tanggal, "status": "bayar",
		"tindakans": []map[string]any{{"treatment_id": tr.ID, "jumlah": 1, "harga": 1000000, "total": 1000000, "tanggal": tanggal}},
	}, &pw)

	var antre []struct{ ID uint }
	e.must("GET", "/pembayaran/perawatan/paket", nil, &antre)
	if len(antre) != 1 || antre[0].ID != pw.ID {
		t.Fatalf("perawatan paket queue = %+v", antre)
	}
	e.must("GET", "/pembayaran/perawatan/reguler", nil, &antre)
	for _, a := range antre {
		if a.ID == pw.ID {
			t.Errorf("paket perawatan also listed in reguler queue")
		}
	}

	if r := e.call("staff", "POST", "/pembayaran/bayar", map[string]any{"source_type": "perawatan", "source_id": pw.ID, "staff_id": f.staff, "jenis_pembayaran": "tunai", "jumlah_bayar": 1000000, "tanggal": tanggal}); r.Code != http.StatusOK {
		t.Fatalf("bayar paket: %d %s", r.Code, r.Message)
	}
	var sisa []struct {
		ID        uint    `json:"id"`
		SisaSesi  int     `json:"sisa_sesi"`
		TotalSesi int     `json:"total_sesi"`
		Harga     float64 `json:"harga_total"`
	}
	e.must("GET", fmt.Sprintf("/pembayaran/paket/sisa?pasien_id=%d", f.pasien), nil, &sisa)
	if len(sisa) != 1 {
		t.Fatalf("paket sisa = %+v, want 1 paket", sisa)
	}
	if sisa[0].SisaSesi != 5 || sisa[0].TotalSesi != 5 {
		t.Errorf("paket sesi = %d/%d, want 5/5 (sesi_paket from the treatment)", sisa[0].SisaSesi, sisa[0].TotalSesi)
	}

	if r := e.call("nurse", "POST", fmt.Sprintf("/pembayaran/paket/%d/batal", sisa[0].ID), map[string]any{"refund": 100000}); r.Code != http.StatusForbidden {
		t.Errorf("nurse batal paket: %d, want 403", r.Code)
	}
	e.must("POST", fmt.Sprintf("/pembayaran/paket/%d/batal", sisa[0].ID), map[string]any{"refund": 600000, "jenis_pembayaran": "tunai", "tanggal": tanggal}, nil)
	if r := e.call("staff", "POST", fmt.Sprintf("/pembayaran/paket/%d/batal", sisa[0].ID), map[string]any{"refund": 0}); r.Code != http.StatusBadRequest {
		t.Errorf("cancelling paket twice: %d, want 400", r.Code)
	}
	e.expectBalanced()
	if got := e.saldo("1-1101"); got != 400000 {
		t.Errorf("kas after paket 1.000.000 and refund 600.000 = %v, want 400000", got)
	}
	e.must("GET", fmt.Sprintf("/pembayaran/paket/sisa?pasien_id=%d", f.pasien), nil, &sisa)
	if len(sisa) != 0 {
		t.Errorf("cancelled paket still listed in sisa: %+v", sisa)
	}
}

func TestProduksiDanKonversiStok(t *testing.T) {
	e := newEnv(t)
	f := e.fixtures(10)
	var jadi struct{ ID uint }
	e.must("POST", "/barang", map[string]any{"nama": "Serum Racikan", "harga_jual": 50000}, &jadi)

	var pr struct{ ID uint }
	r := e.call("apoteker", "POST", "/produksi-barang", map[string]any{"tanggal": tanggal, "details": []map[string]any{
		{"barang_id": f.barang, "qty": 4, "tipe": "keluar"}, {"barang_id": jadi.ID, "qty": 2, "tipe": "masuk"},
	}})
	if r.Code != http.StatusCreated {
		t.Fatalf("produksi: %d %s", r.Code, r.Message)
	}
	_ = json.Unmarshal(r.Data, &pr)
	// Bahan goes out (keluar), the product comes in (masuk) - same as ProduksiPage.
	if got, gotJadi := e.stok(f.barang), e.stok(jadi.ID); got != 6 || gotJadi != 2 {
		t.Errorf("after produksi bahan=%d jadi=%d, want bahan 6 jadi 2", got, gotJadi)
	}

	if r := e.call("apoteker", "POST", "/konversi-stok", map[string]any{"tanggal": tanggal, "details": []map[string]any{{"barang_id": f.barang, "qty": 999, "tipe": "keluar"}}}); r.Code != http.StatusBadRequest {
		t.Errorf("konversi keluar beyond stock: %d, want 400", r.Code)
	}
	if r := e.call("staff", "POST", "/produksi-barang", map[string]any{"tanggal": tanggal, "details": []map[string]any{{"barang_id": f.barang, "qty": 1, "tipe": "keluar"}}}); r.Code != http.StatusForbidden {
		t.Errorf("staff produksi: %d, want 403", r.Code)
	}

	e.must("DELETE", fmt.Sprintf("/produksi-barang/%d", pr.ID), nil, nil)
	if got, gotJadi := e.stok(f.barang), e.stok(jadi.ID); got != 10 || gotJadi != 0 {
		t.Errorf("after deleting produksi bahan=%d jadi=%d, want 10 and 0", got, gotJadi)
	}
}

func TestLaporanPerRoleSetelahTransaksi(t *testing.T) {
	e := newEnv(t)
	f := e.fixtures(5)
	pw := e.perawatan(f)
	if r := e.call("staff", "POST", "/pembayaran/bayar", map[string]any{"source_type": "perawatan", "source_id": pw, "staff_id": f.staff, "jenis_pembayaran": "tunai", "jumlah_bayar": 370000, "tanggal": tanggal}); r.Code != http.StatusOK {
		t.Fatalf("bayar: %d %s", r.Code, r.Message)
	}
	q := "?dari=" + tanggal + "&sampai=" + tanggal
	for _, c := range []struct {
		role, path string
		want       int
	}{
		{"staff", "/laporan/fo", 200}, {"finance", "/laporan/fo", 200}, {"doctor", "/laporan/fo", 403},
		{"apoteker", "/laporan/apotek", 200}, {"finance", "/laporan/apotek", 200}, {"staff", "/laporan/apotek", 403},
		{"nurse", "/laporan/nurse", 200}, {"finance", "/laporan/nurse", 403},
		{"doctor", "/laporan/dm", 200}, {"nurse", "/laporan/dm", 403},
		{"finance", "/finance/laporan/neraca", 200}, {"doctor", "/finance/laporan/neraca", 403},
		{"finance", "/finance/laporan/neraca-saldo", 200},
		{"admin", "/dashboard/kpi", 200}, {"nurse", "/dashboard/kpi", 200},
	} {
		if r := e.call(c.role, "GET", c.path+q, nil); r.Code != c.want {
			t.Errorf("%s GET %s = %d (%s), want %d", c.role, c.path, r.Code, r.Message, c.want)
		}
	}

	var dm struct {
		Ringkasan map[string]any `json:"ringkasan"`
	}
	e.must("GET", "/laporan/dm"+q, nil, &dm)
	if len(dm.Ringkasan) == 0 {
		t.Errorf("laporan dm ringkasan empty after a paid perawatan")
	}

	var ns struct {
		TotalDebit  float64 `json:"total_debit"`
		TotalKredit float64 `json:"total_kredit"`
	}
	e.must("GET", "/finance/laporan/neraca-saldo"+q, nil, &ns)
	if ns.TotalDebit == 0 || ns.TotalDebit != ns.TotalKredit {
		t.Errorf("neraca saldo debit %v kredit %v, want equal and non-zero", ns.TotalDebit, ns.TotalKredit)
	}
}

func TestAksesPerRoleLanjutan(t *testing.T) {
	e := newEnv(t)
	cases := []struct {
		role, method, path string
		body               any
		want               int
	}{
		{"finance", "GET", "/finance/akun", nil, 200},
		{"doctor", "GET", "/finance/jurnal", nil, 403},
		{"apoteker", "POST", "/finance/jurnal", map[string]any{}, 403},
		{"doctor", "GET", "/user", nil, 403},
		{"nurse", "POST", "/supplier", map[string]any{"nama": "X"}, 403},
		{"apoteker", "POST", "/supplier", map[string]any{"nama": "Supplier Apoteker"}, 201},
		{"staff", "POST", "/stok-opname", map[string]any{}, 403},
		{"doctor", "POST", "/pembayaran/deposit", map[string]any{}, 403},
		{"nurse", "POST", "/membership", map[string]any{}, 403},
		{"finance", "POST", "/pasien", map[string]any{"nama": "X"}, 403},
		{"nurse", "DELETE", "/perawatan/1", nil, 403},
		{"staff", "POST", "/bank", map[string]any{"nama": "X"}, 403},
		{"staff", "POST", "/cabang", map[string]any{"nama": "X"}, 403},
		{"staff", "POST", "/user", map[string]any{"username": "x"}, 403},
		{"apoteker", "PATCH", "/penjualan/1/status", map[string]any{"status": "cancelled"}, 403},
	}
	for _, c := range cases {
		if r := e.call(c.role, c.method, c.path, c.body); r.Code != c.want {
			t.Errorf("%s %s %s = %d (%s), want %d", c.role, c.method, c.path, r.Code, r.Message, c.want)
		}
	}

	// Without a token every protected route is 401.
	e.tok["anon"] = ""
	if r := e.call("anon", "GET", "/pasien", nil); r.Code != http.StatusUnauthorized {
		t.Errorf("no token GET /pasien = %d, want 401", r.Code)
	}
	e.tok["anon"] = "not-a-jwt"
	if r := e.call("anon", "GET", "/pasien", nil); r.Code != http.StatusUnauthorized {
		t.Errorf("bad token GET /pasien = %d, want 401", r.Code)
	}
}

func TestPenjualanBatalTidakMengembalikanStokDuaKali(t *testing.T) {
	e := newEnv(t)
	f := e.fixtures(5)

	pj := e.penjualanLangsung(f, 2)
	e.must("PATCH", fmt.Sprintf("/penjualan/%d/status", pj), map[string]any{"status": "cancelled"}, nil)
	if got := e.stok(f.barang); got != 5 {
		t.Fatalf("stok after cancel = %d, want 5", got)
	}
	// A cancelled sale already gave its goods back; reopening it would sell them without taking stock.
	if r := e.call("admin", "PATCH", fmt.Sprintf("/penjualan/%d/status", pj), map[string]any{"status": "confirmed"}); r.Code != http.StatusBadRequest {
		t.Errorf("reopening cancelled penjualan: %d, want 400", r.Code)
	}
	if r := e.call("admin", "PATCH", fmt.Sprintf("/penjualan/%d/status", pj), map[string]any{"status": "asal"}); r.Code != http.StatusBadRequest {
		t.Errorf("unknown penjualan status: %d, want 400", r.Code)
	}
	e.must("DELETE", fmt.Sprintf("/penjualan/%d", pj), nil, nil)
	if got := e.stok(f.barang); got != 5 {
		t.Errorf("stok after deleting a cancelled penjualan = %d, want 5 (not returned twice)", got)
	}
}

func TestPenjualanPaidHanyaLewatKasir(t *testing.T) {
	e := newEnv(t)
	f := e.fixtures(5)
	body := map[string]any{
		"pasien_id": f.pasien, "staff_id": f.staff, "tanggal": tanggal, "status": "paid",
		"details": []map[string]any{{"barang_id": f.barang, "qty": 1}},
	}
	if r := e.call("apoteker", "POST", "/penjualan", body); r.Code != http.StatusBadRequest {
		t.Errorf("create penjualan as paid = %d, want 400", r.Code)
	}
	pj := e.penjualanLangsung(f, 1)
	if r := e.call("admin", "PATCH", fmt.Sprintf("/penjualan/%d/status", pj), map[string]any{"status": "paid"}); r.Code != http.StatusBadRequest {
		t.Errorf("PATCH status paid without payment = %d, want 400", r.Code)
	}
	if got := e.saldo("1-1101"); got != 0 {
		t.Errorf("kas = %v, want 0 (nothing paid)", got)
	}
}

func TestAntreanKasirMenampilkanTotalTagihan(t *testing.T) {
	e := newEnv(t)
	f := e.fixtures(5)
	pw := e.perawatan(f)
	var rows []struct {
		ID        uint    `json:"id"`
		Total     float64 `json:"total"`
		Tindakans []struct {
			Treatment *struct {
				Nama string `json:"nama"`
			} `json:"treatment"`
		} `json:"tindakans"`
	}
	e.must("GET", "/pembayaran/perawatan/reguler", nil, &rows)
	if len(rows) != 1 || rows[0].ID != pw {
		t.Fatalf("queue = %+v", rows)
	}
	// Facial 350.000 + resep 2 x 10.000.
	if rows[0].Total != 370000 {
		t.Errorf("queue total = %v, want 370000", rows[0].Total)
	}
	if len(rows[0].Tindakans) != 1 || rows[0].Tindakans[0].Treatment == nil || rows[0].Tindakans[0].Treatment.Nama != "Facial Uji" {
		t.Errorf("queue tindakan lacks treatment name: %+v", rows[0].Tindakans)
	}
}

// Dashboard charts: revenue fields only reach the roles that may see Laporan FO.
func TestDashboardTrenPerRole(t *testing.T) {
	e := newEnv(t)
	type tren struct {
		Harian             []map[string]any  `json:"harian"`
		TopTreatment       []map[string]any  `json:"top_treatment"`
		StatusAppointment  []map[string]any  `json:"status_appointment"`
		PerJenisPembayaran *[]map[string]any `json:"per_jenis_pembayaran"`
	}
	get := func(role string, hari int) tren {
		t.Helper()
		r := e.call(role, "GET", fmt.Sprintf("/dashboard/tren?hari=%d", hari), nil)
		if r.Code != http.StatusOK {
			t.Fatalf("%s tren: %d %s", role, r.Code, r.Message)
		}
		var out tren
		if err := json.Unmarshal(r.Data, &out); err != nil {
			t.Fatal(err)
		}
		return out
	}

	for _, hari := range []int{7, 30} {
		if got := len(get("admin", hari).Harian); got != hari {
			t.Errorf("admin tren hari=%d harian = %d rows, want one per day", hari, got)
		}
	}
	admin := get("finance", 7)
	if _, ok := admin.Harian[0]["pendapatan"]; !ok {
		t.Errorf("finance tren harian missing pendapatan: %+v", admin.Harian[0])
	}
	nurse := get("nurse", 7)
	if _, ok := nurse.Harian[0]["pendapatan"]; ok {
		t.Errorf("nurse tren harian exposes pendapatan: %+v", nurse.Harian[0])
	}
	if nurse.PerJenisPembayaran != nil {
		t.Errorf("nurse tren exposes per_jenis_pembayaran: %+v", *nurse.PerJenisPembayaran)
	}
	if nurse.TopTreatment == nil || nurse.StatusAppointment == nil {
		t.Errorf("nurse tren lists must be arrays, got %+v / %+v", nurse.TopTreatment, nurse.StatusAppointment)
	}
	if r := e.call("admin", "GET", "/dashboard/tren?hari=99", nil); r.Code != http.StatusBadRequest {
		t.Errorf("tren hari=99 = %d, want 400", r.Code)
	}
}

func TestKwitansiPenjualan(t *testing.T) {
	e := newEnv(t)
	f := e.fixtures(5)
	e.must("PUT", "/pengaturan/klinik", map[string]any{"nama": "Klinik Uji", "catatan_invoice": "Barang yang sudah dibeli tidak dapat dikembalikan", "garansi": "Garansi 7 hari"}, nil)
	e.must("POST", "/pembayaran/deposit", map[string]any{"pasien_id": f.pasien, "staff_id": f.staff, "tanggal": tanggal, "jenis": "pembayaran_deposit", "jumlah": 50000, "jenis_pembayaran": "tunai"}, nil)
	e.must("POST", "/pembayaran/deposit", map[string]any{"pasien_id": f.pasien, "staff_id": f.staff, "tanggal": tanggal, "jenis": "pendaftaran_member", "jumlah": 30000, "jenis_pembayaran": "tunai"}, nil)
	var promo, voucher struct{ Kode string }
	e.must("POST", "/promo", map[string]any{"nama": "Promo 10%", "tipe_diskon": "percent", "nilai_diskon": 10}, &promo)
	e.must("POST", "/voucher", map[string]any{"nama": "Voucher 20rb", "tipe_diskon": "nominal", "nilai_diskon": 20000, "min_pembelian": 100000}, &voucher)

	pw := e.perawatan(f)
	r := e.call("staff", "POST", "/pembayaran/bayar", map[string]any{
		"source_type": "perawatan", "source_id": pw, "promo_kode": promo.Kode, "voucher_kode": voucher.Kode,
		"poin_dipakai": 10000, "deposit_dipakai": 40000, "staff_id": f.staff, "jenis_pembayaran": "tunai", "jumlah_bayar": 300000, "tanggal": tanggal,
	})
	if r.Code != http.StatusOK {
		t.Fatalf("bayar: %d %s", r.Code, r.Message)
	}
	var pj struct {
		ID        uint   `json:"id"`
		NoInvoice string `json:"no_invoice"`
	}
	_ = json.Unmarshal(r.Data, &pj)

	var k struct {
		NoInvoice      string  `json:"no_invoice"`
		Status         string  `json:"status"`
		PasienNama     string  `json:"pasien_nama"`
		KasirNama      string  `json:"kasir_nama"`
		JenisBayar     string  `json:"jenis_pembayaran"`
		Subtotal       float64 `json:"subtotal"`
		PromoKode      string  `json:"promo_kode"`
		DiskonPromo    float64 `json:"diskon_promo"`
		VoucherKode    string  `json:"voucher_kode"`
		DiskonVoucher  float64 `json:"diskon_voucher"`
		Total          float64 `json:"total"`
		PoinDipakai    int     `json:"poin_dipakai"`
		PotonganPoin   float64 `json:"potongan_poin"`
		DepositDipakai float64 `json:"deposit_dipakai"`
		SisaBayar      float64 `json:"sisa_bayar"`
		JumlahBayar    float64 `json:"jumlah_bayar"`
		Kembalian      float64 `json:"kembalian"`
		Items          []struct {
			Nama     string  `json:"nama"`
			Subtotal float64 `json:"subtotal"`
		} `json:"items"`
		Klinik struct {
			Nama           string `json:"nama"`
			CatatanInvoice string `json:"catatan_invoice"`
			Garansi        string `json:"garansi"`
		} `json:"klinik"`
	}
	r = e.call("staff", "GET", fmt.Sprintf("/penjualan/%d/kwitansi", pj.ID), nil)
	if r.Code != http.StatusOK {
		t.Fatalf("kwitansi: %d %s", r.Code, r.Message)
	}
	_ = json.Unmarshal(r.Data, &k)
	// 370.000 - promo 37.000 - voucher 20.000 = 313.000; less 10.000 poin and 40.000 deposit = 263.000; paid 300.000.
	if k.NoInvoice != pj.NoInvoice || k.Status != "paid" || k.PasienNama != "Pasien Uji" || k.KasirNama != "Dokter Uji" || k.JenisBayar != "tunai" {
		t.Errorf("kwitansi header = %+v", k)
	}
	if k.Subtotal != 370000 || k.DiskonPromo != 37000 || k.DiskonVoucher != 20000 || k.Total != 313000 {
		t.Errorf("kwitansi totals: subtotal %v promo %v voucher %v total %v", k.Subtotal, k.DiskonPromo, k.DiskonVoucher, k.Total)
	}
	if k.PromoKode != promo.Kode || k.VoucherKode != voucher.Kode {
		t.Errorf("kwitansi codes = %q/%q, want %q/%q", k.PromoKode, k.VoucherKode, promo.Kode, voucher.Kode)
	}
	if k.PoinDipakai != 10000 || k.PotonganPoin != 10000 || k.DepositDipakai != 40000 || k.SisaBayar != 263000 || k.JumlahBayar != 300000 || k.Kembalian != 37000 {
		t.Errorf("kwitansi pembayaran: poin %d/%v deposit %v sisa %v bayar %v kembalian %v", k.PoinDipakai, k.PotonganPoin, k.DepositDipakai, k.SisaBayar, k.JumlahBayar, k.Kembalian)
	}
	if len(k.Items) != 2 || k.Items[0].Nama != "Facial Uji" || k.Items[1].Nama != "Obat Uji" || k.Items[1].Subtotal != 20000 {
		t.Errorf("kwitansi items = %+v", k.Items)
	}
	if k.Klinik.Nama != "Klinik Uji" || k.Klinik.CatatanInvoice == "" || k.Klinik.Garansi != "Garansi 7 hari" {
		t.Errorf("kwitansi klinik = %+v", k.Klinik)
	}

	// A sale still waiting at the cashier has no receipt yet.
	unpaid := e.penjualanLangsung(f, 1)
	if r := e.call("staff", "GET", fmt.Sprintf("/penjualan/%d/kwitansi", unpaid), nil); r.Code != http.StatusConflict {
		t.Errorf("kwitansi unpaid = %d (%s), want 409", r.Code, r.Message)
	}
	// Dropping an unpaid sale does not turn it into a receipt.
	e.must("PATCH", fmt.Sprintf("/penjualan/%d/status", unpaid), map[string]any{"status": "cancelled"}, nil)
	if r := e.call("staff", "GET", fmt.Sprintf("/penjualan/%d/kwitansi", unpaid), nil); r.Code != http.StatusConflict {
		t.Errorf("kwitansi cancelled-unpaid = %d, want 409", r.Code)
	}
	// A voided paid sale stays printable, with its cancelled status and reason for the DIBATALKAN stamp.
	e.must("POST", fmt.Sprintf("/pembayaran/penjualan/%d/batal", pj.ID), map[string]any{"alasan": "Pasien batal"}, nil)
	var kv struct {
		Status      string `json:"status"`
		AlasanBatal string `json:"alasan_batal"`
	}
	r = e.call("staff", "GET", fmt.Sprintf("/penjualan/%d/kwitansi", pj.ID), nil)
	_ = json.Unmarshal(r.Data, &kv)
	if r.Code != http.StatusOK || kv.Status != "cancelled" || kv.AlasanBatal != "Pasien batal" {
		t.Errorf("kwitansi voided = %d %+v, want 200 cancelled with reason", r.Code, kv)
	}
	if r := e.call("staff", "GET", "/penjualan/999999/kwitansi", nil); r.Code != http.StatusNotFound {
		t.Errorf("kwitansi unknown = %d, want 404", r.Code)
	}
}

func TestInformedConsentPerawatan(t *testing.T) {
	e := newEnv(t)
	f := e.fixtures(5)
	pw := e.perawatan(f)
	var tpl struct{ ID uint }
	e.must("POST", "/template-informed-consent", map[string]any{
		"judul": "Persetujuan {treatment}", "kategori": "Umum",
		"isi": "Saya {nama_pasien} ({kode_pasien}) setuju menjalani {treatment} oleh {nama_dokter} pada {tanggal}.",
	}, &tpl)

	body := map[string]any{"template_id": tpl.ID, "nama_penandatangan": "Pasien Uji", "ttd_pasien_url": "/api/uploads/files/ttd/a.png", "dokter_id": f.staff, "ttd_dokter_url": "/api/uploads/files/ttd/b.png", "saksi": "Perawat Jaga"}
	path := fmt.Sprintf("/perawatan/%d/consent", pw)
	if r := e.call("apoteker", "POST", path, body); r.Code != http.StatusForbidden {
		t.Errorf("apoteker POST consent = %d, want 403", r.Code)
	}
	r := e.call("nurse", "POST", path, body)
	if r.Code != http.StatusCreated {
		t.Fatalf("nurse POST consent: %d %s", r.Code, r.Message)
	}
	type consent struct {
		ID          uint   `json:"id"`
		Judul       string `json:"judul"`
		Isi         string `json:"isi"`
		Status      string `json:"status"`
		Hubungan    string `json:"hubungan"`
		AlasanBatal string `json:"alasan_batal"`
	}
	var c consent
	_ = json.Unmarshal(r.Data, &c)
	want := "Saya Pasien Uji (PAS-T1) setuju menjalani Facial Uji oleh Dokter Uji pada "
	if c.Judul != "Persetujuan Facial Uji" || !strings.HasPrefix(c.Isi, want) || strings.Contains(c.Isi, "{") || c.Status != "aktif" || c.Hubungan != "Pasien sendiri" {
		t.Fatalf("consent = %+v", c)
	}

	// Editing the template later must not change what was signed.
	e.must("PUT", fmt.Sprintf("/template-informed-consent/%d", tpl.ID), map[string]any{"judul": "Baru", "isi": "Isi baru {nama_pasien}"}, nil)
	var list []consent
	e.must("GET", path, nil, &list)
	if len(list) != 1 || list[0].Isi != c.Isi || list[0].Judul != c.Judul {
		t.Fatalf("consent after template edit = %+v", list)
	}

	if r := e.call("nurse", "POST", path, map[string]any{"template_id": tpl.ID, "nama_penandatangan": "X"}); r.Code != http.StatusBadRequest {
		t.Errorf("consent without signature = %d, want 400", r.Code)
	}
	if r := e.call("staff", "POST", "/perawatan/999999/consent", body); r.Code != http.StatusNotFound {
		t.Errorf("consent on unknown perawatan = %d, want 404", r.Code)
	}

	batal := fmt.Sprintf("/perawatan-consent/%d/batal", c.ID)
	if r := e.call("nurse", "POST", batal, map[string]any{"alasan": "salah template"}); r.Code != http.StatusForbidden {
		t.Errorf("nurse batal consent = %d, want 403", r.Code)
	}
	if r := e.call("doctor", "POST", batal, map[string]any{}); r.Code != http.StatusBadRequest {
		t.Errorf("batal without alasan = %d, want 400", r.Code)
	}
	r = e.call("doctor", "POST", batal, map[string]any{"alasan": "salah template"})
	if r.Code != http.StatusOK {
		t.Fatalf("doctor batal consent: %d %s", r.Code, r.Message)
	}
	_ = json.Unmarshal(r.Data, &c)
	if c.Status != "dibatalkan" || c.AlasanBatal != "salah template" {
		t.Errorf("consent after batal = %+v", c)
	}
	if r := e.call("doctor", "POST", batal, map[string]any{"alasan": "lagi"}); r.Code != http.StatusBadRequest {
		t.Errorf("double batal = %d, want 400", r.Code)
	}
	if r := e.call("finance", "GET", fmt.Sprintf("/perawatan-consent/%d", c.ID), nil); r.Code != http.StatusOK {
		t.Errorf("GET consent = %d", r.Code)
	}
}

// Money is only taken on an open cashier shift; closing it compares the counted cash with the drawer.
func TestShiftKasir(t *testing.T) {
	e := newEnv(t)
	f := e.fixtures(20)
	// The kasir starts without a shift; admin keeps the one from fixtures.
	e.db.Exec("DELETE FROM kasir_shifts WHERE user_id = (SELECT id FROM users WHERE username = 't_staff')")

	type ringkasan struct {
		JenisPembayaran string  `json:"jenis_pembayaran"`
		Masuk           float64 `json:"masuk"`
		Keluar          float64 `json:"keluar"`
	}
	type detail struct {
		Shift struct {
			ID              uint     `json:"id"`
			Kode            string   `json:"kode"`
			Status          string   `json:"status"`
			SaldoAkhirFisik *float64 `json:"saldo_akhir_fisik"`
			ExpectedTunai   *float64 `json:"expected_tunai"`
			Selisih         *float64 `json:"selisih"`
		} `json:"shift"`
		Ringkasan     []ringkasan `json:"ringkasan"`
		ExpectedTunai float64     `json:"expected_tunai"`
		Mutasi        []struct {
			SourceType string  `json:"source_type"`
			Masuk      float64 `json:"masuk"`
			Keluar     float64 `json:"keluar"`
		} `json:"mutasi"`
	}
	bayar := func(role string, pj uint, jenis string, jumlah float64) resp {
		return e.call(role, "POST", "/pembayaran/bayar", map[string]any{"source_type": "penjualan", "source_id": pj, "staff_id": f.staff, "jenis_pembayaran": jenis, "jumlah_bayar": jumlah, "tanggal": tanggal})
	}
	deposit := func(jumlah float64) resp {
		return e.call("staff", "POST", "/pembayaran/deposit", map[string]any{"pasien_id": f.pasien, "staff_id": f.staff, "tanggal": tanggal, "jenis": "pembayaran_deposit", "jumlah": jumlah, "jenis_pembayaran": "tunai"})
	}

	pj := e.penjualanLangsung(f, 10) // 10 x 10.000
	if r := bayar("staff", pj, "tunai", 150000); r.Code != http.StatusBadRequest || !strings.Contains(r.Message, "Kasir belum dibuka") {
		t.Fatalf("bayar without shift: %d %s", r.Code, r.Message)
	}
	if r := deposit(50000); r.Code != http.StatusBadRequest || !strings.Contains(r.Message, "Kasir belum dibuka") {
		t.Fatalf("deposit without shift: %d %s", r.Code, r.Message)
	}
	if got := e.stok(f.barang); got != 10 {
		t.Errorf("stok after refused payment = %d, want 10", got)
	}
	r := e.call("staff", "GET", "/kasir/shift/aktif", nil)
	if r.Code != http.StatusOK || (len(r.Data) > 0 && string(r.Data) != "null") {
		t.Fatalf("aktif without shift: %d %s", r.Code, r.Data)
	}

	r = e.call("staff", "POST", "/kasir/shift/buka", map[string]any{"saldo_awal": 500000, "catatan": "Laci pagi"})
	if r.Code != http.StatusCreated {
		t.Fatalf("buka: %d %s", r.Code, r.Message)
	}
	var d detail
	_ = json.Unmarshal(r.Data, &d)
	if d.Shift.Status != "open" || !strings.HasPrefix(d.Shift.Kode, "SHF-") || d.ExpectedTunai != 500000 {
		t.Fatalf("shift dibuka = %+v", d)
	}
	shiftID := d.Shift.ID
	if r := e.call("staff", "POST", "/kasir/shift/buka", map[string]any{"saldo_awal": 0}); r.Code != http.StatusBadRequest {
		t.Errorf("second open shift: %d %s, want 400", r.Code, r.Message)
	}
	if r := e.call("doctor", "POST", "/kasir/shift/buka", map[string]any{"saldo_awal": 0}); r.Code != http.StatusForbidden {
		t.Errorf("doctor buka kasir: %d, want 403", r.Code)
	}

	// Tunai 100.000 paid with 150.000: only the bill stays in the drawer.
	if r := bayar("staff", pj, "tunai", 150000); r.Code != http.StatusOK {
		t.Fatalf("bayar tunai: %d %s", r.Code, r.Message)
	}
	if r := deposit(50000); r.Code != http.StatusCreated {
		t.Fatalf("deposit tunai: %d %s", r.Code, r.Message)
	}
	if r := bayar("staff", e.penjualanLangsung(f, 2), "transfer", 20000); r.Code != http.StatusOK {
		t.Fatalf("bayar transfer: %d %s", r.Code, r.Message)
	}

	// Admin sells a paket on admin's own shift; the kasir refunds 600.000 tunai from theirs.
	var tr struct{ ID uint }
	e.must("POST", "/treatment", map[string]any{"nama": "Paket Peeling 5x", "kategori": "Paket", "harga": 1000000, "sesi_paket": 5}, &tr)
	var pw struct{ ID uint }
	e.must("POST", "/perawatan", map[string]any{
		"pasien_id": f.pasien, "staff_id": f.staff, "tanggal": tanggal, "status": "bayar",
		"tindakans": []map[string]any{{"treatment_id": tr.ID, "jumlah": 1, "harga": 1000000, "total": 1000000, "tanggal": tanggal}},
	}, &pw)
	if r := e.call("admin", "POST", "/pembayaran/bayar", map[string]any{"source_type": "perawatan", "source_id": pw.ID, "staff_id": f.staff, "jenis_pembayaran": "tunai", "jumlah_bayar": 1000000, "tanggal": tanggal}); r.Code != http.StatusOK {
		t.Fatalf("admin bayar paket: %d %s", r.Code, r.Message)
	}
	var sisa []struct{ ID uint }
	e.must("GET", "/pembayaran/paket/sisa", nil, &sisa)
	if len(sisa) != 1 {
		t.Fatalf("paket sisa = %+v", sisa)
	}
	if r := e.call("staff", "POST", fmt.Sprintf("/pembayaran/paket/%d/batal", sisa[0].ID), map[string]any{"refund": 600000, "jenis_pembayaran": "tunai", "tanggal": tanggal}); r.Code != http.StatusOK {
		t.Fatalf("refund paket: %d %s", r.Code, r.Message)
	}

	r = e.call("staff", "GET", "/kasir/shift/aktif", nil)
	d = detail{}
	_ = json.Unmarshal(r.Data, &d)
	// 500.000 awal + 100.000 penjualan + 50.000 deposit - 600.000 refund; transfer stays out of the drawer.
	if d.Shift.ID != shiftID || d.ExpectedTunai != 50000 || len(d.Mutasi) != 4 {
		t.Fatalf("aktif = %+v", d)
	}
	if len(d.Ringkasan) != 2 || d.Ringkasan[0] != (ringkasan{"tunai", 150000, 600000}) || d.Ringkasan[1] != (ringkasan{"transfer", 20000, 0}) {
		t.Errorf("ringkasan = %+v", d.Ringkasan)
	}

	var adminShift struct{ ID uint }
	e.db.Table("kasir_shifts").Select("id").Where("user_id = (SELECT id FROM users WHERE username = 't_admin') AND status = 'open'").Scan(&adminShift)
	var ad detail
	e.must("GET", fmt.Sprintf("/kasir/shift/%d", adminShift.ID), nil, &ad)
	if ad.ExpectedTunai != 1000000 || len(ad.Mutasi) != 1 || ad.Mutasi[0].SourceType != "penjualan" {
		t.Errorf("admin shift = %+v", ad)
	}

	// Only the owner or an admin closes a shift; staff only see their own.
	tutupAdmin := fmt.Sprintf("/kasir/shift/%d/tutup", adminShift.ID)
	if r := e.call("staff", "POST", tutupAdmin, map[string]any{"saldo_akhir_fisik": 1000000}); r.Code != http.StatusForbidden {
		t.Errorf("staff closes admin's shift: %d %s, want 403", r.Code, r.Message)
	}
	if r := e.call("finance", "POST", tutupAdmin, map[string]any{"saldo_akhir_fisik": 1000000}); r.Code != http.StatusForbidden {
		t.Errorf("finance closes a shift: %d, want 403", r.Code)
	}
	if r := e.call("staff", "GET", fmt.Sprintf("/kasir/shift/%d", adminShift.ID), nil); r.Code != http.StatusForbidden {
		t.Errorf("staff reads admin's shift: %d, want 403", r.Code)
	}
	var list []struct{ ID uint }
	r = e.call("staff", "GET", "/kasir/shift", nil)
	_ = json.Unmarshal(r.Data, &list)
	if r.Code != http.StatusOK || len(list) != 1 || list[0].ID != shiftID {
		t.Errorf("staff shift list = %d %+v", r.Code, list)
	}
	r = e.call("finance", "GET", "/kasir/shift?status=open", nil)
	_ = json.Unmarshal(r.Data, &list)
	if r.Code != http.StatusOK || len(list) != 2 {
		t.Errorf("finance shift list = %d %+v", r.Code, list)
	}

	tutup := fmt.Sprintf("/kasir/shift/%d/tutup", shiftID)
	if r := e.call("staff", "POST", tutup, map[string]any{"catatan": "lupa hitung"}); r.Code != http.StatusBadRequest {
		t.Errorf("tutup without saldo_akhir_fisik: %d, want 400", r.Code)
	}
	r = e.call("staff", "POST", tutup, map[string]any{"saldo_akhir_fisik": 45000, "catatan": "kurang 5rb"})
	if r.Code != http.StatusOK {
		t.Fatalf("tutup: %d %s", r.Code, r.Message)
	}
	d = detail{}
	_ = json.Unmarshal(r.Data, &d)
	if d.Shift.Status != "closed" || d.Shift.ExpectedTunai == nil || *d.Shift.ExpectedTunai != 50000 || d.Shift.Selisih == nil || *d.Shift.Selisih != -5000 {
		t.Fatalf("shift ditutup = %+v", d.Shift)
	}
	if r := e.call("staff", "POST", tutup, map[string]any{"saldo_akhir_fisik": 45000}); r.Code != http.StatusBadRequest {
		t.Errorf("closing twice: %d, want 400", r.Code)
	}
	if r := bayar("staff", e.penjualanLangsung(f, 1), "tunai", 10000); r.Code != http.StatusBadRequest || !strings.Contains(r.Message, "Kasir belum dibuka") {
		t.Errorf("bayar after close: %d %s", r.Code, r.Message)
	}

	// A new shift may be opened after closing, and admin may close it for the kasir.
	r = e.call("staff", "POST", "/kasir/shift/buka", map[string]any{"saldo_awal": 100000})
	if r.Code != http.StatusCreated {
		t.Fatalf("buka lagi: %d %s", r.Code, r.Message)
	}
	_ = json.Unmarshal(r.Data, &d)
	if r := e.call("admin", "POST", fmt.Sprintf("/kasir/shift/%d/tutup", d.Shift.ID), map[string]any{"saldo_akhir_fisik": 100000}); r.Code != http.StatusOK {
		t.Errorf("admin closes kasir's shift: %d %s", r.Code, r.Message)
	}
	e.expectBalanced()
}

// ── Multi-treatment packages with deferred revenue ──

type paketItemOut struct {
	ID           uint    `json:"id"`
	TreatmentID  uint    `json:"treatment_id"`
	TotalSesi    int     `json:"total_sesi"`
	SisaSesi     int     `json:"sisa_sesi"`
	NilaiTotal   float64 `json:"nilai_total"`
	NilaiPerSesi float64 `json:"nilai_per_sesi"`
	NilaiSisa    float64 `json:"nilai_sisa"`
}

type paketOut struct {
	ID          uint           `json:"id"`
	Kode        string         `json:"kode"`
	Status      string         `json:"status"`
	TotalSesi   int            `json:"total_sesi"`
	SisaSesi    int            `json:"sisa_sesi"`
	HargaTotal  float64        `json:"harga_total"`
	NilaiSisa   float64        `json:"nilai_sisa"`
	PenjualanID *uint          `json:"penjualan_id"`
	PerawatanID *uint          `json:"perawatan_id"`
	Items       []paketItemOut `json:"items"`
}

func (p paketOut) item(treatmentID uint) paketItemOut {
	for _, it := range p.Items {
		if it.TreatmentID == treatmentID {
			return it
		}
	}
	return paketItemOut{}
}

// paketGlow creates Peeling (250.000) and "Paket Glow" (1.200.000) = 3x Facial Uji + 2x Peeling.
func (e *env) paketGlow(f fixtures) (paketTr, peeling uint) {
	e.t.Helper()
	var p, pk struct {
		ID        uint `json:"id"`
		SesiPaket int  `json:"sesi_paket"`
		Items     []struct {
			TreatmentID uint `json:"treatment_id"`
			Sesi        int  `json:"sesi"`
		} `json:"items"`
	}
	e.must("POST", "/treatment", map[string]any{"nama": "Peeling Uji", "kategori": "Perawatan", "harga": 250000}, &p)
	e.must("POST", "/treatment", map[string]any{"nama": "Paket Glow", "kategori": "Paket", "harga": 1200000,
		"items": []map[string]any{{"treatment_id": f.treatment, "sesi": 3}, {"treatment_id": p.ID, "sesi": 2}}}, &pk)
	if pk.SesiPaket != 5 || len(pk.Items) != 2 {
		e.t.Fatalf("paket treatment = %+v, want 5 sesi in 2 items", pk)
	}
	return pk.ID, p.ID
}

// beliPaket sells a paket treatment on a perawatan at its price and returns the package.
func (e *env) beliPaket(f fixtures, paketTr uint, harga float64) paketOut {
	e.t.Helper()
	var pw struct{ ID uint }
	e.must("POST", "/perawatan", map[string]any{
		"pasien_id": f.pasien, "staff_id": f.staff, "tanggal": tanggal, "status": "bayar",
		"tindakans": []map[string]any{{"treatment_id": paketTr, "jumlah": 1, "harga": harga, "total": harga, "tanggal": tanggal}},
	}, &pw)
	if r := e.call("staff", "POST", "/pembayaran/bayar", map[string]any{"source_type": "perawatan", "source_id": pw.ID, "staff_id": f.staff, "jenis_pembayaran": "tunai", "jumlah_bayar": harga, "tanggal": tanggal}); r.Code != http.StatusOK {
		e.t.Fatalf("bayar paket: %d %s", r.Code, r.Message)
	}
	var list []paketOut
	e.must("GET", fmt.Sprintf("/pembayaran/paket/aktif?pasien_id=%d", f.pasien), nil, &list)
	for _, p := range list {
		if p.PerawatanID != nil && *p.PerawatanID == pw.ID {
			return p
		}
	}
	e.t.Fatalf("paket bought on perawatan %d not in aktif list %+v", pw.ID, list)
	return paketOut{}
}

func (e *env) paketAktif(pasien uint) []paketOut {
	e.t.Helper()
	var list []paketOut
	e.must("GET", fmt.Sprintf("/pembayaran/paket/aktif?pasien_id=%d", pasien), nil, &list)
	return list
}

func (e *env) paketByID(pasien, id uint) paketOut {
	e.t.Helper()
	for _, p := range e.paketAktif(pasien) {
		if p.ID == id {
			return p
		}
	}
	var row struct {
		Status   string
		SisaSesi int
	}
	if err := e.db.Table("paket_perawatans").Select("status, sisa_sesi").Where("id = ?", id).Scan(&row).Error; err != nil {
		e.t.Fatal(err)
	}
	return paketOut{ID: id, Status: row.Status, SisaSesi: row.SisaSesi}
}

// pakaiPaket saves a perawatan redeeming qty sessions of a package item. The price sent
// is the treatment's normal price; it must be forced to 0.
func (e *env) pakaiPaket(f fixtures, treatmentID, itemID uint, qty int) resp {
	e.t.Helper()
	return e.call("admin", "POST", "/perawatan", map[string]any{
		"pasien_id": f.pasien, "staff_id": f.staff, "tanggal": tanggal, "status": "bayar",
		"tindakans": []map[string]any{{"treatment_id": treatmentID, "jumlah": qty, "harga": 350000, "total": 350000 * qty, "tanggal": tanggal, "paket_item_id": itemID}},
	})
}

func (e *env) bayarNol(pw uint) resp {
	e.t.Helper()
	return e.call("staff", "POST", "/pembayaran/bayar", map[string]any{"source_type": "perawatan", "source_id": pw, "staff_id": e.staffID(), "tanggal": tanggal})
}

func (e *env) staffID() uint {
	var id uint
	e.db.Table("staffs").Select("id").Where("kode = ?", "STF-T1").Scan(&id)
	return id
}

func idOf(r resp) uint {
	var out struct{ ID uint }
	_ = json.Unmarshal(r.Data, &out)
	return out.ID
}

func TestPaketMultiTreatmentDipakaiSampaiHabis(t *testing.T) {
	e := newEnv(t)
	f := e.fixtures(5)
	paketTr, peeling := e.paketGlow(f)

	// The catalog editor's rules: no nested paket, no duplicates, sessions > 0.
	for name, items := range map[string][]map[string]any{
		"nested":    {{"treatment_id": paketTr, "sesi": 1}},
		"duplicate": {{"treatment_id": f.treatment, "sesi": 1}, {"treatment_id": f.treatment, "sesi": 2}},
		"sesi 0":    {{"treatment_id": f.treatment, "sesi": 0}},
	} {
		if r := e.call("admin", "POST", "/treatment", map[string]any{"nama": "Paket Salah", "kategori": "Paket", "harga": 1, "items": items}); r.Code != http.StatusBadRequest {
			t.Errorf("paket item %s: %d %s, want 400", name, r.Code, r.Message)
		}
	}

	pk := e.beliPaket(f, paketTr, 1200000)
	facial, peel := pk.item(f.treatment), pk.item(peeling)
	if pk.TotalSesi != 5 || facial.TotalSesi != 3 || peel.TotalSesi != 2 || pk.NilaiSisa != 1200000 {
		t.Fatalf("paket = %+v", pk)
	}
	// Value split by price weight: Facial 350.000 x 3 vs Peeling 250.000 x 2.
	if math.Abs(facial.NilaiTotal-812903.23) > 0.001 || math.Abs(facial.NilaiTotal+peel.NilaiTotal-1200000) > 0.001 {
		t.Errorf("item values = facial %v, peeling %v", facial.NilaiTotal, peel.NilaiTotal)
	}
	// Bought: the money is a liability, not revenue yet.
	e.expectSaldo(map[string]float64{"1-1101": 1200000, "2-1301": -1200000, "4-1101": 0})

	// One facial session: Rp 0 bill, titipan -> pendapatan for one session.
	r := e.pakaiPaket(f, f.treatment, facial.ID, 1)
	if r.Code != http.StatusCreated {
		t.Fatalf("perawatan pakai paket: %d %s", r.Code, r.Message)
	}
	pw1 := idOf(r)
	var tg struct {
		Subtotal  float64 `json:"subtotal"`
		SisaBayar float64 `json:"sisa_bayar"`
		Items     []struct {
			Harga      float64 `json:"harga"`
			PakaiPaket bool    `json:"pakai_paket"`
			PaketKode  string  `json:"paket_kode"`
			PaketSisa  *int    `json:"paket_sisa"`
		} `json:"items"`
	}
	r = e.call("staff", "POST", "/pembayaran/tagihan", map[string]any{"source_type": "perawatan", "source_id": pw1})
	if r.Code != http.StatusOK {
		t.Fatalf("tagihan Rp 0: %d %s", r.Code, r.Message)
	}
	_ = json.Unmarshal(r.Data, &tg)
	if tg.Subtotal != 0 || tg.SisaBayar != 0 || len(tg.Items) != 1 || !tg.Items[0].PakaiPaket || tg.Items[0].Harga != 0 ||
		tg.Items[0].PaketKode != pk.Kode || tg.Items[0].PaketSisa == nil || *tg.Items[0].PaketSisa != 3 {
		t.Fatalf("tagihan = %+v", tg)
	}
	if r := e.bayarNol(pw1); r.Code != http.StatusOK {
		t.Fatalf("bayar Rp 0: %d %s", r.Code, r.Message)
	}
	e.expectSaldo(map[string]float64{"1-1101": 1200000, "2-1301": -(1200000 - facial.NilaiPerSesi), "4-1101": -facial.NilaiPerSesi})
	var nJurnal int64
	e.db.Table("jurnals").Where("source_type = ?", "paket_pemakaian").Count(&nJurnal)
	if nJurnal != 1 {
		t.Errorf("pemakaian journals = %d, want 1", nJurnal)
	}

	// Two more facials in one visit, then the peeling sessions.
	if r := e.pakaiPaket(f, f.treatment, facial.ID, 3); r.Code != http.StatusBadRequest {
		t.Errorf("3 facial with 2 left: %d %s, want 400", r.Code, r.Message)
	}
	if r := e.pakaiPaket(f, peeling, facial.ID, 1); r.Code != http.StatusBadRequest {
		t.Errorf("peeling from the facial item: %d %s, want 400", r.Code, r.Message)
	}
	r = e.pakaiPaket(f, f.treatment, facial.ID, 2)
	if r.Code != http.StatusCreated {
		t.Fatalf("2 facial: %d %s", r.Code, r.Message)
	}
	if r := e.bayarNol(idOf(r)); r.Code != http.StatusOK {
		t.Fatalf("bayar 2 facial: %d %s", r.Code, r.Message)
	}
	r = e.pakaiPaket(f, peeling, peel.ID, 1)
	if r.Code != http.StatusCreated {
		t.Fatalf("peeling: %d %s", r.Code, r.Message)
	}
	if r := e.bayarNol(idOf(r)); r.Code != http.StatusOK {
		t.Fatalf("bayar peeling: %d %s", r.Code, r.Message)
	}

	// The last peeling is saved on two perawatans; only the first one paid gets it.
	a, b := e.pakaiPaket(f, peeling, peel.ID, 1), e.pakaiPaket(f, peeling, peel.ID, 1)
	if a.Code != http.StatusCreated || b.Code != http.StatusCreated {
		t.Fatalf("saving the last peeling twice: %d / %d", a.Code, b.Code)
	}
	if r := e.bayarNol(idOf(a)); r.Code != http.StatusOK {
		t.Fatalf("bayar last peeling: %d %s", r.Code, r.Message)
	}
	// The package is habis now, so the second bill is refused.
	if r := e.bayarNol(idOf(b)); r.Code != http.StatusBadRequest || !strings.Contains(r.Message, "habis") {
		t.Errorf("over-use at the kasir: %d %s, want 400", r.Code, r.Message)
	}

	got := e.paketByID(f.pasien, pk.ID)
	if got.Status != "habis" || got.SisaSesi != 0 {
		t.Errorf("paket after all sessions = %s, sisa %d; want habis, 0", got.Status, got.SisaSesi)
	}
	if len(e.paketAktif(f.pasien)) != 0 {
		t.Errorf("paket habis still listed as aktif")
	}
	if r := e.pakaiPaket(f, f.treatment, facial.ID, 1); r.Code != http.StatusBadRequest {
		t.Errorf("using a habis paket: %d, want 400", r.Code)
	}
	// Every session moved its share: the liability is gone and revenue is the full price.
	e.expectSaldo(map[string]float64{"2-1301": 0, "4-1101": -1200000, "1-1101": 1200000})
	e.expectBalanced()
	var used []struct {
		Qty   int
		Nilai float64
	}
	e.db.Table("paket_pemakaians").Where("paket_perawatan_id = ?", pk.ID).Order("id").Scan(&used)
	if len(used) != 4 {
		t.Errorf("pemakaian rows = %d, want 4", len(used))
	}
}

func TestPaketBayarBersamaanHanyaSatu(t *testing.T) {
	e := newEnv(t)
	f := e.fixtures(5)
	var tr struct{ ID uint }
	e.must("POST", "/treatment", map[string]any{"nama": "Paket Facial 1x", "kategori": "Paket", "harga": 300000,
		"items": []map[string]any{{"treatment_id": f.treatment, "sesi": 1}}}, &tr)
	pk := e.beliPaket(f, tr.ID, 300000)
	item := pk.item(f.treatment)

	pws := make([]uint, 4)
	for i := range pws {
		r := e.pakaiPaket(f, f.treatment, item.ID, 1)
		if r.Code != http.StatusCreated {
			t.Fatalf("perawatan %d: %d %s", i, r.Code, r.Message)
		}
		pws[i] = idOf(r)
	}
	codes := make([]int, len(pws))
	var wg sync.WaitGroup
	for i := range pws {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			codes[i] = e.bayarNol(pws[i]).Code
		}(i)
	}
	wg.Wait()
	sort.Ints(codes)
	if fmt.Sprint(codes) != "[200 400 400 400]" {
		t.Fatalf("concurrent payments of the last session = %v, want one 200", codes)
	}
	var n int64
	e.db.Table("paket_pemakaians").Where("paket_perawatan_id = ?", pk.ID).Count(&n)
	var sisa int
	e.db.Table("paket_perawatan_items").Select("sisa_sesi").Where("id = ?", item.ID).Scan(&sisa)
	if n != 1 || sisa != 0 {
		t.Errorf("after concurrent payments: %d pemakaian, sisa %d; want 1, 0", n, sisa)
	}
	e.expectSaldo(map[string]float64{"2-1301": 0, "4-1101": -300000})
	e.expectBalanced()
}

func TestPaketSesiPertamaDiKunjunganYangSama(t *testing.T) {
	e := newEnv(t)
	f := e.fixtures(5)
	paketTr, peeling := e.paketGlow(f)
	var lain struct{ ID uint }
	e.must("POST", "/treatment", map[string]any{"nama": "Laser Uji", "kategori": "Perawatan", "harga": 500000}, &lain)

	body := func(tindakans ...map[string]any) map[string]any {
		return map[string]any{"pasien_id": f.pasien, "staff_id": f.staff, "tanggal": tanggal, "status": "bayar", "tindakans": tindakans}
	}
	beli := map[string]any{"treatment_id": paketTr, "jumlah": 1, "harga": 1200000, "total": 1200000, "tanggal": tanggal}
	sesi := func(tr uint, idx int) map[string]any {
		return map[string]any{"treatment_id": tr, "jumlah": 1, "harga": 350000, "total": 350000, "tanggal": tanggal, "paket_beli_index": idx}
	}
	if r := e.call("admin", "POST", "/perawatan", body(beli, sesi(lain.ID, 0))); r.Code != http.StatusBadRequest {
		t.Errorf("same-visit session of a treatment not in the paket: %d, want 400", r.Code)
	}
	if r := e.call("admin", "POST", "/perawatan", body(map[string]any{"treatment_id": lain.ID, "jumlah": 1, "total": 500000}, sesi(f.treatment, 0))); r.Code != http.StatusBadRequest {
		t.Errorf("same-visit session pointing at a non-paket tindakan: %d, want 400", r.Code)
	}
	r := e.call("admin", "POST", "/perawatan", body(beli, sesi(f.treatment, 0)))
	if r.Code != http.StatusCreated {
		t.Fatalf("perawatan beli + pakai: %d %s", r.Code, r.Message)
	}
	var pw struct {
		ID        uint
		Tindakans []struct {
			ID                  uint    `json:"id"`
			Total               float64 `json:"total"`
			PaketBeliTindakanID *uint   `json:"paket_beli_tindakan_id"`
		} `json:"tindakans"`
	}
	_ = json.Unmarshal(r.Data, &pw)
	if len(pw.Tindakans) != 2 || pw.Tindakans[1].PaketBeliTindakanID == nil || *pw.Tindakans[1].PaketBeliTindakanID != pw.Tindakans[0].ID || pw.Tindakans[1].Total != 0 {
		t.Fatalf("tindakans = %+v", pw.Tindakans)
	}

	var tg struct {
		Subtotal float64 `json:"subtotal"`
		Items    []struct {
			Subtotal   float64 `json:"subtotal"`
			BeliPaket  bool    `json:"beli_paket"`
			PakaiPaket bool    `json:"pakai_paket"`
			PaketBaru  bool    `json:"paket_baru"`
		} `json:"items"`
	}
	r = e.call("staff", "POST", "/pembayaran/tagihan", map[string]any{"source_type": "perawatan", "source_id": pw.ID})
	_ = json.Unmarshal(r.Data, &tg)
	if r.Code != http.StatusOK || tg.Subtotal != 1200000 || len(tg.Items) != 2 || !tg.Items[0].BeliPaket || tg.Items[0].Subtotal != 1200000 ||
		!tg.Items[1].PakaiPaket || !tg.Items[1].PaketBaru || tg.Items[1].Subtotal != 0 {
		t.Fatalf("tagihan = %d %+v", r.Code, tg)
	}
	r = e.call("staff", "POST", "/pembayaran/bayar", map[string]any{"source_type": "perawatan", "source_id": pw.ID, "staff_id": f.staff, "jenis_pembayaran": "tunai", "jumlah_bayar": 1200000, "tanggal": tanggal})
	if r.Code != http.StatusOK {
		t.Fatalf("bayar: %d %s", r.Code, r.Message)
	}
	pj := idOf(r)

	list := e.paketAktif(f.pasien)
	if len(list) != 1 {
		t.Fatalf("paket aktif = %+v", list)
	}
	pk := list[0]
	facial := pk.item(f.treatment)
	if pk.SisaSesi != 4 || facial.SisaSesi != 2 || pk.item(peeling).SisaSesi != 2 || pk.PenjualanID == nil || *pk.PenjualanID != pj {
		t.Fatalf("paket after same-visit session = %+v", pk)
	}
	e.expectSaldo(map[string]float64{"1-1101": 1200000, "2-1301": -(1200000 - facial.NilaiPerSesi), "4-1101": -facial.NilaiPerSesi})
	e.expectBalanced()

	// The receipt lists the package (via penjualan_id) and the Rp 0 session.
	var k struct {
		Items []struct {
			PakaiPaket bool    `json:"pakai_paket"`
			Subtotal   float64 `json:"subtotal"`
		} `json:"items"`
		Paket []struct {
			Kode     string `json:"kode"`
			SisaSesi int    `json:"sisa_sesi"`
		} `json:"paket"`
	}
	e.must("GET", fmt.Sprintf("/penjualan/%d/kwitansi", pj), nil, &k)
	if len(k.Paket) != 1 || k.Paket[0].Kode != pk.Kode || k.Paket[0].SisaSesi != 4 || len(k.Items) != 2 || !k.Items[1].PakaiPaket || k.Items[1].Subtotal != 0 {
		t.Errorf("kwitansi = %+v", k)
	}
}

func TestPaketRefundMaksimumDanHangus(t *testing.T) {
	e := newEnv(t)
	f := e.fixtures(5)
	paketTr, _ := e.paketGlow(f)
	pk := e.beliPaket(f, paketTr, 1200000)
	facial := pk.item(f.treatment)
	r := e.pakaiPaket(f, f.treatment, facial.ID, 1)
	if r.Code != http.StatusCreated {
		t.Fatalf("pakai: %d %s", r.Code, r.Message)
	}
	if r := e.bayarNol(idOf(r)); r.Code != http.StatusOK {
		t.Fatalf("bayar: %d %s", r.Code, r.Message)
	}

	// ListPaketSisa honours pasien_id and shows the remaining value per item.
	var other struct{ ID uint }
	e.must("POST", "/pasien", map[string]any{"nama": "Pasien Lain"}, &other)
	var sisa []paketOut
	e.must("GET", fmt.Sprintf("/pembayaran/paket/sisa?pasien_id=%d", other.ID), nil, &sisa)
	if len(sisa) != 0 {
		t.Errorf("paket sisa for another pasien = %+v", sisa)
	}
	e.must("GET", fmt.Sprintf("/pembayaran/paket/sisa?pasien_id=%d", f.pasien), nil, &sisa)
	nilaiSisa := math.Round((1200000-facial.NilaiPerSesi)*100) / 100
	if len(sisa) != 1 || sisa[0].NilaiSisa != nilaiSisa || len(sisa[0].Items) != 2 || sisa[0].item(f.treatment).SisaSesi != 2 {
		t.Fatalf("paket sisa = %+v, want nilai sisa %v", sisa, nilaiSisa)
	}

	batal := fmt.Sprintf("/pembayaran/paket/%d/batal", pk.ID)
	if r := e.call("staff", "POST", batal, map[string]any{"refund": nilaiSisa + 1, "jenis_pembayaran": "tunai"}); r.Code != http.StatusBadRequest {
		t.Fatalf("refund above the unused value: %d %s, want 400", r.Code, r.Message)
	}
	if r := e.call("staff", "POST", batal, map[string]any{"refund": 500000, "jenis_pembayaran": "tunai", "tanggal": tanggal, "keterangan": "pindah kota"}); r.Code != http.StatusOK {
		t.Fatalf("refund: %d %s", r.Code, r.Message)
	}
	// The whole remaining liability leaves titipan: 500.000 back in cash, the rest is hangus.
	e.expectSaldo(map[string]float64{
		"2-1301": 0,
		"1-1101": 1200000 - 500000,
		"4-1101": -facial.NilaiPerSesi,
		"4-1903": -(nilaiSisa - 500000),
		"4-1902": 0,
	})
	e.expectBalanced()
	if r := e.pakaiPaket(f, f.treatment, facial.ID, 1); r.Code != http.StatusBadRequest {
		t.Errorf("using a cancelled paket: %d, want 400", r.Code)
	}
}

func TestPaketBackfillDataLama(t *testing.T) {
	e := newEnv(t)
	f := e.fixtures(5)
	// A paket treatment and a package sold before multi-treatment packages.
	old := treatment.Treatment{Kode: "TRT-OLD", Nama: "Paket Lama 4x", Kategori: "Paket", Harga: 400000, SesiPaket: 4, IsActive: true}
	if err := e.db.Create(&old).Error; err != nil {
		t.Fatal(err)
	}
	lama := paket.PaketPerawatan{Kode: "PKT-OLD", CabangID: branch.UtamaID(e.db), PasienID: f.pasien, TreatmentID: old.ID, StaffID: f.staff,
		TanggalBeli: time.Now(), TotalSesi: 4, SisaSesi: 3, HargaTotal: 400000, Status: "aktif", IsActive: true}
	if err := e.db.Omit("Items").Create(&lama).Error; err != nil {
		t.Fatal(err)
	}
	// An older database also lacks the new accounts.
	e.db.Exec("DELETE FROM akun_mappings WHERE key IN ('paket.titipan', 'pendapatan.paket_hangus')")
	e.db.Exec("DELETE FROM akuns WHERE kode IN ('2-1301', '4-1903')")

	for i := 0; i < 2; i++ { // safe to run again
		if err := server.AutoMigrate(e.db); err != nil {
			t.Fatalf("migrate %d: %v", i, err)
		}
	}
	var katalog []treatment.PaketItem
	e.db.Where("paket_treatment_id = ?", old.ID).Find(&katalog)
	if len(katalog) != 1 || katalog[0].TreatmentID != old.ID || katalog[0].Sesi != 4 {
		t.Fatalf("backfilled catalog = %+v, want 1 item of itself x4", katalog)
	}
	var items []paket.Item
	e.db.Where("paket_perawatan_id = ?", lama.ID).Find(&items)
	if len(items) != 1 || items[0].TreatmentID != old.ID || items[0].TotalSesi != 4 || items[0].SisaSesi != 3 || items[0].NilaiPerSesi != 100000 {
		t.Fatalf("backfilled items = %+v", items)
	}
	var keys int64
	e.db.Table("akun_mappings").Where("key IN ('paket.titipan', 'pendapatan.paket_hangus')").Count(&keys)
	if keys != 2 {
		t.Errorf("new account mappings after migrate = %d, want 2", keys)
	}

	// Redeeming an old package posts no journal: its revenue was booked when sold.
	r := e.pakaiPaket(f, old.ID, items[0].ID, 1)
	if r.Code != http.StatusCreated {
		t.Fatalf("pakai paket lama: %d %s", r.Code, r.Message)
	}
	if r := e.bayarNol(idOf(r)); r.Code != http.StatusOK {
		t.Fatalf("bayar paket lama: %d %s", r.Code, r.Message)
	}
	e.expectSaldo(map[string]float64{"2-1301": 0, "4-1101": 0})
	// Refund max is the 2 sessions left x 100.000, booked on the old refund account.
	batal := fmt.Sprintf("/pembayaran/paket/%d/batal", lama.ID)
	if r := e.call("staff", "POST", batal, map[string]any{"refund": 200001, "jenis_pembayaran": "tunai"}); r.Code != http.StatusBadRequest {
		t.Fatalf("refund above 2 sessions: %d %s", r.Code, r.Message)
	}
	e.must("POST", batal, map[string]any{"refund": 200000, "jenis_pembayaran": "tunai", "tanggal": tanggal}, nil)
	e.expectSaldo(map[string]float64{"4-1902": 200000, "1-1101": -200000, "2-1301": 0})
	e.expectBalanced()
}
