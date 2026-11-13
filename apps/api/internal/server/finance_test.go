package server_test

import (
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"testing"
	"time"

	"github.com/scaleup/clinic-v2/api/internal/modules/barang"
	"github.com/scaleup/clinic-v2/api/internal/modules/finance"
	"github.com/scaleup/clinic-v2/api/internal/modules/pembayaran"
)

// saldo returns debit minus kredit posted to the account with the given kode.
func (e *env) saldo(kode string) float64 {
	e.t.Helper()
	var v float64
	if err := e.db.Raw(`SELECT COALESCE(SUM(d.debit - d.kredit), 0) FROM jurnal_details d
		JOIN akuns a ON a.id = d.akun_id WHERE a.kode = ?`, kode).Scan(&v).Error; err != nil {
		e.t.Fatal(err)
	}
	return math.Round(v*100) / 100
}

func (e *env) expectSaldo(want map[string]float64) {
	e.t.Helper()
	for kode, w := range want {
		if got := e.saldo(kode); got != w {
			e.t.Errorf("saldo %s = %v, want %v", kode, got, w)
		}
	}
}

// expectBalanced checks every journal has equal debit and kredit.
func (e *env) expectBalanced() {
	e.t.Helper()
	var n int64
	e.db.Raw(`SELECT COUNT(*) FROM (SELECT jurnal_id FROM jurnal_details GROUP BY jurnal_id
		HAVING ROUND(SUM(debit),2) <> ROUND(SUM(kredit),2)) x`).Scan(&n)
	if n != 0 {
		e.t.Fatalf("%d unbalanced journals", n)
	}
}

func TestJurnalPembayaranKasir(t *testing.T) {
	e := newEnv(t)
	f := e.fixtures(5)
	e.db.Model(&barang.Barang{}).Where("id = ?", f.barang).Update("harga_beli", 4000)

	e.must("POST", "/pembayaran/deposit", map[string]any{"pasien_id": f.pasien, "staff_id": f.staff, "tanggal": tanggal, "jenis": "pembayaran_deposit", "jumlah": 50000, "jenis_pembayaran": "tunai"}, nil)
	e.must("POST", "/pembayaran/deposit", map[string]any{"pasien_id": f.pasien, "staff_id": f.staff, "tanggal": tanggal, "jenis": "pendaftaran_member", "jumlah": 30000, "jenis_pembayaran": "tunai"}, nil)
	var promo, voucher struct{ Kode string }
	e.must("POST", "/promo", map[string]any{"nama": "Promo 10%", "tipe_diskon": "percent", "nilai_diskon": 10}, &promo)
	e.must("POST", "/voucher", map[string]any{"nama": "Voucher 20rb", "tipe_diskon": "nominal", "nilai_diskon": 20000, "min_pembelian": 100000}, &voucher)

	pw := e.perawatan(f)
	r := e.call("staff", "POST", "/pembayaran/bayar", map[string]any{
		"source_type": "perawatan", "source_id": pw, "promo_kode": promo.Kode, "voucher_kode": voucher.Kode,
		"poin_dipakai": 10000, "deposit_dipakai": 40000, "staff_id": f.staff, "jenis_pembayaran": "tunai",
		"jumlah_bayar": 300000, "tanggal": tanggal,
	})
	if r.Code != http.StatusOK {
		t.Fatalf("bayar: %d %s", r.Code, r.Message)
	}
	var pj struct{ ID uint }
	_ = json.Unmarshal(r.Data, &pj)

	e.expectBalanced()
	// Subtotal 370.000 = treatment 350.000 + 2 obat x 10.000; diskon 57.000, poin 10.000,
	// deposit 40.000, cash 263.000; HPP 2 x 4.000.
	e.expectSaldo(map[string]float64{
		"1-1101": 50000 + 30000 + 263000,
		"2-1201": -10000,
		"4-1101": -350000,
		"4-1201": -20000,
		"4-1301": -30000,
		"4-1901": 57000,
		"6-9101": 10000,
		"5-1101": 8000,
		"1-1401": -8000,
	})

	var lr finance.LabaRugi
	e.must("GET", "/finance/laporan/laba-rugi?dari="+tanggal+"&sampai="+tanggal, nil, &lr)
	if lr.TotalPendapatan != 343000 || lr.TotalBeban != 18000 || lr.LabaBersih != 325000 {
		t.Fatalf("laba rugi = %v / %v / %v", lr.TotalPendapatan, lr.TotalBeban, lr.LabaBersih)
	}
	var nr finance.Neraca
	e.must("GET", "/finance/laporan/neraca?per="+tanggal, nil, &nr)
	if !nr.Seimbang || nr.TotalAset != 335000 || nr.LabaBerjalan != 325000 {
		t.Fatalf("neraca = aset %v pasiva %v laba %v", nr.TotalAset, nr.TotalPasiva, nr.LabaBerjalan)
	}
	var ns finance.NeracaSaldo
	e.must("GET", "/finance/laporan/neraca-saldo?sampai="+tanggal, nil, &ns)
	if ns.TotalDebit != ns.TotalKredit || ns.TotalDebit == 0 {
		t.Fatalf("neraca saldo = %v / %v", ns.TotalDebit, ns.TotalKredit)
	}

	// Cancelling the paid sale reverses its journal and leaves the deposit entries.
	e.must("PATCH", fmt.Sprintf("/penjualan/%d/status", pj.ID), map[string]any{"status": "cancelled"}, nil)
	e.expectBalanced()
	e.expectSaldo(map[string]float64{"1-1101": 80000, "2-1201": -50000, "4-1101": 0, "5-1101": 0, "1-1401": 0})
}

