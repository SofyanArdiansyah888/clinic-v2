package perawatan

import (
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/scaleup/clinic-v2/api/internal/modules/paket"
	"github.com/scaleup/clinic-v2/api/internal/modules/treatment"
	"github.com/scaleup/clinic-v2/api/internal/platform/branch"
	"github.com/scaleup/clinic-v2/api/internal/platform/filter"
	"github.com/scaleup/clinic-v2/api/internal/platform/generator"
	"github.com/scaleup/clinic-v2/api/internal/platform/pagination"
	"github.com/scaleup/clinic-v2/api/internal/platform/response"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

type Repository struct{ db *gorm.DB }

func NewRepository(db *gorm.DB) *Repository { return &Repository{db: db} }

type Service struct {
	repo *Repository
	gen  *generator.Service
	cab  branch.Ctx
}

// For binds the service to the request's active branch.
func (s *Service) For(c *gin.Context) *Service {
	cp := *s
	cp.cab = branch.From(c)
	return &cp
}

// resepScope limits reseps to perawatans of the active branch.
func (s *Service) resepScope(q *gorm.DB) *gorm.DB {
	if s.cab.All {
		return q
	}
	return q.Where("perawatan_id IN (SELECT id FROM perawatans WHERE cabang_id = ?)", s.cab.ID)
}

func NewService(repo *Repository, gen *generator.Service) *Service {
	return &Service{repo: repo, gen: gen}
}

type TindakanInput struct {
	TreatmentID  uint    `json:"treatment_id"`
	Tanggal      string  `json:"tanggal"`
	Jumlah       int     `json:"jumlah"`
	BeauticianID *uint   `json:"beautician_id"`
	Harga        float64 `json:"harga"`
	Diskon       float64 `json:"diskon"`
	RpPercent    float64 `json:"rp_percent"`
	Total        float64 `json:"total"`
	Status       string  `json:"status"`
	Catatan      string  `json:"catatan"`
	// PaketItemID redeems the tindakan from a package item the pasien owns (price forced 0).
	PaketItemID *uint `json:"paket_item_id"`
	// PaketBeliIndex (0-based, into this request's tindakans) redeems it from the package
	// bought by that tindakan in the same visit; stored as paket_beli_tindakan_id.
	PaketBeliIndex *int `json:"paket_beli_index"`
}

type ResepBarangInput struct {
	BarangID   uint    `json:"barang_id"`
	KodeBarang string  `json:"kode_barang"`
	NamaBarang string  `json:"nama_barang"`
	Jumlah     float64 `json:"jumlah"`
	Unit       string  `json:"unit"`
	Harga      float64 `json:"harga"`
	Total      float64 `json:"total"`
}

type ResepInput struct {
	AntrianID *uint              `json:"antrian_id"`
	PasienID  *uint              `json:"pasien_id"`
	StaffID   *uint              `json:"staff_id"`
	Tanggal   string             `json:"tanggal"`
	Status    string             `json:"status"`
	Barangs   []ResepBarangInput `json:"barangs"`
}

type UpsertRequest struct {
	PasienID            uint            `json:"pasien_id" binding:"required"`
	TreatmentID         *uint           `json:"treatment_id"`
	StaffID             uint            `json:"staff_id" binding:"required"`
	AntrianID           *uint           `json:"antrian_id"`
	Tanggal             string          `json:"tanggal"`
	JamMulai            string          `json:"jam_mulai"`
	JamSelesai          string          `json:"jam_selesai"`
	Status              string          `json:"status"`
	Anamnesis           string          `json:"anamnesis"`
	PemeriksaanAwal     string          `json:"pemeriksaan_awal"`
	Pemeriksaan         string          `json:"pemeriksaan"`
	Diagnosa            string          `json:"diagnosa"`
	Tindakan            string          `json:"tindakan"`
	Catatan             string          `json:"catatan"`
	Biaya               float64         `json:"biaya"`
	KunjunganBerikutnya string          `json:"kunjungan_berikutnya"`
	FotoPerawatan       datatypes.JSON  `json:"foto_perawatan"`
	FotoSebelum         datatypes.JSON  `json:"foto_sebelum"`
	FotoSesudah         datatypes.JSON  `json:"foto_sesudah"`
	IsActive            *bool           `json:"is_active"`
	Tindakans           []TindakanInput `json:"tindakans"`
	Reseps              []ResepInput    `json:"reseps"`
}

type StatusRequest struct {
	Status string `json:"status" binding:"required"`
}

type Handler struct{ svc *Service }

func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

func parseDate(s string) (time.Time, error) {
	if s == "" {
		return time.Now(), nil
	}
	if t, err := time.Parse("2006-01-02", s); err == nil {
		return t, nil
	}
	return time.Parse(time.RFC3339, s)
}

type ListFilters struct {
	Status  string
	Tanggal string
}

func filtersFromContext(c *gin.Context) ListFilters {
	return ListFilters{
		Status:  c.Query("status"),
		Tanggal: c.Query("tanggal"),
	}
}

func applyListFilters(q *gorm.DB, f ListFilters) *gorm.DB {
	if f.Status != "" {
		q = q.Where("status = ?", f.Status)
	}
	if f.Tanggal != "" {
		q = q.Where("tanggal = ?", f.Tanggal)
	}
	return q
}

func (s *Service) preload(q *gorm.DB) *gorm.DB {
	return q.Preload("Pasien").Preload("Staff").Preload("Treatment").
		Preload("Tindakans.Treatment").Preload("Reseps.Barangs")
}

func (s *Service) List(p pagination.Params, f ListFilters) ([]Perawatan, pagination.Meta, error) {
	q := s.preload(s.cab.Scope(s.repo.db.Model(&Perawatan{}), "perawatans.cabang_id"))
	q = applyListFilters(q, f)
	if p.Search != "" {
		like := "%" + p.Search + "%"
		q = q.Where("kode ILIKE ? OR status ILIKE ? OR diagnosa ILIKE ?", like, like, like)
	}
	var items []Perawatan
	meta, err := pagination.Paginate(q, p, &items)
	return items, meta, err
}

func (s *Service) Get(id uint) (*Perawatan, error) {
	var item Perawatan
	if err := s.preload(s.cab.Scope(s.repo.db, "cabang_id")).First(&item, id).Error; err != nil {
		return nil, err
	}
	return &item, nil
}

func (s *Service) applyFields(item *Perawatan, req UpsertRequest) error {
	tanggal, err := parseDate(req.Tanggal)
	if err != nil {
		return err
	}
	item.PasienID = req.PasienID
	item.TreatmentID = req.TreatmentID
	item.StaffID = req.StaffID
	item.AntrianID = req.AntrianID
	item.Tanggal = tanggal
	item.JamMulai = req.JamMulai
	item.JamSelesai = req.JamSelesai
	if req.Status != "" {
		item.Status = req.Status
	}
	item.Anamnesis = req.Anamnesis
	item.PemeriksaanAwal = req.PemeriksaanAwal
	item.Pemeriksaan = req.Pemeriksaan
	item.Diagnosa = req.Diagnosa
	item.Tindakan = req.Tindakan
	item.Catatan = req.Catatan
	item.Biaya = req.Biaya
	item.FotoPerawatan = req.FotoPerawatan
	item.FotoSebelum = req.FotoSebelum
	item.FotoSesudah = req.FotoSesudah
	if req.KunjunganBerikutnya != "" {
		if t, err := parseDate(req.KunjunganBerikutnya); err == nil {
			item.KunjunganBerikutnya = &t
		}
	}
	if req.IsActive != nil {
		item.IsActive = *req.IsActive
	}
	return nil
}

func (s *Service) syncNested(tx *gorm.DB, perawatanID, cabangID uint, req UpsertRequest) error {
	if req.Tindakans != nil {
		if err := cekPaket(tx, req.PasienID, req.Tindakans); err != nil {
			return ErrPaket{err}
		}
		tx.Where("perawatan_id = ?", perawatanID).Delete(&PerawatanTindakan{})
		rows := make([]PerawatanTindakan, len(req.Tindakans))
		for i, t := range req.Tindakans {
			tanggal, _ := parseDate(t.Tanggal)
			status := t.Status
			if status == "" {
				status = "draft"
			}
			jumlah := t.Jumlah
			if jumlah == 0 {
				jumlah = 1
			}
			row := PerawatanTindakan{
				PerawatanID: perawatanID, TreatmentID: t.TreatmentID, Tanggal: tanggal,
				Jumlah: jumlah, BeauticianID: t.BeauticianID, Harga: t.Harga, Diskon: t.Diskon,
				RpPercent: t.RpPercent, Total: t.Total, Status: status, Catatan: t.Catatan, IsActive: true,
			}
			if (t.PaketItemID != nil && *t.PaketItemID > 0) || t.PaketBeliIndex != nil {
				// A session redeemed from a package is already paid for.
				row.Harga, row.Diskon, row.RpPercent, row.Total = 0, 0, 0, 0
				if t.PaketItemID != nil && *t.PaketItemID > 0 {
					row.PaketItemID = t.PaketItemID
				}
			}
			if err := tx.Omit("Treatment", "Beautician").Create(&row).Error; err != nil {
				return err
			}
			rows[i] = row
		}
		for i, t := range req.Tindakans {
			if t.PaketBeliIndex == nil {
				continue
			}
			if err := tx.Model(&PerawatanTindakan{}).Where("id = ?", rows[i].ID).
				Update("paket_beli_tindakan_id", rows[*t.PaketBeliIndex].ID).Error; err != nil {
				return err
			}
		}
	}
	if req.Reseps != nil {
		var existing []PerawatanResep
		tx.Where("perawatan_id = ?", perawatanID).Find(&existing)
		for _, e := range existing {
			tx.Where("perawatan_resep_id = ?", e.ID).Delete(&PerawatanResepBarang{})
		}
		tx.Where("perawatan_id = ?", perawatanID).Delete(&PerawatanResep{})
		for _, r := range req.Reseps {
			tanggal, _ := parseDate(r.Tanggal)
			status := r.Status
			if status == "" {
				status = "draft"
			}
			kode, err := s.gen.GenerateCabang("RES", cabangID)
			if err != nil {
				return err
			}
			resep := PerawatanResep{
				PerawatanID: perawatanID, AntrianID: r.AntrianID, PasienID: r.PasienID,
				StaffID: r.StaffID, Kode: kode, Tanggal: tanggal, Status: status, IsActive: true,
			}
			// A resep written inside a perawatan belongs to that perawatan's pasien, dokter and
			// antrian; the EMR form doesn't send them per resep, so default them here.
			if resep.PasienID == nil || *resep.PasienID == 0 {
				resep.PasienID = uintPtr(req.PasienID)
			}
			if resep.StaffID == nil || *resep.StaffID == 0 {
				resep.StaffID = uintPtr(req.StaffID)
			}
			if resep.AntrianID == nil {
				resep.AntrianID = req.AntrianID
			}
			if err := tx.Create(&resep).Error; err != nil {
				return err
			}
			for _, b := range r.Barangs {
				row := PerawatanResepBarang{
					PerawatanResepID: resep.ID, BarangID: b.BarangID, KodeBarang: b.KodeBarang,
					NamaBarang: b.NamaBarang, Jumlah: b.Jumlah, Unit: b.Unit, Harga: b.Harga,
					Total: b.Total, IsActive: true,
				}
				if err := tx.Create(&row).Error; err != nil {
					return err
				}
			}
		}
	}
	return nil
}

// ErrPaket is a tindakan's package redemption that cannot be accepted (400).
type ErrPaket struct{ err error }

func (e ErrPaket) Error() string { return e.err.Error() }
func (e ErrPaket) Unwrap() error { return e.err }

// cekPaket validates tindakan redeemed from packages before they are saved: a package
// item must belong to the pasien, be active, match the treatment and have the sessions
// left (the cashier checks again under lock); a same-visit redemption must point at a
// paket tindakan of this request whose package contains the treatment.
func cekPaket(tx *gorm.DB, pasienID uint, tindakans []TindakanInput) error {
	var pakai []paket.Pakai
	beli := map[[2]int]int{} // (paket tindakan index, treatment) -> sessions asked
	for i, t := range tindakans {
		qty := t.Jumlah
		if qty <= 0 {
			qty = 1
		}
		hasItem := t.PaketItemID != nil && *t.PaketItemID > 0
		if hasItem && t.PaketBeliIndex != nil {
			return fmt.Errorf("tindakan %d: pilih salah satu, paket milik pasien atau paket yang dibeli sekarang", i+1)
		}
		if hasItem {
			pakai = append(pakai, paket.Pakai{ItemID: *t.PaketItemID, TreatmentID: t.TreatmentID, Qty: qty})
			continue
		}
		if t.PaketBeliIndex == nil {
			continue
		}
		j := *t.PaketBeliIndex
		if j < 0 || j >= len(tindakans) || j == i {
			return fmt.Errorf("tindakan %d: paket yang dibeli tidak ditemukan", i+1)
		}
		src := tindakans[j]
		if src.PaketItemID != nil || src.PaketBeliIndex != nil {
			return fmt.Errorf("tindakan %d: tindakan sumber bukan pembelian paket", i+1)
		}
		var tr treatment.Treatment
		if err := tx.First(&tr, src.TreatmentID).Error; err != nil || !tr.IsPaket() {
			return fmt.Errorf("tindakan %d: tindakan sumber bukan pembelian paket", i+1)
		}
		items, err := paket.KatalogItems(tx, tr)
		if err != nil {
			return err
		}
		sesi := 0
		for _, it := range items {
			if it.TreatmentID == t.TreatmentID {
				sesi = it.Sesi
			}
		}
		if sesi == 0 {
			return fmt.Errorf("tindakan %d: treatment ini tidak termasuk dalam %s", i+1, tr.Nama)
		}
		key := [2]int{j, int(t.TreatmentID)}
		beli[key] += qty
		if beli[key] > sesi {
			return fmt.Errorf("tindakan %d: %s hanya berisi %d sesi treatment ini", i+1, tr.Nama, sesi)
		}
	}
	_, err := paket.Cek(tx, pasienID, pakai, false)
	return err
}

func antrianStatusForPerawatan(status string) string {
	switch status {
	case "proses", "diproses":
		return "diproses"
	case "selesai", "bayar":
		return "bayar"
	case "batal", "dibatalkan":
		return "batal"
	default:
		return ""
	}
}

func (s *Service) syncLinkedAntrian(tx *gorm.DB, antrianID *uint, perawatanStatus string) error {
	if antrianID == nil || *antrianID == 0 {
		return nil
	}
	next := antrianStatusForPerawatan(perawatanStatus)
	if next == "" {
		return nil
	}
	return tx.Table("antrians").Where("id = ?", *antrianID).Update("status", next).Error
}

func (s *Service) Create(req UpsertRequest) (*Perawatan, error) {
	cabangID, err := s.cab.WriteID()
	if err != nil {
		return nil, err
	}
	kode, err := s.gen.GenerateCabang("PRW", cabangID)
	if err != nil {
		return nil, err
	}
	item := &Perawatan{Kode: kode, CabangID: cabangID, Status: "draft", IsActive: true}
	if err := s.applyFields(item, req); err != nil {
		return nil, err
	}
	err = s.repo.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(item).Error; err != nil {
			return err
		}
		if err := s.syncNested(tx, item.ID, item.CabangID, req); err != nil {
			return err
		}
		return s.syncLinkedAntrian(tx, item.AntrianID, item.Status)
	})
	if err != nil {
		return nil, err
	}
	return s.Get(item.ID)
}

