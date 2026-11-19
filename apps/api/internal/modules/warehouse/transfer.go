package warehouse

import (
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/scaleup/clinic-v2/api/internal/modules/barang"
	"github.com/scaleup/clinic-v2/api/internal/platform/filter"
	"github.com/scaleup/clinic-v2/api/internal/platform/middleware"
	"github.com/scaleup/clinic-v2/api/internal/platform/pagination"
	"github.com/scaleup/clinic-v2/api/internal/platform/response"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// Transfer status: sent stock has left the source branch; received stock is in the
// destination; a transfer cancelled before it was received puts the stock back.
const (
	TransferDikirim  = "dikirim"
	TransferDiterima = "diterima"
	TransferBatal    = "batal"
)

// TransferStok moves barang from one branch to another. It only changes where stock is;
// inventory is one book, so no journal is posted.
type TransferStok struct {
	ID            uint                 `gorm:"primaryKey" json:"id"`
	Kode          string               `gorm:"size:50;uniqueIndex;not null" json:"kode"`
	DariCabangID  uint                 `gorm:"not null;index" json:"dari_cabang_id"`
	KeCabangID    uint                 `gorm:"not null;index" json:"ke_cabang_id"`
	Tanggal       time.Time            `gorm:"type:date;not null" json:"tanggal"`
	Status        string               `gorm:"size:20;not null;default:dikirim;index" json:"status"`
	Keterangan    string               `gorm:"type:text" json:"keterangan"`
	DikirimOleh   uint                 `gorm:"not null" json:"dikirim_oleh"`
	SelesaiOleh   *uint                `json:"selesai_oleh"`
	SelesaiAt     *time.Time           `json:"selesai_at"`
	CatatanTerima string               `gorm:"type:text" json:"catatan_terima"`
	CreatedAt     time.Time            `json:"created_at"`
	UpdatedAt     time.Time            `json:"updated_at"`
	Details       []TransferStokDetail `gorm:"foreignKey:TransferStokID" json:"details,omitempty"`

	// Read-only names filled by the list/detail queries.
	DariCabangNama string `gorm:"->;-:migration" json:"dari_cabang_nama"`
	KeCabangNama   string `gorm:"->;-:migration" json:"ke_cabang_nama"`
	DikirimNama    string `gorm:"->;-:migration" json:"dikirim_nama"`
	SelesaiNama    string `gorm:"->;-:migration" json:"selesai_nama"`
}

func (TransferStok) TableName() string { return "transfer_stoks" }

type TransferStokDetail struct {
	ID             uint           `gorm:"primaryKey" json:"id"`
	TransferStokID uint           `gorm:"not null;index" json:"transfer_stok_id"`
	BarangID       uint           `gorm:"not null;index" json:"barang_id"`
	Qty            int            `gorm:"not null" json:"qty"`
	Barang         *barang.Barang `gorm:"foreignKey:BarangID" json:"barang,omitempty"`
}

func (TransferStokDetail) TableName() string { return "transfer_stok_details" }

var (
	ErrTransferTidakAda = errors.New("transfer stok tidak ditemukan")
	ErrTransferSelesai  = errors.New("transfer ini sudah diterima atau dibatalkan")
)

type TransferDetailInput struct {
	BarangID uint `json:"barang_id" binding:"required"`
	Qty      int  `json:"qty" binding:"required,gt=0"`
}

type TransferRequest struct {
	KeCabangID uint                  `json:"ke_cabang_id" binding:"required"`
	Tanggal    string                `json:"tanggal" binding:"required"`
	Keterangan string                `json:"keterangan"`
	Details    []TransferDetailInput `json:"details" binding:"required,min=1,dive"`
}

type TransferFilter struct {
	Arah    string // keluar (sent from the active branch) | masuk (sent to it) | "" both
	Status  string
	Periode filter.DateRange
}

func (s *Service) transferQuery(db *gorm.DB) *gorm.DB {
	return db.Model(&TransferStok{}).
		Select(`transfer_stoks.*, COALESCE(cd.nama, '') AS dari_cabang_nama, COALESCE(ck.nama, '') AS ke_cabang_nama,
			COALESCE(ud.name, '') AS dikirim_nama, COALESCE(us.name, '') AS selesai_nama`).
		Joins("LEFT JOIN cabangs cd ON cd.id = transfer_stoks.dari_cabang_id").
		Joins("LEFT JOIN cabangs ck ON ck.id = transfer_stoks.ke_cabang_id").
		Joins("LEFT JOIN users ud ON ud.id = transfer_stoks.dikirim_oleh").
		Joins("LEFT JOIN users us ON us.id = transfer_stoks.selesai_oleh")
}

// visible limits transfers to those sent from or to the active branch.
func (s *Service) visible(q *gorm.DB, arah string) *gorm.DB {
	if s.cab.All {
		return q
	}
	switch arah {
	case "keluar":
		return q.Where("transfer_stoks.dari_cabang_id = ?", s.cab.ID)
	case "masuk":
		return q.Where("transfer_stoks.ke_cabang_id = ?", s.cab.ID)
	}
	return q.Where("transfer_stoks.dari_cabang_id = ? OR transfer_stoks.ke_cabang_id = ?", s.cab.ID, s.cab.ID)
}

func (s *Service) ListTransfer(p pagination.Params, f TransferFilter) ([]TransferStok, pagination.Meta, error) {
	q := s.visible(s.transferQuery(s.repo.db), f.Arah).Preload("Details.Barang")
	if f.Status != "" {
		q = q.Where("transfer_stoks.status = ?", f.Status)
	}
	q = f.Periode.Apply(q, "transfer_stoks.tanggal")
	if p.Search != "" {
		like := "%" + p.Search + "%"
		q = q.Where(`transfer_stoks.kode ILIKE ? OR transfer_stoks.keterangan ILIKE ? OR transfer_stoks.id IN (
			SELECT d.transfer_stok_id FROM transfer_stok_details d JOIN barangs b ON b.id = d.barang_id
			WHERE b.nama ILIKE ? OR b.kode ILIKE ?)`, like, like, like, like)
	}
	p.SortBy = "transfer_stoks." + p.SortBy
	var items []TransferStok
	meta, err := pagination.Paginate(q, p, &items)
	if items == nil {
		items = []TransferStok{}
	}
	return items, meta, err
}

func (s *Service) GetTransfer(id uint) (*TransferStok, error) {
	var item TransferStok
	err := s.visible(s.transferQuery(s.repo.db), "").Preload("Details.Barang").
		Where("transfer_stoks.id = ?", id).First(&item).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrTransferTidakAda
	}
	return &item, err
}