func TestJurnalPembelianDanStokOpname(t *testing.T) {
	e := newEnv(t)
	f := e.fixtures(0)
	e.db.Model(&barang.Barang{}).Where("id = ?", f.barang).Update("harga_beli", 1000)
	var sup struct{ ID uint }
	e.must("POST", "/supplier", map[string]any{"nama": "Supplier Uji"}, &sup)

	var pbl struct{ ID uint }
	e.must("POST", "/pembelian", map[string]any{
		"supplier_id": sup.ID, "staff_id": f.staff, "tanggal": tanggal,
		"details": []map[string]any{{"barang_id": f.barang, "qty": 10, "harga_beli": 1000}},
	}, &pbl)
	e.expectSaldo(map[string]float64{"1-1401": 10000, "2-1101": -10000})

	pay := func(role string, jumlah float64) resp {
		return e.call(role, "POST", fmt.Sprintf("/pembelian/%d/bayar", pbl.ID), map[string]any{
			"tanggal": tanggal, "jumlah": jumlah, "jenis_pembayaran": "transfer",
		})
	}
	if r := pay("staff", 1000); r.Code != http.StatusForbidden {
		t.Fatalf("staff pays supplier: %d, want 403", r.Code)
	}
	if r := pay("finance", 4000); r.Code != http.StatusOK {
		t.Fatalf("partial payment: %d %s", r.Code, r.Message)
	}
	if r := pay("finance", 7000); r.Code != http.StatusBadRequest {
		t.Fatalf("overpayment: %d %s, want 400", r.Code, r.Message)
	}
	r := pay("apoteker", 6000)
	if r.Code != http.StatusOK {
		t.Fatalf("final payment: %d %s", r.Code, r.Message)
	}
	var lunas struct {
		StatusBayar   string  `json:"status_bayar"`
		JumlahDibayar float64 `json:"jumlah_dibayar"`
	}
	_ = json.Unmarshal(r.Data, &lunas)
	if lunas.StatusBayar != "lunas" || lunas.JumlahDibayar != 10000 {
		t.Fatalf("after payments = %+v", lunas)
	}
	e.expectSaldo(map[string]float64{"2-1101": 0, "1-1201": -10000})
	if r := e.call("admin", "DELETE", fmt.Sprintf("/pembelian/%d", pbl.ID), nil); r.Code != http.StatusBadRequest {
		t.Fatalf("delete paid pembelian: %d, want 400", r.Code)
	}

	var so struct{ ID uint }
	e.must("POST", "/stok-opname", map[string]any{"tanggal": tanggal, "details": []map[string]any{{"barang_id": f.barang, "stok_fisik": 8}}}, &so)
	e.expectSaldo(map[string]float64{"1-1401": 8000, "6-9201": 2000})
	e.must("DELETE", fmt.Sprintf("/stok-opname/%d", so.ID), nil, nil)
	e.expectSaldo(map[string]float64{"1-1401": 10000, "6-9201": 0})
	e.expectBalanced()
}

