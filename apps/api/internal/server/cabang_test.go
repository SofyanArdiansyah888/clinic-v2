package server_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/scaleup/clinic-v2/api/internal/modules/cabang"
	"github.com/scaleup/clinic-v2/api/internal/modules/user"
)

// callCabang is e.call with an X-Cabang-ID header ("" sends none).
func (e *env) callCabang(role, method, path, cab string, body any) resp {
	e.t.Helper()
	var buf bytes.Buffer
	if body != nil {
		_ = json.NewEncoder(&buf).Encode(body)
	}
	req := httptest.NewRequest(method, "/api"+path, &buf)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+e.tok[role])
	if cab != "" {
		req.Header.Set("X-Cabang-ID", cab)
	}
	w := httptest.NewRecorder()
	e.h.ServeHTTP(w, req)
	var r resp
	_ = json.Unmarshal(w.Body.Bytes(), &r)
	r.Code = w.Code
	return r
}

type aksesResp struct {
	Cabangs []struct {
		ID              uint
		Nama, Singkatan string
		IsUtama         bool `json:"is_utama"`
	}
	AktifID   uint `json:"aktif_id"`
	Semua     bool
	BisaSemua bool `json:"bisa_semua"`
}

func (e *env) akses(role, cab string) (aksesResp, int) {
	e.t.Helper()
	r := e.callCabang(role, "GET", "/cabang/akses", cab, nil)
	var a aksesResp
	_ = json.Unmarshal(r.Data, &a)
	return a, r.Code
}

