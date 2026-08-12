from pathlib import Path

ROOT = Path("internal/modules")

modules = {
    "pasien": {
        "type": "Pasien",
        "table": "pasiens",
        "key": "PAS",
        "route": "pasien",
        "search": ["nama", "kode", "no_telp", "email"],
        "entity_extra": '''
	Alamat       string     `gorm:"type:text" json:"alamat"`
	NoTelp       string     `gorm:"size:30" json:"no_telp"`
	Email        string     `gorm:"size:150" json:"email"`
	TanggalLahir *time.Time `gorm:"type:date" json:"tanggal_lahir"`
	JenisKelamin string     `gorm:"size:1" json:"jenis_kelamin"`''',
        "dto": '''
	Nama         string     `json:"nama" binding:"required"`
	Alamat       string     `json:"alamat"`
	NoTelp       string     `json:"no_telp"`
	Email        string     `json:"email"`
	TanggalLahir *time.Time `json:"tanggal_lahir"`
	JenisKelamin string     `json:"jenis_kelamin"`
	IsActive     *bool      `json:"is_active"`''',
        "assign": '''
	item.Nama = req.Nama
	item.Alamat = req.Alamat
	item.NoTelp = req.NoTelp
	item.Email = req.Email
	item.TanggalLahir = req.TanggalLahir
	item.JenisKelamin = req.JenisKelamin''',
        "needs_time": True,
    },
    "staff": {
        "type": "Staff",
        "table": "staffs",
        "key": "STF",
        "route": "staff",
        "search": ["nama", "kode", "jabatan", "email"],
        "entity_extra": '''
	Jabatan string `gorm:"size:100" json:"jabatan"`
	NoTelp  string `gorm:"size:30" json:"no_telp"`
	Email   string `gorm:"size:150" json:"email"`''',
        "dto": '''
	Nama     string `json:"nama" binding:"required"`
	Jabatan  string `json:"jabatan"`
	NoTelp   string `json:"no_telp"`
	Email    string `json:"email"`
	IsActive *bool  `json:"is_active"`''',
        "assign": '''
	item.Nama = req.Nama
	item.Jabatan = req.Jabatan
	item.NoTelp = req.NoTelp
	item.Email = req.Email''',
        "needs_time": False,
    },
    "treatment": {
        "type": "Treatment",
        "table": "treatments",
        "key": "TRT",
        "route": "treatment",
        "search": ["nama", "kode", "kategori"],
        "entity_extra": '''
	Kategori  string  `gorm:"size:100" json:"kategori"`
	Harga     float64 `gorm:"type:decimal(12,2);default:0" json:"harga"`
	Durasi    int     `gorm:"default:0" json:"durasi"`
	Deskripsi string  `gorm:"type:text" json:"deskripsi"`''',
        "dto": '''
	Nama      string  `json:"nama" binding:"required"`
	Kategori  string  `json:"kategori"`
	Harga     float64 `json:"harga"`
	Durasi    int     `json:"durasi"`
	Deskripsi string  `json:"deskripsi"`
	IsActive  *bool   `json:"is_active"`''',
        "assign": '''
	item.Nama = req.Nama
	item.Kategori = req.Kategori
	item.Harga = req.Harga
	item.Durasi = req.Durasi
	item.Deskripsi = req.Deskripsi''',
        "needs_time": False,
    },
    "supplier": {
        "type": "Supplier",
        "table": "suppliers",
        "key": "SUP",
        "route": "supplier",
        "search": ["nama", "kode", "email"],
        "entity_extra": '''
	Alamat string `gorm:"type:text" json:"alamat"`
	NoTelp string `gorm:"size:30" json:"no_telp"`
	Email  string `gorm:"size:150" json:"email"`''',
        "dto": '''
	Nama     string `json:"nama" binding:"required"`
	Alamat   string `json:"alamat"`
	NoTelp   string `json:"no_telp"`
	Email    string `json:"email"`
	IsActive *bool  `json:"is_active"`''',
        "assign": '''
	item.Nama = req.Nama
	item.Alamat = req.Alamat
	item.NoTelp = req.NoTelp
	item.Email = req.Email''',
        "needs_time": False,
    },
    "bank": {
        "type": "Bank",
        "table": "banks",
        "key": "BNK",
        "route": "bank",
        "search": ["nama", "kode", "no_rekening"],
        "entity_extra": '''
	NoRekening string `gorm:"size:50" json:"no_rekening"`
	AtasNama   string `gorm:"size:150" json:"atas_nama"`''',
        "dto": '''
	Nama       string `json:"nama" binding:"required"`
	NoRekening string `json:"no_rekening"`
	AtasNama   string `json:"atas_nama"`
	IsActive   *bool  `json:"is_active"`''',
        "assign": '''
	item.Nama = req.Nama
	item.NoRekening = req.NoRekening
	item.AtasNama = req.AtasNama''',
        "needs_time": False,
    },
    "perusahaan": {
        "type": "Perusahaan",
        "table": "perusahaans",
        "key": "PRS",
        "route": "perusahaan",
        "search": ["nama", "kode"],
        "entity_extra": '''
	Alamat string `gorm:"type:text" json:"alamat"`
	NoTelp string `gorm:"size:30" json:"no_telp"`
	Email  string `gorm:"size:150" json:"email"`''',
        "dto": '''
	Nama     string `json:"nama" binding:"required"`
	Alamat   string `json:"alamat"`
	NoTelp   string `json:"no_telp"`
	Email    string `json:"email"`
	IsActive *bool  `json:"is_active"`''',
        "assign": '''
	item.Nama = req.Nama
	item.Alamat = req.Alamat
	item.NoTelp = req.NoTelp
	item.Email = req.Email''',
        "needs_time": False,
    },
    "cabang": {
        "type": "Cabang",
        "table": "cabangs",
        "key": "CAB",
        "route": "cabang",
        "search": ["nama", "kode"],
        "entity_extra": '''
	Alamat string `gorm:"type:text" json:"alamat"`
	NoTelp string `gorm:"size:30" json:"no_telp"`''',
        "dto": '''
	Nama     string `json:"nama" binding:"required"`
	Alamat   string `json:"alamat"`
	NoTelp   string `json:"no_telp"`
	IsActive *bool  `json:"is_active"`''',
        "assign": '''
	item.Nama = req.Nama
	item.Alamat = req.Alamat
	item.NoTelp = req.NoTelp''',
        "needs_time": False,
    },
}


