# Clinic OS — Domain Overview

Source of truth: ported from the previous Laravel clinic backend.

## Core flows

1. **Resepsionis** — register/lookup pasien → create antrian/appointment
2. **Perawatan** — open antrian → record tindakan/resep → update status
3. **Pembayaran / Depo** — create penjualan (+ details) → stock out via kartu stok
4. **Warehouse** — barang master, pembelian (stock in), konversi, produksi, stok opname
5. **Administrasi** — users, staff, treatment, supplier, bank, cabang, perusahaan, membership, voucher, promo

## ID format

`{KEY}-{YY}{MM}{#####}` via `monthly_sequences` (e.g. `PAS-260800001`).

## Auth

JWT access + refresh. Seed user: `admin` / `admin123`.

## API base

`http://localhost:8080/api`
