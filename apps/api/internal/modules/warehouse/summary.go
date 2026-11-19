package warehouse

import (
	"github.com/gin-gonic/gin"
	"github.com/scaleup/clinic-v2/api/internal/platform/filter"
	"github.com/scaleup/clinic-v2/api/internal/platform/response"
	"gorm.io/gorm"
)

// DokumenFilter narrows a stock document list (konversi, produksi, opname) by period
// and by a barang that appears in its details.
type DokumenFilter struct {
	Periode  filter.DateRange
	BarangID uint
}

func dokumenFilter(c *gin.Context) (DokumenFilter, error) {
	r, err := filter.DateRangeFromContext(c)
	return DokumenFilter{Periode: r, BarangID: filter.UintQuery(c, "barang_id")}, err
}

// dokumenTable describes a stock document header and its detail table.
type dokumenTable struct {
	header, detail, fk string
}

var (
	tblKonversi = dokumenTable{"konversi_stoks", "konversi_stok_details", "konversi_stok_id"}
	tblProduksi = dokumenTable{"produksi_barangs", "produksi_barang_details", "produksi_barang_id"}
	tblOpname   = dokumenTable{"stok_opnames", "stok_opname_details", "stok_opname_id"}
)

func (f DokumenFilter) apply(q *gorm.DB, t dokumenTable) *gorm.DB {
	q = f.Periode.Apply(q, t.header+".tanggal")
	if f.BarangID > 0 {
		q = q.Where(t.header+".id IN (SELECT "+t.fk+" FROM "+t.detail+" WHERE barang_id = ?)", f.BarangID)
	}
	return q
}

// DokumenSummary is the overview above a stock document list. Masuk/Keluar apply to
// konversi and produksi; SelisihPlus/SelisihMinus/ItemSelisih to stok opname.
type DokumenSummary struct {
	JumlahDokumen int64 `json:"jumlah_dokumen"`
	JumlahBarang  int64 `json:"jumlah_barang"`
	QtyMasuk      int64 `json:"qty_masuk"`
	QtyKeluar     int64 `json:"qty_keluar"`
	SelisihPlus   int64 `json:"selisih_plus"`
	SelisihMinus  int64 `json:"selisih_minus"`
	ItemSelisih   int64 `json:"item_selisih"`
}

func (s *Service) dokumenSummary(t dokumenTable, f DokumenFilter, search string) (DokumenSummary, error) {
	var out DokumenSummary
	headers := f.apply(s.repo.db.Table(t.header), t)
	if search != "" {
		like := "%" + search + "%"
		headers = headers.Where(t.header+".kode ILIKE ? OR "+t.header+".keterangan ILIKE ?", like, like)
	}
	ids := headers.Select(t.header + ".id")
	if err := s.repo.db.Table(t.header).Where("id IN (?)", ids).Count(&out.JumlahDokumen).Error; err != nil {
		return out, err
	}
	details := s.repo.db.Table(t.detail).Where(t.fk+" IN (?)", ids)
	sel := "COUNT(DISTINCT barang_id) AS jumlah_barang"
	if t == tblOpname {
		sel += `, COALESCE(SUM(selisih) FILTER (WHERE selisih > 0), 0) AS selisih_plus,
			COALESCE(-SUM(selisih) FILTER (WHERE selisih < 0), 0) AS selisih_minus,
			COUNT(*) FILTER (WHERE selisih <> 0) AS item_selisih`
	} else {
		sel += `, COALESCE(SUM(qty) FILTER (WHERE tipe = 'masuk'), 0) AS qty_masuk,
			COALESCE(SUM(qty) FILTER (WHERE tipe = 'keluar'), 0) AS qty_keluar`
	}
	// Scan the detail totals separately: Scan zeroes fields it does not select.
	var totals DokumenSummary
	err := details.Select(sel).Scan(&totals).Error
	totals.JumlahDokumen = out.JumlahDokumen
	return totals, err
}

func (h *Handler) dokumenSummaryHandler(t dokumenTable) gin.HandlerFunc {
	return func(c *gin.Context) {
		f, err := dokumenFilter(c)
		if err != nil {
			response.BadRequest(c, err.Error(), nil)
			return
		}
		out, err := h.svc.dokumenSummary(t, f, c.Query("search"))
		if err != nil {
			response.Internal(c, err.Error())
			return
		}
		response.OK(c, out, "ok")
	}
}

// KartuStokSummary totals the movements matching the kartu stok filters.
type KartuStokSummary struct {
	JumlahMutasi int64 `json:"jumlah_mutasi"`
	JumlahBarang int64 `json:"jumlah_barang"`
	TotalMasuk   int64 `json:"total_masuk"`
	TotalKeluar  int64 `json:"total_keluar"`
}

func (s *Service) kartuStokQuery(f KartuStokFilter, search string) *gorm.DB {
	q := s.repo.db.Model(&KartuStok{})
	if f.BarangID > 0 {
		q = q.Where("barang_id = ?", f.BarangID)
	}
	q = filter.DateRange{Dari: f.Dari, Sampai: f.Sampai}.Apply(q, "tanggal")
	if search != "" {
		like := "%" + search + "%"
		q = q.Where("kode ILIKE ? OR keterangan ILIKE ? OR referensi ILIKE ?", like, like, like)
	}
	return q
}

func (s *Service) KartuStokSummary(f KartuStokFilter, search string) (KartuStokSummary, error) {
	var out KartuStokSummary
	err := s.kartuStokQuery(f, search).Select(`COUNT(*) AS jumlah_mutasi, COUNT(DISTINCT barang_id) AS jumlah_barang,
		COALESCE(SUM(qty_masuk), 0) AS total_masuk, COALESCE(SUM(qty_keluar), 0) AS total_keluar`).Scan(&out).Error
	return out, err
}

func (h *Handler) SummaryKartuStok(c *gin.Context) {
	r, err := filter.DateRangeFromContext(c)
	if err != nil {
		response.BadRequest(c, err.Error(), nil)
		return
	}
	out, err := h.svc.KartuStokSummary(KartuStokFilter{BarangID: filter.UintQuery(c, "barang_id"), Dari: r.Dari, Sampai: r.Sampai}, c.Query("search"))
	if err != nil {
		response.Internal(c, err.Error())
		return
	}
	response.OK(c, out, "ok")
}
