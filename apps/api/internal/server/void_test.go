package server_test

import (
	"fmt"
	"math"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/scaleup/clinic-v2/api/internal/modules/barang"
)

// ── Void of a paid sale ──

// saldoSemua is debit minus kredit per account kode, for comparing the books before and after.
func (e *env) saldoSemua() map[string]float64 {
	e.t.Helper()
	var rows []struct {
		Kode  string
		Saldo float64
	}
	if err := e.db.Raw(`SELECT a.kode, COALESCE(SUM(d.debit - d.kredit), 0) AS saldo FROM akuns a
		LEFT JOIN jurnal_details d ON d.akun_id = a.id GROUP BY a.kode`).Scan(&rows).Error; err != nil {
		e.t.Fatal(err)
	}
	out := map[string]float64{}
	for _, r := range rows {
		out[r.Kode] = math.Round(r.Saldo*100) / 100
	}
	return out
}

func (e *env) poin(pasien uint) int {
	e.t.Helper()
	var p int
	e.db.Table("memberships").Select("points").Where("pasien_id = ? AND is_active = ?", pasien, true).Scan(&p)
	return p
}

func (e *env) saldoDeposit(pasien uint) float64 {
	e.t.Helper()
	var out struct {
		SaldoDeposit float64 `json:"saldo_deposit"`
	}
	e.must("GET", fmt.Sprintf("/pembayaran/deposit/saldo?pasien_id=%d", pasien), nil, &out)
	return out.SaldoDeposit
}

func (e *env) statusOf(table string, id uint) string {
	e.t.Helper()
	var s string
	if err := e.db.Table(table).Select("status").Where("id = ?", id).Scan(&s).Error; err != nil {
		e.t.Fatal(err)
	}
	return s
}