def write_module(pkg: str, m: dict) -> None:
    d = ROOT / pkg
    d.mkdir(parents=True, exist_ok=True)
    type_name = m["type"]
    search_sql = " OR ".join(f"{f} ILIKE ?" for f in m["search"])
    search_args = ", ".join(["like"] * len(m["search"]))
    time_import = '\n\t"time"' if m["needs_time"] else ""

    entity = f'''package {pkg}

import "time"

type {type_name} struct {{
	ID        uint      `gorm:"primaryKey" json:"id"`
	Kode      string    `gorm:"size:50;uniqueIndex;not null" json:"kode"`
	Nama      string    `gorm:"size:150;not null" json:"nama"`{m["entity_extra"]}
	IsActive  bool      `gorm:"default:true" json:"is_active"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}}

func ({type_name}) TableName() string {{ return "{m["table"]}" }}
'''
    (d / "entity.go").write_text(entity, encoding="utf-8")

    module = f'''package {pkg}

import (
	"strconv"{time_import}

	"github.com/gin-gonic/gin"
	"github.com/scaleup/clinic-v2/api/internal/platform/generator"
	"github.com/scaleup/clinic-v2/api/internal/platform/pagination"
	"github.com/scaleup/clinic-v2/api/internal/platform/response"
	"gorm.io/gorm"
)

type Repository struct {{
	db *gorm.DB
}}

func NewRepository(db *gorm.DB) *Repository {{
	return &Repository{{db: db}}
}}

type Service struct {{
	repo *Repository
	gen  *generator.Service
}}

func NewService(repo *Repository, gen *generator.Service) *Service {{
	return &Service{{repo: repo, gen: gen}}
}}

type UpsertRequest struct {{{m["dto"]}
}}

type Handler struct {{
	svc *Service
}}

func NewHandler(svc *Service) *Handler {{
	return &Handler{{svc: svc}}
}}

func (s *Service) List(p pagination.Params) ([]{type_name}, pagination.Meta, error) {{
	q := s.repo.db.Model(&{type_name}{{}})
	if p.Search != "" {{
		like := "%" + p.Search + "%"
		q = q.Where("{search_sql}", {search_args})
	}}
	var items []{type_name}
	meta, err := pagination.Paginate(q, p, &items)
	return items, meta, err
}}

func (s *Service) Get(id uint) (*{type_name}, error) {{
	var item {type_name}
	if err := s.repo.db.First(&item, id).Error; err != nil {{
		return nil, err
	}}
	return &item, nil
}}

func (s *Service) Create(req UpsertRequest) (*{type_name}, error) {{
	kode, err := s.gen.Generate("{m["key"]}")
	if err != nil {{
		return nil, err
	}}
	item := &{type_name}{{Kode: kode, IsActive: true}}
	{m["assign"]}
	if req.IsActive != nil {{
		item.IsActive = *req.IsActive
	}}
	if err := s.repo.db.Create(item).Error; err != nil {{
		return nil, err
	}}
	return item, nil
}}

func (s *Service) Update(id uint, req UpsertRequest) (*{type_name}, error) {{
	item, err := s.Get(id)
	if err != nil {{
		return nil, err
	}}
	{m["assign"]}
	if req.IsActive != nil {{
		item.IsActive = *req.IsActive
	}}
	if err := s.repo.db.Save(item).Error; err != nil {{
		return nil, err
	}}
	return item, nil
}}

func (s *Service) Delete(id uint) error {{
	return s.repo.db.Delete(&{type_name}{{}}, id).Error
}}

func (h *Handler) Index(c *gin.Context) {{
	items, meta, err := h.svc.List(pagination.FromContext(c))
	if err != nil {{
		response.Internal(c, err.Error())
		return
	}}
	response.OKWithMeta(c, items, meta, "ok")
}}

func (h *Handler) Show(c *gin.Context) {{
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	item, err := h.svc.Get(uint(id))
	if err != nil {{
		response.NotFound(c, "{pkg} not found")
		return
	}}
	response.OK(c, item, "ok")
}}

func (h *Handler) Store(c *gin.Context) {{
	var req UpsertRequest
	if err := c.ShouldBindJSON(&req); err != nil {{
		response.BadRequest(c, "validation failed", err.Error())
		return
	}}
	item, err := h.svc.Create(req)
	if err != nil {{
		response.Internal(c, err.Error())
		return
	}}
	response.Created(c, item, "created")
}}

func (h *Handler) Update(c *gin.Context) {{
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	var req UpsertRequest
	if err := c.ShouldBindJSON(&req); err != nil {{
		response.BadRequest(c, "validation failed", err.Error())
		return
	}}
	item, err := h.svc.Update(uint(id), req)
	if err != nil {{
		response.Internal(c, err.Error())
		return
	}}
	response.OK(c, item, "updated")
}}

func (h *Handler) Destroy(c *gin.Context) {{
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	if err := h.svc.Delete(uint(id)); err != nil {{
		response.Internal(c, err.Error())
		return
	}}
	response.OK(c, nil, "deleted")
}}

func RegisterRoutes(rg *gin.RouterGroup, db *gorm.DB, gen *generator.Service) {{
	h := NewHandler(NewService(NewRepository(db), gen))
	g := rg.Group("/{m["route"]}")
	{{
		g.GET("", h.Index)
		g.POST("", h.Store)
		g.GET("/:id", h.Show)
		g.PUT("/:id", h.Update)
		g.DELETE("/:id", h.Destroy)
	}}
}}
'''
    (d / "module.go").write_text(module, encoding="utf-8")
    print("ok", pkg)


for pkg, meta in modules.items():
    write_module(pkg, meta)
print("done")
