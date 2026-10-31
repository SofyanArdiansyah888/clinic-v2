package middleware

import "testing"

func TestAllowed(t *testing.T) {
	cases := []struct {
		role, method, path string
		want               bool
	}{
		{RoleAdmin, "DELETE", "/user/:id", true},
		{RoleAdmin, "PUT", "/route-not-in-policy", true},

		// Reads are open except users and other roles' reports.
		{RoleNurse, "GET", "/barang", true},
		{RoleStaff, "GET", "/user", false},
		{RoleStaff, "GET", "/laporan/fo", true},
		{RoleStaff, "GET", "/laporan/apotek", false},
		{RoleDoctor, "GET", "/laporan/dm", true},

		// Writes follow the role's job; anything unlisted is admin only.
		{RoleStaff, "POST", "/pembayaran/bayar", true},
		{RoleApoteker, "POST", "/pembayaran/bayar", false},
		{RoleNurse, "PATCH", "/antrian/:id/status", true},
		{RoleNurse, "PUT", "/antrian/:id", false},
		{RoleStaff, "POST", "/perawatan", true},
		{RoleStaff, "DELETE", "/perawatan/:id", false},
		{RoleDoctor, "DELETE", "/perawatan/:id", true},
		{RoleApoteker, "POST", "/penjualan", true},
		{RoleApoteker, "DELETE", "/penjualan/:id", false},
		{RoleStaff, "PATCH", "/penjualan/:id/status", false},
		{RoleApoteker, "PATCH", "/resep/:id/serahkan", true},
		{RoleStaff, "POST", "/treatment", false},
		{RoleDoctor, "PUT", "/pengaturan/klinik", false},

		// Prefixes match whole path segments only.
		{RoleApoteker, "POST", "/barangx", false},

		{"", "GET", "/barang", true},
		{"", "POST", "/pasien", false},
		{"unknown", "POST", "/auth/logout", false},
	}
	for _, c := range cases {
		if got := Allowed(c.role, c.method, c.path); got != c.want {
			t.Errorf("Allowed(%q, %s, %s) = %v, want %v", c.role, c.method, c.path, got, c.want)
		}
	}
}