func TestVoidPenjualanLunasMengembalikanSemua(t *testing.T) {
	e := newEnv(t)
	f := e.fixtures(5)
	e.db.Model(&barang.Barang{}).Where("id = ?", f.barang).Update("harga_beli", 4000)
	e.must("POST", "/pembayaran/deposit", map[string]any{"pasien_id": f.pasien, "staff_id": f.staff, "tanggal": tanggal, "jenis": "pembayaran_deposit", "jumlah": 50000, "jenis_pembayaran": "tunai"}, nil)
	e.must("POST", "/pembayaran/deposit", map[string]any{"pasien_id": f.pasien, "staff_id": f.staff, "tanggal": tanggal, "jenis": "pendaftaran_member", "jumlah": 30000, "jenis_pembayaran": "tunai"}, nil)
	paketTr, peeling := e.paketGlow(f)
	lama := e.beliPaket(f, paketTr, 1200000)
	facialLama := lama.item(f.treatment)

	// One visit: a facial from the package owned before, a new Paket Glow with its first
	// peeling right away, and a resep of 2 Obat Uji; paid with poin, deposit and cash.
	var pw struct{ ID uint }
	e.must("POST", "/perawatan", map[string]any{
		"pasien_id": f.pasien, "staff_id": f.staff, "tanggal": tanggal, "status": "bayar",
		"tindakans": []map[string]any{
			{"treatment_id": f.treatment, "jumlah": 1, "harga": 350000, "total": 350000, "tanggal": tanggal, "paket_item_id": facialLama.ID},
			{"treatment_id": paketTr, "jumlah": 1, "harga": 1200000, "total": 1200000, "tanggal": tanggal},
			{"treatment_id": peeling, "jumlah": 1, "harga": 250000, "total": 250000, "tanggal": tanggal, "paket_beli_index": 1},
		},
		"reseps": []map[string]any{{"pasien_id": f.pasien, "tanggal": tanggal, "barangs": []map[string]any{{"barang_id": f.barang, "nama_barang": "Obat Uji", "jumlah": 2, "harga": 10000}}}},
	}, &pw)

	sebelum := e.saldoSemua()
	bayar := map[string]any{
		"source_type": "perawatan", "source_id": pw.ID, "poin_dipakai": 10000, "deposit_dipakai": 40000,
		"staff_id": f.staff, "jenis_pembayaran": "tunai", "jumlah_bayar": 1200000, "tanggal": tanggal,
	}
	r := e.call("staff", "POST", "/pembayaran/bayar", bayar)
	if r.Code != http.StatusOK {
		t.Fatalf("bayar: %d %s", r.Code, r.Message)
	}
	pj := idOf(r)
	// 1.200.000 paket + 20.000 obat - 10.000 poin - 40.000 deposit = 1.170.000 cash.
	if e.stok(f.barang) != 3 || e.saldoDeposit(f.pasien) != 10000 || e.poin(f.pasien) != 20000 || e.paketByID(f.pasien, lama.ID).SisaSesi != 4 {
		t.Fatalf("after bayar: stok %d deposit %v poin %d sisa lama %d", e.stok(f.barang), e.saldoDeposit(f.pasien), e.poin(f.pasien), e.paketByID(f.pasien, lama.ID).SisaSesi)
	}
	var baru uint
	e.db.Table("paket_perawatans").Select("id").Where("penjualan_id = ? AND id <> ?", pj, lama.ID).Scan(&baru)
	if baru == 0 {
		t.Fatal("paket bought in the sale not linked to its penjualan")
	}

	// The preview lists what goes back.
	var dmp struct {
		Refund          float64             `json:"refund"`
		DepositKembali  float64             `json:"deposit_kembali"`
		PoinKembali     int                 `json:"poin_kembali"`
		Barang          []struct{ Qty int } `json:"barang"`
		PaketDibatalkan []struct{ ID uint } `json:"paket_dibatalkan"`
		SesiKembali     []struct{ Qty int } `json:"sesi_kembali"`
		ResepKembali    int                 `json:"resep_kembali"`
		Blokir          string              `json:"blokir"`
	}
	e.must("GET", fmt.Sprintf("/pembayaran/penjualan/%d/batal", pj), nil, &dmp)
	if dmp.Refund != 1170000 || dmp.DepositKembali != 40000 || dmp.PoinKembali != 10000 || len(dmp.Barang) != 1 || dmp.Barang[0].Qty != 2 ||
		len(dmp.PaketDibatalkan) != 1 || dmp.PaketDibatalkan[0].ID != baru || len(dmp.SesiKembali) != 2 || dmp.ResepKembali != 1 || dmp.Blokir != "" {
		t.Fatalf("dampak void = %+v", dmp)
	}

	// Staff may not void; a reason is required.
	if r := e.call("staff", "POST", fmt.Sprintf("/pembayaran/penjualan/%d/batal", pj), map[string]any{"alasan": "x"}); r.Code != http.StatusForbidden {
		t.Errorf("staff void: %d, want 403", r.Code)
	}
	if r := e.call("admin", "POST", fmt.Sprintf("/pembayaran/penjualan/%d/batal", pj), map[string]any{"alasan": "  "}); r.Code != http.StatusBadRequest {
		t.Errorf("void without alasan: %d, want 400", r.Code)
	}

	r = e.call("admin", "POST", fmt.Sprintf("/pembayaran/penjualan/%d/batal", pj), map[string]any{"alasan": "Salah pasien"})
	if r.Code != http.StatusOK {
		t.Fatalf("void: %d %s", r.Code, r.Message)
	}

	// Books, stock, deposit, poin and package sessions are as before the payment.
	e.expectBalanced()
	sesudah := e.saldoSemua()
	for kode, v := range sebelum {
		if sesudah[kode] != v {
			t.Errorf("saldo %s after void = %v, want %v (as before payment)", kode, sesudah[kode], v)
		}
	}
	if got := e.stok(f.barang); got != 5 {
		t.Errorf("stok after void = %d, want 5", got)
	}
	if got := e.saldoDeposit(f.pasien); got != 50000 {
		t.Errorf("deposit after void = %v, want 50000", got)
	}
	if got := e.poin(f.pasien); got != 30000 {
		t.Errorf("poin after void = %d, want 30000", got)
	}
	if got := e.paketByID(f.pasien, lama.ID); got.SisaSesi != 5 || got.Status != "aktif" || got.item(f.treatment).SisaSesi != 3 {
		t.Errorf("paket lama after void = %+v, want 5 sesi, facial 3", got)
	}
	if got := e.statusOf("paket_perawatans", baru); got != "dibatalkan" {
		t.Errorf("paket bought in the sale = %s, want dibatalkan", got)
	}
	var aktifPemakaian int64
	e.db.Table("paket_pemakaians").Where("penjualan_id = ? AND status = ?", pj, "aktif").Count(&aktifPemakaian)
	if aktifPemakaian != 0 {
		t.Errorf("pemakaian still aktif after void: %d", aktifPemakaian)
	}
	var pjOut struct {
		Status         string
		AlasanBatal    string
		DibatalkanAt   *time.Time
		DibatalkanOleh *uint
	}
	e.db.Table("penjualans").Select("status, alasan_batal, dibatalkan_at, dibatalkan_oleh").Where("id = ?", pj).Scan(&pjOut)
	if pjOut.Status != "cancelled" || pjOut.AlasanBatal != "Salah pasien" || pjOut.DibatalkanAt == nil || pjOut.DibatalkanOleh == nil {
		t.Errorf("penjualan after void = %+v", pjOut)
	}
	if got := e.statusOf("perawatans", pw.ID); got != "bayar" {
		t.Errorf("perawatan after void = %s, want bayar", got)
	}
	var resep string
	e.db.Table("perawatan_resep").Select("status").Where("perawatan_id = ?", pw.ID).Scan(&resep)
	if resep != "draft" {
		t.Errorf("resep after void = %s, want draft", resep)
	}
	// The cash kept is paid out on the admin's shift.
	var keluar float64
	e.db.Table("kasir_mutasis").Select("COALESCE(SUM(keluar), 0)").Where("source_type = ? AND source_id = ?", "void", pj).Scan(&keluar)
	if keluar != 1170000 {
		t.Errorf("kasir keluar for void = %v, want 1170000", keluar)
	}

	// Voiding twice is refused.
	if r := e.call("admin", "POST", fmt.Sprintf("/pembayaran/penjualan/%d/batal", pj), map[string]any{"alasan": "lagi"}); r.Code != http.StatusBadRequest {
		t.Errorf("double void: %d, want 400", r.Code)
	}

	// The visit is back at the kasir and can be paid again, with everything taken again.
	r = e.call("staff", "POST", "/pembayaran/bayar", bayar)
	if r.Code != http.StatusOK {
		t.Fatalf("bayar again after void: %d %s", r.Code, r.Message)
	}
	if e.stok(f.barang) != 3 || e.saldoDeposit(f.pasien) != 10000 || e.poin(f.pasien) != 20000 || e.paketByID(f.pasien, lama.ID).SisaSesi != 4 {
		t.Errorf("after paying again: stok %d deposit %v poin %d", e.stok(f.barang), e.saldoDeposit(f.pasien), e.poin(f.pasien))
	}
	e.expectBalanced()
}

