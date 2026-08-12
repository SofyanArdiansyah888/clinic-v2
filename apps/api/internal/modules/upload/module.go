package upload

import (
	"net/http"
	"path/filepath"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/scaleup/clinic-v2/api/internal/platform/response"
	"github.com/scaleup/clinic-v2/api/internal/platform/storage"
)

type Handler struct {
	store storage.Store
}

func NewHandler(store storage.Store) *Handler {
	return &Handler{store: store}
}

type uploadResponse = storage.Object

func (h *Handler) Upload(c *gin.Context) {
	file, err := c.FormFile("file")
	if err != nil {
		response.BadRequest(c, "file is required", err.Error())
		return
	}

	folder := c.DefaultPostForm("folder", "foto")
	contentType := file.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	if !strings.HasPrefix(contentType, "image/") {
		response.BadRequest(c, "only image uploads are allowed", contentType)
		return
	}
	const maxSize = 8 << 20 // 8MB
	if file.Size > maxSize {
		response.BadRequest(c, "file too large (max 8MB)", nil)
		return
	}

	src, err := file.Open()
	if err != nil {
		response.Internal(c, err.Error())
		return
	}
	defer src.Close()

	obj, err := h.store.Put(c.Request.Context(), folder, file.Filename, src, file.Size, contentType)
	if err != nil {
		response.Internal(c, err.Error())
		return
	}
	response.Created(c, obj, "uploaded")
}

func (h *Handler) Serve(c *gin.Context) {
	key := strings.TrimPrefix(c.Param("key"), "/")
	local, ok := h.store.(*storage.LocalStore)
	if !ok {
		// MinIO driver later: redirect to object URL
		c.JSON(http.StatusNotImplemented, gin.H{"success": false, "message": "file serving not available for this storage driver"})
		return
	}
	abs, err := local.ResolveLocalPath(key)
	if err != nil {
		response.BadRequest(c, "invalid path", err.Error())
		return
	}
	c.File(abs)
}

func RegisterRoutes(rg *gin.RouterGroup, store storage.Store) {
	h := NewHandler(store)
	g := rg.Group("/uploads")
	{
		g.POST("", h.Upload)
	}
}

// SafeFilename helper for tests / future use
func SafeFilename(name string) string {
	return filepath.Base(name)
}
