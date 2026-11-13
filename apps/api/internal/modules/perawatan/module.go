package perawatan

import (
	"errors"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/scaleup/clinic-v2/api/internal/platform/generator"
	"github.com/scaleup/clinic-v2/api/internal/platform/pagination"
	"github.com/scaleup/clinic-v2/api/internal/platform/response"
	"gorm.io/datatypes"
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

type TindakanInput struct {
	TreatmentID  uint    `json:"treatment_id"`
	Tanggal      string  `json:"tanggal"`
	Jumlah       int     `json:"jumlah"`
	BeauticianID *uint   `json:"beautician_id"`
	Harga        float64 `json:"harga"`
	Diskon       float64 `json:"diskon"`
	RpPercent    float64 `json:"rp_percent"`
	Total        float64 `json:"total"`
	Status       string  `json:"status"`
	Catatan      string  `json:"catatan"`
}

type ResepBarangInput struct {
	BarangID   uint    `json:"barang_id"`
	KodeBarang string  `json:"kode_barang"`
	NamaBarang string  `json:"nama_barang"`
	Jumlah     float64 `json:"jumlah"`
	Unit       string  `json:"unit"`
	Harga      float64 `json:"harga"`
	Total      float64 `json:"total"`
}

type ResepInput struct {
	AntrianID *uint              `json:"antrian_id"`
	PasienID  *uint              `json:"pasien_id"`
	StaffID   *uint              `json:"staff_id"`
	Tanggal   string             `json:"tanggal"`
	Status    string             `json:"status"`
	Barangs   []ResepBarangInput `json:"barangs"`
}

type UpsertRequest struct {
	PasienID            uint            `json:"pasien_id" binding:"required"`
	TreatmentID         *uint           `json:"treatment_id"`
	StaffID             uint            `json:"staff_id" binding:"required"`
	AntrianID           *uint           `json:"antrian_id"`
	Tanggal             string          `json:"tanggal"`
	JamMulai            string          `json:"jam_mulai"`
	JamSelesai          string          `json:"jam_selesai"`
	Status              string          `json:"status"`
	Anamnesis           string          `json:"anamnesis"`
	PemeriksaanAwal     string          `json:"pemeriksaan_awal"`
	Pemeriksaan         string          `json:"pemeriksaan"`
	Diagnosa            string          `json:"diagnosa"`
	Tindakan            string          `json:"tindakan"`
	Catatan             string          `json:"catatan"`
	Biaya               float64         `json:"biaya"`
	KunjunganBerikutnya string          `json:"kunjungan_berikutnya"`
	FotoPerawatan       datatypes.JSON  `json:"foto_perawatan"`
	FotoSebelum         datatypes.JSON  `json:"foto_sebelum"`
	FotoSesudah         datatypes.JSON  `json:"foto_sesudah"`
	IsActive            *bool           `json:"is_active"`
	Tindakans           []TindakanInput `json:"tindakans"`
	Reseps              []ResepInput    `json:"reseps"`
}

type StatusRequest struct {
	Status string `json:"status" binding:"required"`
}

type Handler struct{ svc *Service }

func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

func parseDate(s string) (time.Time, error) {
	if s == "" {
		return time.Now(), nil
	}
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

func (s *Service) preload(q *gorm.DB) *gorm.DB {
	return q.Preload("Pasien").Preload("Staff").Preload("Treatment").
		Preload("Tindakans").Preload("Reseps.Barangs")
}

func (s *Service) List(p pagination.Params, f ListFilters) ([]Perawatan, pagination.Meta, error) {
	q := s.preload(s.repo.db.Model(&Perawatan{}))
	q = applyListFilters(q, f)
	if p.Search != "" {
		like := "%" + p.Search + "%"
		q = q.Where("kode ILIKE ? OR status ILIKE ? OR diagnosa ILIKE ?", like, like, like)
	}
	var items []Perawatan
	meta, err := pagination.Paginate(q, p, &items)
	return items, meta, err
}

func (s *Service) Get(id uint) (*Perawatan, error) {
	var item Perawatan
	if err := s.preload(s.repo.db).First(&item, id).Error; err != nil {
		return nil, err
	}
	return &item, nil
}

func (s *Service) applyFields(item *Perawatan, req UpsertRequest) error {
	tanggal, err := parseDate(req.Tanggal)
	if err != nil {
		return err
	}
	item.PasienID = req.PasienID
	item.TreatmentID = req.TreatmentID
	item.StaffID = req.StaffID
	item.AntrianID = req.AntrianID
	item.Tanggal = tanggal
	item.JamMulai = req.JamMulai
	item.JamSelesai = req.JamSelesai
	if req.Status != "" {
		item.Status = req.Status
	}
	item.Anamnesis = req.Anamnesis
	item.PemeriksaanAwal = req.PemeriksaanAwal
	item.Pemeriksaan = req.Pemeriksaan
	item.Diagnosa = req.Diagnosa
	item.Tindakan = req.Tindakan
	item.Catatan = req.Catatan
	item.Biaya = req.Biaya
	item.FotoPerawatan = req.FotoPerawatan
	item.FotoSebelum = req.FotoSebelum
	item.FotoSesudah = req.FotoSesudah
	if req.KunjunganBerikutnya != "" {
		if t, err := parseDate(req.KunjunganBerikutnya); err == nil {
			item.KunjunganBerikutnya = &t
		}
	}
	if req.IsActive != nil {
		item.IsActive = *req.IsActive
	}
	return nil
}

func (s *Service) syncNested(tx *gorm.DB, perawatanID uint, req UpsertRequest) error {
	if req.Tindakans != nil {
		tx.Where("perawatan_id = ?", perawatanID).Delete(&PerawatanTindakan{})
		for _, t := range req.Tindakans {
			tanggal, _ := parseDate(t.Tanggal)
			status := t.Status
			if status == "" {
				status = "draft"
			}
			jumlah := t.Jumlah
			if jumlah == 0 {
				jumlah = 1
			}
			row := PerawatanTindakan{
				PerawatanID: perawatanID, TreatmentID: t.TreatmentID, Tanggal: tanggal,
				Jumlah: jumlah, BeauticianID: t.BeauticianID, Harga: t.Harga, Diskon: t.Diskon,
				RpPercent: t.RpPercent, Total: t.Total, Status: status, Catatan: t.Catatan, IsActive: true,
			}
			if err := tx.Create(&row).Error; err != nil {
				return err
			}
		}
	}
	if req.Reseps != nil {
		var existing []PerawatanResep
		tx.Where("perawatan_id = ?", perawatanID).Find(&existing)
		for _, e := range existing {
			tx.Where("perawatan_resep_id = ?", e.ID).Delete(&PerawatanResepBarang{})
		}
		tx.Where("perawatan_id = ?", perawatanID).Delete(&PerawatanResep{})
		for _, r := range req.Reseps {
			tanggal, _ := parseDate(r.Tanggal)
			status := r.Status
			if status == "" {
				status = "draft"
			}
			kode, err := s.gen.Generate("RES")
			if err != nil {
				return err
			}
			resep := PerawatanResep{
				PerawatanID: perawatanID, AntrianID: r.AntrianID, PasienID: r.PasienID,
				StaffID: r.StaffID, Kode: kode, Tanggal: tanggal, Status: status, IsActive: true,
			}
			if err := tx.Create(&resep).Error; err != nil {
				return err
			}
			for _, b := range r.Barangs {
				row := PerawatanResepBarang{
					PerawatanResepID: resep.ID, BarangID: b.BarangID, KodeBarang: b.KodeBarang,
					NamaBarang: b.NamaBarang, Jumlah: b.Jumlah, Unit: b.Unit, Harga: b.Harga,
					Total: b.Total, IsActive: true,
				}
				if err := tx.Create(&row).Error; err != nil {
					return err
				}
			}
		}
	}
	return nil
}

func antrianStatusForPerawatan(status string) string {
	switch status {
	case "proses", "diproses":
		return "diproses"
	case "selesai", "bayar":
		return "bayar"
	case "batal", "dibatalkan":
		return "batal"
	default:
		return ""
	}
}

func (s *Service) syncLinkedAntrian(tx *gorm.DB, antrianID *uint, perawatanStatus string) error {
	if antrianID == nil || *antrianID == 0 {
		return nil
	}
	next := antrianStatusForPerawatan(perawatanStatus)
	if next == "" {
		return nil
	}
	return tx.Table("antrians").Where("id = ?", *antrianID).Update("status", next).Error
}

func (s *Service) Create(req UpsertRequest) (*Perawatan, error) {
	kode, err := s.gen.Generate("PRW")
	if err != nil {
		return nil, err
	}
	item := &Perawatan{Kode: kode, Status: "draft", IsActive: true}
	if err := s.applyFields(item, req); err != nil {
		return nil, err
	}
	err = s.repo.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(item).Error; err != nil {
			return err
		}
		if err := s.syncNested(tx, item.ID, req); err != nil {
			return err
		}
		return s.syncLinkedAntrian(tx, item.AntrianID, item.Status)
	})
	if err != nil {
		return nil, err
	}
	return s.Get(item.ID)
}

