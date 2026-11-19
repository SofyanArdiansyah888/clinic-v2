// Package branch resolves the active branch (cabang) of every request and keeps the
// user/staff ↔ cabang links. Transactions and stock are recorded per branch; patients,
// membership and deposit balances are shared by all branches.
//
// The web sends the active branch in the X-Cabang-ID header: a cabang id, or "all"
// (admin only, for combined reports). Without the header the user's default branch is
// used (the main branch when allowed, otherwise their first), so older clients keep working.
package branch

import (
	"errors"
	"net/http"
	"sort"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/scaleup/clinic-v2/api/internal/platform/middleware"
	"github.com/scaleup/clinic-v2/api/internal/platform/response"
	"gorm.io/gorm"
)

const (
	Header   = "X-Cabang-ID"
	AllValue = "all"

	ctxID  = "cabangID"
	ctxAll = "cabangAll"

	MsgForbidden = "Anda tidak punya akses ke cabang ini."
	MsgPilih     = "Pilih cabang aktif terlebih dahulu."
)

// Akses is one branch a user may work in.
type Akses struct {
	ID        uint   `json:"id"`
	Kode      string `json:"kode"`
	Nama      string `json:"nama"`
	Singkatan string `json:"singkatan"`
	IsUtama   bool   `json:"is_utama"`
}

// Allowed lists the active branches the user may open, main branch first. Admin may open
// every active branch; other roles only those linked in user_cabangs.
func Allowed(db *gorm.DB, userID uint, role string) ([]Akses, error) {
	q := db.Table("cabangs c").
		Select("c.id, c.kode, c.nama, c.singkatan, c.is_utama").
		Where("c.is_active = ?", true).
		Order("c.is_utama DESC, c.id ASC")
	if role != middleware.RoleAdmin {
		q = q.Joins("JOIN user_cabangs uc ON uc.cabang_id = c.id AND uc.user_id = ?", userID)
	}
	var out []Akses
	err := q.Scan(&out).Error
	return out, err
}

// Middleware puts the active branch in the request context. It must run after Auth.
func Middleware(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		role := c.GetString(middleware.ContextRole)
		h := strings.TrimSpace(c.GetHeader(Header))
		if strings.EqualFold(h, AllValue) {
			if role != middleware.RoleAdmin {
				response.Fail(c, http.StatusForbidden, MsgForbidden, nil)
				c.Abort()
				return
			}
			c.Set(ctxAll, true)
			c.Set(ctxID, uint(0))
			c.Next()
			return
		}

		allowed, err := Allowed(db, c.GetUint(middleware.ContextUserID), role)
		if err != nil {
			response.Internal(c, err.Error())
			c.Abort()
			return
		}
		var id uint
		if h == "" {
			if len(allowed) > 0 {
				id = allowed[0].ID // main branch when allowed, otherwise the first one
			}
		} else {
			n, err := strconv.ParseUint(h, 10, 64)
			if err != nil || !contains(allowed, uint(n)) {
				response.Fail(c, http.StatusForbidden, MsgForbidden, nil)
				c.Abort()
				return
			}
			id = uint(n)
		}
		c.Set(ctxID, id)
		c.Set(ctxAll, false)
		c.Next()
	}
}

func contains(list []Akses, id uint) bool {
	for _, a := range list {
		if a.ID == id {
			return true
		}
	}
	return false
}

// ID is the active branch, 0 when "all branches" is selected or the user has no branch.
func ID(c *gin.Context) uint { return c.GetUint(ctxID) }

// All reports whether the admin asked for all branches combined.
func All(c *gin.Context) bool { return c.GetBool(ctxAll) }

// Require returns the active branch for endpoints that record data in one branch, writing
// a 400 response (and returning false) when no single branch is active.
func Require(c *gin.Context) (uint, bool) {
	id := ID(c)
	if id == 0 {
		response.BadRequest(c, MsgPilih, nil)
		return 0, false
	}
	return id, true
}

// Scope limits a query to the active branch; "all branches" leaves it unfiltered.
func Scope(q *gorm.DB, c *gin.Context, column string) *gorm.DB {
	if All(c) {
		return q
	}
	return q.Where(column+" = ?", ID(c))
}

// ── user/staff ↔ cabang links ──

// Link tables: user_cabangs (user_id, cabang_id) and staff_cabangs (staff_id, cabang_id).
type Link struct{ Table, Owner string }

var (
	UserLinks  = Link{"user_cabangs", "user_id"}
	StaffLinks = Link{"staff_cabangs", "staff_id"}
)

var ErrCabangTidakAda = errors.New("cabang tidak ditemukan")

// IDs returns the linked cabang ids for each owner id.
func (l Link) IDs(db *gorm.DB, owners []uint) (map[uint][]uint, error) {
	out := make(map[uint][]uint, len(owners))
	if len(owners) == 0 {
		return out, nil
	}
	var rows []struct {
		Owner    uint
		CabangID uint
	}
	err := db.Table(l.Table).Select(l.Owner+" AS owner, cabang_id").Where(l.Owner+" IN ?", owners).Order("cabang_id").Scan(&rows).Error
	for _, r := range rows {
		out[r.Owner] = append(out[r.Owner], r.CabangID)
	}
	return out, err
}

// Set replaces the owner's links with cabangIDs (duplicates ignored, unknown ids refused).
func (l Link) Set(db *gorm.DB, owner uint, cabangIDs []uint) error {
	ids := unique(cabangIDs)
	if len(ids) > 0 {
		var n int64
		if err := db.Table("cabangs").Where("id IN ?", ids).Count(&n).Error; err != nil {
			return err
		}
		if int(n) != len(ids) {
			return ErrCabangTidakAda
		}
	}
	return db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Exec("DELETE FROM "+l.Table+" WHERE "+l.Owner+" = ?", owner).Error; err != nil {
			return err
		}
		for _, id := range ids {
			if err := tx.Exec("INSERT INTO "+l.Table+" ("+l.Owner+", cabang_id) VALUES (?, ?)", owner, id).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

func unique(ids []uint) []uint {
	seen := map[uint]bool{}
	out := []uint{}
	for _, id := range ids {
		if id != 0 && !seen[id] {
			seen[id] = true
			out = append(out, id)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i] < out[j] })
	return out
}

// ErrMinimalSatu: an account other than admin must be able to work in at least one branch.
var ErrMinimalSatu = errors.New("pilih minimal satu cabang")

// UtamaID is the main branch (0 when there is none yet).
func UtamaID(db *gorm.DB) uint {
	var row struct{ ID uint }
	db.Table("cabangs").Select("id").Where("is_utama = ?", true).Order("id").Limit(1).Scan(&row)
	return row.ID
}

// Validate checks that every id is an existing branch.
func Validate(db *gorm.DB, cabangIDs []uint) error {
	ids := unique(cabangIDs)
	if len(ids) == 0 {
		return nil
	}
	var n int64
	if err := db.Table("cabangs").Where("id IN ?", ids).Count(&n).Error; err != nil {
		return err
	}
	if int(n) != len(ids) {
		return ErrCabangTidakAda
	}
	return nil
}

// IsRequestError reports link errors that are the client's fault (respond 400).
func IsRequestError(err error) bool {
	return errors.Is(err, ErrCabangTidakAda) || errors.Is(err, ErrMinimalSatu)
}
