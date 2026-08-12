package middleware

import (
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/scaleup/clinic-v2/api/internal/platform/jwt"
	"github.com/scaleup/clinic-v2/api/internal/platform/response"
)

const ContextUserID = "userID"
const ContextUsername = "username"
const ContextRole = "role"

func Auth(jm *jwt.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		header := c.GetHeader("Authorization")
		if header == "" || !strings.HasPrefix(header, "Bearer ") {
			response.Unauthorized(c, "missing or invalid authorization header")
			c.Abort()
			return
		}
		token := strings.TrimPrefix(header, "Bearer ")
		claims, err := jm.Parse(token)
		if err != nil || claims.Subject != "access" {
			response.Unauthorized(c, "invalid or expired token")
			c.Abort()
			return
		}
		c.Set(ContextUserID, claims.UserID)
		c.Set(ContextUsername, claims.Username)
		c.Set(ContextRole, claims.Role)
		c.Next()
	}
}
