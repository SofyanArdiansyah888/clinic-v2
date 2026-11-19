package server_test

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/scaleup/clinic-v2/api/internal/modules/barang"
	"github.com/scaleup/clinic-v2/api/internal/modules/warehouse"
	"github.com/scaleup/clinic-v2/api/internal/platform/branch"
)

// stokCabang is a barang's stock as the barang endpoint shows it from one branch.
func (e *env) stokCabang(id uint, cab string) int {
	e.t.Helper()
	r := e.callCabang("admin", "GET", fmt.Sprintf("/barang/%d", id), cab, nil)
	if r.Code != http.StatusOK {
		e.t.Fatalf("GET barang [%s] = %d %s", cab, r.Code, r.Message)
	}
	var b barang.Barang
	_ = json.Unmarshal(r.Data, &b)
	return b.StokAktual
}

func TestCabangStokDanTransfer(t *testing.T) {
	e := newEnv(t)
	f := e.fixtures(10) // a barang from before multi-branch: its stock is the main branch's
	var kemang struct{ ID uint }
	e.must("POST", "/cabang", map[string]any{"nama": "Klinik Kemang", "singkatan": "KMG"}, &kemang)
	kmg := fmt.Sprint(kemang.ID)

	if m, k, all := e.stokCabang(f.barang, ""), e.stokCabang(f.barang, kmg), e.stokCabang(f.barang, "all"); m != 10 || k != 0 || all != 10 {
		t.Fatalf("stock main/kemang/all = %d/%d/%d, want 10/0/10", m, k, all)
	}

	// Kemang has nothing to sell yet.
	jual := func(cab string, qty int) resp {
		return e.callCabang("admin", "POST", "/penjualan", cab, map[string]any{
			"pasien_id": f.pasien, "staff_id": f.staff, "tanggal": tanggal, "keterangan": "Penjualan langsung",
			"details": []map[string]any{{"barang_id": f.barang, "qty": qty}},
		})
	}
	if r := jual(kmg, 1); r.Code != http.StatusBadRequest {
		t.Errorf("kemang sale without stock = %d %q", r.Code, r.Message)
	}

	// Send 4 from main to kemang: it leaves main at once and is in transit until received.
	kirim := func(qty int) (warehouse.TransferStok, resp) {
		r := e.callCabang("apoteker", "POST", "/transfer-stok", "", map[string]any{
			"ke_cabang_id": kemang.ID, "tanggal": tanggal, "keterangan": "Isi stok Kemang",
			"details": []map[string]any{{"barang_id": f.barang, "qty": qty}},
		})
		var tr warehouse.TransferStok
		_ = json.Unmarshal(r.Data, &tr)
		return tr, r
	}
	tr, r := kirim(4)
	if r.Code != http.StatusCreated {
		t.Fatalf("transfer = %d %s", r.Code, r.Message)
	}
	if tr.Status != warehouse.TransferDikirim || !strings.HasPrefix(tr.Kode, "TRF-") || tr.KeCabangNama != "Klinik Kemang" {
		t.Errorf("transfer = %+v", tr)
	}
	if m, k := e.stokCabang(f.barang, ""), e.stokCabang(f.barang, kmg); m != 6 || k != 0 {
		t.Errorf("in transit main/kemang = %d/%d, want 6/0", m, k)
	}
	if got := e.stok(f.barang); got != 6 {
		t.Errorf("total in transit = %d, want 6", got)
	}
	if _, r := kirim(20); r.Code != http.StatusBadRequest {
		t.Errorf("transfer more than main has = %d, want 400", r.Code)
	}
	if r := e.callCabang("apoteker", "POST", "/transfer-stok", "", map[string]any{
		"ke_cabang_id": branch.UtamaID(e.db), "tanggal": tanggal,
		"details": []map[string]any{{"barang_id": f.barang, "qty": 1}},
	}); r.Code != http.StatusBadRequest {
		t.Errorf("transfer to itself = %d, want 400", r.Code)
	}

	// Only kemang receives; only main cancels.
	terima := fmt.Sprintf("/transfer-stok/%d/terima", tr.ID)
	if r := e.callCabang("admin", "POST", terima, "", nil); r.Code != http.StatusBadRequest {
		t.Errorf("main receiving = %d, want 400", r.Code)
	}
	if r := e.callCabang("admin", "POST", fmt.Sprintf("/transfer-stok/%d/batal", tr.ID), kmg, nil); r.Code != http.StatusBadRequest {
		t.Errorf("kemang cancelling = %d, want 400", r.Code)
	}
	if n := e.listCabang("admin", "/transfer-stok?arah=masuk&status=dikirim", kmg); n != 1 {
		t.Errorf("kemang incoming = %d, want 1", n)
	}
	var sum warehouse.TransferSummary
	r = e.callCabang("admin", "GET", "/transfer-stok/summary", kmg, nil)
	_ = json.Unmarshal(r.Data, &sum)
	if sum.MenungguDiterima != 1 || sum.DalamPengiriman != 0 {
		t.Errorf("kemang summary = %+v", sum)
	}
	if r := e.callCabang("admin", "POST", terima, kmg, map[string]any{"catatan": "lengkap"}); r.Code != http.StatusOK {
		t.Fatalf("kemang receiving = %d %s", r.Code, r.Message)
	}
	if r := e.callCabang("admin", "POST", terima, kmg, nil); r.Code != http.StatusBadRequest {
		t.Errorf("receiving twice = %d, want 400", r.Code)
	}
	if m, k, total := e.stokCabang(f.barang, ""), e.stokCabang(f.barang, kmg), e.stok(f.barang); m != 6 || k != 4 || total != 10 {
		t.Errorf("after receipt main/kemang/total = %d/%d/%d, want 6/4/10", m, k, total)
	}

	// A kemang sale takes kemang stock only.
	if r := jual(kmg, 5); r.Code != http.StatusBadRequest {
		t.Errorf("selling 5 of 4 in kemang = %d, want 400", r.Code)
	}
	if r := jual(kmg, 3); r.Code != http.StatusCreated {
		t.Fatalf("kemang sale = %d %s", r.Code, r.Message)
	}
	if m, k := e.stokCabang(f.barang, ""), e.stokCabang(f.barang, kmg); m != 6 || k != 1 {
		t.Errorf("after sale main/kemang = %d/%d, want 6/1", m, k)
	}

	// A transfer cancelled before receipt puts the stock back in main.
	tr2, _ := kirim(2)
	if r := e.callCabang("apoteker", "POST", fmt.Sprintf("/transfer-stok/%d/batal", tr2.ID), "", nil); r.Code != http.StatusOK {
		t.Fatalf("cancel = %d %s", r.Code, r.Message)
	}
	if m := e.stokCabang(f.barang, ""); m != 6 {
		t.Errorf("main after cancel = %d, want 6", m)
	}

	// Stock opname counts one branch.
	if r := e.callCabang("apoteker", "POST", "/stok-opname", "", map[string]any{
		"tanggal": tanggal, "details": []map[string]any{{"barang_id": f.barang, "stok_fisik": 5}},
	}); r.Code != http.StatusCreated {
		t.Fatalf("opname = %d %s", r.Code, r.Message)
	}
	if m, k, total := e.stokCabang(f.barang, ""), e.stokCabang(f.barang, kmg), e.stok(f.barang); m != 5 || k != 1 || total != 6 {
		t.Errorf("after opname main/kemang/total = %d/%d/%d, want 5/1/6", m, k, total)
	}

	// Each branch has its own kartu stok and documents.
	if n := e.listCabang("admin", fmt.Sprintf("/kartu-stok?barang_id=%d", f.barang), kmg); n != 2 {
		t.Errorf("kemang kartu stok = %d, want 2 (receipt, sale)", n)
	}
	if n := e.listCabang("admin", "/stok-opname", kmg); n != 0 {
		t.Errorf("kemang opname list = %d, want 0", n)
	}
	if n := e.listCabang("admin", "/barang?stok=habis&search=Obat%20Uji", kmg); n != 0 {
		t.Errorf("kemang habis = %d, want 0", n)
	}

	// The barang form edits the active branch; with all branches selected stock cannot be set.
	if r := e.callCabang("admin", "PATCH", fmt.Sprintf("/barang/%d/stock", f.barang), kmg, map[string]any{"stok_aktual": 7}); r.Code != http.StatusOK {
		t.Fatalf("set kemang stock = %d %s", r.Code, r.Message)
	}
	if m, k, total := e.stokCabang(f.barang, ""), e.stokCabang(f.barang, kmg), e.stok(f.barang); m != 5 || k != 7 || total != 12 {
		t.Errorf("after edit main/kemang/total = %d/%d/%d, want 5/7/12", m, k, total)
	}
	if r := e.callCabang("admin", "POST", "/barang", "all", map[string]any{"nama": "Serum Baru", "stok_aktual": 3}); r.Code != http.StatusBadRequest {
		t.Errorf("opening stock in all branches = %d, want 400", r.Code)
	}
	var baru struct{ ID uint }
	r = e.callCabang("admin", "POST", "/barang", kmg, map[string]any{"nama": "Serum Baru", "stok_aktual": 3})
	_ = json.Unmarshal(r.Data, &baru)
	if m, k := e.stokCabang(baru.ID, ""), e.stokCabang(baru.ID, kmg); m != 0 || k != 3 {
		t.Errorf("new barang main/kemang = %d/%d, want 0/3", m, k)
	}
}
