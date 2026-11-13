package laporan

import (
	"errors"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/scaleup/clinic-v2/api/internal/platform/response"
	"gorm.io/gorm"
)

// Revenue is always counted net of promo and voucher discounts, from paid penjualan only.
const netExpr = "(p.total_harga - p.diskon_promo - p.diskon_voucher)"

type Periode struct {
	Dari   string `json:"dari"`
	Sampai string `json:"sampai"`
}

// parsePeriode reads ?dari=&sampai= (yyyy-MM-dd). It defaults to the current month
// to date and rejects ranges longer than a year to keep the queries bounded.
func parsePeriode(c *gin.Context) (Periode, error) {
	now := time.Now()
	dari := c.DefaultQuery("dari", time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location()).Format("2006-01-02"))
	sampai := c.DefaultQuery("sampai", now.Format("2006-01-02"))
	d, err := time.Parse("2006-01-02", dari)
	if err != nil {
		return Periode{}, errors.New("format dari harus yyyy-mm-dd")
	}
	s, err := time.Parse("2006-01-02", sampai)
	if err != nil {
		return Periode{}, errors.New("format sampai harus yyyy-mm-dd")
	}
	if s.Before(d) {
		return Periode{}, errors.New("tanggal sampai harus setelah tanggal dari")
	}
	if s.Sub(d) > 366*24*time.Hour {
		return Periode{}, errors.New("periode laporan maksimal 1 tahun")
	}
	return Periode{Dari: dari, Sampai: sampai}, nil
}

type Service struct{ db *gorm.DB }

func NewService(db *gorm.DB) *Service { return &Service{db: db} }

// ── Front office ──

type FoRingkasan struct {
	Kunjungan        int64   `json:"kunjungan"`
	PasienBaru       int64   `json:"pasien_baru"`
	Appointment      int64   `json:"appointment"`
	Transaksi        int64   `json:"transaksi"`
	PendapatanBruto  float64 `json:"pendapatan_bruto"`
	Diskon           float64 `json:"diskon"`
	PendapatanBersih float64 `json:"pendapatan_bersih"`
	PoinDipakai      int64   `json:"poin_dipakai"`
	DepositMasuk     float64 `json:"deposit_masuk"`
	DepositDipakai   float64 `json:"deposit_dipakai"`
}

type JenisPembayaranRow struct {
	JenisPembayaran string  `json:"jenis_pembayaran"`
	Transaksi       int64   `json:"transaksi"`
	Total           float64 `json:"total"`
}

type HarianRow struct {
	Tanggal    string  `json:"tanggal"`
	Kunjungan  int64   `json:"kunjungan"`
	Transaksi  int64   `json:"transaksi"`
	Pendapatan float64 `json:"pendapatan"`
}

type StatusCount struct {
	Status string `json:"status"`
	Jumlah int64  `json:"jumlah"`
}

type FoLaporan struct {
	Periode            Periode              `json:"periode"`
	Ringkasan          FoRingkasan          `json:"ringkasan"`
	PerJenisPembayaran []JenisPembayaranRow `json:"per_jenis_pembayaran"`
	Harian             []HarianRow          `json:"harian"`
	StatusAppointment  []StatusCount        `json:"status_appointment"`
}

