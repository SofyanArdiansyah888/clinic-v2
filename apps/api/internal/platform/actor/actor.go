// Package actor decides whose name a transaction is recorded under.
package actor

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/scaleup/clinic-v2/api/internal/platform/middleware"
	"github.com/scaleup/clinic-v2/api/internal/platform/response"
	"gorm.io/gorm"
)

const (
	MsgNotLinked = "Akun Anda belum terhubung ke data staff. Minta admin menghubungkannya di Administrasi › User."
	MsgOther     = "Transaksi hanya boleh dicatat atas nama Anda sendiri."
)

// OwnStaff makes non-admin users record a transaction (kasir, deposit, depo, pembelian)
// under the staff record linked to their own account. Admin may record for anyone.
// It fills staffID when empty and writes a 403 response (returning false) when the
// account has no staff record or the request names someone else.
func OwnStaff(c *gin.Context, db *gorm.DB, staffID *uint) bool {
	if c.GetString(middleware.ContextRole) == middleware.RoleAdmin {
		return true
	}
	var row struct{ StaffID *uint }
	db.Table("users").Select("staff_id").Where("id = ?", c.GetUint(middleware.ContextUserID)).Scan(&row)
	if row.StaffID == nil || *row.StaffID == 0 {
		response.Fail(c, http.StatusForbidden, MsgNotLinked, nil)
		return false
	}
	if *staffID != 0 && *staffID != *row.StaffID {
		response.Fail(c, http.StatusForbidden, MsgOther, nil)
		return false
	}
	*staffID = *row.StaffID
	return true
}
