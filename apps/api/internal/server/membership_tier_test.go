package server_test

import (
	"fmt"
	"testing"

	"github.com/scaleup/clinic-v2/api/internal/modules/membership"
	"github.com/scaleup/clinic-v2/api/internal/modules/pembayaran"
	"github.com/scaleup/clinic-v2/api/internal/server"
)

// The member tier is a membership level, never the payment type that created it.
func TestMemberTierFromDeposit(t *testing.T) {
	e := newEnv(t)
	f := e.fixtures(0)
	member := func(jenis string, jumlah float64) {
		t.Helper()
		if r := e.call("staff", "POST", "/pembayaran/deposit", map[string]any{
			"pasien_id": f.pasien, "staff_id": f.staff, "tanggal": tanggal, "jenis": jenis, "jumlah": jumlah, "jenis_pembayaran": "tunai",
		}); r.Code >= 300 {
			t.Fatalf("%s: %d %s", jenis, r.Code, r.Message)
		}
	}
	get := func() membership.Membership {
		t.Helper()
		var m membership.Membership
		if err := e.db.Where("pasien_id = ?", f.pasien).Order("id DESC").First(&m).Error; err != nil {
			t.Fatal(err)
		}
		return m
	}

	member("pendaftaran_member", 100000)
	m := get()
	if m.Tipe != pembayaran.DefaultMemberTier {
		t.Errorf("new member tier = %q, want %q", m.Tipe, pembayaran.DefaultMemberTier)
	}

	// Admin upgrades the tier; an extension must keep it.
	e.must("PUT", fmt.Sprintf("/membership/%d", m.ID), map[string]any{"pasien_id": f.pasien, "tipe": "Gold", "points": m.Points}, nil)
	member("perpanjangan_member", 50000)
	if got := get(); got.ID != m.ID || got.Tipe != "Gold" || got.Points != m.Points+50000 {
		t.Errorf("after extension: id %d tier %q points %d, want id %d tier Gold points %d", got.ID, got.Tipe, got.Points, m.ID, m.Points+50000)
	}

	// Rows written by the old code are repaired by the migration.
	e.db.Model(&membership.Membership{}).Where("id = ?", m.ID).Update("tipe", "perpanjangan_member")
	if err := server.AutoMigrate(e.db); err != nil {
		t.Fatal(err)
	}
	if got := get(); got.Tipe != pembayaran.DefaultMemberTier {
		t.Errorf("after migration tier = %q, want %q", got.Tipe, pembayaran.DefaultMemberTier)
	}
}