func (s *Service) Fo(p Periode) (*FoLaporan, error) {
	out := &FoLaporan{Periode: p}
	r := &out.Ringkasan
	// Scanning into a struct resets its other fields, so the struct scan runs first
	// and the single-value scans fill the remaining fields after it.
	steps := []*gorm.DB{
		s.db.Raw(`SELECT COUNT(*) AS transaksi,
				COALESCE(SUM(p.total_harga), 0) AS pendapatan_bruto,
				COALESCE(SUM(p.diskon_promo + p.diskon_voucher), 0) AS diskon,
				COALESCE(SUM(`+netExpr+`), 0) AS pendapatan_bersih,
				COALESCE(SUM(p.poin_dipakai), 0) AS poin_dipakai,
				COALESCE(SUM(p.deposit_dipakai), 0) AS deposit_dipakai
			FROM penjualans p WHERE p.status = 'paid' AND p.tanggal BETWEEN ? AND ?`, p.Dari, p.Sampai).Scan(r),
		s.db.Raw(`SELECT COUNT(*) FROM antrians WHERE tanggal BETWEEN ? AND ?`, p.Dari, p.Sampai).Scan(&r.Kunjungan),
		// created_at::date uses the DB session time zone (Asia/Jakarta, set in the DSN).
		s.db.Raw(`SELECT COUNT(*) FROM pasiens WHERE created_at::date BETWEEN ? AND ?`, p.Dari, p.Sampai).Scan(&r.PasienBaru),
		s.db.Raw(`SELECT COUNT(*) FROM appointments WHERE tanggal BETWEEN ? AND ?`, p.Dari, p.Sampai).Scan(&r.Appointment),
		s.db.Raw(`SELECT COALESCE(SUM(jumlah), 0) FROM deposit_transaksis
			WHERE jenis = 'pembayaran_deposit' AND is_active AND tanggal BETWEEN ? AND ?`, p.Dari, p.Sampai).Scan(&r.DepositMasuk),
		s.db.Raw(`SELECT COALESCE(NULLIF(p.jenis_pembayaran, ''), '-') AS jenis_pembayaran,
				COUNT(*) AS transaksi, COALESCE(SUM(`+netExpr+`), 0) AS total
			FROM penjualans p WHERE p.status = 'paid' AND p.tanggal BETWEEN ? AND ?
			GROUP BY 1 ORDER BY total DESC`, p.Dari, p.Sampai).Scan(&out.PerJenisPembayaran),
		s.db.Raw(`SELECT d::date::text AS tanggal,
				(SELECT COUNT(*) FROM antrians a WHERE a.tanggal = d::date) AS kunjungan,
				(SELECT COUNT(*) FROM penjualans p WHERE p.status = 'paid' AND p.tanggal = d::date) AS transaksi,
				(SELECT COALESCE(SUM(`+netExpr+`), 0) FROM penjualans p WHERE p.status = 'paid' AND p.tanggal = d::date) AS pendapatan
			FROM generate_series(?::date, ?::date, interval '1 day') d ORDER BY d`, p.Dari, p.Sampai).Scan(&out.Harian),
		s.db.Raw(`SELECT COALESCE(NULLIF(status, ''), '-') AS status, COUNT(*) AS jumlah FROM appointments
			WHERE tanggal BETWEEN ? AND ? GROUP BY 1 ORDER BY jumlah DESC`, p.Dari, p.Sampai).Scan(&out.StatusAppointment),
	}
	return out, firstErr(steps)
}

// ── Apotek ──

type ApotekRingkasan struct {
	ItemTerjual       int64   `json:"item_terjual"`
	NilaiPenjualan    float64 `json:"nilai_penjualan"`
	ResepDibayar      int64   `json:"resep_dibayar"`
	ResepDiserahkan   int64   `json:"resep_diserahkan"`
	ResepBelumDibayar int64   `json:"resep_belum_dibayar"`
	StokMenipis       int64   `json:"stok_menipis"`
}

type BarangTerjualRow struct {
	BarangID uint    `json:"barang_id"`
	Kode     string  `json:"kode"`
	Nama     string  `json:"nama"`
	Satuan   string  `json:"satuan"`
	Qty      int64   `json:"qty"`
	Nilai    float64 `json:"nilai"`
	Stok     int64   `json:"stok"`
}

type StokMenipisRow struct {
	BarangID    uint   `json:"barang_id"`
	Kode        string `json:"kode"`
	Nama        string `json:"nama"`
	Satuan      string `json:"satuan"`
	StokAktual  int64  `json:"stok_aktual"`
	StokMinimal int64  `json:"stok_minimal"`
}

type ApotekLaporan struct {
	Periode       Periode            `json:"periode"`
	Ringkasan     ApotekRingkasan    `json:"ringkasan"`
	BarangTerjual []BarangTerjualRow `json:"barang_terjual"`
	StokMenipis   []StokMenipisRow   `json:"stok_menipis"`
}

