package server_test

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/scaleup/clinic-v2/api/internal/modules/cabang"
	"github.com/scaleup/clinic-v2/api/internal/modules/kasir"
	"github.com/scaleup/clinic-v2/api/internal/modules/penjualan"
)

// listCabang counts a list endpoint's rows as seen from one branch.
func (e *env) listCabang(role, path, cab string) int {
	e.t.Helper()
	r := e.callCabang(role, "GET", path, cab, nil)
	if r.Code != http.StatusOK {
		e.t.Fatalf("GET %s [%s] = %d %s", path, cab, r.Code, r.Message)
	}
	var rows []json.RawMessage
	_ = json.Unmarshal(r.Data, &rows)
	return len(rows)
}

func TestCabangTransaksi(t *testing.T) {
	e := newEnv(t)
	f := e.fixtures(5)

	var utama cabang.Cabang
	if err := e.db.Where("is_utama = ?", true).First(&utama).Error; err != nil {
		t.Fatal(err)
	}
	var kemang struct{ ID uint }
	e.must("POST", "/cabang", map[string]any{"nama": "Klinik Kemang", "singkatan": "KMG"}, &kemang)
	kmg := fmt.Sprint(kemang.ID)

	// Numbers carry the branch prefix and count per branch.
	antrian := map[string]any{"pasien_id": f.pasien, "staff_id": f.staff, "tanggal": tanggal}
	var a1, a2 struct {
		ID       uint
		Kode     string
		CabangID uint `json:"cabang_id"`
	}
	r := e.callCabang("admin", "POST", "/antrian", "", antrian)
	_ = json.Unmarshal(r.Data, &a1)
	r = e.callCabang("admin", "POST", "/antrian", kmg, antrian)
	_ = json.Unmarshal(r.Data, &a2)
	if !strings.HasPrefix(a1.Kode, "ANT-"+utama.Singkatan+"-") || a1.CabangID != utama.ID {
		t.Errorf("main antrian = %+v, want ANT-%s- in branch %d", a1, utama.Singkatan, utama.ID)
	}
	if !strings.HasPrefix(a2.Kode, "ANT-KMG-") || !strings.HasSuffix(a2.Kode, "00001") || a2.CabangID != kemang.ID {
		t.Errorf("kemang antrian = %+v, want ANT-KMG-…00001", a2)
	}

	// Each branch sees its own rows; admin "all" sees both.
	if n := e.listCabang("admin", "/antrian", ""); n != 1 {
		t.Errorf("main antrian list = %d, want 1", n)
	}
	if n := e.listCabang("admin", "/antrian", kmg); n != 1 {
		t.Errorf("kemang antrian list = %d, want 1", n)
	}
	if n := e.listCabang("admin", "/antrian", "all"); n != 2 {
		t.Errorf("all antrian list = %d, want 2", n)
	}
	if r := e.callCabang("admin", "GET", fmt.Sprintf("/antrian/%d", a1.ID), kmg, nil); r.Code != http.StatusNotFound {
		t.Errorf("main antrian from kemang = %d, want 404", r.Code)
	}
	if r := e.callCabang("admin", "PATCH", fmt.Sprintf("/antrian/%d/status", a1.ID), kmg, map[string]any{"status": "batal"}); r.Code == http.StatusOK {
		t.Errorf("changing a main antrian from kemang succeeded")
	}
	// Writing needs one branch, not "all".
	if r := e.callCabang("admin", "POST", "/antrian", "all", antrian); r.Code != http.StatusBadRequest {
		t.Errorf("antrian in all branches = %d, want 400", r.Code)
	}
	// Staff only works in the main branch.
	if n := e.listCabang("staff", "/antrian", ""); n != 1 {
		t.Errorf("staff antrian list = %d, want 1", n)
	}
	if r := e.callCabang("staff", "GET", "/antrian", kmg, nil); r.Code != http.StatusForbidden {
		t.Errorf("staff opening kemang = %d, want 403", r.Code)
	}

	// Deposit: the log is per branch, the pasien's balance is shared. Transfer money
	// still goes through the shift, so admin needs one open in kemang first.
	dep := map[string]any{"pasien_id": f.pasien, "staff_id": f.staff, "tanggal": tanggal, "jenis": "pembayaran_deposit", "jumlah": 50000, "jenis_pembayaran": "transfer"}
	r = e.callCabang("admin", "POST", "/pembayaran/deposit", kmg, dep)
	if r.Code != http.StatusBadRequest {
		t.Errorf("kemang deposit on a main shift = %d %q", r.Code, r.Message)
	}
	if err := e.db.Model(&kasir.Shift{}).Where("cabang_id = ?", utama.ID).Update("status", kasir.StatusClosed).Error; err != nil {
		t.Fatal(err)
	}
	r = e.callCabang("admin", "POST", "/kasir/shift/buka", kmg, map[string]any{"saldo_awal": 0})
	if r.Code != http.StatusCreated {
		t.Fatalf("open kemang shift = %d %s", r.Code, r.Message)
	}
	var shift struct {
		Shift kasir.Shift `json:"shift"`
	}
	_ = json.Unmarshal(r.Data, &shift)
	if shift.Shift.CabangID != kemang.ID || shift.Shift.CabangNama != "Klinik Kemang" || !strings.HasPrefix(shift.Shift.Kode, "SHF-KMG-") {
		t.Errorf("kemang shift = %+v", shift.Shift)
	}
	if r := e.callCabang("admin", "POST", "/pembayaran/deposit", kmg, dep); r.Code != http.StatusCreated {
		t.Fatalf("kemang deposit = %d %s", r.Code, r.Message)
	}
	if n := e.listCabang("admin", "/pembayaran/deposit", ""); n != 0 {
		t.Errorf("main deposit log = %d, want 0", n)
	}
	if n := e.listCabang("admin", "/pembayaran/deposit", kmg); n != 1 {
		t.Errorf("kemang deposit log = %d, want 1", n)
	}
	var saldo struct {
		Saldo float64 `json:"saldo_deposit"`
	}
	r = e.callCabang("staff", "GET", fmt.Sprintf("/pembayaran/deposit/saldo?pasien_id=%d", f.pasien), "", nil)
	_ = json.Unmarshal(r.Data, &saldo)
	if saldo.Saldo != 50000 {
		t.Errorf("saldo seen from main = %v (%s), want 50000", saldo.Saldo, r.Data)
	}

	// A kemang perawatan is billed in kemang only.
	var pw struct{ ID uint }
	r = e.callCabang("admin", "POST", "/perawatan", kmg, map[string]any{
		"pasien_id": f.pasien, "staff_id": f.staff, "tanggal": tanggal, "status": "bayar",
		"tindakans": []map[string]any{{"treatment_id": f.treatment, "jumlah": 1, "harga": 350000, "total": 350000, "tanggal": tanggal}},
	})
	if r.Code != http.StatusCreated {
		t.Fatalf("kemang perawatan = %d %s", r.Code, r.Message)
	}
	_ = json.Unmarshal(r.Data, &pw)
	if n := e.listCabang("admin", "/pembayaran/perawatan/reguler", ""); n != 0 {
		t.Errorf("main kasir queue = %d, want 0", n)
	}
	bayar := map[string]any{"source_type": "perawatan", "source_id": pw.ID, "staff_id": f.staff, "jenis_pembayaran": "tunai", "jumlah_bayar": 350000, "tanggal": tanggal}
	if r := e.callCabang("admin", "POST", "/pembayaran/bayar", "", bayar); r.Code != http.StatusBadRequest {
		t.Errorf("paying a kemang perawatan from main = %d, want 400", r.Code)
	}
	r = e.callCabang("admin", "POST", "/pembayaran/bayar", kmg, bayar)
	if r.Code != http.StatusOK && r.Code != http.StatusCreated {
		t.Fatalf("kemang bayar = %d %s", r.Code, r.Message)
	}
	var pj penjualan.Penjualan
	_ = json.Unmarshal(r.Data, &pj)
	if pj.CabangID != kemang.ID || !strings.HasPrefix(pj.Kode, "PJL-KMG-") {
		t.Errorf("kemang sale = cabang %d kode %s", pj.CabangID, pj.Kode)
	}
	if n := e.listCabang("admin", "/penjualan", ""); n != 0 {
		t.Errorf("main penjualan list = %d, want 0", n)
	}
	if n := e.listCabang("admin", "/kasir/shift", kmg); n != 1 {
		t.Errorf("kemang shifts = %d, want 1", n)
	}

	// Staff pickers list only staff serving the active branch.
	e.must("POST", "/staff", map[string]any{"nama": "Dokter Kemang", "jabatan": "Dokter", "cabang_ids": []uint{kemang.ID}}, nil)
	if n := e.listCabang("admin", "/staff?cabang=aktif&search=Dokter%20Kemang", ""); n != 0 {
		t.Errorf("kemang doctor in main picker = %d, want 0", n)
	}
	if n := e.listCabang("admin", "/staff?cabang=aktif&search=Dokter%20Kemang", kmg); n != 1 {
		t.Errorf("kemang doctor in kemang picker = %d, want 1", n)
	}

	// Rows from before multi-branch (cabang_id 0) move to the main branch.
	if err := e.db.Exec("UPDATE antrians SET cabang_id = 0").Error; err != nil {
		t.Fatal(err)
	}
	if err := cabang.EnsureDefaults(e.db); err != nil {
		t.Fatal(err)
	}
	if n := e.listCabang("admin", "/antrian", ""); n != 2 {
		t.Errorf("main antrian after backfill = %d, want 2", n)
	}
}
