package cabang

import (
	"errors"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/scaleup/clinic-v2/api/internal/platform/branch"
	"github.com/scaleup/clinic-v2/api/internal/platform/generator"
	"github.com/scaleup/clinic-v2/api/internal/platform/middleware"
	"github.com/scaleup/clinic-v2/api/internal/platform/pagination"
	"github.com/scaleup/clinic-v2/api/internal/platform/response"
	"gorm.io/gorm"
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
	Nama   string `json:"nama" binding:"required"`
	Alamat string `json:"alamat"`
	NoTelp string `json:"no_telp"`
	// Singkatan: 2-6 letters/digits, unique; derived from the name when empty.
	Singkatan string `json:"singkatan"`
	IsUtama   *bool  `json:"is_utama"`
	IsActive  *bool  `json:"is_active"`
}

// validationError is a request problem reported as 400.
type validationError struct{ msg string }

func (e validationError) Error() string { return e.msg }

func invalid(msg string) error { return validationError{msg} }

type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

func (s *Service) List(p pagination.Params) ([]Cabang, pagination.Meta, error) {
	q := s.repo.db.Model(&Cabang{}).Order("is_utama DESC, id ASC")
	if p.Search != "" {
		like := "%" + p.Search + "%"
		q = q.Where("nama ILIKE ? OR kode ILIKE ? OR singkatan ILIKE ?", like, like, like)
	}
	var items []Cabang
	meta, err := pagination.Paginate(q, p, &items)
	return items, meta, err
}

func (s *Service) Get(id uint) (*Cabang, error) {
	var item Cabang
	if err := s.repo.db.First(&item, id).Error; err != nil {
		return nil, err
	}
	return &item, nil
}

// apply copies the request onto item and validates it; the main-branch flag is handled by save.
func (s *Service) apply(item *Cabang, req UpsertRequest) error {
	item.Nama = req.Nama
	item.Alamat = req.Alamat
	item.NoTelp = req.NoTelp
	if req.IsActive != nil {
		item.IsActive = *req.IsActive
	}
	if req.Singkatan == "" {
		if item.Singkatan == "" {
			item.Singkatan = uniqueSingkatan(s.repo.db, deriveSingkatan(req.Nama), item.ID)
		}
		return nil
	}
	sk, ok := NormalizeSingkatan(req.Singkatan)
	if !ok {
		return invalid("singkatan harus 2-6 huruf atau angka, mis. JKS")
	}
	var n int64
	s.repo.db.Model(&Cabang{}).Where("singkatan = ? AND id <> ?", sk, item.ID).Count(&n)
	if n > 0 {
		return invalid("singkatan " + sk + " sudah dipakai cabang lain")
	}
	item.Singkatan = sk
	return nil
}

// save writes the branch; making it the main branch clears the flag on the others.
func (s *Service) save(item *Cabang, utama *bool) error {
	wasUtama := item.IsUtama
	if utama != nil {
		if wasUtama && !*utama {
			return invalid("jadikan cabang lain sebagai utama terlebih dahulu")
		}
		item.IsUtama = *utama
	}
	if item.IsUtama && !item.IsActive {
		return invalid("cabang utama tidak boleh nonaktif")
	}
	return s.repo.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Save(item).Error; err != nil {
			return err
		}
		if item.IsUtama && !wasUtama {
			return tx.Model(&Cabang{}).Where("id <> ? AND is_utama = ?", item.ID, true).Update("is_utama", false).Error
		}
		return nil
	})
}

func (s *Service) Create(req UpsertRequest) (*Cabang, error) {
	kode, err := s.gen.Generate("CAB")
	if err != nil {
		return nil, err
	}
	item := &Cabang{Kode: kode, IsActive: true}
	if err := s.apply(item, req); err != nil {
		return nil, err
	}
	if err := s.save(item, req.IsUtama); err != nil {
		return nil, err
	}
	return item, nil
}

func (s *Service) Update(id uint, req UpsertRequest) (*Cabang, error) {
	item, err := s.Get(id)
	if err != nil {
		return nil, err
	}
	if err := s.apply(item, req); err != nil {
		return nil, err
	}
	if err := s.save(item, req.IsUtama); err != nil {
		return nil, err
	}
	return item, nil
}

func (s *Service) Delete(id uint) error {
	item, err := s.Get(id)
	if err != nil {
		return err
	}
	if item.IsUtama {
		return invalid("cabang utama tidak boleh dihapus")
	}
	return s.repo.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("cabang_id = ?", id).Delete(&UserCabang{}).Error; err != nil {
			return err
		}
		if err := tx.Where("cabang_id = ?", id).Delete(&StaffCabang{}).Error; err != nil {
			return err
		}
		return tx.Delete(&Cabang{}, id).Error
	})
}

func fail(c *gin.Context, err error) {
	var v validationError
	switch {
	case errors.As(err, &v):
		response.BadRequest(c, v.msg, nil)
	case errors.Is(err, gorm.ErrRecordNotFound):
		response.NotFound(c, "cabang tidak ditemukan")
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
		response.NotFound(c, "cabang not found")
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
		fail(c, err)
		return
	}
	response.OK(c, nil, "deleted")
}

// AksesResponse is what the branch switcher needs: the branches this account may open,
// which one this request resolved to, and whether "all branches" is available.
type AksesResponse struct {
	Cabangs   []branch.Akses `json:"cabangs"`
	AktifID   uint           `json:"aktif_id"`
	Semua     bool           `json:"semua"`
	BisaSemua bool           `json:"bisa_semua"`
}

func (h *Handler) Akses(c *gin.Context) {
	role := c.GetString(middleware.ContextRole)
	list, err := branch.Allowed(h.svc.repo.db, c.GetUint(middleware.ContextUserID), role)
	if err != nil {
		response.Internal(c, err.Error())
		return
	}
	if list == nil {
		list = []branch.Akses{}
	}
	response.OK(c, AksesResponse{Cabangs: list, AktifID: branch.ID(c), Semua: branch.All(c), BisaSemua: role == middleware.RoleAdmin}, "ok")
}

func RegisterRoutes(rg *gin.RouterGroup, db *gorm.DB, gen *generator.Service) {
	h := NewHandler(NewService(NewRepository(db), gen))
	g := rg.Group("/cabang")
	{
		g.GET("", h.Index)
		g.GET("/akses", h.Akses)
		g.POST("", h.Store)
		g.GET("/:id", h.Show)
		g.PUT("/:id", h.Update)
		g.DELETE("/:id", h.Destroy)
	}
}
