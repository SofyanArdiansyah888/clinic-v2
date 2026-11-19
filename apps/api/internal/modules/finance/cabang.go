package finance

import (
	"fmt"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/scaleup/clinic-v2/api/internal/platform/branch"
	"gorm.io/gorm"
)

// One set of books for the whole clinic: every journal carries the branch it belongs to,
// so laba rugi, buku besar and highlights can be read per branch or combined. The neraca
// and neraca saldo are always combined (the clinic is one entity).

// sourceCabangSQL finds the branch of a journal's source document.
var sourceCabangSQL = map[string]string{
	SourcePenjualan:          "SELECT cabang_id FROM penjualans WHERE id = ?",
	SourceDeposit:            "SELECT cabang_id FROM deposit_transaksis WHERE id = ?",
	SourcePaket:              "SELECT cabang_id FROM paket_perawatans WHERE id = ?",
	SourcePaketPemakaian:     "SELECT cabang_id FROM paket_pemakaians WHERE id = ?",
	SourcePembelian:          "SELECT cabang_id FROM pembelians WHERE id = ?",
	SourcePelunasanPembelian: "SELECT p.cabang_id FROM pembelian_pembayarans b JOIN pembelians p ON p.id = b.pembelian_id WHERE b.id = ?",
	SourceStokOpname:         "SELECT cabang_id FROM stok_opnames WHERE id = ?",
}

// cabangFor is the branch an entry is booked in: the one given, else the source
// document's, else the main branch.
func cabangFor(tx *gorm.DB, e Entry) uint {
	if e.CabangID != 0 {
		return e.CabangID
	}
	var id uint
	if q, ok := sourceCabangSQL[e.SourceType]; ok && e.SourceID != 0 {
		tx.Raw(q, e.SourceID).Scan(&id)
	}
	if id == 0 {
		id = branch.UtamaID(tx)
	}
	return id
}

// BackfillCabang books journals from before multi-branch in their source document's
// branch, and the rest (manual journals) in the main branch.
func BackfillCabang(db *gorm.DB, utamaID uint) error {
	if !db.Migrator().HasColumn(&Jurnal{}, "cabang_id") {
		return nil
	}
	for src, q := range sourceCabangSQL {
		// Postgres rejects a statement naming a missing table even when no row needs it.
		if t := fromTable(q); t == "" || !db.Migrator().HasTable(t) {
			continue
		}
		// The lookups take the source id as their only parameter; correlate it with j.source_id.
		sub := "(" + replaceParam(q, "j.source_id") + ")"
		if err := db.Exec("UPDATE jurnals j SET cabang_id = COALESCE("+sub+", 0) WHERE j.cabang_id = 0 AND j.source_type = ?", src).Error; err != nil {
			return err
		}
	}
	return db.Exec("UPDATE jurnals SET cabang_id = ? WHERE cabang_id = 0", utamaID).Error
}

// fromTable is the first table a lookup reads (the word after FROM).
func fromTable(q string) string {
	f := strings.Fields(q[strings.Index(q, "FROM ")+len("FROM "):])
	if len(f) == 0 {
		return ""
	}
	return f[0]
}

func replaceParam(q, with string) string {
	for i := len(q) - 1; i >= 0; i-- {
		if q[i] == '?' {
			return q[:i] + with + q[i+1:]
		}
	}
	return q
}

// For binds the service to the request's active branch.
func (s *Service) For(c *gin.Context) *Service {
	cp := *s
	cp.cab = branch.From(c)
	return &cp
}

// gabungan is the service reading every branch, for the combined balance sheet.
func (s *Service) gabungan() *Service {
	cp := *s
	cp.cab = branch.System
	return &cp
}

// jcf limits journals (alias j) to the active branch, starting with AND.
func (s *Service) jcf() string {
	if s.cab.All {
		return ""
	}
	return fmt.Sprintf(" AND j.cabang_id = %d", s.cab.ID)
}
