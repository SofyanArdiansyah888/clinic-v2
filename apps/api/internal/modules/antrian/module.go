package antrian

import (
	"errors"
	"fmt"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/scaleup/clinic-v2/api/internal/modules/pasien"
	"github.com/scaleup/clinic-v2/api/internal/platform/generator"
	"github.com/scaleup/clinic-v2/api/internal/platform/pagination"
	"github.com/scaleup/clinic-v2/api/internal/platform/response"
	"gorm.io/gorm"
)

type Repository struct{ db *gorm.DB }

func NewRepository(db *gorm.DB) *Repository { return &Repository{db: db} }

type Service struct {
	repo *Repository
	gen  *generator.Service
}

func NewService(repo *Repository, gen *generator.Service) *Service {
	return &Service{repo: repo, gen: gen}
}

type UpsertRequest struct {
	PasienID   uint   `json:"pasien_id" binding:"required"`
	StaffID    uint   `json:"staff_id" binding:"required"`
	Tanggal    string `json:"tanggal" binding:"required"`
	Jam        string `json:"jam"`
	Status     string `json:"status"`
	Keterangan string `json:"keterangan"`
	IsActive   *bool  `json:"is_active"`
}

type CreatePasienAntrianRequest struct {
	PasienID     *uint  `json:"pasien_id"`
	Nama         string `json:"nama"`
	NoTelp       string `json:"no_telp"`
	Alamat       string `json:"alamat"`
	Email        string `json:"email"`
	TanggalLahir string `json:"tanggal_lahir"`
	JenisKelamin string `json:"jenis_kelamin"`
	StaffID      uint   `json:"staff_id" binding:"required"`
	Tanggal      string `json:"tanggal" binding:"required"`
	Jam          string `json:"jam"`
	Keterangan   string `json:"keterangan"`
}

type Handler struct{ svc *Service }

func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

// ValidStatus is the queue lifecycle: menunggu → dipanggil → diproses → bayar → selesai, or batal.
var ValidStatus = map[string]bool{
	"menunggu": true, "dipanggil": true, "diproses": true, "bayar": true, "selesai": true, "batal": true,
}

func checkStatus(status string) error {
	if status != "" && !ValidStatus[status] {
		return fmt.Errorf("status antrian %q tidak dikenal", status)
	}
	return nil
}

// fail maps service errors: missing rows are 404, everything else the caller sent is 400.
func fail(c *gin.Context, err error) {
	if errors.Is(err, gorm.ErrRecordNotFound) {
		response.NotFound(c, "data tidak ditemukan")
		return
	}
	response.BadRequest(c, err.Error(), nil)
}

func parseDate(s string) (time.Time, error) {
	if t, err := time.Parse("2006-01-02", s); err == nil {
		return t, nil
	}
	return time.Parse(time.RFC3339, s)
}

type ListFilters struct {
	Status  string
	Tanggal string
}

func filtersFromContext(c *gin.Context) ListFilters {
	return ListFilters{
		Status:  c.Query("status"),
		Tanggal: c.Query("tanggal"),
	}
}

func applyListFilters(q *gorm.DB, f ListFilters) *gorm.DB {
	if f.Status != "" {
		q = q.Where("status = ?", f.Status)
	}
	if f.Tanggal != "" {
		q = q.Where("tanggal = ?", f.Tanggal)
	}
	return q
}

func (s *Service) List(p pagination.Params, f ListFilters) ([]Antrian, pagination.Meta, error) {
	q := s.repo.db.Model(&Antrian{}).Preload("Pasien").Preload("Staff")
	q = applyListFilters(q, f)
	if p.Search != "" {
		like := "%" + p.Search + "%"
		q = q.Where("kode ILIKE ? OR status ILIKE ? OR keterangan ILIKE ?", like, like, like)
	}
	var items []Antrian
	meta, err := pagination.Paginate(q, p, &items)
	return items, meta, err
}

func (s *Service) Get(id uint) (*Antrian, error) {
	var item Antrian
	if err := s.repo.db.Preload("Pasien").Preload("Staff").First(&item, id).Error; err != nil {
		return nil, err
	}
	return &item, nil
}

func (s *Service) Create(req UpsertRequest) (*Antrian, error) {
	if err := checkStatus(req.Status); err != nil {
		return nil, err
	}
	kode, err := s.gen.Generate("ANT")
	if err != nil {
		return nil, err
	}
	tanggal, err := parseDate(req.Tanggal)
	if err != nil {
		return nil, err
	}
	jam := req.Jam
	if jam == "" {
		jam = time.Now().Format("15:04:05")
	}
	status := req.Status
	if status == "" {
		status = "menunggu"
	}
	item := &Antrian{
		Kode: kode, PasienID: req.PasienID, StaffID: req.StaffID,
		Tanggal: tanggal, Jam: jam, Status: status, Keterangan: req.Keterangan, IsActive: true,
	}
	if req.IsActive != nil {
		item.IsActive = *req.IsActive
	}
	if err := s.repo.db.Create(item).Error; err != nil {
		return nil, err
	}
	return s.Get(item.ID)
}

