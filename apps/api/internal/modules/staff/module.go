package staff

import (
	"github.com/scaleup/clinic-v2/api/internal/platform/branch"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/scaleup/clinic-v2/api/internal/platform/generator"
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
	Nama     string `json:"nama" binding:"required"`
	Jabatan  string `json:"jabatan"`
	NoTelp   string `json:"no_telp"`
	Email    string `json:"email"`
	IsActive *bool  `json:"is_active"`
	// CabangIDs: omitted keeps the current branches; a new record without it joins the main branch.
	CabangIDs *[]uint `json:"cabang_ids"`
}

type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// List returns staff; cabangID > 0 keeps only those who serve that branch (pickers).
func (s *Service) List(p pagination.Params, cabangID uint) ([]Staff, pagination.Meta, error) {
	q := s.repo.db.Model(&Staff{})
	if cabangID > 0 {
		q = q.Where("id IN (SELECT staff_id FROM staff_cabangs WHERE cabang_id = ?)", cabangID)
	}
	if p.Search != "" {
		like := "%" + p.Search + "%"
		q = q.Where("nama ILIKE ? OR kode ILIKE ? OR jabatan ILIKE ? OR email ILIKE ?", like, like, like, like)
	}
	var items []Staff
	meta, err := pagination.Paginate(q, p, &items)
	if err == nil {
		err = s.fillCabang(items)
	}
	return items, meta, err
}

func (s *Service) Get(id uint) (*Staff, error) {
	var item Staff
	if err := s.repo.db.First(&item, id).Error; err != nil {
		return nil, err
	}
	list := []Staff{item}
	if err := s.fillCabang(list); err != nil {
		return nil, err
	}
	return &list[0], nil
}

func (s *Service) Create(req UpsertRequest) (*Staff, error) {
	kode, err := s.gen.Generate("STF")
	if err != nil {
		return nil, err
	}
	item := &Staff{Kode: kode, IsActive: true}

	item.Nama = req.Nama
	item.Jabatan = req.Jabatan
	item.NoTelp = req.NoTelp
	item.Email = req.Email
	if req.IsActive != nil {
		item.IsActive = *req.IsActive
	}
	if err := s.checkCabang(true, req.CabangIDs); err != nil {
		return nil, err
	}
	if err := s.repo.db.Create(item).Error; err != nil {
		return nil, err
	}
	ids := req.CabangIDs
	if ids == nil {
		def := []uint{branch.UtamaID(s.repo.db)}
		ids = &def
	}
	if err := branch.StaffLinks.Set(s.repo.db, item.ID, *ids); err != nil {
		return nil, err
	}
	return s.Get(item.ID)
}

func (s *Service) Update(id uint, req UpsertRequest) (*Staff, error) {
	item, err := s.Get(id)
	if err != nil {
		return nil, err
	}

	item.Nama = req.Nama
	item.Jabatan = req.Jabatan
	item.NoTelp = req.NoTelp
	item.Email = req.Email
	if req.IsActive != nil {
		item.IsActive = *req.IsActive
	}
	if err := s.checkCabang(true, req.CabangIDs); err != nil {
		return nil, err
	}
	if err := s.repo.db.Save(item).Error; err != nil {
		return nil, err
	}
	if req.CabangIDs != nil {
		if err := branch.StaffLinks.Set(s.repo.db, item.ID, *req.CabangIDs); err != nil {
			return nil, err
		}
	}
	return s.Get(item.ID)
}

func (s *Service) Delete(id uint) error {
	return s.repo.db.Delete(&Staff{}, id).Error
}

func (h *Handler) Index(c *gin.Context) {
	// ?cabang=aktif narrows a picker to staff serving the active branch.
	var cabangID uint
	if c.Query("cabang") == "aktif" && !branch.All(c) {
		cabangID = branch.ID(c)
	}
	items, meta, err := h.svc.List(pagination.FromContext(c), cabangID)
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
		response.NotFound(c, "staff not found")
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
	if branch.IsRequestError(err) {
		response.BadRequest(c, err.Error(), nil)
		return
	}
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
	if branch.IsRequestError(err) {
		response.BadRequest(c, err.Error(), nil)
		return
	}
	if err != nil {
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

func RegisterRoutes(rg *gin.RouterGroup, db *gorm.DB, gen *generator.Service) {
	h := NewHandler(NewService(NewRepository(db), gen))
	g := rg.Group("/staff")
	{
		g.GET("", h.Index)
		g.POST("", h.Store)
		g.GET("/:id", h.Show)
		g.PUT("/:id", h.Update)
		g.DELETE("/:id", h.Destroy)
	}
}

// fillCabang loads the linked branch ids of each record.
func (s *Service) fillCabang(items []Staff) error {
	ids := make([]uint, len(items))
	for i := range items {
		ids[i] = items[i].ID
	}
	m, err := branch.StaffLinks.IDs(s.repo.db, ids)
	for i := range items {
		items[i].CabangIDs = m[items[i].ID]
		if items[i].CabangIDs == nil {
			items[i].CabangIDs = []uint{}
		}
	}
	return err
}

// checkCabang validates requested branches before anything is written.
func (s *Service) checkCabang(needOne bool, ids *[]uint) error {
	if ids == nil {
		return nil
	}
	if needOne && len(*ids) == 0 {
		return branch.ErrMinimalSatu
	}
	return branch.Validate(s.repo.db, *ids)
}
