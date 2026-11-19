package kasir

import (
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/scaleup/clinic-v2/api/internal/platform/generator"
	"github.com/scaleup/clinic-v2/api/internal/platform/middleware"
	"github.com/scaleup/clinic-v2/api/internal/platform/pagination"
	"github.com/scaleup/clinic-v2/api/internal/platform/response"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var (
	ErrSudahBuka    = errors.New("kasir Anda masih terbuka; tutup shift yang berjalan dulu")
	ErrSudahTutup   = errors.New("shift kasir ini sudah ditutup")
	ErrBukanPemilik = errors.New("shift kasir hanya dapat ditutup oleh pemiliknya atau admin")
	ErrTidakAda     = errors.New("shift kasir tidak ditemukan")
)

type Service struct {
	db  *gorm.DB
	gen *generator.Service
}

func NewService(db *gorm.DB, gen *generator.Service) *Service { return &Service{db: db, gen: gen} }

// shiftQuery selects shifts with the cashier's name (staff name when linked, else the account name).
func (s *Service) shiftQuery(tx *gorm.DB) *gorm.DB {
	return tx.Model(&Shift{}).
		Select(`kasir_shifts.*, COALESCE(NULLIF(st.nama, ''), u.name, '') AS kasir_nama, COALESCE(cu.name, '') AS closed_by_nama`).
		Joins("LEFT JOIN users u ON u.id = kasir_shifts.user_id").
		Joins("LEFT JOIN staffs st ON st.id = kasir_shifts.staff_id").
		Joins("LEFT JOIN users cu ON cu.id = kasir_shifts.closed_by_user_id")
}

func (s *Service) detail(tx *gorm.DB, id uint) (*Detail, error) {
	var sh Shift
	if err := s.shiftQuery(tx).Where("kasir_shifts.id = ?", id).First(&sh).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrTidakAda
		}
		return nil, err
	}
	var mutasi []Mutasi
	if err := tx.Model(&Mutasi{}).
		Select("kasir_mutasis.*, COALESCE(b.nama, '') AS bank_nama").
		Joins("LEFT JOIN banks b ON b.id = kasir_mutasis.bank_id").
		Where("shift_id = ?", id).Order("waktu, kasir_mutasis.id").Find(&mutasi).Error; err != nil {
		return nil, err
	}
	if mutasi == nil {
		mutasi = []Mutasi{}
	}
	d := ringkas(sh, mutasi)
	return &d, nil
}

// Aktif returns the account's open shift, or nil when the cashier is closed.
func (s *Service) Aktif(userID uint) (*Detail, error) {
	var sh Shift
	err := s.db.Where("user_id = ? AND status = ?", userID, StatusOpen).First(&sh).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return s.detail(s.db, sh.ID)
}

type BukaRequest struct {
	SaldoAwal float64 `json:"saldo_awal"`
	Catatan   string  `json:"catatan"`
}

func (s *Service) Buka(userID uint, req BukaRequest) (*Detail, error) {
	if req.SaldoAwal < 0 {
		return nil, errors.New("saldo awal tidak boleh negatif")
	}
	var n int64
	if err := s.db.Model(&Shift{}).Where("user_id = ? AND status = ?", userID, StatusOpen).Count(&n).Error; err != nil {
		return nil, err
	}
	if n > 0 {
		return nil, ErrSudahBuka
	}
	var u struct{ StaffID *uint }
	s.db.Table("users").Select("staff_id").Where("id = ?", userID).Scan(&u)
	if u.StaffID != nil && *u.StaffID == 0 {
		u.StaffID = nil
	}
	kode, err := s.gen.Generate("SHF")
	if err != nil {
		return nil, err
	}
	sh := Shift{
		Kode: kode, UserID: userID, StaffID: u.StaffID, SaldoAwal: roundRp(req.SaldoAwal),
		OpenedAt: time.Now(), CatatanBuka: strings.TrimSpace(req.Catatan), Status: StatusOpen,
	}
	if err := s.db.Create(&sh).Error; err != nil {
		// Two opens at once: the partial unique index lets only one through.
		if strings.Contains(err.Error(), "uniq_kasir_shift_open_user") {
			return nil, ErrSudahBuka
		}
		return nil, err
	}
	return s.detail(s.db, sh.ID)
}

type TutupRequest struct {
	SaldoAkhirFisik *float64 `json:"saldo_akhir_fisik" binding:"required"`
	Catatan         string   `json:"catatan"`
}

// Tutup closes a shift: it fixes the expected cash and the difference with what was counted.
// Only the owner or an admin may close it.
func (s *Service) Tutup(id, userID uint, isAdmin bool, req TutupRequest) (*Detail, error) {
	if req.SaldoAkhirFisik == nil || *req.SaldoAkhirFisik < 0 {
		return nil, errors.New("saldo akhir fisik wajib diisi dan tidak boleh negatif")
	}
	err := s.db.Transaction(func(tx *gorm.DB) error {
		var sh Shift
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&sh, id).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrTidakAda
			}
			return err
		}
		if sh.UserID != userID && !isAdmin {
			return ErrBukanPemilik
		}
		if sh.Status != StatusOpen {
			return ErrSudahTutup
		}
		var mutasi []Mutasi
		if err := tx.Where("shift_id = ?", id).Find(&mutasi).Error; err != nil {
			return err
		}
		d := ringkas(sh, mutasi)
		now := time.Now()
		fisik := roundRp(*req.SaldoAkhirFisik)
		expected := d.ExpectedTunai
		selisih := roundRp(fisik - expected)
		return tx.Model(&Shift{}).Where("id = ?", id).Updates(map[string]any{
			"status": StatusClosed, "closed_at": now, "closed_by_user_id": userID,
			"saldo_akhir_fisik": fisik, "expected_tunai": expected, "selisih": selisih,
			"catatan_tutup": strings.TrimSpace(req.Catatan),
		}).Error
	})
	if err != nil {
		return nil, err
	}
	return s.detail(s.db, id)
}