var ErrPerawatanTerkunci = errors.New("perawatan sudah dibayar; tindakan dan resep tidak bisa diubah")

func (s *Service) Update(id uint, req UpsertRequest) (*Perawatan, error) {
	item, err := s.Get(id)
	if err != nil {
		return nil, err
	}
	// Once paid, tindakan and resep are billed and resep stock is out; rewriting them would desync both.
	if item.Status == "selesai" && (req.Tindakans != nil || req.Reseps != nil) {
		return nil, ErrPerawatanTerkunci
	}
	if err := s.applyFields(item, req); err != nil {
		return nil, err
	}
	err = s.repo.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Save(item).Error; err != nil {
			return err
		}
		if err := s.syncNested(tx, item.ID, item.CabangID, req); err != nil {
			return err
		}
		return s.syncLinkedAntrian(tx, item.AntrianID, item.Status)
	})
	if err != nil {
		return nil, err
	}
	return s.Get(id)
}

func (s *Service) UpdateStatus(id uint, status string) (*Perawatan, error) {
	item, err := s.Get(id)
	if err != nil {
		return nil, err
	}
	item.Status = status
	if err := s.repo.db.Save(item).Error; err != nil {
		return nil, err
	}
	return s.Get(id)
}

func (s *Service) Delete(id uint) error {
	if _, err := s.Get(id); err != nil {
		return err
	}
	return s.repo.db.Transaction(func(tx *gorm.DB) error {
		var reseps []PerawatanResep
		tx.Where("perawatan_id = ?", id).Find(&reseps)
		for _, r := range reseps {
			tx.Where("perawatan_resep_id = ?", r.ID).Delete(&PerawatanResepBarang{})
		}
		tx.Where("perawatan_id = ?", id).Delete(&PerawatanResep{})
		tx.Where("perawatan_id = ?", id).Delete(&PerawatanTindakan{})
		return tx.Delete(&Perawatan{}, id).Error
	})
}