func TestVoidPenjualanBatalKunjungan(t *testing.T) {
	e := newEnv(t)
	f := e.fixtures(5)
	var pw struct {
		ID        uint
		AntrianID *uint `json:"antrian_id"`
	}
	var ant struct{ ID uint }
	e.must("POST", "/antrian", map[string]any{"pasien_id": f.pasien, "staff_id": f.staff, "tanggal": tanggal, "jam": "09:00"}, &ant)
	e.must("POST", "/perawatan", map[string]any{
		"pasien_id": f.pasien, "staff_id": f.staff, "antrian_id": ant.ID, "tanggal": tanggal, "status": "bayar",
		"tindakans": []map[string]any{{"treatment_id": f.treatment, "jumlah": 1, "harga": 350000, "total": 350000, "tanggal": tanggal}},
	}, &pw)
	r := e.call("staff", "POST", "/pembayaran/bayar", map[string]any{"source_type": "perawatan", "source_id": pw.ID, "staff_id": f.staff, "jenis_pembayaran": "tunai", "jumlah_bayar": 350000, "tanggal": tanggal})
	if r.Code != http.StatusOK {
		t.Fatalf("bayar: %d %s", r.Code, r.Message)
	}
	if got := e.statusOf("antrians", ant.ID); got != "selesai" {
		t.Fatalf("antrian after bayar = %s", got)
	}
	e.must("POST", fmt.Sprintf("/pembayaran/penjualan/%d/batal", idOf(r)), map[string]any{"alasan": "Pasien pulang", "kembalikan_ke_kasir": false}, nil)
	if got := e.statusOf("perawatans", pw.ID); got != "batal" {
		t.Errorf("perawatan after void without kasir = %s, want batal", got)
	}
	if got := e.statusOf("antrians", ant.ID); got != "batal" {
		t.Errorf("antrian after void without kasir = %s, want batal", got)
	}
	e.expectSaldo(map[string]float64{"1-1101": 0, "4-1101": 0})
	e.expectBalanced()
}

