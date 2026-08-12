package response

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

type Body struct {
	Success bool        `json:"success"`
	Message string      `json:"message,omitempty"`
	Data    interface{} `json:"data,omitempty"`
	Meta    interface{} `json:"meta,omitempty"`
	Errors  interface{} `json:"errors,omitempty"`
}

func OK(c *gin.Context, data interface{}, message string) {
	c.JSON(http.StatusOK, Body{Success: true, Message: message, Data: data})
}

func Created(c *gin.Context, data interface{}, message string) {
	c.JSON(http.StatusCreated, Body{Success: true, Message: message, Data: data})
}

func OKWithMeta(c *gin.Context, data interface{}, meta interface{}, message string) {
	c.JSON(http.StatusOK, Body{Success: true, Message: message, Data: data, Meta: meta})
}

func Fail(c *gin.Context, status int, message string, errors interface{}) {
	c.JSON(status, Body{Success: false, Message: message, Errors: errors})
}

func BadRequest(c *gin.Context, message string, errors interface{}) {
	Fail(c, http.StatusBadRequest, message, errors)
}

func Unauthorized(c *gin.Context, message string) {
	Fail(c, http.StatusUnauthorized, message, nil)
}

func NotFound(c *gin.Context, message string) {
	Fail(c, http.StatusNotFound, message, nil)
}

func Internal(c *gin.Context, message string) {
	Fail(c, http.StatusInternalServerError, message, nil)
}
