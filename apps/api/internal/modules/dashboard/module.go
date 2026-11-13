package dashboard

import (
	"time"

	"github.com/gin-gonic/gin"
	"github.com/scaleup/clinic-v2/api/internal/platform/response"
	"gorm.io/gorm"
)

type KPI struct {
	RevenueToday     float64 `json:"revenue_today"`
	VisitsToday      int64   `json:"visits_today"`
	NewPatientsToday int64   `json:"new_patients_today"`
	PendingQueue     int64   `json:"pending_queue"`
}

type Handler struct{ db *gorm.DB }

func NewHandler(db *gorm.DB) *Handler { return &Handler{db: db} }

func (h *Handler) KPI(c *gin.Context) {
	today := time.Now().Format("2006-01-02")
	var kpi KPI
	h.db.Table("penjualans").
		Where("DATE(tanggal) = ? AND status = ?", today, "paid").
		Select("COALESCE(SUM(total_harga - diskon_promo - diskon_voucher),0)").Scan(&kpi.RevenueToday)
	h.db.Table("antrians").Where("DATE(tanggal) = ?", today).Count(&kpi.VisitsToday)
	h.db.Table("pasiens").Where("DATE(created_at) = ?", today).Count(&kpi.NewPatientsToday)
	h.db.Table("antrians").Where("DATE(tanggal) = ? AND status = ?", today, "menunggu").Count(&kpi.PendingQueue)
	response.OK(c, kpi, "ok")
}

func RegisterRoutes(rg *gin.RouterGroup, db *gorm.DB) {
	h := NewHandler(db)
	g := rg.Group("/dashboard")
	{
		g.GET("/kpi", h.KPI)
	}
}