func (h *Handler) Index(c *gin.Context) {
	items, meta, err := h.svc.For(c).List(pagination.FromContext(c), filtersFromContext(c))
	if err != nil {
		response.Internal(c, err.Error())
		return
	}
	response.OKWithMeta(c, items, meta, "ok")
}

func (h *Handler) Show(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	item, err := h.svc.For(c).Get(uint(id))
	if err != nil {
		response.NotFound(c, "perawatan not found")
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
	item, err := h.svc.For(c).Create(req)
	if err != nil {
		var pe ErrPaket
		if errors.As(err, &pe) {
			response.BadRequest(c, err.Error(), nil)
			return
		}
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
	item, err := h.svc.For(c).Update(uint(id), req)
	if err != nil {
		var pe ErrPaket
		if errors.Is(err, ErrPerawatanTerkunci) || errors.As(err, &pe) {
			response.BadRequest(c, err.Error(), nil)
			return
		}
		response.Internal(c, err.Error())
		return
	}
	response.OK(c, item, "updated")
}

func (h *Handler) Destroy(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	if err := h.svc.For(c).Delete(uint(id)); err != nil {
		response.Internal(c, err.Error())
		return
	}
	response.OK(c, nil, "deleted")
}

func (h *Handler) UpdateStatus(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	var req StatusRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "validation failed", err.Error())
		return
	}
	item, err := h.svc.For(c).UpdateStatus(uint(id), req.Status)
	if err != nil {
		response.Internal(c, err.Error())
		return
	}
	response.OK(c, item, "status updated")
}

