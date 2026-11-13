package pengaturan

import (
	"errors"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/scaleup/clinic-v2/api/internal/platform/response"
	"gorm.io/gorm"
)

// Klinik is a single-row table holding the clinic identity printed on invoices and receipts.
type Klinik struct {
	ID             uint      `gorm:"primaryKey" json:"id"`
	Nama           string    `gorm:"size:150;not null" json:"nama"`
	Telepon        string    `gorm:"size:30" json:"telepon"`
	Email          string    `gorm:"size:150" json:"email"`
	Alamat         string    `gorm:"type:text" json:"alamat"`
	Garansi        string    `gorm:"type:text" json:"garansi"`
	CatatanInvoice string    `gorm:"type:text" json:"catatan_invoice"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

func (Klinik) TableName() string { return "pengaturan_kliniks" }

const klinikID = 1

type UpdateRequest struct {
	Nama           string `json:"nama" binding:"required"`
	Telepon        string `json:"telepon"`
	Email          string `json:"email" binding:"omitempty,email"`
	Alamat         string `json:"alamat"`
	Garansi        string `json:"garansi"`
	CatatanInvoice string `json:"catatan_invoice"`
}

type Service struct {
	db *gorm.DB
}

func NewService(db *gorm.DB) *Service {
	return &Service{db: db}
}

func (s *Service) Get() (*Klinik, error) {
	var item Klinik
	err := s.db.First(&item, klinikID).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return &Klinik{ID: klinikID}, nil
	}
	if err != nil {
		return nil, err
	}
	return &item, nil
}

func (s *Service) Update(req UpdateRequest) (*Klinik, error) {
	item, err := s.Get()
	if err != nil {
		return nil, err
	}
	item.Nama = req.Nama
	item.Telepon = req.Telepon
	item.Email = req.Email
	item.Alamat = req.Alamat
	item.Garansi = req.Garansi
	item.CatatanInvoice = req.CatatanInvoice
	// Save upserts on primary key, so the first update creates the row.
	if err := s.db.Save(item).Error; err != nil {
		return nil, err
	}
	return item, nil
}

type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

func (h *Handler) Show(c *gin.Context) {
	item, err := h.svc.Get()
	if err != nil {
		response.Internal(c, err.Error())
		return
	}
	response.OK(c, item, "ok")
}

func (h *Handler) Update(c *gin.Context) {
	var req UpdateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "validation failed", err.Error())
		return
	}
	item, err := h.svc.Update(req)
	if err != nil {
		response.Internal(c, err.Error())
		return
	}
	response.OK(c, item, "updated")
}

func RegisterRoutes(rg *gin.RouterGroup, db *gorm.DB) {
	h := NewHandler(NewService(db))
	g := rg.Group("/pengaturan/klinik")
	{
		g.GET("", h.Show)
		g.PUT("", h.Update)
	}
}
