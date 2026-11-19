package pembayaran

import (
	"errors"
	"fmt"
	"math"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/scaleup/clinic-v2/api/internal/modules/finance"
	"github.com/scaleup/clinic-v2/api/internal/modules/kasir"
	"github.com/scaleup/clinic-v2/api/internal/modules/membership"
	"github.com/scaleup/clinic-v2/api/internal/modules/paket"
	"github.com/scaleup/clinic-v2/api/internal/modules/penjualan"
	"github.com/scaleup/clinic-v2/api/internal/modules/perawatan"
	"github.com/scaleup/clinic-v2/api/internal/platform/middleware"
	"github.com/scaleup/clinic-v2/api/internal/platform/response"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// VoidRequest cancels a paid sale. KembalikanKeKasir (default true) puts the perawatan
// back in the kasir queue so it can be billed again; false cancels the visit.
type VoidRequest struct {
	Alasan            string `json:"alasan"`
	KembalikanKeKasir *bool  `json:"kembalikan_ke_kasir"`
	// UserID is the signed-in account (from the JWT), filled by the handler.
	UserID uint `json:"-"`
}

type VoidBarang struct {
	BarangID uint   `json:"barang_id"`
	Nama     string `json:"nama"`
	Qty      int    `json:"qty"`
}

type VoidPaket struct {
	ID            uint   `json:"id"`
	Kode          string `json:"kode"`
	TreatmentNama string `json:"treatment_nama"`
	Status        string `json:"status"`
}

type VoidSesi struct {
	PemakaianID   uint    `json:"pemakaian_id"`
	PaketID       uint    `json:"paket_id"`
	PaketKode     string  `json:"paket_kode"`
	TreatmentNama string  `json:"treatment_nama"`
	Qty           int     `json:"qty"`
	Nilai         float64 `json:"nilai"`
	ItemID        uint    `json:"-"`
	PaketStatus   string  `json:"-"`
}

// VoidDampak is what voiding a sale gives back. Blokir, when set, is why it cannot be voided.
type VoidDampak struct {
	PenjualanID     uint         `json:"penjualan_id"`
	Kode            string       `json:"kode"`
	NoInvoice       string       `json:"no_invoice"`
	Status          string       `json:"status"`
	Total           float64      `json:"total"`
	Refund          float64      `json:"refund"`
	JenisPembayaran string       `json:"jenis_pembayaran"`
	BankID          *uint        `json:"bank_id"`
	DepositKembali  float64      `json:"deposit_kembali"`
	PoinKembali     int          `json:"poin_kembali"`
	Barang          []VoidBarang `json:"barang"`
	PaketDibatalkan []VoidPaket  `json:"paket_dibatalkan"`
	SesiKembali     []VoidSesi   `json:"sesi_kembali"`
	PerawatanID     *uint        `json:"perawatan_id"`
	PerawatanKode   string       `json:"perawatan_kode"`
	ResepKembali    int          `json:"resep_kembali"`
	Blokir          string       `json:"blokir,omitempty"`
}

// ErrVoidDitolak wraps the reasons a paid sale cannot be voided.
var ErrVoidDitolak = errors.New("penjualan tidak bisa dibatalkan")

// dampakVoid works out what a void of pj gives back and whether it is allowed. With lock
// it takes row locks in the kasir's order (perawatan, packages, items, membership) so a
// concurrent payment or package use has to wait.
func (s *Service) dampakVoid(tx *gorm.DB, pj *penjualan.Penjualan, lock bool) (*VoidDampak, error) {
	q := tx
	if lock {
		q = tx.Clauses(clause.Locking{Strength: "UPDATE"}).Session(&gorm.Session{})
	}
	d := &VoidDampak{
		PenjualanID: pj.ID, Kode: pj.Kode, NoInvoice: pj.NoInvoice, Status: pj.Status,
		JenisPembayaran: pj.JenisPembayaran, BankID: pj.BankID, PerawatanID: pj.PerawatanID,
		DepositKembali: pj.DepositDipakai, PoinKembali: pj.PoinDipakai,
		Total:  roundRp(pj.TotalHarga - pj.DiskonPromo - pj.DiskonVoucher),
		Refund: roundRp(math.Max(pj.JumlahBayar-pj.Kembalian, 0)),
		Barang: []VoidBarang{}, PaketDibatalkan: []VoidPaket{}, SesiKembali: []VoidSesi{},
	}
	blokir := func(msg string) {
		if d.Blokir == "" {
			d.Blokir = msg
		}
	}
	switch pj.Status {
	case "paid":
	case "cancelled":
		blokir("penjualan sudah dibatalkan")
	default:
		blokir("hanya penjualan yang sudah lunas yang bisa di-void; penjualan belum lunas cukup dibatalkan")
	}

	if err := tx.Table("penjualan_details d").Select("d.barang_id, b.nama, SUM(d.qty) AS qty").
		Joins("JOIN barangs b ON b.id = d.barang_id").
		Where("d.penjualan_id = ? AND d.barang_id IS NOT NULL", pj.ID).
		Group("d.barang_id, b.nama").Order("d.barang_id").Scan(&d.Barang).Error; err != nil {
		return nil, err
	}

	if pj.PerawatanID != nil {
		var pw perawatan.Perawatan
		if err := q.First(&pw, *pj.PerawatanID).Error; err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, err
		}
		d.PerawatanKode = pw.Kode
		var reseps []perawatan.PerawatanResep
		if err := q.Where("perawatan_id = ? AND status IN ?", *pj.PerawatanID,
			[]string{perawatan.ResepStatusDibayar, perawatan.ResepStatusDiserahkan}).Order("id").Find(&reseps).Error; err != nil {
			return nil, err
		}
		for _, r := range reseps {
			if r.Status == perawatan.ResepStatusDiserahkan {
				blokir(fmt.Sprintf("resep %s sudah diserahkan ke pasien; obat yang sudah keluar tidak bisa di-void", r.Kode))
			}
		}
		d.ResepKembali = len(reseps)
	}

	// Packages bought in this sale (older ones only know their perawatan).
	var dibeli []paket.PaketPerawatan
	pq := tx.Where("penjualan_id = ?", pj.ID)
	if pj.PerawatanID != nil {
		pq = tx.Where("penjualan_id = ? OR (penjualan_id IS NULL AND perawatan_id = ?)", pj.ID, *pj.PerawatanID)
	}
	if err := pq.Preload("Treatment").Order("id").Find(&dibeli).Error; err != nil {
		return nil, err
	}
	// Sessions this sale redeemed, to be given back.
	if err := tx.Table("paket_pemakaians m").
		Select("m.id AS pemakaian_id, m.paket_perawatan_id AS paket_id, p.kode AS paket_kode, t.nama AS treatment_nama, m.qty, m.nilai, m.paket_item_id AS item_id, p.status AS paket_status").
		Joins("JOIN paket_perawatans p ON p.id = m.paket_perawatan_id").
		Joins("LEFT JOIN paket_perawatan_items i ON i.id = m.paket_item_id").
		Joins("LEFT JOIN treatments t ON t.id = i.treatment_id").
		Where("m.penjualan_id = ? AND m.status = ?", pj.ID, paket.PemakaianAktif).
		Order("m.id").Scan(&d.SesiKembali).Error; err != nil {
		return nil, err
	}

	if lock {
		ids := map[uint]bool{}
		for _, p := range dibeli {
			ids[p.ID] = true
		}
		var itemIDs []uint
		for _, s := range d.SesiKembali {
			ids[s.PaketID] = true
			itemIDs = append(itemIDs, s.ItemID)
		}
		paketIDs := make([]uint, 0, len(ids))
		for id := range ids {
			paketIDs = append(paketIDs, id)
		}
		sort.Slice(paketIDs, func(a, b int) bool { return paketIDs[a] < paketIDs[b] })
		if len(paketIDs) > 0 {
			var locked []paket.PaketPerawatan
			if err := q.Select("id").Where("id IN ?", paketIDs).Order("id").Find(&locked).Error; err != nil {
				return nil, err
			}
			// Statuses may have changed while waiting for the lock.
			if err := tx.Where("id IN ?", paketIDs).Find(&locked).Error; err != nil {
				return nil, err
			}
			status := map[uint]string{}
			for _, p := range locked {
				status[p.ID] = p.Status
			}
			for k := range dibeli {
				dibeli[k].Status = status[dibeli[k].ID]
			}
			for k := range d.SesiKembali {
				d.SesiKembali[k].PaketStatus = status[d.SesiKembali[k].PaketID]
			}
		}
		if len(itemIDs) > 0 {
			var items []paket.Item
			if err := q.Select("id").Where("id IN ?", itemIDs).Order("id").Find(&items).Error; err != nil {
				return nil, err
			}
		}
	}

	beliIni := map[uint]bool{}
	for _, p := range dibeli {
		beliIni[p.ID] = true
		nama := ""
		if p.Treatment != nil {
			nama = p.Treatment.Nama
		}
		d.PaketDibatalkan = append(d.PaketDibatalkan, VoidPaket{ID: p.ID, Kode: p.Kode, TreatmentNama: nama, Status: p.Status})
		if p.Status == paket.StatusDibatalkan {
			blokir(fmt.Sprintf("paket %s dari transaksi ini sudah dibatalkan/di-refund", p.Kode))
			continue
		}
		// Sessions redeemed by other visits are services already given.
		var dipakai int64
		if err := tx.Model(&paket.Pemakaian{}).
			Where("paket_perawatan_id = ? AND status = ? AND (penjualan_id IS NULL OR penjualan_id <> ?)", p.ID, paket.PemakaianAktif, pj.ID).
			Select("COALESCE(SUM(qty), 0)").Scan(&dipakai).Error; err != nil {
			return nil, err
		}
		if dipakai > 0 {
			blokir(fmt.Sprintf("paket %s dari transaksi ini sudah dipakai %d sesi di kunjungan lain", p.Kode, dipakai))
		}
	}
	for _, s := range d.SesiKembali {
		if !beliIni[s.PaketID] && s.PaketStatus == paket.StatusDibatalkan {
			blokir(fmt.Sprintf("sesi yang dipakai berasal dari paket %s yang sudah dibatalkan; sesi tidak bisa dikembalikan", s.PaketKode))
		}
	}
	return d, nil
}

