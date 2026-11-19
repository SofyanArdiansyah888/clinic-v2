package server_test

import (
	"encoding/json"
	"fmt"
	"net/http"
	"testing"

	"github.com/scaleup/clinic-v2/api/internal/modules/staff"
	"github.com/scaleup/clinic-v2/api/internal/modules/user"
	"github.com/scaleup/clinic-v2/api/internal/platform/actor"
)

// Non-admin accounts record transactions only under their own staff; admin may record for anyone.
func TestTransaksiAtasNamaSendiri(t *testing.T) {
	e := newEnv(t)
	f := e.fixtures(10)
	lain := staff.Staff{Kode: "STF-T2", Nama: "Kasir Lain", Jabatan: "Kasir", IsActive: true}
	if err := e.db.Create(&lain).Error; err != nil {
		t.Fatal(err)
	}
	deposit := func(role string, staffID uint) resp {
		return e.call(role, "POST", "/pembayaran/deposit", map[string]any{
			"pasien_id": f.pasien, "staff_id": staffID, "tanggal": tanggal, "jenis": "pembayaran_deposit", "jumlah": 10000, "jenis_pembayaran": "tunai",
		})
	}
	jual := func(role string, staffID uint) resp {
		return e.call(role, "POST", "/penjualan", map[string]any{
			"pasien_id": f.pasien, "staff_id": staffID, "tanggal": tanggal, "status": "confirmed",
			"details": []map[string]any{{"barang_id": f.barang, "qty": 1, "harga_jual": 10000}},
		})
	}

	if r := deposit("staff", lain.ID); r.Code != http.StatusForbidden || r.Message != actor.MsgOther {
		t.Errorf("staff deposits for another staff: %d %s", r.Code, r.Message)
	}
	if r := jual("apoteker", lain.ID); r.Code != http.StatusForbidden {
		t.Errorf("apoteker sells for another staff: %d %s", r.Code, r.Message)
	}
	if r := deposit("staff", f.staff); r.Code >= 300 {
		t.Errorf("staff deposits as self: %d %s", r.Code, r.Message)
	}
	if r := deposit("admin", lain.ID); r.Code >= 300 {
		t.Errorf("admin deposits for another staff: %d %s", r.Code, r.Message)
	}

	// The recorded staff is the account's own, not whatever the client claimed.
	var rows []struct{ StaffID uint }
	e.db.Table("deposit_transaksis").Select("staff_id").Order("id").Scan(&rows)
	if len(rows) != 2 || rows[0].StaffID != f.staff || rows[1].StaffID != lain.ID {
		t.Errorf("recorded staff = %+v, want [%d %d]", rows, f.staff, lain.ID)
	}

	// An account without a staff link cannot record transactions at all.
	e.db.Model(&user.User{}).Where("role = ?", "staff").Update("staff_id", nil)
	if r := deposit("staff", f.staff); r.Code != http.StatusForbidden || r.Message != actor.MsgNotLinked {
		t.Errorf("unlinked staff deposits: %d %s", r.Code, r.Message)
	}

	// Admin links the account through the user API; /auth/me reports it.
	var u user.User
	e.db.Where("role = ?", "staff").First(&u)
	if r := e.call("admin", "PUT", fmt.Sprintf("/user/%d", u.ID), map[string]any{"name": u.Name, "email": u.Email, "username": u.Username, "staff_id": 99999}); r.Code < 400 {
		t.Errorf("link to missing staff: %d", r.Code)
	}
	if r := e.call("admin", "PUT", fmt.Sprintf("/user/%d", u.ID), map[string]any{"name": u.Name, "email": u.Email, "username": u.Username, "staff_id": lain.ID}); r.Code != http.StatusOK {
		t.Fatalf("link staff: %d %s", r.Code, r.Message)
	}
	r := e.call("staff", "GET", "/auth/me", nil)
	var me struct {
		StaffID *uint `json:"staff_id"`
	}
	_ = json.Unmarshal(r.Data, &me)
	if me.StaffID == nil || *me.StaffID != lain.ID {
		t.Errorf("/auth/me staff_id = %v, want %d (%s)", me.StaffID, lain.ID, r.Data)
	}
	if r := deposit("staff", lain.ID); r.Code >= 300 {
		t.Errorf("staff deposits after relink: %d %s", r.Code, r.Message)
	}
	// Omitting staff_id on update keeps the link.
	e.call("admin", "PUT", fmt.Sprintf("/user/%d", u.ID), map[string]any{"name": u.Name, "email": u.Email, "username": u.Username})
	e.db.First(&u, u.ID)
	if u.StaffID == nil || *u.StaffID != lain.ID {
		t.Errorf("update without staff_id dropped the link: %v", u.StaffID)
	}
}
