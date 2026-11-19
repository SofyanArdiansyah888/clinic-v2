package informedconsent

import (
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/scaleup/clinic-v2/api/internal/modules/pasien"
	"github.com/scaleup/clinic-v2/api/internal/modules/perawatan"
	"github.com/scaleup/clinic-v2/api/internal/modules/staff"
	"github.com/scaleup/clinic-v2/api/internal/platform/middleware"
	"github.com/scaleup/clinic-v2/api/internal/platform/response"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const (
	ConsentAktif      = "aktif"
	ConsentDibatalkan = "dibatalkan"
)

// PerawatanConsent is a signed informed consent for one perawatan. Judul and Isi are a
// snapshot of the template at signing time with placeholders filled in, so later edits
// to the template never change what the pasien signed. A consent is never edited; a
// wrong one is cancelled with a reason and a new one signed.
type PerawatanConsent struct {
	ID                uint                 `gorm:"primaryKey" json:"id"`
	PerawatanID       uint                 `gorm:"not null;index" json:"perawatan_id"`
	PasienID          uint                 `gorm:"not null;index" json:"pasien_id"`
	TemplateID        *uint                `gorm:"index" json:"template_id"`
	Judul             string               `gorm:"size:200;not null" json:"judul"`
	Isi               string               `gorm:"type:text;not null" json:"isi"`
	NamaPenandatangan string               `gorm:"size:150;not null" json:"nama_penandatangan"`
	Hubungan          string               `gorm:"size:50" json:"hubungan"`
	TtdPasienURL      string               `gorm:"type:text;not null" json:"ttd_pasien_url"`
	DokterID          *uint                `gorm:"index" json:"dokter_id"`
	TtdDokterURL      string               `gorm:"type:text" json:"ttd_dokter_url"`
	Saksi             string               `gorm:"size:150" json:"saksi"`
	SignedAt          time.Time            `gorm:"not null" json:"signed_at"`
	Status            string               `gorm:"size:20;not null;default:aktif;index" json:"status"`
	AlasanBatal       string               `gorm:"type:text" json:"alasan_batal"`
	DibatalkanAt      *time.Time           `json:"dibatalkan_at"`
	DibatalkanOleh    *uint                `json:"dibatalkan_oleh"`
	CreatedBy         *uint                `json:"created_by"`
	CreatedAt         time.Time            `json:"created_at"`
	UpdatedAt         time.Time            `json:"updated_at"`
	Pasien            *pasien.Pasien       `gorm:"foreignKey:PasienID" json:"pasien,omitempty"`
	Dokter            *staff.Staff         `gorm:"foreignKey:DokterID" json:"dokter,omitempty"`
	Perawatan         *perawatan.Perawatan `gorm:"foreignKey:PerawatanID" json:"perawatan,omitempty"`
}

func (PerawatanConsent) TableName() string { return "perawatan_consents" }

type ConsentRequest struct {
	TemplateID        *uint  `json:"template_id"`
	Judul             string `json:"judul"`
	Isi               string `json:"isi"`
	NamaPenandatangan string `json:"nama_penandatangan" binding:"required"`
	Hubungan          string `json:"hubungan"`
	TtdPasienURL      string `json:"ttd_pasien_url" binding:"required"`
	DokterID          *uint  `json:"dokter_id"`
	TtdDokterURL      string `json:"ttd_dokter_url"`
	Saksi             string `json:"saksi"`
}

type BatalConsentRequest struct {
	Alasan string `json:"alasan" binding:"required"`
}

var bulanID = [...]string{"Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"}

// TanggalIndonesia formats a date the way it is written on clinic paperwork, e.g. 19 November 2026.
func TanggalIndonesia(t time.Time) string {
	return fmt.Sprintf("%d %s %d", t.Day(), bulanID[t.Month()-1], t.Year())
}

// IsiPlaceholders fills the template placeholders: {nama_pasien}, {kode_pasien},
// {tanggal}, {nama_dokter} and {treatment}.
func IsiPlaceholders(isi string, vals map[string]string) string {
	pairs := make([]string, 0, len(vals)*2)
	for k, v := range vals {
		pairs = append(pairs, "{"+k+"}", v)
	}
	return strings.NewReplacer(pairs...).Replace(isi)
}

type ConsentService struct{ db *gorm.DB }

func preloadConsent(q *gorm.DB) *gorm.DB {
	return q.Preload("Pasien").Preload("Dokter").Preload("Perawatan")
}

func (s *ConsentService) List(perawatanID uint) ([]PerawatanConsent, error) {
	items := []PerawatanConsent{}
	err := preloadConsent(s.db).Where("perawatan_id = ?", perawatanID).Order("id").Find(&items).Error
	return items, err
}

func (s *ConsentService) Get(id uint) (*PerawatanConsent, error) {
	var item PerawatanConsent
	if err := preloadConsent(s.db).First(&item, id).Error; err != nil {
		return nil, err
	}
	return &item, nil
}

func (s *ConsentService) Create(perawatanID uint, req ConsentRequest, userID uint) (*PerawatanConsent, error) {
	var pw perawatan.Perawatan
	if err := s.db.Preload("Pasien").Preload("Staff").Preload("Treatment").Preload("Tindakans.Treatment").
		First(&pw, perawatanID).Error; err != nil {
		return nil, err
	}

	judul, isi := strings.TrimSpace(req.Judul), req.Isi
	if req.TemplateID != nil && *req.TemplateID > 0 {
		var t Template
		if err := s.db.First(&t, *req.TemplateID).Error; err != nil {
			return nil, errors.New("template informed consent tidak ditemukan")
		}
		judul, isi = t.Judul, t.Isi
	}
	if judul == "" || strings.TrimSpace(isi) == "" {
		return nil, errors.New("pilih template atau isi judul dan isi consent")
	}
	if strings.TrimSpace(req.NamaPenandatangan) == "" || strings.TrimSpace(req.TtdPasienURL) == "" {
		return nil, errors.New("nama dan tanda tangan penandatangan wajib diisi")
	}

	namaDokter := ""
	if pw.Staff != nil {
		namaDokter = pw.Staff.Nama
	}
	if req.DokterID != nil && *req.DokterID > 0 {
		var d staff.Staff
		if err := s.db.First(&d, *req.DokterID).Error; err != nil {
			return nil, errors.New("dokter tidak ditemukan")
		}
		namaDokter = d.Nama
	} else {
		req.DokterID = nil
	}
	var treatments []string
	seen := map[string]bool{}
	for _, t := range pw.Tindakans {
		if t.Treatment != nil && !seen[t.Treatment.Nama] {
			seen[t.Treatment.Nama] = true
			treatments = append(treatments, t.Treatment.Nama)
		}
	}
	if len(treatments) == 0 && pw.Treatment != nil {
		treatments = append(treatments, pw.Treatment.Nama)
	}
	var namaPasien, kodePasien string
	if pw.Pasien != nil {
		namaPasien, kodePasien = pw.Pasien.Nama, pw.Pasien.Kode
	}

	now := time.Now()
	vals := map[string]string{
		"nama_pasien": namaPasien, "kode_pasien": kodePasien, "tanggal": TanggalIndonesia(now),
		"nama_dokter": namaDokter, "treatment": strings.Join(treatments, ", "),
	}
	item := &PerawatanConsent{
		PerawatanID: pw.ID, PasienID: pw.PasienID, TemplateID: req.TemplateID,
		Judul: IsiPlaceholders(judul, vals), Isi: IsiPlaceholders(isi, vals),
		NamaPenandatangan: strings.TrimSpace(req.NamaPenandatangan), Hubungan: strings.TrimSpace(req.Hubungan),
		TtdPasienURL: strings.TrimSpace(req.TtdPasienURL), DokterID: req.DokterID, TtdDokterURL: strings.TrimSpace(req.TtdDokterURL),
		Saksi: strings.TrimSpace(req.Saksi), SignedAt: now, Status: ConsentAktif,
	}
	if item.Hubungan == "" {
		item.Hubungan = "Pasien sendiri"
	}
	if userID > 0 {
		item.CreatedBy = &userID
	}
	if err := s.db.Create(item).Error; err != nil {
		return nil, err
	}
	return s.Get(item.ID)
}

func (s *ConsentService) Batal(id uint, alasan string, userID uint) (*PerawatanConsent, error) {
	alasan = strings.TrimSpace(alasan)
	if alasan == "" {
		return nil, errors.New("alasan pembatalan wajib diisi")
	}
	err := s.db.Transaction(func(tx *gorm.DB) error {
		var item PerawatanConsent
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&item, id).Error; err != nil {
			return err
		}
		if item.Status == ConsentDibatalkan {
			return errors.New("consent sudah dibatalkan")
		}
		now := time.Now()
		updates := map[string]any{"status": ConsentDibatalkan, "alasan_batal": alasan, "dibatalkan_at": now}
		if userID > 0 {
			updates["dibatalkan_oleh"] = userID
		}
		return tx.Model(&item).Updates(updates).Error
	})
	if err != nil {
		return nil, err
	}
	return s.Get(id)
}

