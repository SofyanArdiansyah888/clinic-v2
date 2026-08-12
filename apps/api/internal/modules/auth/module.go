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
