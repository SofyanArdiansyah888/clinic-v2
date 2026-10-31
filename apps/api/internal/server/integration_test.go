package server_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sort"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/scaleup/clinic-v2/api/internal/modules/barang"
	"github.com/scaleup/clinic-v2/api/internal/modules/pasien"
	"github.com/scaleup/clinic-v2/api/internal/modules/staff"
	"github.com/scaleup/clinic-v2/api/internal/modules/treatment"
	"github.com/scaleup/clinic-v2/api/internal/platform/generator"
	"github.com/scaleup/clinic-v2/api/internal/platform/jwt"
	"github.com/scaleup/clinic-v2/api/internal/server"
	"github.com/scaleup/clinic-v2/api/internal/testutil"
	"gorm.io/gorm"
)

const tanggal = "2026-11-01"

type env struct {
	t   *testing.T
	db  *gorm.DB
	h   http.Handler
	jm  *jwt.Manager
	tok map[string]string
}

func newEnv(t *testing.T) *env {
	t.Helper()
	gin.SetMode(gin.TestMode)
	db, cfg := testutil.DB(t)
	jm := jwt.NewManager("test-secret", time.Hour, time.Hour)
	e := &env{t: t, db: db, jm: jm, h: server.New(cfg, db, jm, generator.New(db)), tok: map[string]string{}}
	for i, role := range []string{"admin", "doctor", "staff", "apoteker", "nurse"} {
		tok, err := jm.GenerateAccess(uint(i+1), role, role)
		if err != nil {
			t.Fatal(err)
		}
		e.tok[role] = tok
	}
	return e
}

type resp struct {
	Code    int
	Success bool            `json:"success"`
	Message string          `json:"message"`
	Data    json.RawMessage `json:"data"`
}

func (e *env) call(role, method, path string, body any) resp {
	e.t.Helper()
	var buf bytes.Buffer
	if body != nil {
		if err := json.NewEncoder(&buf).Encode(body); err != nil {
			e.t.Fatal(err)
		}
	}
	req := httptest.NewRequest(method, "/api"+path, &buf)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+e.tok[role])
	w := httptest.NewRecorder()
	e.h.ServeHTTP(w, req)
	var r resp
	_ = json.Unmarshal(w.Body.Bytes(), &r)
	r.Code = w.Code
	return r
}

// must calls the API as admin and fails the test unless it returns 2xx.
func (e *env) must(method, path string, body any, out any) {
	e.t.Helper()
	r := e.call("admin", method, path, body)
	if r.Code >= 300 {
		e.t.Fatalf("%s %s: %d %s", method, path, r.Code, r.Message)
	}
	if out != nil {
		if err := json.Unmarshal(r.Data, out); err != nil {
			e.t.Fatalf("%s %s: decode: %v", method, path, err)
		}
	}
}

func (e *env) stok(id uint) int {
	e.t.Helper()
	var b barang.Barang
	if err := e.db.First(&b, id).Error; err != nil {
		e.t.Fatal(err)
	}
	return b.StokAktual
}

type fixtures struct {
	pasien, staff, treatment, barang uint
}

func (e *env) fixtures(stok int) fixtures {
	e.t.Helper()
	p := pasien.Pasien{Kode: "PAS-T1", Nama: "Pasien Uji", IsActive: true}
	s := staff.Staff{Kode: "STF-T1", Nama: "Dokter Uji", Jabatan: "Dokter", IsActive: true}
	tr := treatment.Treatment{Kode: "TRT-T1", Nama: "Facial Uji", Kategori: "Perawatan", Harga: 350000, KomisiDokter: 20000, KomisiTerapis: 10000, IsActive: true}
	b := barang.Barang{Kode: "BRG-T1", Nama: "Obat Uji", Satuan: "pcs", HargaJual: 10000, StokAktual: stok, IsActive: true}
	for _, x := range []any{&p, &s, &tr, &b} {
		if err := e.db.Create(x).Error; err != nil {
			e.t.Fatal(err)
		}
	}
	return fixtures{p.ID, s.ID, tr.ID, b.ID}
}

// perawatan creates a perawatan waiting at the cashier: one Facial (350.000) and a resep of 2 Obat Uji (2 x 10.000).
func (e *env) perawatan(f fixtures) uint {
	e.t.Helper()
	var out struct{ ID uint }
	e.must("POST", "/perawatan", map[string]any{
		"pasien_id": f.pasien, "staff_id": f.staff, "tanggal": tanggal, "status": "bayar",
		"tindakans": []map[string]any{{"treatment_id": f.treatment, "jumlah": 1, "harga": 350000, "total": 350000, "tanggal": tanggal, "beautician_id": f.staff}},
		"reseps":    []map[string]any{{"pasien_id": f.pasien, "tanggal": tanggal, "barangs": []map[string]any{{"barang_id": f.barang, "nama_barang": "Obat Uji", "jumlah": 2, "harga": 10000}}}},
	}, &out)
	return out.ID
}