var ErrPerawatanTerkunci = errors.New("perawatan sudah dibayar; tindakan dan resep tidak bisa diubah")

func (s *Service) Update(id uint, req UpsertRequest) (*Perawatan, error) {
	item, err := s.Get(id)
	if err != nil {
		return nil, err
	}
	// Once paid, tindakan and resep are billed and resep stock is out; rewriting them would desync both.
	if item.Status == "selesai" && (req.Tindakans != nil || req.Reseps != nil) {
		return nil, ErrPerawatanTerkunci
	}
	if err := s.applyFields(item, req); err != nil {
		return nil, err
	}
	err = s.repo.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Save(item).Error; err != nil {
			return err
		}
		if err := s.syncNested(tx, item.ID, req); err != nil {
			return err
		}
		return s.syncLinkedAntrian(tx, item.AntrianID, item.Status)
	})
	if err != nil {
		return nil, err
	}
	return s.Get(id)
}

func (s *Service) UpdateStatus(id uint, status string) (*Perawatan, error) {
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
	return s.repo.db.Transaction(func(tx *gorm.DB) error {
		var reseps []PerawatanResep
		tx.Where("perawatan_id = ?", id).Find(&reseps)
		for _, r := range reseps {
			tx.Where("perawatan_resep_id = ?", r.ID).Delete(&PerawatanResepBarang{})
		}
		tx.Where("perawatan_id = ?", id).Delete(&PerawatanResep{})
		tx.Where("perawatan_id = ?", id).Delete(&PerawatanTindakan{})
		return tx.Delete(&Perawatan{}, id).Error
	})
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
		response.NotFound(c, "perawatan not found")
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
		response.Internal(c, err.Error())
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
		if errors.Is(err, ErrPerawatanTerkunci) {
			response.BadRequest(c, err.Error(), nil)
			return
		}
		response.Internal(c, err.Error())
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

func (h *Handler) UpdateStatus(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	var req StatusRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "validation failed", err.Error())
		return
	}
	item, err := h.svc.UpdateStatus(uint(id), req.Status)
	if err != nil {
		response.Internal(c, err.Error())
		return
	}
	response.OK(c, item, "status updated")
}

