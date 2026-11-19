package treatment

import (
	"errors"
	"fmt"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/scaleup/clinic-v2/api/internal/platform/generator"
	"github.com/scaleup/clinic-v2/api/internal/platform/pagination"
	"github.com/scaleup/clinic-v2/api/internal/platform/response"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type Repository struct {
	db *gorm.DB
}

func NewRepository(db *gorm.DB) *Repository {
	return &Repository{db: db}
}

type Service struct {
	repo *Repository
	gen  *generator.Service
}

func NewService(repo *Repository, gen *generator.Service) *Service {
	return &Service{repo: repo, gen: gen}
}

type UpsertRequest struct {
	Nama          string  `json:"nama" binding:"required"`
	Kategori      string  `json:"kategori"`
	Harga         float64 `json:"harga"`
	Durasi        int     `json:"durasi"`
	SesiPaket     *int    `json:"sesi_paket"`
	KomisiDokter  float64 `json:"komisi_dokter"`
	KomisiTerapis float64 `json:"komisi_terapis"`
	Deskripsi     string  `json:"deskripsi"`
	IsActive      *bool   `json:"is_active"`
	// Items is the content of a paket treatment. Leave it out to keep the current
	// items; a paket without items gets one item pointing at itself (sesi_paket sessions).
	Items *[]ItemInput `json:"items"`
}

type ItemInput struct {
	TreatmentID uint `json:"treatment_id"`
	Sesi        int  `json:"sesi"`
}

// ErrValidasi marks a request the user can fix (400 rather than 500).
type ErrValidasi struct{ msg string }

func (e ErrValidasi) Error() string { return e.msg }

func invalid(format string, a ...any) error { return ErrValidasi{fmt.Sprintf(format, a...)} }

type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

func (s *Service) List(p pagination.Params) ([]Treatment, pagination.Meta, error) {
	q := s.repo.db.Model(&Treatment{}).Preload("Items", orderItems).Preload("Items.Treatment")
	if p.Search != "" {
		like := "%" + p.Search + "%"
		q = q.Where("nama ILIKE ? OR kode ILIKE ? OR kategori ILIKE ?", like, like, like)
	}
	var items []Treatment
	meta, err := pagination.Paginate(q, p, &items)
	return items, meta, err
}

func (s *Service) Get(id uint) (*Treatment, error) {
	var item Treatment
	if err := s.repo.db.Preload("Items", orderItems).Preload("Items.Treatment").First(&item, id).Error; err != nil {
		return nil, err
	}
	return &item, nil
}

func orderItems(q *gorm.DB) *gorm.DB { return q.Order("id") }

func (s *Service) Create(req UpsertRequest) (*Treatment, error) {
	kode, err := s.gen.Generate("TRT")
	if err != nil {
		return nil, err
	}
	item := &Treatment{Kode: kode, IsActive: true}
	if err := applyFields(item, req); err != nil {
		return nil, err
	}
	err = s.repo.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Omit(clause.Associations).Create(item).Error; err != nil {
			return err
		}
		return syncItems(tx, item, req.Items)
	})
	if err != nil {
		return nil, err
	}
	return s.Get(item.ID)
}

func (s *Service) Update(id uint, req UpsertRequest) (*Treatment, error) {
	item, err := s.Get(id)
	if err != nil {
		return nil, err
	}
	if err := applyFields(item, req); err != nil {
		return nil, err
	}
	err = s.repo.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Omit(clause.Associations).Save(item).Error; err != nil {
			return err
		}
		return syncItems(tx, item, req.Items)
	})
	if err != nil {
		return nil, err
	}
	return s.Get(id)
}

func applyFields(item *Treatment, req UpsertRequest) error {
	item.Nama = req.Nama
	item.Kategori = req.Kategori
	item.Harga = req.Harga
	item.Durasi = req.Durasi
	if req.SesiPaket != nil {
		if *req.SesiPaket < 0 {
			return invalid("sesi_paket tidak boleh negatif")
		}
		item.SesiPaket = *req.SesiPaket
	}
	item.KomisiDokter = req.KomisiDokter
	item.KomisiTerapis = req.KomisiTerapis
	item.Deskripsi = req.Deskripsi
	if req.IsActive != nil {
		item.IsActive = *req.IsActive
	}
	return nil
}