func TestPembayaranPerawatan(t *testing.T) {
	e := newEnv(t)
	f := e.fixtures(5)

	e.must("POST", "/pembayaran/deposit", map[string]any{"pasien_id": f.pasien, "staff_id": f.staff, "tanggal": tanggal, "jenis": "pembayaran_deposit", "jumlah": 50000, "jenis_pembayaran": "tunai"}, nil)
	e.must("POST", "/pembayaran/deposit", map[string]any{"pasien_id": f.pasien, "staff_id": f.staff, "tanggal": tanggal, "jenis": "pendaftaran_member", "jumlah": 30000, "jenis_pembayaran": "tunai"}, nil)
	var promo, voucher struct{ Kode string }
	e.must("POST", "/promo", map[string]any{"nama": "Promo 10%", "tipe_diskon": "percent", "nilai_diskon": 10}, &promo)
	e.must("POST", "/voucher", map[string]any{"nama": "Voucher 20rb", "tipe_diskon": "nominal", "nilai_diskon": 20000, "min_pembelian": 100000}, &voucher)

	pw := e.perawatan(f)
	tagihan := map[string]any{"source_type": "perawatan", "source_id": pw, "promo_kode": promo.Kode, "voucher_kode": voucher.Kode, "poin_dipakai": 10000, "deposit_dipakai": 40000}

	var tg struct {
		Subtotal      float64 `json:"subtotal"`
		DiskonPromo   float64 `json:"diskon_promo"`
		DiskonVoucher float64 `json:"diskon_voucher"`
		SisaBayar     float64 `json:"sisa_bayar"`
	}
	r := e.call("staff", "POST", "/pembayaran/tagihan", tagihan)
	if r.Code != http.StatusOK {
		t.Fatalf("tagihan: %d %s", r.Code, r.Message)
	}
	_ = json.Unmarshal(r.Data, &tg)
	// 350.000 + 2 x 10.000 = 370.000; promo 10% = 37.000; voucher 20.000; then 10.000 poin and 40.000 deposit.
	if tg.Subtotal != 370000 || tg.DiskonPromo != 37000 || tg.DiskonVoucher != 20000 || tg.SisaBayar != 263000 {
		t.Fatalf("tagihan = %+v", tg)
	}

	bayar := func(body map[string]any) resp {
		b := map[string]any{"staff_id": f.staff, "jenis_pembayaran": "tunai", "tanggal": tanggal}
		for k, v := range body {
			b[k] = v
		}
		return e.call("staff", "POST", "/pembayaran/bayar", b)
	}
	withAmount := func(amount float64) map[string]any {
		b := map[string]any{"jumlah_bayar": amount}
		for k, v := range tagihan {
			b[k] = v
		}
		return b
	}

	if r := bayar(withAmount(100000)); r.Code != http.StatusBadRequest || !strings.Contains(r.Message, "kurang") {
		t.Fatalf("underpayment: %d %s", r.Code, r.Message)
	}
	if got := e.stok(f.barang); got != 5 {
		t.Fatalf("stok after failed payment = %d, want 5 (rolled back)", got)
	}

	r = bayar(withAmount(300000))
	if r.Code != http.StatusOK {
		t.Fatalf("bayar: %d %s", r.Code, r.Message)
	}
	var pj struct {
		Kembalian float64 `json:"kembalian"`
	}
	_ = json.Unmarshal(r.Data, &pj)
	if pj.Kembalian != 37000 {
		t.Fatalf("kembalian = %v, want 37000", pj.Kembalian)
	}
	if got := e.stok(f.barang); got != 3 {
		t.Fatalf("stok after resep = %d, want 3", got)
	}
	var saldo struct {
		SaldoDeposit float64 `json:"saldo_deposit"`
		Poin         int     `json:"poin"`
	}
	e.must("GET", fmt.Sprintf("/pembayaran/deposit/saldo?pasien_id=%d", f.pasien), nil, &saldo)
	if saldo.SaldoDeposit != 10000 || saldo.Poin != 20000 {
		t.Fatalf("saldo = %+v, want deposit 10000 poin 20000", saldo)
	}

	if r := bayar(withAmount(300000)); r.Code != http.StatusConflict {
		t.Fatalf("second payment: %d %s, want 409", r.Code, r.Message)
	}

	if r := e.call("doctor", "PUT", fmt.Sprintf("/perawatan/%d", pw), map[string]any{"pasien_id": f.pasien, "staff_id": f.staff, "tanggal": tanggal, "reseps": []any{}}); r.Code != http.StatusBadRequest {
		t.Fatalf("editing paid perawatan: %d %s, want 400", r.Code, r.Message)
	}

	var reseps []struct {
		ID       uint `json:"id"`
		PasienID uint `json:"pasien_id"`
	}
	e.must("GET", "/resep?status=dibayar", nil, &reseps)
	if len(reseps) != 1 {
		t.Fatalf("resep dibayar = %d, want 1", len(reseps))
	}
	if r := e.call("staff", "PATCH", fmt.Sprintf("/resep/%d/serahkan", reseps[0].ID), nil); r.Code != http.StatusForbidden {
		t.Fatalf("staff serahkan resep: %d, want 403", r.Code)
	}
	if r := e.call("apoteker", "PATCH", fmt.Sprintf("/resep/%d/serahkan", reseps[0].ID), nil); r.Code != http.StatusOK {
		t.Fatalf("apoteker serahkan resep: %d %s", r.Code, r.Message)
	}

	var fo struct {
		Ringkasan struct {
			Transaksi        int64   `json:"transaksi"`
			PendapatanBersih float64 `json:"pendapatan_bersih"`
		} `json:"ringkasan"`
	}
	e.must("GET", "/laporan/fo?dari="+tanggal+"&sampai="+tanggal, nil, &fo)
	if fo.Ringkasan.Transaksi != 1 || fo.Ringkasan.PendapatanBersih != 313000 {
		t.Fatalf("laporan fo = %+v, want 1 transaksi, 313000 bersih", fo.Ringkasan)
	}
	var nurse struct {
		Ringkasan struct {
			KomisiTerapis float64 `json:"komisi_terapis"`
		} `json:"ringkasan"`
	}
	e.must("GET", "/laporan/nurse?dari="+tanggal+"&sampai="+tanggal, nil, &nurse)
	if nurse.Ringkasan.KomisiTerapis != 10000 {
		t.Fatalf("komisi terapis = %v, want 10000", nurse.Ringkasan.KomisiTerapis)
	}
}