// ResepFilter narrows the resep list; Status is a comma-separated list of resep statuses.
type ResepFilter struct {
	Status   string
	Periode  filter.DateRange
	StaffID  uint // dokter
	PasienID uint
}

func resepFilter(c *gin.Context) (ResepFilter, error) {
	r, err := filter.DateRangeFromContext(c)
	return ResepFilter{
		Status: c.Query("status"), Periode: r,
		StaffID: filter.UintQuery(c, "staff_id"), PasienID: filter.UintQuery(c, "pasien_id"),
	}, err
}

// resepQuery applies every filter except status, which the summary breaks down instead.
func (s *Service) resepQuery(f ResepFilter, search string) *gorm.DB {
	q := f.Periode.Apply(s.resepScope(s.repo.db.Model(&PerawatanResep{})), "tanggal")
	if f.StaffID > 0 {
		q = q.Where("staff_id = ?", f.StaffID)
	}
	if f.PasienID > 0 {
		q = q.Where("pasien_id = ?", f.PasienID)
	}
	if search != "" {
		like := "%" + search + "%"
		q = q.Where("kode ILIKE ? OR pasien_id IN (SELECT id FROM pasiens WHERE nama ILIKE ? OR kode ILIKE ?)", like, like, like)
	}
	return q
}

func (s *Service) ListResep(p pagination.Params, f ResepFilter) ([]PerawatanResep, pagination.Meta, error) {
	q := s.resepQuery(f, p.Search).Preload("Pasien").Preload("Staff").Preload("Barangs")
	if f.Status != "" {
		q = q.Where("status IN ?", strings.Split(f.Status, ","))
	}
	var items []PerawatanResep
	meta, err := pagination.Paginate(q, p, &items)
	if err != nil || len(items) == 0 {
		return items, meta, err
	}
	ids := make([]uint, 0, len(items))
	for _, it := range items {
		ids = append(ids, it.PerawatanID)
	}
	var pws []struct {
		ID     uint
		Kode   string
		Status string
	}
	if err := s.repo.db.Table("perawatans").Select("id, kode, status").Where("id IN ?", ids).Scan(&pws).Error; err != nil {
		return nil, meta, err
	}
	byID := make(map[uint]int, len(pws))
	for i, pw := range pws {
		byID[pw.ID] = i
	}
	for i := range items {
		if j, ok := byID[items[i].PerawatanID]; ok {
			items[i].PerawatanKode, items[i].PerawatanStatus = pws[j].Kode, pws[j].Status
		}
	}
	return items, meta, nil
}

