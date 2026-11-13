package finance

import (
	"errors"

	"gorm.io/gorm"
)

// Mapping keys used by the automatic journals.
const (
	KeyMetodePrefix = "metode."
	KeyBankPrefix   = "bank."

	KeyPendapatanTreatment  = "pendapatan.treatment"
	KeyPendapatanLayanan    = "pendapatan.layanan"
	KeyPendapatanBarang     = "pendapatan.barang"
	KeyPenjualanDiskon      = "penjualan.diskon"
	KeyPenjualanPoin        = "penjualan.poin"
	KeyDepositTitipan       = "deposit.titipan"
	KeyPendapatanMembership = "pendapatan.membership"
	KeyPaketRefund          = "paket.refund"
	KeyPersediaan           = "persediaan"
	KeyHPP                  = "hpp"
	KeyPembelianUtang       = "pembelian.utang"
	KeyStokSelisihLebih     = "stok.selisih_lebih"
	KeyStokSelisihKurang    = "stok.selisih_kurang"
)

// MappingKey describes a configurable key for the Pengaturan Akun page.
type MappingKey struct {
	Key         string `json:"key"`
	Label       string `json:"label"`
	Grup        string `json:"grup"`
	Keterangan  string `json:"keterangan"`
	DefaultKode string `json:"-"`
}

// MappingKeys lists every fixed key. Per-bank overrides (bank.<id>) are added on top.
var MappingKeys = []MappingKey{
	{KeyMetodePrefix + "tunai", "Tunai", "Metode Pembayaran", "Akun kas untuk pembayaran tunai", "1-1101"},
	{KeyMetodePrefix + "transfer", "Transfer Bank", "Metode Pembayaran", "Dipakai bila bank tidak punya akun sendiri", "1-1201"},
	{KeyMetodePrefix + "kartu_debit", "Kartu Debit", "Metode Pembayaran", "Dipakai bila bank tidak punya akun sendiri", "1-1201"},
	{KeyMetodePrefix + "kartu_kredit", "Kartu Kredit", "Metode Pembayaran", "Piutang ke penerbit kartu / EDC", "1-1301"},
	{KeyMetodePrefix + "e_money", "E-Money", "Metode Pembayaran", "Dipakai bila bank tidak punya akun sendiri", "1-1201"},

	{KeyPendapatanTreatment, "Pendapatan Treatment", "Penjualan", "Kredit untuk baris treatment", "4-1101"},
	{KeyPendapatanLayanan, "Pendapatan Layanan", "Penjualan", "Kredit untuk baris layanan non-treatment", "4-1102"},
	{KeyPendapatanBarang, "Pendapatan Produk / Obat", "Penjualan", "Kredit untuk baris barang", "4-1201"},
	{KeyPenjualanDiskon, "Diskon Promo & Voucher", "Penjualan", "Debit sebesar potongan promo dan voucher", "4-1901"},
	{KeyPenjualanPoin, "Pemakaian Poin Member", "Penjualan", "Debit sebesar nilai poin yang ditukar", "6-9101"},

	{KeyDepositTitipan, "Titipan Deposit Pasien", "Deposit & Member", "Kewajiban atas saldo deposit pasien", "2-1201"},
	{KeyPendapatanMembership, "Pendapatan Membership", "Deposit & Member", "Pendaftaran dan perpanjangan member", "4-1301"},
	{KeyPaketRefund, "Refund Batal Paket", "Deposit & Member", "Debit saat refund paket perawatan", "4-1902"},

	{KeyPersediaan, "Persediaan Barang", "Persediaan & Pembelian", "Nilai stok barang", "1-1401"},
	{KeyHPP, "Harga Pokok Penjualan", "Persediaan & Pembelian", "Debit sebesar harga beli barang terjual", "5-1101"},
	{KeyPembelianUtang, "Utang Pembelian", "Persediaan & Pembelian", "Kredit saat pembelian, debit saat pelunasan", "2-1101"},
	{KeyStokSelisihLebih, "Selisih Lebih Stok", "Persediaan & Pembelian", "Kredit saat stok fisik lebih dari sistem", "4-9101"},
	{KeyStokSelisihKurang, "Selisih Kurang Stok", "Persediaan & Pembelian", "Debit saat stok fisik kurang dari sistem", "6-9201"},
}