func TestPembayaranBersamaanHanyaSekali(t *testing.T) {
	e := newEnv(t)
	f := e.fixtures(5)
	pw := e.perawatan(f)

	codes := make([]int, 4)
	var wg sync.WaitGroup
	for i := range codes {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			codes[i] = e.call("staff", "POST", "/pembayaran/bayar", map[string]any{
				"source_type": "perawatan", "source_id": pw, "staff_id": f.staff, "jenis_pembayaran": "tunai", "jumlah_bayar": 400000,
			}).Code
		}(i)
	}
	wg.Wait()
	sort.Ints(codes)
	if fmt.Sprint(codes) != "[200 409 409 409]" {
		t.Fatalf("concurrent payments = %v, want exactly one 200", codes)
	}
	if got := e.stok(f.barang); got != 3 {
		t.Fatalf("stok = %d, want 3 (taken out once)", got)
	}
}

func TestStokTidakCukupMembatalkanPembayaran(t *testing.T) {
	e := newEnv(t)
	f := e.fixtures(1)
	pw := e.perawatan(f)
	r := e.call("staff", "POST", "/pembayaran/bayar", map[string]any{
		"source_type": "perawatan", "source_id": pw, "staff_id": f.staff, "jenis_pembayaran": "tunai", "jumlah_bayar": 400000,
	})
	if r.Code != http.StatusBadRequest || !strings.Contains(r.Message, "tidak cukup") {
		t.Fatalf("bayar with short stock: %d %s", r.Code, r.Message)
	}
	var n int64
	e.db.Table("penjualans").Count(&n)
	if n != 0 {
		t.Fatalf("penjualan rows = %d, want 0 after rollback", n)
	}
}