// ResepSummary counts reseps per status; MenungguKasir is the part of Draft whose
// perawatan has been sent to the kasir (status "bayar") and can be paid now.
type ResepSummary struct {
	Draft         int64 `json:"draft"`
	MenungguKasir int64 `json:"menunggu_kasir"`
	Dibayar       int64 `json:"dibayar"`
	Diserahkan    int64 `json:"diserahkan"`
}

func (s *Service) ResepSummary(f ResepFilter, search string) (ResepSummary, error) {
	var out ResepSummary
	err := s.resepQuery(f, search).Select(`
		COUNT(*) FILTER (WHERE status = 'draft') AS draft,
		COUNT(*) FILTER (WHERE status = 'draft' AND perawatan_id IN (SELECT id FROM perawatans WHERE status = 'bayar')) AS menunggu_kasir,
		COUNT(*) FILTER (WHERE status = ?) AS dibayar,
		COUNT(*) FILTER (WHERE status = ?) AS diserahkan`, ResepStatusDibayar, ResepStatusDiserahkan).
		Scan(&out).Error
	return out, err
}

func (s *Service) SerahkanResep(id uint) (*PerawatanResep, error) {
	res := s.resepScope(s.repo.db.Model(&PerawatanResep{})).
		Where("id = ? AND status = ?", id, ResepStatusDibayar).
		Update("status", ResepStatusDiserahkan)
	if res.Error != nil {
		return nil, res.Error
	}
	if res.RowsAffected == 0 {
		return nil, errors.New("resep tidak ditemukan atau belum dibayar")
	}
	var item PerawatanResep
	if err := s.repo.db.Preload("Pasien").Preload("Staff").Preload("Barangs").First(&item, id).Error; err != nil {
		return nil, err
	}
	return &item, nil
}