type defaultAkun struct {
	kode, nama, tipe, parent string
	header                   bool
	saldo                    string // empty = from tipe
}

var defaultCOA = []defaultAkun{
	{"1", "ASET", TipeAset, "", true, ""},
	{"1-1101", "Kas", TipeAset, "1", false, ""},
	{"1-1201", "Bank", TipeAset, "1", false, ""},
	{"1-1301", "Piutang EDC / Kartu Kredit", TipeAset, "1", false, ""},
	{"1-1401", "Persediaan Barang", TipeAset, "1", false, ""},

	{"2", "KEWAJIBAN", TipeKewajiban, "", true, ""},
	{"2-1101", "Utang Usaha", TipeKewajiban, "2", false, ""},
	{"2-1201", "Utang Deposit Pasien", TipeKewajiban, "2", false, ""},

	{"3", "EKUITAS", TipeEkuitas, "", true, ""},
	{"3-1101", "Modal", TipeEkuitas, "3", false, ""},
	{"3-1201", "Laba Ditahan", TipeEkuitas, "3", false, ""},

	{"4", "PENDAPATAN", TipePendapatan, "", true, ""},
	{"4-1101", "Pendapatan Treatment", TipePendapatan, "4", false, ""},
	{"4-1102", "Pendapatan Layanan", TipePendapatan, "4", false, ""},
	{"4-1201", "Pendapatan Produk / Obat", TipePendapatan, "4", false, ""},
	{"4-1301", "Pendapatan Membership", TipePendapatan, "4", false, ""},
	{"4-1901", "Diskon Penjualan", TipePendapatan, "4", false, SaldoDebit},
	{"4-1902", "Refund Paket Perawatan", TipePendapatan, "4", false, SaldoDebit},
	{"4-9101", "Pendapatan Selisih Stok", TipePendapatan, "4", false, ""},

	{"5", "HARGA POKOK PENJUALAN", TipeBeban, "", true, ""},
	{"5-1101", "HPP Produk / Obat", TipeBeban, "5", false, ""},

	{"6", "BEBAN OPERASIONAL", TipeBeban, "", true, ""},
	{"6-1101", "Beban Gaji", TipeBeban, "6", false, ""},
	{"6-1201", "Beban Sewa", TipeBeban, "6", false, ""},
	{"6-1301", "Beban Listrik & Air", TipeBeban, "6", false, ""},
	{"6-1901", "Beban Umum", TipeBeban, "6", false, ""},
	{"6-9101", "Beban Poin Member", TipeBeban, "6", false, ""},
	{"6-9201", "Beban Selisih Stok", TipeBeban, "6", false, ""},
}

// NormalOf returns the usual balance side for an account type.
func NormalOf(tipe string) string {
	if tipe == TipeAset || tipe == TipeBeban {
		return SaldoDebit
	}
	return SaldoKredit
}

// SeedDefault creates the default chart of accounts when none exists and fills
// any fixed mapping key that has no account yet. It is safe to run on every start.
func SeedDefault(db *gorm.DB) error {
	return db.Transaction(func(tx *gorm.DB) error {
		var count int64
		if err := tx.Model(&Akun{}).Count(&count).Error; err != nil {
			return err
		}
		if count == 0 {
			ids := map[string]uint{}
			for _, d := range defaultCOA {
				saldo := d.saldo
				if saldo == "" {
					saldo = NormalOf(d.tipe)
				}
				a := Akun{Kode: d.kode, Nama: d.nama, Tipe: d.tipe, SaldoNormal: saldo, IsHeader: d.header, IsSystem: true, IsActive: true}
				if d.parent != "" {
					pid := ids[d.parent]
					a.ParentID = &pid
				}
				if err := tx.Create(&a).Error; err != nil {
					return err
				}
				ids[d.kode] = a.ID
			}
		}
		for _, k := range MappingKeys {
			var m AkunMapping
			err := tx.Where("key = ?", k.Key).First(&m).Error
			if err == nil {
				continue
			}
			if !errors.Is(err, gorm.ErrRecordNotFound) {
				return err
			}
			var a Akun
			if err := tx.Where("kode = ?", k.DefaultKode).First(&a).Error; err != nil {
				continue // default account was removed or renumbered; leave it for the user
			}
			if err := tx.Create(&AkunMapping{Key: k.Key, AkunID: a.ID}).Error; err != nil {
				return err
			}
		}
		return nil
	})
}