func TestDokumenStokDanPengembalian(t *testing.T) {
	e := newEnv(t)
	f := e.fixtures(0)
	var sup struct{ ID uint }
	e.must("POST", "/supplier", map[string]any{"nama": "Supplier Uji"}, &sup)

	var pbl struct{ ID uint }
	r := e.call("apoteker", "POST", "/pembelian", map[string]any{
		"supplier_id": sup.ID, "staff_id": f.staff, "tanggal": tanggal,
		"details": []map[string]any{{"barang_id": f.barang, "qty": 10, "harga_beli": 1000}},
	})
	if r.Code != http.StatusCreated {
		t.Fatalf("pembelian: %d %s", r.Code, r.Message)
	}
	_ = json.Unmarshal(r.Data, &pbl)
	if got := e.stok(f.barang); got != 10 {
		t.Fatalf("stok after pembelian = %d, want 10", got)
	}

	if r := e.call("apoteker", "POST", "/konversi-stok", map[string]any{"tanggal": tanggal, "details": []map[string]any{{"barang_id": f.barang, "qty": 0, "tipe": "keluar"}}}); r.Code != http.StatusBadRequest {
		t.Fatalf("qty 0 accepted: %d", r.Code)
	}
	if r := e.call("apoteker", "POST", "/konversi-stok", map[string]any{"tanggal": tanggal, "details": []map[string]any{{"barang_id": f.barang, "qty": 1, "tipe": "pindah"}}}); r.Code != http.StatusBadRequest {
		t.Fatalf("unknown tipe accepted: %d", r.Code)
	}

	var so struct{ ID uint }
	r = e.call("apoteker", "POST", "/stok-opname", map[string]any{"tanggal": tanggal, "details": []map[string]any{{"barang_id": f.barang, "stok_fisik": 0}}})
	if r.Code != http.StatusCreated {
		t.Fatalf("opname with stok fisik 0: %d %s", r.Code, r.Message)
	}
	_ = json.Unmarshal(r.Data, &so)
	if got := e.stok(f.barang); got != 0 {
		t.Fatalf("stok after opname = %d, want 0", got)
	}

	if r := e.call("admin", "DELETE", fmt.Sprintf("/pembelian/%d", pbl.ID), nil); r.Code != http.StatusBadRequest {
		t.Fatalf("deleting pembelian whose stock is gone: %d, want 400", r.Code)
	}
	if r := e.call("admin", "DELETE", fmt.Sprintf("/stok-opname/%d", so.ID), nil); r.Code != http.StatusOK {
		t.Fatalf("delete opname: %d %s", r.Code, r.Message)
	}
	if got := e.stok(f.barang); got != 10 {
		t.Fatalf("stok after deleting opname = %d, want 10", got)
	}
	if r := e.call("admin", "DELETE", fmt.Sprintf("/pembelian/%d", pbl.ID), nil); r.Code != http.StatusOK {
		t.Fatalf("delete pembelian: %d %s", r.Code, r.Message)
	}
	if got := e.stok(f.barang); got != 0 {
		t.Fatalf("stok after deleting pembelian = %d, want 0", got)
	}

	var kartu []struct {
		Saldo int `json:"saldo"`
	}
	e.must("GET", fmt.Sprintf("/kartu-stok?barang_id=%d&per_page=50", f.barang), nil, &kartu)
	if len(kartu) != 4 || kartu[0].Saldo != 0 {
		t.Fatalf("kartu stok = %+v, want 4 rows ending at saldo 0", kartu)
	}
}

func TestAksesPerRole(t *testing.T) {
	e := newEnv(t)
	barangBody := map[string]any{"nama": "Barang Role", "harga_jual": 1000}
	cases := []struct {
		role, method, path string
		body               any
		want               int
	}{
		{"staff", "POST", "/barang", barangBody, http.StatusForbidden},
		{"apoteker", "POST", "/barang", barangBody, http.StatusCreated},
		{"nurse", "GET", "/barang", nil, http.StatusOK},
		{"staff", "GET", "/user", nil, http.StatusForbidden},
		{"admin", "GET", "/user", nil, http.StatusOK},
		{"nurse", "GET", "/laporan/fo", nil, http.StatusForbidden},
		{"doctor", "GET", "/laporan/dm", nil, http.StatusOK},
		{"apoteker", "POST", "/pembayaran/tagihan", map[string]any{"source_type": "perawatan", "source_id": 1}, http.StatusForbidden},
		{"doctor", "POST", "/treatment", map[string]any{"nama": "X"}, http.StatusForbidden},
		{"staff", "PUT", "/pengaturan/klinik", map[string]any{"nama": "X"}, http.StatusForbidden},
		{"staff", "POST", "/pasien", map[string]any{"nama": "Pasien Baru"}, http.StatusCreated},
		{"staff", "DELETE", "/penjualan/1", nil, http.StatusForbidden},
	}
	for _, c := range cases {
		if r := e.call(c.role, c.method, c.path, c.body); r.Code != c.want {
			t.Errorf("%s %s %s = %d (%s), want %d", c.role, c.method, c.path, r.Code, r.Message, c.want)
		}
	}
}