func TestCabangFondasi(t *testing.T) {
	e := newEnv(t)

	// The seeded branch became the main branch with a derived abbreviation, and every
	// account (seed admin and the test roles) was linked to it.
	var utama cabang.Cabang
	if err := e.db.Where("is_utama = ?", true).First(&utama).Error; err != nil {
		t.Fatalf("no main branch: %v", err)
	}
	if utama.Nama != "Cabang Pusat" || utama.Singkatan != "CP" {
		t.Errorf("main branch = %q / %q, want Cabang Pusat / CP", utama.Nama, utama.Singkatan)
	}
	var unlinked int64
	e.db.Raw(`SELECT COUNT(*) FROM users u WHERE NOT EXISTS (SELECT 1 FROM user_cabangs uc WHERE uc.user_id = u.id)`).Scan(&unlinked)
	if unlinked != 0 {
		t.Errorf("%d users without a branch", unlinked)
	}

	// Without a header the default branch is the main one.
	if a, code := e.akses("staff", ""); code != 200 || a.AktifID != utama.ID || len(a.Cabangs) != 1 || a.BisaSemua {
		t.Errorf("staff default akses = %+v (%d)", a, code)
	}

	// Branch create: abbreviation is normalized, must be valid and unique.
	var kemang cabang.Cabang
	e.must("POST", "/cabang", map[string]any{"nama": "Klinik Kemang", "singkatan": "kmg", "alamat": "Jl. Kemang Raya"}, &kemang)
	if kemang.Singkatan != "KMG" || kemang.IsUtama {
		t.Errorf("new branch = %+v", kemang)
	}
	if r := e.call("admin", "POST", "/cabang", map[string]any{"nama": "Dobel", "singkatan": "KMG"}); r.Code != 400 {
		t.Errorf("duplicate singkatan: %d", r.Code)
	}
	if r := e.call("admin", "POST", "/cabang", map[string]any{"nama": "Salah", "singkatan": "K-1"}); r.Code != 400 {
		t.Errorf("invalid singkatan: %d", r.Code)
	}
	var auto cabang.Cabang
	e.must("POST", "/cabang", map[string]any{"nama": "Klinik Bintaro Sektor Sembilan"}, &auto)
	if auto.Singkatan != "KBS" {
		t.Errorf("derived singkatan = %q, want KBS", auto.Singkatan)
	}
	if r := e.call("staff", "POST", "/cabang", map[string]any{"nama": "X"}); r.Code != http.StatusForbidden {
		t.Errorf("staff creates branch: %d", r.Code)
	}

	// Admin sees every active branch and may ask for all of them.
	if a, _ := e.akses("admin", ""); len(a.Cabangs) != 3 || a.Cabangs[0].ID != utama.ID || !a.BisaSemua {
		t.Errorf("admin akses = %+v", a)
	}
	if a, code := e.akses("admin", "all"); code != 200 || !a.Semua || a.AktifID != 0 {
		t.Errorf("admin all = %+v (%d)", a, code)
	}

	// Move the staff account to Kemang only.
	var staffUser user.User
	e.db.Where("role = ?", "staff").First(&staffUser)
	put := func(ids []uint) resp {
		return e.call("admin", "PUT", fmt.Sprintf("/user/%d", staffUser.ID), map[string]any{
			"name": staffUser.Name, "email": staffUser.Email, "username": staffUser.Username, "cabang_ids": ids,
		})
	}
	if r := put([]uint{}); r.Code != 400 {
		t.Errorf("non-admin with no branch: %d", r.Code)
	}
	if r := put([]uint{99999}); r.Code != 400 {
		t.Errorf("unknown branch: %d", r.Code)
	}
	r := put([]uint{kemang.ID})
	var got struct {
		CabangIDs []uint `json:"cabang_ids"`
	}
	_ = json.Unmarshal(r.Data, &got)
	if r.Code != 200 || len(got.CabangIDs) != 1 || got.CabangIDs[0] != kemang.ID {
		t.Fatalf("link staff to Kemang: %d %s %v", r.Code, r.Message, got)
	}

	if a, _ := e.akses("staff", ""); a.AktifID != kemang.ID || len(a.Cabangs) != 1 {
		t.Errorf("staff default after move = %+v", a)
	}
	if _, code := e.akses("staff", fmt.Sprint(utama.ID)); code != http.StatusForbidden {
		t.Errorf("staff opens a branch it is not linked to: %d", code)
	}
	if _, code := e.akses("staff", "all"); code != http.StatusForbidden {
		t.Errorf("staff asks for all branches: %d", code)
	}
	if _, code := e.akses("staff", "abc"); code != http.StatusForbidden {
		t.Errorf("garbage header: %d", code)
	}
	// The header applies to every protected endpoint, not only /cabang.
	if r := e.callCabang("staff", "GET", "/pasien", fmt.Sprint(utama.ID), nil); r.Code != http.StatusForbidden {
		t.Errorf("staff lists pasien in a foreign branch: %d", r.Code)
	}

	// Staff (employee) records carry their branches too; a new one joins the main branch.
	var dokter struct {
		ID        uint
		CabangIDs []uint `json:"cabang_ids"`
	}
	e.must("POST", "/staff", map[string]any{"nama": "Dr. Dua Cabang", "jabatan": "Dokter", "cabang_ids": []uint{utama.ID, kemang.ID}}, &dokter)
	if len(dokter.CabangIDs) != 2 {
		t.Errorf("staff cabang_ids = %v", dokter.CabangIDs)
	}
	var baru struct {
		CabangIDs []uint `json:"cabang_ids"`
	}
	e.must("POST", "/staff", map[string]any{"nama": "Terapis Baru", "jabatan": "Beautician"}, &baru)
	if len(baru.CabangIDs) != 1 || baru.CabangIDs[0] != utama.ID {
		t.Errorf("default staff branch = %v, want [%d]", baru.CabangIDs, utama.ID)
	}

	// Main branch rules.
	if r := e.call("admin", "DELETE", fmt.Sprintf("/cabang/%d", utama.ID), nil); r.Code != 400 {
		t.Errorf("delete main branch: %d", r.Code)
	}
	if r := e.call("admin", "PUT", fmt.Sprintf("/cabang/%d", utama.ID), map[string]any{"nama": utama.Nama, "is_utama": false}); r.Code != 400 {
		t.Errorf("unset main flag directly: %d", r.Code)
	}
	e.must("PUT", fmt.Sprintf("/cabang/%d", kemang.ID), map[string]any{"nama": kemang.Nama, "singkatan": "KMG", "is_utama": true}, nil)
	var n int64
	e.db.Model(&cabang.Cabang{}).Where("is_utama = ?", true).Count(&n)
	if n != 1 {
		t.Errorf("%d main branches after switching", n)
	}
	e.must("DELETE", fmt.Sprintf("/cabang/%d", auto.ID), nil, nil)

	// Defaults are idempotent and repair blanks.
	e.db.Model(&cabang.Cabang{}).Where("id = ?", utama.ID).Update("singkatan", "")
	e.db.Exec("DELETE FROM user_cabangs WHERE user_id = ?", staffUser.ID)
	for i := 0; i < 2; i++ {
		if err := cabang.EnsureDefaults(e.db); err != nil {
			t.Fatal(err)
		}
	}
	e.db.First(&utama, utama.ID)
	if utama.Singkatan != "CP" {
		t.Errorf("repaired singkatan = %q", utama.Singkatan)
	}
	var links []cabang.UserCabang
	e.db.Where("user_id = ?", staffUser.ID).Find(&links)
	if len(links) != 1 || links[0].CabangID != kemang.ID {
		t.Errorf("relinked staff user = %+v, want main branch %d", links, kemang.ID)
	}
}
