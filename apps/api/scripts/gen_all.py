#!/usr/bin/env python3
"""Generate remaining Clinic V2 API Go modules."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MOD = ROOT / "internal" / "modules"


def w(rel: str, content: str) -> None:
    p = ROOT / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content.lstrip("\n"), encoding="utf-8")
    print("wrote", rel)


# ─── user ───────────────────────────────────────────────────────────────────
w("internal/modules/user/entity.go", r'''
package user

import (
	"time"

	"gorm.io/datatypes"
)

type User struct {
	ID        uint           `gorm:"primaryKey" json:"id"`
	Name      string         `gorm:"size:150;not null" json:"name"`
	Email     string         `gorm:"size:150;uniqueIndex;not null" json:"email"`
	Username  string         `gorm:"size:100;uniqueIndex;not null" json:"username"`
	Password  string         `gorm:"size:255;not null" json:"-"`
	Role      string         `gorm:"size:20;not null;default:staff" json:"role"`
	HakAkses  datatypes.JSON `gorm:"type:jsonb" json:"hak_akses"`
	IsActive  bool           `gorm:"default:true" json:"is_active"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
}

func (User) TableName() string { return "users" }
''')

w("internal/modules/user/module.go", r'''
package user

import (
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/scaleup/clinic-v2/api/internal/platform/generator"
	"github.com/scaleup/clinic-v2/api/internal/platform/pagination"
	"github.com/scaleup/clinic-v2/api/internal/platform/response"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

type Repository struct{ db *gorm.DB }

func NewRepository(db *gorm.DB) *Repository { return &Repository{db: db} }

type Service struct {
	repo *Repository
}

func NewService(repo *Repository) *Service { return &Service{repo: repo} }

type UpsertRequest struct {
	Name     string         `json:"name" binding:"required"`
	Email    string         `json:"email" binding:"required"`
	Username string         `json:"username" binding:"required"`
	Password string         `json:"password"`
	Role     string         `json:"role"`
	HakAkses datatypes.JSON `json:"hak_akses"`
	IsActive *bool          `json:"is_active"`
}

type PasswordRequest struct {
	Password string `json:"password" binding:"required,min=6"`
}

type Handler struct{ svc *Service }

func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

func hashPassword(pw string) (string, error) {
	b, err := bcrypt.GenerateFromPassword([]byte(pw), bcrypt.DefaultCost)
	return string(b), err
}

func (s *Service) List(p pagination.Params) ([]User, pagination.Meta, error) {
	q := s.repo.db.Model(&User{})
	if p.Search != "" {
		like := "%" + p.Search + "%"
		q = q.Where("name ILIKE ? OR email ILIKE ? OR username ILIKE ?", like, like, like)
	}
	var items []User
	meta, err := pagination.Paginate(q, p, &items)
	return items, meta, err
}

func (s *Service) Get(id uint) (*User, error) {
	var item User
	if err := s.repo.db.First(&item, id).Error; err != nil {
		return nil, err
	}
	return &item, nil
}

func (s *Service) FindByLogin(login string) (*User, error) {
	var item User
	if err := s.repo.db.Where("username = ? OR email = ?", login, login).First(&item).Error; err != nil {
		return nil, err
	}
	return &item, nil
}

func (s *Service) Create(req UpsertRequest) (*User, error) {
	if req.Password == "" {
		req.Password = "password123"
	}
	hashed, err := hashPassword(req.Password)
	if err != nil {
		return nil, err
	}
	role := req.Role
	if role == "" {
		role = "staff"
	}
	item := &User{
		Name:     req.Name,
		Email:    req.Email,
		Username: req.Username,
		Password: hashed,
		Role:     role,
		HakAkses: req.HakAkses,
		IsActive: true,
	}
	if req.IsActive != nil {
		item.IsActive = *req.IsActive
	}
	if err := s.repo.db.Create(item).Error; err != nil {
		return nil, err
	}
	return item, nil
}

func (s *Service) Update(id uint, req UpsertRequest) (*User, error) {
	item, err := s.Get(id)
	if err != nil {
		return nil, err
	}
	item.Name = req.Name
	item.Email = req.Email
	item.Username = req.Username
	if req.Role != "" {
		item.Role = req.Role
	}
	if req.HakAkses != nil {
		item.HakAkses = req.HakAkses
	}
	if req.Password != "" {
		hashed, err := hashPassword(req.Password)
		if err != nil {
			return nil, err
		}
		item.Password = hashed
	}
	if req.IsActive != nil {
		item.IsActive = *req.IsActive
	}
	if err := s.repo.db.Save(item).Error; err != nil {
		return nil, err
	}
	return item, nil
}

func (s *Service) UpdatePassword(id uint, password string) error {
	hashed, err := hashPassword(password)
	if err != nil {
		return err
	}
	return s.repo.db.Model(&User{}).Where("id = ?", id).Update("password", hashed).Error
}

func (s *Service) Delete(id uint) error {
	return s.repo.db.Delete(&User{}, id).Error
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
		response.NotFound(c, "user not found")
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

func (h *Handler) UpdatePassword(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	var req PasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "validation failed", err.Error())
		return
	}
	if err := h.svc.UpdatePassword(uint(id), req.Password); err != nil {
		response.Internal(c, err.Error())
		return
	}
	response.OK(c, nil, "password updated")
}

func RegisterRoutes(rg *gin.RouterGroup, db *gorm.DB, _ *generator.Service) {
	h := NewHandler(NewService(NewRepository(db)))
	g := rg.Group("/user")
	{
		g.GET("", h.Index)
		g.POST("", h.Store)
		g.GET("/:id", h.Show)
		g.PUT("/:id", h.Update)
		g.DELETE("/:id", h.Destroy)
		g.PATCH("/:id/password", h.UpdatePassword)
	}
}
''')

# ─── auth ───────────────────────────────────────────────────────────────────
w("internal/modules/auth/module.go", r'''
package auth

import (
	"github.com/gin-gonic/gin"
	"github.com/scaleup/clinic-v2/api/internal/modules/user"
	"github.com/scaleup/clinic-v2/api/internal/platform/jwt"
	"github.com/scaleup/clinic-v2/api/internal/platform/middleware"
	"github.com/scaleup/clinic-v2/api/internal/platform/response"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

type Service struct {
	users *user.Service
	jm    *jwt.Manager
}

func NewService(users *user.Service, jm *jwt.Manager) *Service {
	return &Service{users: users, jm: jm}
}

type LoginRequest struct {
	Username string `json:"username"`
	Email    string `json:"email"`
	Password string `json:"password" binding:"required"`
}

type RefreshRequest struct {
	RefreshToken string `json:"refresh_token" binding:"required"`
}

type Handler struct{ svc *Service }

func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

func (s *Service) Login(login, password string) (map[string]interface{}, error) {
	u, err := s.users.FindByLogin(login)
	if err != nil {
		return nil, err
	}
	if !u.IsActive {
		return nil, gorm.ErrRecordNotFound
	}
	if err := bcrypt.CompareHashAndPassword([]byte(u.Password), []byte(password)); err != nil {
		return nil, err
	}
	access, err := s.jm.GenerateAccess(u.ID, u.Username, u.Role)
	if err != nil {
		return nil, err
	}
	refresh, err := s.jm.GenerateRefresh(u.ID, u.Username, u.Role)
	if err != nil {
		return nil, err
	}
	return map[string]interface{}{
		"access_token":  access,
		"refresh_token": refresh,
		"user":          u,
	}, nil
}

func (s *Service) Refresh(tokenStr string) (map[string]interface{}, error) {
	claims, err := s.jm.Parse(tokenStr)
	if err != nil || claims.Subject != "refresh" {
		return nil, gorm.ErrRecordNotFound
	}
	u, err := s.users.Get(claims.UserID)
	if err != nil {
		return nil, err
	}
	if !u.IsActive {
		return nil, gorm.ErrRecordNotFound
	}
	access, err := s.jm.GenerateAccess(u.ID, u.Username, u.Role)
	if err != nil {
		return nil, err
	}
	refresh, err := s.jm.GenerateRefresh(u.ID, u.Username, u.Role)
	if err != nil {
		return nil, err
	}
	return map[string]interface{}{
		"access_token":  access,
		"refresh_token": refresh,
		"user":          u,
	}, nil
}

func (h *Handler) Login(c *gin.Context) {
	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "validation failed", err.Error())
		return
	}
	login := req.Username
	if login == "" {
		login = req.Email
	}
	if login == "" {
		response.BadRequest(c, "username or email is required", nil)
		return
	}
	data, err := h.svc.Login(login, req.Password)
	if err != nil {
		response.Unauthorized(c, "invalid credentials")
		return
	}
	response.OK(c, data, "login successful")
}

func (h *Handler) Logout(c *gin.Context) {
	response.OK(c, nil, "logout successful")
}

func (h *Handler) Me(c *gin.Context) {
	uid, _ := c.Get(middleware.ContextUserID)
	id, ok := uid.(uint)
	if !ok {
		response.Unauthorized(c, "unauthorized")
		return
	}
	u, err := h.svc.users.Get(id)
	if err != nil {
		response.NotFound(c, "user not found")
		return
	}
	response.OK(c, u, "ok")
}

func (h *Handler) Refresh(c *gin.Context) {
	var req RefreshRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "validation failed", err.Error())
		return
	}
	data, err := h.svc.Refresh(req.RefreshToken)
	if err != nil {
		response.Unauthorized(c, "invalid refresh token")
		return
	}
	response.OK(c, data, "token refreshed")
}

func RegisterPublicRoutes(rg *gin.RouterGroup, db *gorm.DB, jm *jwt.Manager) {
	users := user.NewService(user.NewRepository(db))
	h := NewHandler(NewService(users, jm))
	g := rg.Group("/auth")
	{
		g.POST("/login", h.Login)
		g.POST("/refresh", h.Refresh)
	}
}

func RegisterProtectedRoutes(rg *gin.RouterGroup, db *gorm.DB, jm *jwt.Manager) {
	users := user.NewService(user.NewRepository(db))
	h := NewHandler(NewService(users, jm))
	g := rg.Group("/auth")
	{
		g.POST("/logout", h.Logout)
		g.GET("/me", h.Me)
	}
}
''')

print("user+auth done")
print("ROOT", ROOT)
