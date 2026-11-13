package pagination

import (
	"regexp"
	"strconv"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// sortColumn restricts sort_by to a plain column name; it is interpolated into ORDER BY.
var sortColumn = regexp.MustCompile(`^[a-z_][a-z0-9_]{0,62}$`)

type Params struct {
	Page    int
	PerPage int
	Search  string
	SortBy  string
	SortDir string
}

type Meta struct {
	Page       int   `json:"page"`
	PerPage    int   `json:"per_page"`
	Total      int64 `json:"total"`
	TotalPages int   `json:"total_pages"`
}

func FromContext(c *gin.Context) Params {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	perPage, _ := strconv.Atoi(c.DefaultQuery("per_page", "20"))
	if page < 1 {
		page = 1
	}
	if perPage < 1 || perPage > 100 {
		perPage = 20
	}
	sortDir := c.DefaultQuery("sort_dir", "desc")
	if sortDir != "asc" && sortDir != "desc" {
		sortDir = "desc"
	}
	sortBy := c.DefaultQuery("sort_by", "id")
	if !sortColumn.MatchString(sortBy) {
		sortBy = "id"
	}
	return Params{
		Page:    page,
		PerPage: perPage,
		Search:  c.Query("search"),
		SortBy:  sortBy,
		SortDir: sortDir,
	}
}

func Paginate(db *gorm.DB, p Params, dest interface{}) (Meta, error) {
	var total int64
	if err := db.Count(&total).Error; err != nil {
		return Meta{}, err
	}
	offset := (p.Page - 1) * p.PerPage
	order := p.SortBy + " " + p.SortDir
	if err := db.Order(order).Limit(p.PerPage).Offset(offset).Find(dest).Error; err != nil {
		return Meta{}, err
	}
	totalPages := int(total) / p.PerPage
	if int(total)%p.PerPage != 0 {
		totalPages++
	}
	return Meta{Page: p.Page, PerPage: p.PerPage, Total: total, TotalPages: totalPages}, nil
}
