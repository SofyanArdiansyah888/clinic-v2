package server

import (
	"github.com/scaleup/clinic-v2/api/internal/modules/antrian"
	"github.com/scaleup/clinic-v2/api/internal/modules/appointment"
	"github.com/scaleup/clinic-v2/api/internal/modules/bank"
	"github.com/scaleup/clinic-v2/api/internal/modules/barang"
	"github.com/scaleup/clinic-v2/api/internal/modules/cabang"
	"github.com/scaleup/clinic-v2/api/internal/modules/finance"
	"github.com/scaleup/clinic-v2/api/internal/modules/informedconsent"
	"github.com/scaleup/clinic-v2/api/internal/modules/jadwaldokter"
	"github.com/scaleup/clinic-v2/api/internal/modules/membership"
	"github.com/scaleup/clinic-v2/api/internal/modules/pasien"
	"github.com/scaleup/clinic-v2/api/internal/modules/pembayaran"
	"github.com/scaleup/clinic-v2/api/internal/modules/pembelian"
	"github.com/scaleup/clinic-v2/api/internal/modules/pengaturan"
	"github.com/scaleup/clinic-v2/api/internal/modules/penjualan"
	"github.com/scaleup/clinic-v2/api/internal/modules/perawatan"
	"github.com/scaleup/clinic-v2/api/internal/modules/perusahaan"
	"github.com/scaleup/clinic-v2/api/internal/modules/promo"
	"github.com/scaleup/clinic-v2/api/internal/modules/staff"
	"github.com/scaleup/clinic-v2/api/internal/modules/supplier"
	"github.com/scaleup/clinic-v2/api/internal/modules/treatment"
	"github.com/scaleup/clinic-v2/api/internal/modules/user"
	"github.com/scaleup/clinic-v2/api/internal/modules/voucher"
	"github.com/scaleup/clinic-v2/api/internal/modules/warehouse"
	"github.com/scaleup/clinic-v2/api/internal/platform/generator"
	"gorm.io/gorm"
)

func AutoMigrate(db *gorm.DB) error {
	if err := db.AutoMigrate(
		&generator.MonthlySequence{},
		&user.User{},
		&pasien.Pasien{},
		&staff.Staff{},
		&treatment.Treatment{},
		&supplier.Supplier{},
		&bank.Bank{},
		&perusahaan.Perusahaan{},
		&cabang.Cabang{},
		&barang.Barang{},
		&antrian.Antrian{},
		&appointment.Appointment{},
		&perawatan.Perawatan{},
		&perawatan.PerawatanTindakan{},
		&perawatan.PerawatanResep{},
		&perawatan.PerawatanResepBarang{},
		&penjualan.Penjualan{},
		&penjualan.PenjualanDetail{},
		&pembayaran.DepositTransaksi{},
		&pembayaran.PaketPerawatan{},
		&pembelian.Pembelian{},
		&pembelian.PembelianDetail{},
		&pembelian.PembelianPembayaran{},
		&warehouse.KartuStok{},
		&warehouse.KonversiStok{},
		&warehouse.KonversiStokDetail{},
		&warehouse.ProduksiBarang{},
		&warehouse.ProduksiBarangDetail{},
		&warehouse.StokOpname{},
		&warehouse.StokOpnameDetail{},
		&membership.Membership{},
		&voucher.Voucher{},
		&promo.Promo{},
		&jadwaldokter.JadwalDokter{},
		&informedconsent.Template{},
		&pengaturan.Klinik{},
		&finance.Akun{},
		&finance.AkunMapping{},
		&finance.Jurnal{},
		&finance.JurnalDetail{},
	); err != nil {
		return err
	}
	// AutoMigrate never relaxes NOT NULL. barang_id became optional when treatment
	// lines were added to penjualan_details, so older databases need it altered.
	if err := db.Migrator().AlterColumn(&penjualan.PenjualanDetail{}, "BarangID"); err != nil {
		return err
	}
	// The default chart of accounts and transaction mapping must exist before any
	// transaction can be journaled.
	return finance.SeedDefault(db)
}
