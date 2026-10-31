package middleware

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/scaleup/clinic-v2/api/internal/platform/response"
)

const (
	RoleAdmin    = "admin"
	RoleDoctor   = "doctor"
	RoleStaff    = "staff" // front office / kasir
	RoleApoteker = "apoteker"
	RoleNurse    = "nurse"
)

var allRoles = []string{RoleAdmin, RoleDoctor, RoleStaff, RoleApoteker, RoleNurse}

type access int

const (
	read  access = iota // GET / HEAD
	write               // POST, PUT, PATCH, DELETE
	del                 // DELETE only, checked before the general write rule
)

type rule struct {
	access access
	prefix string // route pattern without the /api prefix, e.g. /antrian/:id/status
	roles  []string
}

// policy is evaluated top to bottom and the first matching rule wins, so specific
// paths come before their parents. Reads not listed are open to every signed-in
// role (pickers across modules need master data); writes not listed are admin only.
var policy = []rule{
	{read, "/user", []string{RoleAdmin}},
	{read, "/laporan/fo", []string{RoleAdmin, RoleStaff}},
	{read, "/laporan/apotek", []string{RoleAdmin, RoleApoteker}},
	{read, "/laporan/nurse", []string{RoleAdmin, RoleNurse}},
	{read, "/laporan/dm", []string{RoleAdmin, RoleDoctor}},

	{write, "/auth", allRoles},
	{write, "/uploads", allRoles},

	// Front office
	{write, "/pasien", []string{RoleAdmin, RoleStaff}},
	{write, "/antrian/:id/status", []string{RoleAdmin, RoleStaff, RoleDoctor, RoleNurse}},
	{write, "/antrian", []string{RoleAdmin, RoleStaff}},
	{write, "/appointment", []string{RoleAdmin, RoleStaff}},
	{write, "/pembayaran", []string{RoleAdmin, RoleStaff}},
	{write, "/membership", []string{RoleAdmin, RoleStaff}},
	{write, "/promo/validate", []string{RoleAdmin, RoleStaff}},
	{write, "/voucher/validate", []string{RoleAdmin, RoleStaff}},

	// Clinical; FO opens the perawatan when registering a visit.
	{del, "/perawatan", []string{RoleAdmin, RoleDoctor}},
	{write, "/perawatan", []string{RoleAdmin, RoleStaff, RoleDoctor, RoleNurse}},

	// Depo / pharmacy / warehouse
	{write, "/resep", []string{RoleAdmin, RoleApoteker}},
	{write, "/penjualan/:id/status", []string{RoleAdmin}},
	{del, "/penjualan", []string{RoleAdmin}},
	{write, "/penjualan", []string{RoleAdmin, RoleStaff, RoleApoteker}},
	{write, "/barang", []string{RoleAdmin, RoleApoteker}},
	{write, "/supplier", []string{RoleAdmin, RoleApoteker}},
	{write, "/pembelian", []string{RoleAdmin, RoleApoteker}},
	{write, "/konversi-stok", []string{RoleAdmin, RoleApoteker}},
	{write, "/produksi-barang", []string{RoleAdmin, RoleApoteker}},
	{write, "/stok-opname", []string{RoleAdmin, RoleApoteker}},
}

func matches(r rule, method, path string) bool {
	isRead := method == http.MethodGet || method == http.MethodHead
	switch r.access {
	case read:
		if !isRead {
			return false
		}
	case write:
		if isRead {
			return false
		}
	case del:
		if method != http.MethodDelete {
			return false
		}
	}
	return path == r.prefix || strings.HasPrefix(path, r.prefix+"/")
}

// Allowed reports whether role may call method on the route pattern path (without /api).
func Allowed(role, method, path string) bool {
	if role == RoleAdmin {
		return true
	}
	for _, r := range policy {
		if matches(r, method, path) {
			for _, allowed := range r.roles {
				if allowed == role {
					return true
				}
			}
			return false
		}
	}
	return method == http.MethodGet || method == http.MethodHead
}

// Authorize enforces the role policy. It must run after Auth, which sets the role.
func Authorize() gin.HandlerFunc {
	return func(c *gin.Context) {
		path := strings.TrimPrefix(c.FullPath(), "/api")
		if path == "" {
			c.Next()
			return
		}
		role, _ := c.Get(ContextRole)
		roleStr, _ := role.(string)
		if !Allowed(roleStr, c.Request.Method, path) {
			response.Fail(c, http.StatusForbidden, "akses ditolak untuk peran "+roleStr, nil)
			c.Abort()
			return
		}
		c.Next()
	}
}