func (s *Service) Apotek(p Periode) (*ApotekLaporan, error) {
	out := &ApotekLaporan{Periode: p}
	r := &out.Ringkasan
	steps := []*gorm.DB{
		s.db.Raw(`SELECT j.item_terjual, j.nilai_penjualan, r.resep_dibayar, r.resep_diserahkan, r.resep_belum_dibayar
			FROM (
				SELECT COALESCE(SUM(d.qty), 0) AS item_terjual, COALESCE(SUM(d.subtotal), 0) AS nilai_penjualan
				FROM penjualan_details d JOIN penjualans p ON p.id = d.penjualan_id
				WHERE p.status = 'paid' AND d.barang_id IS NOT NULL AND p.tanggal BETWEEN ? AND ?
			) j, (
				SELECT
					COUNT(*) FILTER (WHERE status = 'dibayar') AS resep_dibayar,
					COUNT(*) FILTER (WHERE status = 'diserahkan') AS resep_diserahkan,
					COUNT(*) FILTER (WHERE status NOT IN ('dibayar', 'diserahkan', 'batal')) AS resep_belum_dibayar
				FROM perawatan_resep WHERE tanggal BETWEEN ? AND ?
			) r`, p.Dari, p.Sampai, p.Dari, p.Sampai).Scan(r),
		s.db.Raw(`SELECT b.id AS barang_id, b.kode, b.nama, b.satuan, SUM(d.qty) AS qty, SUM(d.subtotal) AS nilai, b.stok_aktual AS stok
			FROM penjualan_details d
			JOIN penjualans p ON p.id = d.penjualan_id
			JOIN barangs b ON b.id = d.barang_id
			WHERE p.status = 'paid' AND p.tanggal BETWEEN ? AND ?
			GROUP BY b.id ORDER BY qty DESC, nilai DESC LIMIT 50`, p.Dari, p.Sampai).Scan(&out.BarangTerjual),
		s.db.Raw(`SELECT id AS barang_id, kode, nama, satuan, stok_aktual, stok_minimal FROM barangs
			WHERE is_active AND stok_aktual <= stok_minimal ORDER BY stok_aktual - stok_minimal, nama`).Scan(&out.StokMenipis),
	}
	r.StokMenipis = int64(len(out.StokMenipis))
	return out, firstErr(steps)
}

// ── Nurse / terapis ──

type TerapisRow struct {
	StaffID  uint    `json:"staff_id"`
	Nama     string  `json:"nama"`
	Jabatan  string  `json:"jabatan"`
	Tindakan int64   `json:"tindakan"`
	Pasien   int64   `json:"pasien"`
	Nilai    float64 `json:"nilai"`
	Komisi   float64 `json:"komisi"`
}

type TreatmentRow struct {
	TreatmentID uint    `json:"treatment_id"`
	Nama        string  `json:"nama"`
	Kategori    string  `json:"kategori"`
	Jumlah      int64   `json:"jumlah"`
	Nilai       float64 `json:"nilai"`
}

type NurseLaporan struct {
	Periode   Periode `json:"periode"`
	Ringkasan struct {
		Tindakan      int64   `json:"tindakan"`
		Nilai         float64 `json:"nilai"`
		KomisiTerapis float64 `json:"komisi_terapis"`
		TanpaTerapis  int64   `json:"tanpa_terapis"`
	} `json:"ringkasan"`
	PerTerapis []TerapisRow   `json:"per_terapis"`
	Treatment  []TreatmentRow `json:"treatment"`
}

// Tindakan are counted only for perawatan that has been paid (status selesai).
const (
	tindakanFrom = `FROM perawatan_tindakan t
	JOIN perawatans w ON w.id = t.perawatan_id
	JOIN treatments tr ON tr.id = t.treatment_id`
	tindakanSelesai = ` WHERE w.status = 'selesai' AND w.tanggal BETWEEN ? AND ?`
)

func (s *Service) Nurse(p Periode) (*NurseLaporan, error) {
	out := &NurseLaporan{Periode: p}
	steps := []*gorm.DB{
		s.db.Raw(`SELECT COALESCE(SUM(GREATEST(t.jumlah, 1)), 0) AS tindakan, COALESCE(SUM(t.total), 0) AS nilai,
				COALESCE(SUM(CASE WHEN t.beautician_id IS NOT NULL THEN tr.komisi_terapis * GREATEST(t.jumlah, 1) ELSE 0 END), 0) AS komisi_terapis,
				COALESCE(SUM(CASE WHEN t.beautician_id IS NULL THEN GREATEST(t.jumlah, 1) ELSE 0 END), 0) AS tanpa_terapis
			`+tindakanFrom+tindakanSelesai, p.Dari, p.Sampai).Scan(&out.Ringkasan),
		s.db.Raw(`SELECT st.id AS staff_id, st.nama, st.jabatan,
				SUM(GREATEST(t.jumlah, 1)) AS tindakan, COUNT(DISTINCT w.pasien_id) AS pasien,
				SUM(t.total) AS nilai, SUM(tr.komisi_terapis * GREATEST(t.jumlah, 1)) AS komisi
			`+tindakanFrom+`
			JOIN staffs st ON st.id = t.beautician_id`+tindakanSelesai+`
			GROUP BY st.id ORDER BY tindakan DESC`, p.Dari, p.Sampai).Scan(&out.PerTerapis),
		s.db.Raw(`SELECT tr.id AS treatment_id, tr.nama, tr.kategori, SUM(GREATEST(t.jumlah, 1)) AS jumlah, SUM(t.total) AS nilai
			`+tindakanFrom+tindakanSelesai+`
			GROUP BY tr.id ORDER BY jumlah DESC, nilai DESC LIMIT 50`, p.Dari, p.Sampai).Scan(&out.Treatment),
	}
	return out, firstErr(steps)
}

