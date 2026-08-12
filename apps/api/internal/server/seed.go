package server

import (
	"log"

	"github.com/scaleup/clinic-v2/api/internal/modules/barang"
	"github.com/scaleup/clinic-v2/api/internal/modules/cabang"
	"github.com/scaleup/clinic-v2/api/internal/modules/pasien"
	"github.com/scaleup/clinic-v2/api/internal/modules/perusahaan"
	"github.com/scaleup/clinic-v2/api/internal/modules/staff"
	"github.com/scaleup/clinic-v2/api/internal/modules/treatment"
	"github.com/scaleup/clinic-v2/api/internal/modules/user"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

func Seed(db *gorm.DB) error {
	var count int64
	db.Model(&user.User{}).Count(&count)
	if count > 0 {
		return nil
	}

	hash, err := bcrypt.GenerateFromPassword([]byte("admin123"), bcrypt.DefaultCost)
	if err != nil {
		return err
	}

	admin := user.User{
		Name:     "Administrator",
		Email:    "admin@clinic.local",
		Username: "admin",
		Password: string(hash),
		Role:     "admin",
		IsActive: true,
	}
	if err := db.Create(&admin).Error; err != nil {
		return err
	}

	items := []any{
		&cabang.Cabang{Kode: "CAB-SEED001", Nama: "Cabang Pusat", Alamat: "Jl. Kesehatan No. 1", NoTelp: "021000000", IsActive: true},
		&perusahaan.Perusahaan{Kode: "PRS-SEED001", Nama: "Clinic OS", Alamat: "Jakarta", NoTelp: "021000000", Email: "hello@clinic.local", IsActive: true},
		&staff.Staff{Kode: "STF-SEED001", Nama: "Dr. Andi", Jabatan: "Dokter", NoTelp: "0811111111", Email: "andi@clinic.local", IsActive: true},
		&staff.Staff{Kode: "STF-SEED002", Nama: "Siti Resepsi", Jabatan: "Resepsionis", NoTelp: "0812222222", Email: "siti@clinic.local", IsActive: true},
		&pasien.Pasien{Kode: "PAS-SEED001", Nama: "Budi Santoso", Alamat: "Jakarta", NoTelp: "0813333333", JenisKelamin: "L", IsActive: true},
		&pasien.Pasien{Kode: "PAS-SEED002", Nama: "Rina Melati", Alamat: "Bandung", NoTelp: "0814444444", JenisKelamin: "P", IsActive: true},
		&treatment.Treatment{Kode: "TRT-SEED001", Nama: "Konsultasi Umum", Kategori: "Konsultasi", Harga: 150000, Durasi: 30, IsActive: true},
		&treatment.Treatment{Kode: "TRT-SEED002", Nama: "Facial Basic", Kategori: "Perawatan", Harga: 350000, Durasi: 60, IsActive: true},
		&barang.Barang{Kode: "BRG-SEED001", Nama: "Serum Vitamin C", Kategori: "Produk", Satuan: "pcs", HargaBeli: 50000, HargaJual: 120000, StokMinimal: 5, StokAktual: 50, LokasiBarang: "apotek", IsActive: true},
		&barang.Barang{Kode: "BRG-SEED002", Nama: "Cream Moisturizer", Kategori: "Produk", Satuan: "pcs", HargaBeli: 40000, HargaJual: 95000, StokMinimal: 5, StokAktual: 40, LokasiBarang: "gudang", IsActive: true},
	}
	for _, item := range items {
		if err := db.Create(item).Error; err != nil {
			return err
		}
	}

	log.Println("seed: admin/admin123 and sample master data created")
	return nil
}