func TestJurnalManualDanPengaturanAkun(t *testing.T) {
	e := newEnv(t)
	f := e.fixtures(0)

	var akuns []finance.Akun
	e.must("GET", "/finance/akun", nil, &akuns)
	byKode := map[string]finance.Akun{}
	for _, a := range akuns {
		byKode[a.Kode] = a
	}
	kas, gaji, header := byKode["1-1101"], byKode["6-1101"], byKode["1"]

	if r := e.call("staff", "GET", "/finance/akun", nil); r.Code != http.StatusForbidden {
		t.Fatalf("staff reads akun: %d, want 403", r.Code)
	}
	if r := e.call("admin", "DELETE", fmt.Sprintf("/finance/akun/%d", kas.ID), nil); r.Code != http.StatusBadRequest {
		t.Fatalf("delete system akun: %d, want 400", r.Code)
	}
	// Kas is mapped to cash payments: deactivating it would break the cashier.
	if r := e.call("admin", "PUT", fmt.Sprintf("/finance/akun/%d", kas.ID), map[string]any{
		"kode": kas.Kode, "nama": kas.Nama, "tipe": kas.Tipe, "is_active": false,
	}); r.Code != http.StatusBadRequest {
		t.Fatalf("deactivate mapped akun: %d %s, want 400", r.Code, r.Message)
	}

	jurnal := func(debit, kredit float64, akunD uint) resp {
		return e.call("finance", "POST", "/finance/jurnal", map[string]any{
			"tanggal": tanggal, "keterangan": "Gaji November",
			"details": []map[string]any{{"akun_id": akunD, "debit": debit}, {"akun_id": kas.ID, "kredit": kredit}},
		})
	}
	if r := jurnal(1000000, 900000, gaji.ID); r.Code != http.StatusBadRequest {
		t.Fatalf("unbalanced jurnal: %d %s", r.Code, r.Message)
	}
	if r := jurnal(1000, 1000, header.ID); r.Code != http.StatusBadRequest {
		t.Fatalf("posting to header: %d %s", r.Code, r.Message)
	}
	r := jurnal(1000000, 1000000, gaji.ID)
	if r.Code != http.StatusCreated {
		t.Fatalf("manual jurnal: %d %s", r.Code, r.Message)
	}
	var j struct{ ID uint }
	_ = json.Unmarshal(r.Data, &j)
	e.expectSaldo(map[string]float64{"6-1101": 1000000, "1-1101": -1000000})
	if r := e.call("finance", "POST", fmt.Sprintf("/finance/jurnal/%d/reverse", j.ID), nil); r.Code != http.StatusOK {
		t.Fatalf("reverse: %d %s", r.Code, r.Message)
	}
	if r := e.call("finance", "POST", fmt.Sprintf("/finance/jurnal/%d/reverse", j.ID), nil); r.Code != http.StatusBadRequest {
		t.Fatalf("reverse twice: %d, want 400", r.Code)
	}
	e.expectSaldo(map[string]float64{"6-1101": 0, "1-1101": 0})

	// A bank with its own account takes transfers instead of the generic Bank account.
	var bank struct{ ID uint }
	e.must("POST", "/bank", map[string]any{"nama": "Bank Uji"}, &bank)
	parent := byKode["1"].ID
	var bca finance.Akun
	e.must("POST", "/finance/akun", map[string]any{"kode": "1-1202", "nama": "Bank Uji", "tipe": "aset", "parent_id": parent}, &bca)
	if r := e.call("finance", "PUT", "/finance/mapping", map[string]any{"items": []map[string]any{{"key": fmt.Sprintf("bank.%d", bank.ID), "akun_id": bca.ID}}}); r.Code != http.StatusOK {
		t.Fatalf("map bank: %d %s", r.Code, r.Message)
	}
	if r := e.call("finance", "PUT", "/finance/mapping", map[string]any{"items": []map[string]any{{"key": "hpp", "akun_id": nil}}}); r.Code != http.StatusBadRequest {
		t.Fatalf("clearing fixed key: %d, want 400", r.Code)
	}
	e.must("POST", "/pembayaran/deposit", map[string]any{"pasien_id": f.pasien, "staff_id": f.staff, "tanggal": tanggal, "jenis": "pembayaran_deposit", "jumlah": 25000, "jenis_pembayaran": "transfer", "bank_id": bank.ID}, nil)
	e.expectSaldo(map[string]float64{"1-1202": 25000, "1-1201": 0, "2-1201": -25000})

	// Refund on a cancelled package goes out of the chosen cash account.
	paket := pembayaran.PaketPerawatan{Kode: "PKT-T1", PasienID: f.pasien, TreatmentID: f.treatment, StaffID: f.staff,
		TanggalBeli: time.Now(), TotalSesi: 4, SisaSesi: 2, HargaTotal: 400000, Status: "aktif", IsActive: true}
	if err := e.db.Create(&paket).Error; err != nil {
		t.Fatal(err)
	}
	if r := e.call("staff", "POST", fmt.Sprintf("/pembayaran/paket/%d/batal", paket.ID), map[string]any{"refund": 500000}); r.Code != http.StatusBadRequest {
		t.Fatalf("refund above price: %d, want 400", r.Code)
	}
	e.must("POST", fmt.Sprintf("/pembayaran/paket/%d/batal", paket.ID), map[string]any{"refund": 150000, "jenis_pembayaran": "tunai", "tanggal": tanggal}, nil)
	e.expectSaldo(map[string]float64{"4-1902": 150000, "1-1101": -150000})
	e.expectBalanced()
}