// ── Dokter / medis ──

type DokterRow struct {
	StaffID   uint    `json:"staff_id"`
	Nama      string  `json:"nama"`
	Jabatan   string  `json:"jabatan"`
	Perawatan int64   `json:"perawatan"`
	Selesai   int64   `json:"selesai"`
	Pasien    int64   `json:"pasien"`
	Nilai     float64 `json:"nilai"`
	Komisi    float64 `json:"komisi"`
}

type DiagnosaRow struct {
	Diagnosa string `json:"diagnosa"`
	Jumlah   int64  `json:"jumlah"`
}

type DmLaporan struct {
	Periode   Periode `json:"periode"`
	Ringkasan struct {
		Perawatan    int64   `json:"perawatan"`
		Selesai      int64   `json:"selesai"`
		Pasien       int64   `json:"pasien"`
		Nilai        float64 `json:"nilai"`
		KomisiDokter float64 `json:"komisi_dokter"`
	} `json:"ringkasan"`
	PerDokter []DokterRow   `json:"per_dokter"`
	Diagnosa  []DiagnosaRow `json:"diagnosa"`
}

func (s *Service) Dm(p Periode) (*DmLaporan, error) {
	out := &DmLaporan{Periode: p}
	// nilai and komisi come from paid (selesai) perawatan; counts include every perawatan in the period.
	const tindakanPerPerawatan = `LEFT JOIN (
			SELECT t.perawatan_id, SUM(t.total) AS nilai, SUM(tr.komisi_dokter * GREATEST(t.jumlah, 1)) AS komisi
			FROM perawatan_tindakan t JOIN treatments tr ON tr.id = t.treatment_id
			GROUP BY t.perawatan_id
		) x ON x.perawatan_id = w.id AND w.status = 'selesai'`
	steps := []*gorm.DB{
		s.db.Raw(`SELECT COUNT(*) AS perawatan, COUNT(*) FILTER (WHERE w.status = 'selesai') AS selesai,
				COUNT(DISTINCT w.pasien_id) AS pasien, COALESCE(SUM(x.nilai), 0) AS nilai, COALESCE(SUM(x.komisi), 0) AS komisi_dokter
			FROM perawatans w `+tindakanPerPerawatan+`
			WHERE w.tanggal BETWEEN ? AND ?`, p.Dari, p.Sampai).Scan(&out.Ringkasan),
		s.db.Raw(`SELECT st.id AS staff_id, st.nama, st.jabatan, COUNT(*) AS perawatan,
				COUNT(*) FILTER (WHERE w.status = 'selesai') AS selesai, COUNT(DISTINCT w.pasien_id) AS pasien,
				COALESCE(SUM(x.nilai), 0) AS nilai, COALESCE(SUM(x.komisi), 0) AS komisi
			FROM perawatans w JOIN staffs st ON st.id = w.staff_id `+tindakanPerPerawatan+`
			WHERE w.tanggal BETWEEN ? AND ?
			GROUP BY st.id ORDER BY perawatan DESC`, p.Dari, p.Sampai).Scan(&out.PerDokter),
		s.db.Raw(`SELECT INITCAP(TRIM(diagnosa)) AS diagnosa, COUNT(*) AS jumlah FROM perawatans
			WHERE tanggal BETWEEN ? AND ? AND TRIM(COALESCE(diagnosa, '')) <> ''
			GROUP BY 1 ORDER BY jumlah DESC LIMIT 20`, p.Dari, p.Sampai).Scan(&out.Diagnosa),
	}
	return out, firstErr(steps)
}

func firstErr(steps []*gorm.DB) error {
	for _, st := range steps {
		if st.Error != nil {
			return st.Error
		}
	}
	return nil
}

// ── Handlers ──

func handle[T any](fn func(Periode) (T, error)) gin.HandlerFunc {
	return func(c *gin.Context) {
		p, err := parsePeriode(c)
		if err != nil {
			response.BadRequest(c, err.Error(), nil)
			return
		}
		out, err := fn(p)
		if err != nil {
			response.Internal(c, err.Error())
			return
		}
		response.OK(c, out, "ok")
	}
}

func RegisterRoutes(rg *gin.RouterGroup, db *gorm.DB) {
	svc := NewService(db)
	g := rg.Group("/laporan")
	{
		g.GET("/fo", handle(svc.Fo))
		g.GET("/apotek", handle(svc.Apotek))
		g.GET("/nurse", handle(svc.Nurse))
		g.GET("/dm", handle(svc.Dm))
	}
}