// loadPenjualan loads the sale in the active branch, FOR UPDATE when lock is set.
func (s *Service) loadPenjualan(tx *gorm.DB, id uint, lock bool) (*penjualan.Penjualan, error) {
	q := s.cab.Scope(tx, "cabang_id")
	if lock {
		q = q.Clauses(clause.Locking{Strength: "UPDATE"})
	}
	var pj penjualan.Penjualan
	if err := q.First(&pj, id).Error; err != nil {
		return nil, err
	}
	return &pj, nil
}

// DampakVoid previews a void without changing anything.
func (s *Service) DampakVoid(id uint) (*VoidDampak, error) {
	pj, err := s.loadPenjualan(s.repo.db, id, false)
	if err != nil {
		return nil, err
	}
	return s.dampakVoid(s.repo.db, pj, false)
}

// VoidPenjualan cancels a paid sale in one transaction and gives back everything the
// payment touched: stock (to the branch that sold it), the sale's journal, deposit used,
// poin, packages bought (cancelled) and sessions redeemed (returned, with their revenue
// journals reversed), the perawatan/antrian/resep statuses and the money at the kasir.
func (s *Service) VoidPenjualan(id uint, req VoidRequest) (*VoidDampak, error) {
	alasan := strings.TrimSpace(req.Alasan)
	if alasan == "" {
		return nil, errors.New("alasan pembatalan wajib diisi")
	}
	keKasir := req.KembalikanKeKasir == nil || *req.KembalikanKeKasir
	now := time.Now()
	var out *VoidDampak
	err := s.repo.db.Transaction(func(tx *gorm.DB) error {
		pj, err := s.loadPenjualan(tx, id, true)
		if err != nil {
			return err
		}
		d, err := s.dampakVoid(tx, pj, true)
		if err != nil {
			return err
		}
		if d.Blokir != "" {
			return fmt.Errorf("%w: %s", ErrVoidDitolak, d.Blokir)
		}
		ket := "Void " + pj.NoInvoice + ": " + alasan

		if err := penjualan.KembalikanStok(tx, s.gen, pj.CabangID, pj.ID, pj.Kode, ket); err != nil {
			return err
		}
		if err := finance.Reverse(tx, s.gen, finance.SourcePenjualan, pj.ID, now, ket); err != nil {
			return err
		}

		// Deposit used on this sale is back in the balance (older rows only know the invoice).
		if err := tx.Model(&DepositTransaksi{}).
			Where("jenis = ? AND is_active = ? AND (penjualan_id = ? OR (penjualan_id IS NULL AND pasien_id = ? AND kwitansi = ?))",
				jenisPemakaianDeposit, true, pj.ID, pj.PasienID, pj.NoInvoice).
			Update("is_active", false).Error; err != nil {
			return err
		}

		if pj.PoinDipakai > 0 {
			var mem membership.Membership
			err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("pasien_id = ?", pj.PasienID).
				Order("is_active DESC, id DESC").First(&mem).Error
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return errors.New("membership pasien tidak ditemukan untuk mengembalikan poin")
			}
			if err != nil {
				return err
			}
			if err := tx.Model(&mem).Update("points", gorm.Expr("points + ?", pj.PoinDipakai)).Error; err != nil {
				return err
			}
		}

		if err := s.kembalikanSesi(tx, d.SesiKembali, now, ket); err != nil {
			return err
		}
		for _, p := range d.PaketDibatalkan {
			if err := tx.Model(&paket.PaketPerawatan{}).Where("id = ?", p.ID).Updates(map[string]any{
				"status": paket.StatusDibatalkan, "keterangan_batal": ket, "refund": 0,
			}).Error; err != nil {
				return err
			}
		}

		if pj.PerawatanID != nil {
			status := "bayar"
			if !keKasir {
				status = "batal"
			}
			var pw perawatan.Perawatan
			if err := tx.First(&pw, *pj.PerawatanID).Error; err == nil {
				if err := tx.Model(&pw).Update("status", status).Error; err != nil {
					return err
				}
				if pw.AntrianID != nil {
					if err := tx.Table("antrians").Where("id = ?", *pw.AntrianID).Update("status", status).Error; err != nil {
						return err
					}
				}
			} else if !errors.Is(err, gorm.ErrRecordNotFound) {
				return err
			}
			if err := tx.Model(&perawatan.PerawatanResep{}).
				Where("perawatan_id = ? AND status = ?", *pj.PerawatanID, perawatan.ResepStatusDibayar).
				Update("status", "draft").Error; err != nil {
				return err
			}
		}

		// The money actually kept at the counter goes back out the way it came in.
		if err := kasir.Catat(tx, req.UserID, pj.CabangID, kasir.Mutasi{
			SourceType: kasir.SourceVoid, SourceID: pj.ID, Referensi: pj.NoInvoice,
			JenisPembayaran: pj.JenisPembayaran, BankID: pj.BankID, Keluar: d.Refund,
			Keterangan: ket,
		}); err != nil {
			return err
		}

		uid := req.UserID
		var oleh *uint
		if uid > 0 {
			oleh = &uid
		}
		if err := tx.Model(&penjualan.Penjualan{}).Where("id = ?", pj.ID).Updates(map[string]any{
			"status": "cancelled", "alasan_batal": alasan, "dibatalkan_at": now, "dibatalkan_oleh": oleh,
		}).Error; err != nil {
			return err
		}
		d.Status = "cancelled"
		out = d
		return nil
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}

// kembalikanSesi gives back the package sessions a voided sale redeemed: the item gets
// its sessions again, the pemakaian is cancelled with its revenue journal reversed, and
// a package that had run out becomes active again.
func (s *Service) kembalikanSesi(tx *gorm.DB, sesi []VoidSesi, tgl time.Time, ket string) error {
	paketIDs := map[uint]bool{}
	for _, m := range sesi {
		if err := tx.Exec(`UPDATE paket_perawatan_items SET sisa_sesi = sisa_sesi + ?, updated_at = NOW() WHERE id = ?`,
			m.Qty, m.ItemID).Error; err != nil {
			return err
		}
		if err := tx.Model(&paket.Pemakaian{}).Where("id = ?", m.PemakaianID).
			Update("status", paket.PemakaianDibatalkan).Error; err != nil {
			return err
		}
		if err := finance.Reverse(tx, s.gen, finance.SourcePaketPemakaian, m.PemakaianID, tgl, ket); err != nil {
			return err
		}
		paketIDs[m.PaketID] = true
	}
	for id := range paketIDs {
		if err := tx.Exec(`UPDATE paket_perawatans SET
				sisa_sesi = s.sisa,
				status = CASE WHEN status = ? AND s.sisa > 0 THEN ? ELSE status END,
				updated_at = NOW()
			FROM (SELECT COALESCE(SUM(sisa_sesi), 0) AS sisa FROM paket_perawatan_items WHERE paket_perawatan_id = ?) s
			WHERE id = ?`, paket.StatusHabis, paket.StatusAktif, id, id).Error; err != nil {
			return err
		}
	}
	return nil
}

func (h *Handler) DampakVoid(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	d, err := h.svc.For(c).DampakVoid(uint(id))
	if errors.Is(err, gorm.ErrRecordNotFound) {
		response.NotFound(c, "penjualan tidak ditemukan")
		return
	}
	if err != nil {
		response.Internal(c, err.Error())
		return
	}
	response.OK(c, d, "ok")
}

func (h *Handler) VoidPenjualan(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	var req VoidRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "validation failed", err.Error())
		return
	}
	req.UserID = c.GetUint(middleware.ContextUserID)
	d, err := h.svc.For(c).VoidPenjualan(uint(id), req)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		response.NotFound(c, "penjualan tidak ditemukan")
		return
	}
	if err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error(), nil)
		return
	}
	response.OK(c, d, "penjualan dibatalkan")
}