func (h *Handler) IndexResep(c *gin.Context) {
	f, err := resepFilter(c)
	if err != nil {
		response.BadRequest(c, err.Error(), nil)
		return
	}
	items, meta, err := h.svc.For(c).ListResep(pagination.FromContext(c), f)
	if err != nil {
		response.Internal(c, err.Error())
		return
	}
	response.OKWithMeta(c, items, meta, "ok")
}

func (h *Handler) SummaryResep(c *gin.Context) {
	f, err := resepFilter(c)
	if err != nil {
		response.BadRequest(c, err.Error(), nil)
		return
	}
	out, err := h.svc.For(c).ResepSummary(f, c.Query("search"))
	if err != nil {
		response.Internal(c, err.Error())
		return
	}
	response.OK(c, out, "ok")
}

func (h *Handler) SerahkanResep(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	item, err := h.svc.For(c).SerahkanResep(uint(id))
	if err != nil {
		response.BadRequest(c, err.Error(), nil)
		return
	}
	response.OK(c, item, "resep diserahkan")
}

func RegisterRoutes(rg *gin.RouterGroup, db *gorm.DB, gen *generator.Service) {
	h := NewHandler(NewService(NewRepository(db), gen))
	g := rg.Group("/perawatan")
	{
		g.GET("", h.Index)
		g.POST("", h.Store)
		g.GET("/:id", h.Show)
		g.PUT("/:id", h.Update)
		g.DELETE("/:id", h.Destroy)
		g.PATCH("/:id/status", h.UpdateStatus)
	}
	r := rg.Group("/resep")
	{
		r.GET("", h.IndexResep)
		r.GET("/summary", h.SummaryResep)
		r.PATCH("/:id/serahkan", h.SerahkanResep)
	}
}

func uintPtr(v uint) *uint {
	if v == 0 {
		return nil
	}
	return &v
}