func (s *Service) ListResep(p pagination.Params, status string) ([]PerawatanResep, pagination.Meta, error) {
	q := s.repo.db.Model(&PerawatanResep{}).Preload("Pasien").Preload("Staff").Preload("Barangs")
	if status != "" {
		q = q.Where("status IN ?", strings.Split(status, ","))
	}
	if p.Search != "" {
		like := "%" + p.Search + "%"
		q = q.Where("kode ILIKE ? OR pasien_id IN (SELECT id FROM pasiens WHERE nama ILIKE ? OR kode ILIKE ?)", like, like, like)
	}
	var items []PerawatanResep
	meta, err := pagination.Paginate(q, p, &items)
	return items, meta, err
}

func (s *Service) SerahkanResep(id uint) (*PerawatanResep, error) {
	res := s.repo.db.Model(&PerawatanResep{}).
		Where("id = ? AND status = ?", id, ResepStatusDibayar).
		Update("status", ResepStatusDiserahkan)
	if res.Error != nil {
		return nil, res.Error
	}
	if res.RowsAffected == 0 {
		return nil, errors.New("resep tidak ditemukan atau belum dibayar")
	}
	var item PerawatanResep
	if err := s.repo.db.Preload("Pasien").Preload("Staff").Preload("Barangs").First(&item, id).Error; err != nil {
		return nil, err
	}
	return &item, nil
}

func (h *Handler) IndexResep(c *gin.Context) {
	items, meta, err := h.svc.ListResep(pagination.FromContext(c), c.Query("status"))
	if err != nil {
		response.Internal(c, err.Error())
		return
	}
	response.OKWithMeta(c, items, meta, "ok")
}

func (h *Handler) SerahkanResep(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	item, err := h.svc.SerahkanResep(uint(id))
	if err != nil {
		response.BadRequest(c, err.Error(), nil)
		return
	}
	response.OK(c, item, "resep diserahkan")
}

func RegisterRoutes(rg *gin.RouterGroup, db *gorm.DB, gen *generator.Service) {
	h := NewHandler(NewService(NewRepository(db), gen))
	g := rg.Group("/perawatan")
	{
		g.GET("", h.Index)
		g.POST("", h.Store)
		g.GET("/:id", h.Show)
		g.PUT("/:id", h.Update)
		g.DELETE("/:id", h.Destroy)
		g.PATCH("/:id/status", h.UpdateStatus)
	}
	r := rg.Group("/resep")
	{
		r.GET("", h.IndexResep)
		r.PATCH("/:id/serahkan", h.SerahkanResep)
	}
}