type ConsentHandler struct{ svc *ConsentService }

func consentFail(c *gin.Context, err error) {
	if errors.Is(err, gorm.ErrRecordNotFound) {
		response.NotFound(c, "data tidak ditemukan")
		return
	}
	response.BadRequest(c, err.Error(), nil)
}

func paramID(c *gin.Context, name string) uint {
	id, _ := strconv.ParseUint(c.Param(name), 10, 64)
	return uint(id)
}

func (h *ConsentHandler) Index(c *gin.Context) {
	items, err := h.svc.List(paramID(c, "id"))
	if err != nil {
		response.Internal(c, err.Error())
		return
	}
	response.OK(c, items, "ok")
}

func (h *ConsentHandler) Store(c *gin.Context) {
	var req ConsentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "validation failed", err.Error())
		return
	}
	item, err := h.svc.Create(paramID(c, "id"), req, c.GetUint(middleware.ContextUserID))
	if err != nil {
		consentFail(c, err)
		return
	}
	response.Created(c, item, "consent tersimpan")
}

func (h *ConsentHandler) Show(c *gin.Context) {
	item, err := h.svc.Get(paramID(c, "cid"))
	if err != nil {
		response.NotFound(c, "consent tidak ditemukan")
		return
	}
	response.OK(c, item, "ok")
}

func (h *ConsentHandler) Batal(c *gin.Context) {
	var req BatalConsentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, http.StatusBadRequest, "alasan pembatalan wajib diisi", nil)
		return
	}
	item, err := h.svc.Batal(paramID(c, "cid"), req.Alasan, c.GetUint(middleware.ContextUserID))
	if err != nil {
		consentFail(c, err)
		return
	}
	response.OK(c, item, "consent dibatalkan")
}

// RegisterConsentRoutes mounts consents under their perawatan; single-consent routes
// live under /perawatan-consent so they do not clash with /perawatan/:id wildcards.
func RegisterConsentRoutes(rg *gin.RouterGroup, db *gorm.DB) {
	h := &ConsentHandler{svc: &ConsentService{db: db}}
	rg.GET("/perawatan/:id/consent", h.Index)
	rg.POST("/perawatan/:id/consent", h.Store)
	rg.GET("/perawatan-consent/:cid", h.Show)
	rg.POST("/perawatan-consent/:cid/batal", h.Batal)
}
