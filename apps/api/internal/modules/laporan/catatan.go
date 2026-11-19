package laporan

import (
	"errors"
	"net/http"
	"slices"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/scaleup/clinic-v2/api/internal/platform/middleware"
	"github.com/scaleup/clinic-v2/api/internal/platform/response"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// Catatan is a division head's commentary and action plan for one report edition
// (a date range), printed in that division's chapter of the performance magazine.
type Catatan struct {
	ID            uint      `gorm:"primaryKey" json:"id"`
	Divisi        string    `gorm:"size:20;not null;uniqueIndex:idx_catatan_edisi" json:"divisi"`
	Dari          string    `gorm:"type:date;not null;uniqueIndex:idx_catatan_edisi" json:"dari"`
	Sampai        string    `gorm:"type:date;not null;uniqueIndex:idx_catatan_edisi" json:"sampai"`
	Isi           string    `gorm:"type:text;not null" json:"isi"`
	UpdatedByID   uint      `json:"updated_by_id"`
	UpdatedByName string    `gorm:"size:150" json:"updated_by_name"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

func (Catatan) TableName() string { return "laporan_catatans" }

type divisiAkses struct {
	writers []string // besides admin
	readers []string // besides admin
}

// Divisions follow the report access rules: whoever may read a division's report may
// read its notes; only that division's own role (and admin) writes them.
var divisiRules = map[string]divisiAkses{
	"eksekutif": {},
	"fo":        {writers: []string{middleware.RoleStaff}, readers: []string{middleware.RoleStaff, middleware.RoleFinance}},
	"dokter":    {writers: []string{middleware.RoleDoctor}, readers: []string{middleware.RoleDoctor}},
	"terapis":   {writers: []string{middleware.RoleNurse}, readers: []string{middleware.RoleNurse}},
	"apotek":    {writers: []string{middleware.RoleApoteker}, readers: []string{middleware.RoleApoteker, middleware.RoleFinance}},
	"finance":   {writers: []string{middleware.RoleFinance}, readers: []string{middleware.RoleFinance}},
}

func canRead(role, divisi string) bool {
	r, ok := divisiRules[divisi]
	return ok && (role == middleware.RoleAdmin || slices.Contains(r.readers, role))
}

func canWrite(role, divisi string) bool {
	r, ok := divisiRules[divisi]
	return ok && (role == middleware.RoleAdmin || slices.Contains(r.writers, role))
}

type CatatanRequest struct {
	Divisi string `json:"divisi" binding:"required"`
	Dari   string `json:"dari" binding:"required"`
	Sampai string `json:"sampai" binding:"required"`
	Isi    string `json:"isi"`
}

var errTanggal = errors.New("format tanggal harus yyyy-mm-dd dan sampai tidak boleh sebelum dari")

func validRange(dari, sampai string) bool {
	d, err1 := time.Parse("2006-01-02", dari)
	s, err2 := time.Parse("2006-01-02", sampai)
	return err1 == nil && err2 == nil && !s.Before(d)
}

type catatanHandler struct{ db *gorm.DB }

func (h *catatanHandler) List(c *gin.Context) {
	dari, sampai := c.Query("dari"), c.Query("sampai")
	if !validRange(dari, sampai) {
		response.BadRequest(c, errTanggal.Error(), nil)
		return
	}
	var rows []Catatan
	if err := h.db.Where("dari = ? AND sampai = ?", dari, sampai).Order("divisi").Find(&rows).Error; err != nil {
		response.Internal(c, err.Error())
		return
	}
	role := c.GetString(middleware.ContextRole)
	out := make([]Catatan, 0, len(rows))
	for _, r := range rows {
		if canRead(role, r.Divisi) {
			out = append(out, r)
		}
	}
	response.OK(c, out, "ok")
}

// Save upserts the note for a division and edition; an empty note removes it.
func (h *catatanHandler) Save(c *gin.Context) {
	var req CatatanRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "validation failed", err.Error())
		return
	}
	if _, ok := divisiRules[req.Divisi]; !ok {
		response.BadRequest(c, "divisi tidak dikenal", nil)
		return
	}
	if !validRange(req.Dari, req.Sampai) {
		response.BadRequest(c, errTanggal.Error(), nil)
		return
	}
	role := c.GetString(middleware.ContextRole)
	if !canWrite(role, req.Divisi) {
		response.Fail(c, http.StatusForbidden, "hanya kepala divisi ini atau admin yang bisa menulis catatan", nil)
		return
	}
	key := h.db.Where("divisi = ? AND dari = ? AND sampai = ?", req.Divisi, req.Dari, req.Sampai)
	isi := strings.TrimSpace(req.Isi)
	if isi == "" {
		if err := key.Delete(&Catatan{}).Error; err != nil {
			response.Internal(c, err.Error())
			return
		}
		response.OK(c, nil, "deleted")
		return
	}
	row := Catatan{
		Divisi: req.Divisi, Dari: req.Dari, Sampai: req.Sampai, Isi: isi,
		UpdatedByID: c.GetUint(middleware.ContextUserID), UpdatedByName: c.GetString(middleware.ContextUsername),
	}
	err := h.db.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "divisi"}, {Name: "dari"}, {Name: "sampai"}},
		DoUpdates: clause.AssignmentColumns([]string{"isi", "updated_by_id", "updated_by_name", "updated_at"}),
	}).Create(&row).Error
	if err != nil {
		response.Internal(c, err.Error())
		return
	}
	var saved Catatan
	h.db.Where("divisi = ? AND dari = ? AND sampai = ?", req.Divisi, req.Dari, req.Sampai).First(&saved)
	response.OK(c, saved, "saved")
}