func TestVoidPenjualanDitolak(t *testing.T) {
	e := newEnv(t)
	f := e.fixtures(10)
	batal := func(pj uint) resp {
		return e.call("admin", "POST", fmt.Sprintf("/pembayaran/penjualan/%d/batal", pj), map[string]any{"alasan": "uji"})
	}

	// An unpaid sale is not voided (it is simply cancelled).
	if r := batal(e.penjualanLangsung(f, 1)); r.Code != http.StatusBadRequest {
		t.Errorf("void unpaid: %d, want 400", r.Code)
	}
	if r := batal(999999); r.Code != http.StatusNotFound {
		t.Errorf("void unknown: %d, want 404", r.Code)
	}

	// Without an open shift the refund cannot leave the counter, so nothing changes.
	pw := e.perawatan(f)
	r := e.call("staff", "POST", "/pembayaran/bayar", map[string]any{"source_type": "perawatan", "source_id": pw, "staff_id": f.staff, "jenis_pembayaran": "tunai", "jumlah_bayar": 370000, "tanggal": tanggal})
	if r.Code != http.StatusOK {
		t.Fatalf("bayar: %d %s", r.Code, r.Message)
	}
	pj := idOf(r)
	stok := e.stok(f.barang)
	e.db.Table("kasir_shifts").Where("kode = ?", "SHF-T-admin").Update("status", "closed")
	if r := batal(pj); r.Code != http.StatusBadRequest || !strings.Contains(r.Message, "Kasir belum dibuka") {
		t.Errorf("void without shift: %d %s, want 400 kasir belum dibuka", r.Code, r.Message)
	}
	if e.statusOf("penjualans", pj) != "paid" || e.stok(f.barang) != stok {
		t.Errorf("failed void changed the sale or stock")
	}
	e.db.Table("kasir_shifts").Where("kode = ?", "SHF-T-admin").Update("status", "open")

	// A resep already handed over cannot be voided.
	var resepID uint
	e.db.Table("perawatan_resep").Select("id").Where("perawatan_id = ?", pw).Scan(&resepID)
	e.must("PATCH", fmt.Sprintf("/resep/%d/serahkan", resepID), nil, nil)
	if r := batal(pj); r.Code != http.StatusBadRequest || !strings.Contains(r.Message, "diserahkan") {
		t.Errorf("void after resep diserahkan: %d %s, want 400", r.Code, r.Message)
	}

	// A package bought in the sale and already used in another visit cannot be voided.
	paketTr, _ := e.paketGlow(f)
	pk := e.beliPaket(f, paketTr, 1200000)
	r = e.pakaiPaket(f, f.treatment, pk.item(f.treatment).ID, 1)
	if r.Code != http.StatusCreated {
		t.Fatalf("pakai paket: %d %s", r.Code, r.Message)
	}
	if r := e.bayarNol(idOf(r)); r.Code != http.StatusOK {
		t.Fatalf("bayar sesi: %d %s", r.Code, r.Message)
	}
	if pk.PenjualanID == nil {
		t.Fatal("paket without penjualan_id")
	}
	var d struct {
		Blokir string `json:"blokir"`
	}
	e.must("GET", fmt.Sprintf("/pembayaran/penjualan/%d/batal", *pk.PenjualanID), nil, &d)
	if !strings.Contains(d.Blokir, "sudah dipakai") {
		t.Errorf("dampak blokir = %q, want paket sudah dipakai", d.Blokir)
	}
	if r := batal(*pk.PenjualanID); r.Code != http.StatusBadRequest || !strings.Contains(r.Message, "sudah dipakai") {
		t.Errorf("void of a used paket: %d %s, want 400", r.Code, r.Message)
	}
	if got := e.paketByID(f.pasien, pk.ID); got.Status != "aktif" || got.SisaSesi != 4 {
		t.Errorf("paket after refused void = %+v", got)
	}
	e.expectBalanced()
}
