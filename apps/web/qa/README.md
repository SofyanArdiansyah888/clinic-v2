# QA suite (Playwright)

Test skenario seperti QA manual: login per role, klik lewat UI, lalu cek hasilnya
(status antrian, tagihan, kembalian, stok, jurnal). Semua test **membuat data**, jadi jalankan
**hanya di staging atau lokal, jangan di prod**. Config menolak host yang namanya tidak
terlihat seperti staging.

## Isi

| File | Test case |
|---|---|
| `01-auth.qa.ts` | TC-AUTH-01..06: login form per role, password salah, form kosong, halaman terproteksi, logout, form login tanpa kredensial bawaan |
| `02-alur-kunjungan.qa.ts` | TC-FLOW-01: FO registrasi pasien baru → panggil → layani (foto) → dokter isi SOAP + resep + tindakan → kasir bayar tunai → stok berkurang → apoteker serahkan obat → jurnal & status antrian |
| `03-depo-penjualan.qa.ts` | TC-DEPO-01: penjualan langsung di depo → kasir bayar → stok berkurang |
| `04-validasi.qa.ts` | TC-VAL-01..05: registrasi tanpa dokter / tanpa nama, batal antrian dengan konfirmasi, bayar kurang dari tagihan, kode promo salah |
| `../e2e/pages.spec.ts` | Semua halaman terbuka tanpa error JS / API gagal (admin) |
| `../e2e/rbac.spec.ts` | Tiap role hanya bisa membuka menu miliknya |

Data uji (dokter, beautician, kasir, treatment, barang + stok) dibuat baru di setiap test
dengan akhiran unik, misalnya `Dr. QA mwnh…` atau `Pasien QA mwnh…`, jadi mudah dicari dan
bisa dijalankan berulang kali.

## Menjalankan

Lokal (stack e2e: API :8082 + DB `clinic_e2e`, web :5175, dinyalakan otomatis):

```bash
docker compose up -d postgres
pnpm --filter @clinic/web qa
```

Staging:

```bash
cp apps/web/.env.qa.example apps/web/.env.qa   # isi QA_BASE_URL + akun admin staging
pnpm --filter @clinic/web qa
```

Akun `e2e_doctor`, `e2e_staff`, `e2e_apoteker`, `e2e_nurse`, `e2e_finance` dibuat otomatis
oleh admin pada run pertama (`e2e/global-setup.ts`) dengan password `E2E_ROLE_PASSWORD`.

Opsi berguna:

```bash
pnpm --filter @clinic/web qa qa/02-alur-kunjungan.qa.ts   # satu file
pnpm --filter @clinic/web qa --headed                     # lihat browsernya
pnpm --filter @clinic/web qa --ui                         # mode interaktif, langkah demi langkah
pnpm --filter @clinic/web qa:report                       # buka laporan HTML terakhir
```

## Laporan

`qa-report/index.html` berisi daftar test case beserta status, langkah, dan durasi. Untuk
test yang gagal tersedia juga screenshot, video, dan trace (rekaman tiap klik dan request
API). Laporan dari staging bisa berisi data pasien, jadi jangan unggah ke tempat publik.