func (s *Service) Update(id uint, req UpsertRequest) (*Antrian, error) {
	if err := checkStatus(req.Status); err != nil {
		return nil, err
	}
	item, err := s.Get(id)
	if err != nil {
		return nil, err
	}
	tanggal, err := parseDate(req.Tanggal)
	if err != nil {
		return nil, err
	}
	item.PasienID = req.PasienID
	item.StaffID = req.StaffID
	item.Tanggal = tanggal
	if req.Jam != "" {
		item.Jam = req.Jam
	}
	if req.Status != "" {
		item.Status = req.Status
	}
	item.Keterangan = req.Keterangan
	if req.IsActive != nil {
		item.IsActive = *req.IsActive
	}
	if err := s.repo.db.Save(item).Error; err != nil {
		return nil, err
	}
	return s.Get(id)
}

type StatusRequest struct {
	Status string `json:"status" binding:"required"`
}

func (s *Service) UpdateStatus(id uint, status string) (*Antrian, error) {
	if err := checkStatus(status); err != nil {
		return nil, err
	}
	item, err := s.Get(id)
	if err != nil {
		return nil, err
	}
	item.Status = status
	if err := s.repo.db.Save(item).Error; err != nil {
		return nil, err
	}
	return s.Get(id)
}

func (s *Service) Delete(id uint) error {
	return s.repo.db.Delete(&Antrian{}, id).Error
}

func (s *Service) CreatePasienAntrian(req CreatePasienAntrianRequest) (map[string]interface{}, error) {
	var result map[string]interface{}
	err := s.repo.db.Transaction(func(tx *gorm.DB) error {
		var pasienID uint
		var p *pasien.Pasien

		if req.PasienID != nil && *req.PasienID > 0 {
			pasienID = *req.PasienID
			var existing pasien.Pasien
			if err := tx.First(&existing, pasienID).Error; err != nil {
				return err
			}
			p = &existing
		} else {
			if req.Nama == "" || req.NoTelp == "" {
				return gorm.ErrInvalidData
			}
			kodePas, err := s.gen.Generate("PAS")
			if err != nil {
				return err
			}
			np := &pasien.Pasien{
				Kode: kodePas, Nama: req.Nama, Alamat: req.Alamat,
				NoTelp: req.NoTelp, Email: req.Email, JenisKelamin: req.JenisKelamin, IsActive: true,
			}
			if req.TanggalLahir != "" {
				if t, err := parseDate(req.TanggalLahir); err == nil {
					np.TanggalLahir = &t
				}
			}
			if err := tx.Create(np).Error; err != nil {
				return err
			}
			pasienID = np.ID
			p = np
		}

		kode, err := s.gen.Generate("ANT")
		if err != nil {
			return err
		}
		tanggal, err := parseDate(req.Tanggal)
		if err != nil {
			return err
		}
		jam := req.Jam
		if jam == "" {
			jam = time.Now().Format("15:04:05")
		}
		a := &Antrian{
			Kode: kode, PasienID: pasienID, StaffID: req.StaffID,
			Tanggal: tanggal, Jam: jam, Status: "menunggu", Keterangan: req.Keterangan, IsActive: true,
		}
		if err := tx.Create(a).Error; err != nil {
			return err
		}
		if err := tx.Preload("Pasien").Preload("Staff").First(a, a.ID).Error; err != nil {
			return err
		}
		result = map[string]interface{}{"pasien": p, "antrian": a}
		return nil
	})
	return result, err
}

func (h *Handler) Index(c *gin.Context) {
	items, meta, err := h.svc.List(pagination.FromContext(c), filtersFromContext(c))
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
		response.NotFound(c, "antrian not found")
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

func (h *Handler) UpdateStatus(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	var req StatusRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "validation failed", err.Error())
		return
	}
	item, err := h.svc.UpdateStatus(uint(id), req.Status)
	if err != nil {
		fail(c, err)
		return
	}
	response.OK(c, item, "status updated")
}

func (h *Handler) Destroy(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	if err := h.svc.Delete(uint(id)); err != nil {
		response.Internal(c, err.Error())
		return
	}
	response.OK(c, nil, "deleted")
}

func (h *Handler) CreatePasienAntrian(c *gin.Context) {
	var req CreatePasienAntrianRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "validation failed", err.Error())
		return
	}
	data, err := h.svc.CreatePasienAntrian(req)
	if err != nil {
		response.BadRequest(c, "failed to create pasien+antrian", err.Error())
		return
	}
	response.Created(c, data, "pasien and antrian created")
}

func RegisterRoutes(rg *gin.RouterGroup, db *gorm.DB, gen *generator.Service) {
	h := NewHandler(NewService(NewRepository(db), gen))
	g := rg.Group("/antrian")
	{
		g.GET("", h.Index)
		g.POST("", h.Store)
		g.POST("/create-pasien-antrian", h.CreatePasienAntrian)
		g.GET("/:id", h.Show)
		g.PUT("/:id", h.Update)
		g.PATCH("/:id/status", h.UpdateStatus)
		g.DELETE("/:id", h.Destroy)
	}
}