// CreateTransfer sends stock from the active branch; it leaves the source right away.
func (s *Service) CreateTransfer(userID uint, req TransferRequest) (*TransferStok, error) {
	dari, err := s.cab.WriteID()
	if err != nil {
		return nil, err
	}
	if req.KeCabangID == dari {
		return nil, errors.New("cabang tujuan harus berbeda dari cabang asal")
	}
	var tujuan struct {
		Nama     string
		IsActive bool
	}
	if err := s.repo.db.Table("cabangs").Select("nama, is_active").Where("id = ?", req.KeCabangID).Scan(&tujuan).Error; err != nil {
		return nil, err
	}
	if tujuan.Nama == "" || !tujuan.IsActive {
		return nil, errors.New("cabang tujuan tidak ditemukan atau tidak aktif")
	}
	tanggal, err := parseDate(req.Tanggal)
	if err != nil {
		return nil, errors.New("tanggal tidak valid")
	}
	kode, err := s.gen.GenerateCabang("TRF", dari)
	if err != nil {
		return nil, err
	}
	var id uint
	err = s.repo.db.Transaction(func(tx *gorm.DB) error {
		item := &TransferStok{
			Kode: kode, DariCabangID: dari, KeCabangID: req.KeCabangID, Tanggal: tanggal,
			Status: TransferDikirim, Keterangan: strings.TrimSpace(req.Keterangan), DikirimOleh: userID,
		}
		if err := tx.Create(item).Error; err != nil {
			return err
		}
		id = item.ID
		for _, d := range req.Details {
			if err := tx.Create(&TransferStokDetail{TransferStokID: item.ID, BarangID: d.BarangID, Qty: d.Qty}).Error; err != nil {
				return err
			}
			if err := ApplyStockMove(tx, s.gen, dari, d.BarangID, d.Qty, "keluar", kode, "Transfer ke "+tujuan.Nama+" "+kode, tanggal); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.GetTransfer(id)
}

type SelesaiRequest struct {
	Catatan string `json:"catatan"`
}

// TerimaTransfer books the stock into the destination branch, which must be active.
func (s *Service) TerimaTransfer(id, userID uint, req SelesaiRequest) (*TransferStok, error) {
	return s.selesai(id, userID, req, TransferDiterima)
}

// BatalTransfer returns the stock to the source branch; only before it was received.
func (s *Service) BatalTransfer(id, userID uint, req SelesaiRequest) (*TransferStok, error) {
	return s.selesai(id, userID, req, TransferBatal)
}

func (s *Service) selesai(id, userID uint, req SelesaiRequest, status string) (*TransferStok, error) {
	err := s.repo.db.Transaction(func(tx *gorm.DB) error {
		var item TransferStok
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Preload("Details").First(&item, id).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrTransferTidakAda
			}
			return err
		}
		// Receiving happens in the destination, cancelling in the source.
		cabangID := item.KeCabangID
		if status == TransferBatal {
			cabangID = item.DariCabangID
		}
		if !s.cab.All && s.cab.ID != cabangID {
			if s.cab.ID != item.DariCabangID && s.cab.ID != item.KeCabangID {
				return ErrTransferTidakAda
			}
			if status == TransferDiterima {
				return errors.New("transfer hanya bisa diterima oleh cabang tujuan")
			}
			return errors.New("transfer hanya bisa dibatalkan oleh cabang pengirim")
		}
		if item.Status != TransferDikirim {
			return ErrTransferSelesai
		}
		var dariNama string
		tx.Table("cabangs").Where("id = ?", item.DariCabangID).Select("nama").Scan(&dariNama)
		ket := "Terima transfer dari " + dariNama + " " + item.Kode
		if status == TransferBatal {
			ket = "Batal transfer " + item.Kode
		}
		now := time.Now()
		for _, d := range item.Details {
			if err := ApplyStockMove(tx, s.gen, cabangID, d.BarangID, d.Qty, "masuk", item.Kode, ket, now); err != nil {
				return err
			}
		}
		return tx.Model(&TransferStok{}).Where("id = ?", id).Updates(map[string]any{
			"status": status, "selesai_oleh": userID, "selesai_at": now, "catatan_terima": strings.TrimSpace(req.Catatan),
		}).Error
	})
	if err != nil {
		return nil, err
	}
	return s.GetTransfer(id)
}

// TransferSummary counts what the active branch has in transit.
type TransferSummary struct {
	MenungguDiterima int64 `json:"menunggu_diterima"` // sent to this branch, not yet received
	DalamPengiriman  int64 `json:"dalam_pengiriman"`  // sent from this branch, not yet received
	Diterima         int64 `json:"diterima"`
	Batal            int64 `json:"batal"`
}

func (s *Service) TransferSummary(f TransferFilter) (TransferSummary, error) {
	var out TransferSummary
	q := f.Periode.Apply(s.visible(s.repo.db.Model(&TransferStok{}), f.Arah), "transfer_stoks.tanggal")
	masuk, keluar := "TRUE", "TRUE"
	if !s.cab.All {
		masuk = fmt.Sprintf("ke_cabang_id = %d", s.cab.ID)
		keluar = fmt.Sprintf("dari_cabang_id = %d", s.cab.ID)
	}
	err := q.Select(`COUNT(*) FILTER (WHERE status = 'dikirim' AND ` + masuk + `) AS menunggu_diterima,
		COUNT(*) FILTER (WHERE status = 'dikirim' AND ` + keluar + `) AS dalam_pengiriman,
		COUNT(*) FILTER (WHERE status = 'diterima') AS diterima,
		COUNT(*) FILTER (WHERE status = 'batal') AS batal`).Scan(&out).Error
	return out, err
}

// ── handlers ──

func failTransfer(c *gin.Context, err error) {
	if errors.Is(err, ErrTransferTidakAda) {
		response.NotFound(c, err.Error())
		return
	}
	response.BadRequest(c, err.Error(), nil)
}

func transferFilter(c *gin.Context) (TransferFilter, error) {
	r, err := filter.DateRangeFromContext(c)
	return TransferFilter{Arah: c.Query("arah"), Status: c.Query("status"), Periode: r}, err
}

func (h *Handler) IndexTransfer(c *gin.Context) {
	f, err := transferFilter(c)
	if err != nil {
		response.BadRequest(c, err.Error(), nil)
		return
	}
	items, meta, err := h.svc.For(c).ListTransfer(pagination.FromContext(c), f)
	if err != nil {
		response.Internal(c, err.Error())
		return
	}
	response.OKWithMeta(c, items, meta, "ok")
}

func (h *Handler) SummaryTransfer(c *gin.Context) {
	f, err := transferFilter(c)
	if err != nil {
		response.BadRequest(c, err.Error(), nil)
		return
	}
	out, err := h.svc.For(c).TransferSummary(f)
	if err != nil {
		response.Internal(c, err.Error())
		return
	}
	response.OK(c, out, "ok")
}

func (h *Handler) ShowTransfer(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	item, err := h.svc.For(c).GetTransfer(uint(id))
	if err != nil {
		failTransfer(c, err)
		return
	}
	response.OK(c, item, "ok")
}

func (h *Handler) StoreTransfer(c *gin.Context) {
	var req TransferRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "validation failed", err.Error())
		return
	}
	item, err := h.svc.For(c).CreateTransfer(c.GetUint(middleware.ContextUserID), req)
	if err != nil {
		failTransfer(c, err)
		return
	}
	response.Created(c, item, "transfer dikirim")
}

func (h *Handler) selesaiHandler(status string) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
		var req SelesaiRequest
		_ = c.ShouldBindJSON(&req)
		svc := h.svc.For(c)
		userID := c.GetUint(middleware.ContextUserID)
		var item *TransferStok
		var err error
		if status == TransferDiterima {
			item, err = svc.TerimaTransfer(uint(id), userID, req)
		} else {
			item, err = svc.BatalTransfer(uint(id), userID, req)
		}
		if err != nil {
			failTransfer(c, err)
			return
		}
		response.OK(c, item, "transfer "+status)
	}
}

func registerTransfer(rg *gin.RouterGroup, h *Handler) {
	g := rg.Group("/transfer-stok")
	{
		g.GET("", h.IndexTransfer)
		g.GET("/summary", h.SummaryTransfer)
		g.POST("", h.StoreTransfer)
		g.GET("/:id", h.ShowTransfer)
		g.POST("/:id/terima", h.selesaiHandler(TransferDiterima))
		g.POST("/:id/batal", h.selesaiHandler(TransferBatal))
	}
}