// syncItems stores what a paket contains and keeps sesi_paket equal to the total
// sessions. Items must be non-paket treatments (no nesting), each listed once, with
// at least one session. A treatment that is not a paket has no items.
func syncItems(tx *gorm.DB, item *Treatment, input *[]ItemInput) error {
	if !item.IsPaket() {
		return tx.Where("paket_treatment_id = ?", item.ID).Delete(&PaketItem{}).Error
	}
	var rows []ItemInput
	if input == nil {
		// Keep the current content. A paket that only contains itself follows sesi_paket
		// from the plain form; otherwise sesi_paket stays the sum of the items.
		var current []PaketItem
		if err := tx.Where("paket_treatment_id = ?", item.ID).Order("id").Find(&current).Error; err != nil {
			return err
		}
		for _, c := range current {
			rows = append(rows, ItemInput{TreatmentID: c.TreatmentID, Sesi: c.Sesi})
		}
		if len(rows) == 1 && rows[0].TreatmentID == item.ID && item.SesiPaket > 0 {
			rows[0].Sesi = item.SesiPaket
		}
	} else {
		rows = *input
	}
	if len(rows) == 0 {
		sesi := item.SesiPaket
		if sesi <= 0 {
			sesi = 1
		}
		rows = []ItemInput{{TreatmentID: item.ID, Sesi: sesi}}
	}
	seen := map[uint]bool{}
	total := 0
	for i, r := range rows {
		if r.TreatmentID == 0 {
			return invalid("item paket baris %d: treatment wajib dipilih", i+1)
		}
		if r.Sesi <= 0 {
			return invalid("item paket baris %d: jumlah sesi harus lebih dari 0", i+1)
		}
		if seen[r.TreatmentID] {
			return invalid("item paket baris %d: treatment yang sama dipilih dua kali", i+1)
		}
		seen[r.TreatmentID] = true
		if r.TreatmentID != item.ID {
			var t Treatment
			if err := tx.First(&t, r.TreatmentID).Error; err != nil {
				if errors.Is(err, gorm.ErrRecordNotFound) {
					return invalid("item paket baris %d: treatment #%d tidak ditemukan", i+1, r.TreatmentID)
				}
				return err
			}
			if t.IsPaket() {
				return invalid("item paket baris %d: %s adalah paket; paket tidak bisa berisi paket lain", i+1, t.Nama)
			}
		}
		total += r.Sesi
	}
	if err := tx.Where("paket_treatment_id = ?", item.ID).Delete(&PaketItem{}).Error; err != nil {
		return err
	}
	for _, r := range rows {
		if err := tx.Create(&PaketItem{PaketTreatmentID: item.ID, TreatmentID: r.TreatmentID, Sesi: r.Sesi}).Error; err != nil {
			return err
		}
	}
	item.SesiPaket = total
	return tx.Model(&Treatment{}).Where("id = ?", item.ID).Update("sesi_paket", total).Error
}

func (s *Service) Delete(id uint) error {
	return s.repo.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("paket_treatment_id = ?", id).Delete(&PaketItem{}).Error; err != nil {
			return err
		}
		return tx.Delete(&Treatment{}, id).Error
	})
}

func fail(c *gin.Context, err error) {
	var v ErrValidasi
	switch {
	case errors.As(err, &v):
		response.BadRequest(c, v.msg, nil)
	case errors.Is(err, gorm.ErrRecordNotFound):
		response.NotFound(c, "treatment not found")
	default:
		response.Internal(c, err.Error())
	}
}

func (h *Handler) Index(c *gin.Context) {
	items, meta, err := h.svc.List(pagination.FromContext(c))
	if err != nil {
		response.Internal(c, err.Error())
		return
	}
	response.OKWithMeta(c, items, meta, "ok")
}

func (h *Handler) Show(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	item, err := h.svc.Get(uint(id))
	if err != nil {
		response.NotFound(c, "treatment not found")
		return
	}
	response.OK(c, item, "ok")
}

func (h *Handler) Store(c *gin.Context) {
	var req UpsertRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "validation failed", err.Error())
		return
	}
	item, err := h.svc.Create(req)
	if err != nil {
		fail(c, err)
		return
	}
	response.Created(c, item, "created")
}

func (h *Handler) Update(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	var req UpsertRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "validation failed", err.Error())
		return
	}
	item, err := h.svc.Update(uint(id), req)
	if err != nil {
		fail(c, err)
		return
	}
	response.OK(c, item, "updated")
}

func (h *Handler) Destroy(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	if err := h.svc.Delete(uint(id)); err != nil {
		response.Internal(c, err.Error())
		return
	}
	response.OK(c, nil, "deleted")
}

func RegisterRoutes(rg *gin.RouterGroup, db *gorm.DB, gen *generator.Service) {
	h := NewHandler(NewService(NewRepository(db), gen))
	g := rg.Group("/treatment")
	{
		g.GET("", h.Index)
		g.POST("", h.Store)
		g.GET("/:id", h.Show)
		g.PUT("/:id", h.Update)
		g.DELETE("/:id", h.Destroy)
	}
}
