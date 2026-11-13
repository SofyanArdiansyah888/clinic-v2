package server_test

import (
	"encoding/json"
	"fmt"
	"net/http"
	"testing"
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

	// Cancelling the paid sale reverses the journal and should bring the goods back.
	e.must("PATCH", fmt.Sprintf("/penjualan/%d/status", pj), map[string]any{"status": "cancelled"}, nil)
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
