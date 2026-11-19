package dashboard

import (
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/scaleup/clinic-v2/api/internal/modules/laporan"
	"github.com/scaleup/clinic-v2/api/internal/platform/branch"
	"github.com/scaleup/clinic-v2/api/internal/platform/middleware"
	"github.com/scaleup/clinic-v2/api/internal/platform/response"
	"gorm.io/gorm"
)

type KPI struct {
	RevenueToday     float64 `json:"revenue_today"`
	VisitsToday      int64   `json:"visits_today"`
	NewPatientsToday int64   `json:"new_patients_today"`
	PendingQueue     int64   `json:"pending_queue"`
}

type Handler struct {
	db      *gorm.DB
	laporan *laporan.Service
}

func NewHandler(db *gorm.DB) *Handler { return &Handler{db: db, laporan: laporan.NewService(db)} }

func (h *Handler) KPI(c *gin.Context) {
	today := time.Now().Format("2006-01-02")
	var kpi KPI
	cab := branch.From(c)
	cab.Scope(h.db.Table("penjualans"), "cabang_id").
		Where("DATE(tanggal) = ? AND status = ?", today, "paid").
		Select("COALESCE(SUM(total_harga - diskon_promo - diskon_voucher),0)").Scan(&kpi.RevenueToday)
	cab.Scope(h.db.Table("antrians"), "cabang_id").Where("DATE(tanggal) = ?", today).Count(&kpi.VisitsToday)
	// Pasien are shared by every branch, so new pasien are counted clinic-wide.
	h.db.Table("pasiens").Where("DATE(created_at) = ?", today).Count(&kpi.NewPatientsToday)
	cab.Scope(h.db.Table("antrians"), "cabang_id").Where("DATE(tanggal) = ? AND status = ?", today, "menunggu").Count(&kpi.PendingQueue)
	response.OK(c, kpi, "ok")
}

// ── Tren (dashboard charts) ──

type TrenHarian struct {
	Tanggal   string `json:"tanggal"`
	Kunjungan int64  `json:"kunjungan"`
	// Nil for roles that may not see revenue, so the field is left out entirely.
	Pendapatan *float64 `json:"pendapatan,omitempty"`
}

type TrenTreatment struct {
	Nama   string `json:"nama"`
	Jumlah int64  `json:"jumlah"`
}

type TrenPembayaran struct {
	JenisPembayaran string  `json:"jenis_pembayaran"`
	Total           float64 `json:"total"`
}

type Tren struct {
	Periode            laporan.Periode       `json:"periode"`
	Harian             []TrenHarian          `json:"harian"`
	TopTreatment       []TrenTreatment       `json:"top_treatment"`
	StatusAppointment  []laporan.StatusCount `json:"status_appointment"`
	PerJenisPembayaran []TrenPembayaran      `json:"per_jenis_pembayaran,omitempty"`
}

// Same roles as /laporan/fo: revenue figures stay with front office and finance.
func canSeeRevenue(role string) bool {
	return role == middleware.RoleAdmin || role == middleware.RoleStaff || role == middleware.RoleFinance
}

const topTreatmentLimit = 5

func (h *Handler) Tren(c *gin.Context) {
	hari, err := strconv.Atoi(c.DefaultQuery("hari", "7"))
	if err != nil || (hari != 7 && hari != 30) {
		response.BadRequest(c, "hari harus 7 atau 30", nil)
		return
	}
	now := time.Now()
	p := laporan.Periode{
		Dari:   now.AddDate(0, 0, -(hari - 1)).Format("2006-01-02"),
		Sampai: now.Format("2006-01-02"),
	}

	lap := h.laporan.For(c)
	fo, err := lap.Fo(p)
	if err != nil {
		response.Internal(c, err.Error())
		return
	}
	nurse, err := lap.Nurse(p)
	if err != nil {
		response.Internal(c, err.Error())
		return
	}

	revenue := canSeeRevenue(c.GetString(middleware.ContextRole))
	out := Tren{
		Periode:           p,
		Harian:            make([]TrenHarian, 0, len(fo.Harian)),
		TopTreatment:      make([]TrenTreatment, 0, topTreatmentLimit),
		StatusAppointment: fo.StatusAppointment,
	}
	if out.StatusAppointment == nil {
		out.StatusAppointment = []laporan.StatusCount{}
	}
	for _, d := range fo.Harian {
		row := TrenHarian{Tanggal: d.Tanggal, Kunjungan: d.Kunjungan}
		if revenue {
			v := d.Pendapatan
			row.Pendapatan = &v
		}
		out.Harian = append(out.Harian, row)
	}
	for i, t := range nurse.Treatment {
		if i == topTreatmentLimit {
			break
		}
		out.TopTreatment = append(out.TopTreatment, TrenTreatment{Nama: t.Nama, Jumlah: t.Jumlah})
	}
	if revenue {
		out.PerJenisPembayaran = make([]TrenPembayaran, 0, len(fo.PerJenisPembayaran))
		for _, j := range fo.PerJenisPembayaran {
			out.PerJenisPembayaran = append(out.PerJenisPembayaran, TrenPembayaran{JenisPembayaran: j.JenisPembayaran, Total: j.Total})
		}
	}
	response.OK(c, out, "ok")
}

func RegisterRoutes(rg *gin.RouterGroup, db *gorm.DB) {
	h := NewHandler(db)
	g := rg.Group("/dashboard")
	{
		g.GET("/kpi", h.KPI)
		g.GET("/tren", h.Tren)
	}
}