type ListFilter struct {
	UserID uint
	Status string
	Dari   string
	Sampai string
}

func (s *Service) List(p pagination.Params, f ListFilter) ([]Shift, pagination.Meta, error) {
	q := s.shiftQuery(s.db)
	if f.UserID > 0 {
		q = q.Where("kasir_shifts.user_id = ?", f.UserID)
	}
	if f.Status != "" {
		q = q.Where("kasir_shifts.status = ?", f.Status)
	}
	if f.Dari != "" {
		q = q.Where("kasir_shifts.opened_at >= ?", f.Dari)
	}
	if f.Sampai != "" {
		if t, err := time.Parse("2006-01-02", f.Sampai); err == nil {
			q = q.Where("kasir_shifts.opened_at < ?", t.AddDate(0, 0, 1).Format("2006-01-02"))
		}
	}
	if p.Search != "" {
		like := "%" + p.Search + "%"
		q = q.Where("kasir_shifts.kode ILIKE ? OR u.name ILIKE ? OR st.nama ILIKE ?", like, like, like)
	}
	// The joined tables also have an id column, so sort on the shift's own column.
	p.SortBy = "kasir_shifts." + p.SortBy
	var items []Shift
	meta, err := pagination.Paginate(q, p, &items)
	if items == nil {
		items = []Shift{}
	}
	return items, meta, err
}

type Handler struct{ svc *Service }

func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

func failShift(c *gin.Context, err error) {
	switch {
	case errors.Is(err, ErrTidakAda):
		response.NotFound(c, err.Error())
	case errors.Is(err, ErrBukanPemilik):
		response.Fail(c, http.StatusForbidden, err.Error(), nil)
	default:
		response.BadRequest(c, err.Error(), nil)
	}
}

func (h *Handler) Aktif(c *gin.Context) {
	d, err := h.svc.Aktif(c.GetUint(middleware.ContextUserID))
	if err != nil {
		response.Internal(c, err.Error())
		return
	}
	if d == nil {
		response.OK(c, nil, "kasir belum dibuka")
		return
	}
	response.OK(c, d, "ok")
}

func (h *Handler) Buka(c *gin.Context) {
	var req BukaRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "validation failed", err.Error())
		return
	}
	d, err := h.svc.Buka(c.GetUint(middleware.ContextUserID), req)
	if err != nil {
		failShift(c, err)
		return
	}
	response.Created(c, d, "kasir dibuka")
}

func (h *Handler) Tutup(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	var req TutupRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "saldo akhir fisik wajib diisi", err.Error())
		return
	}
	isAdmin := c.GetString(middleware.ContextRole) == middleware.RoleAdmin
	d, err := h.svc.Tutup(uint(id), c.GetUint(middleware.ContextUserID), isAdmin, req)
	if err != nil {
		failShift(c, err)
		return
	}
	response.OK(c, d, "kasir ditutup")
}

// ownOnly reports whether the role only sees its own shifts (the cashier staff);
// admin and finance review every shift.
func ownOnly(c *gin.Context) bool {
	role := c.GetString(middleware.ContextRole)
	return role != middleware.RoleAdmin && role != middleware.RoleFinance
}

func (h *Handler) List(c *gin.Context) {
	f := ListFilter{Status: c.Query("status"), Dari: c.Query("dari"), Sampai: c.Query("sampai")}
	if v, err := strconv.ParseUint(c.Query("user_id"), 10, 64); err == nil {
		f.UserID = uint(v)
	}
	if ownOnly(c) {
		f.UserID = c.GetUint(middleware.ContextUserID)
	}
	items, meta, err := h.svc.List(pagination.FromContext(c), f)
	if err != nil {
		response.Internal(c, err.Error())
		return
	}
	response.OKWithMeta(c, items, meta, "ok")
}

func (h *Handler) Get(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	d, err := h.svc.detail(h.svc.db, uint(id))
	if err != nil {
		failShift(c, err)
		return
	}
	if ownOnly(c) && d.Shift.UserID != c.GetUint(middleware.ContextUserID) {
		response.Fail(c, http.StatusForbidden, fmt.Sprintf("shift %s milik kasir lain", d.Shift.Kode), nil)
		return
	}
	response.OK(c, d, "ok")
}

func RegisterRoutes(rg *gin.RouterGroup, db *gorm.DB, gen *generator.Service) {
	h := NewHandler(NewService(db, gen))
	g := rg.Group("/kasir/shift")
	{
		g.GET("", h.List)
		g.GET("/aktif", h.Aktif)
		g.POST("/buka", h.Buka)
		g.GET("/:id", h.Get)
		g.POST("/:id/tutup", h.Tutup)
	}
}
