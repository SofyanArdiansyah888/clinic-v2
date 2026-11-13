# Clinic OS v2

Monorepo Turborepo for clinic operations — **Go (Gin/GORM/Postgres)** API + **React (Vite/TanStack/Tailwind)** web.

## Structure

```
apps/api   → Go clean architecture modular API
apps/web   → React feature-based SPA
docs/      → domain, design system, Gemini UI prompt
```

## Prerequisites

- Node 20+, pnpm 9+
- Go 1.22+
- Docker (Postgres)

## Quick start

```bash
# 1) Database
docker compose up -d postgres

# 2) API
cp apps/api/.env.example apps/api/.env
cd apps/api && go run ./cmd/api

# 3) Web (another terminal, from repo root)
pnpm install
pnpm --filter @clinic/web dev
```

Or from root after deps installed:

```bash
pnpm dev
```

## Tests

```bash
docker compose up -d postgres
pnpm --filter @clinic/api test   # or: cd apps/api && go test ./...
```

Integration tests (`apps/api/internal/server`) run against a separate database,
`clinic_test` by default (override with `TEST_DB_NAME`), which is wiped on every
test. They are skipped when Postgres is not reachable.

## Roles

| Role | Akses |
|---|---|
| `admin` | Semua menu dan data |
| `staff` (FO / kasir) | Resepsionis, perawatan, kasir & pembayaran, pasien, membership, laporan FO |
| `doctor` | Perawatan, laporan DM |
| `nurse` | Perawatan, laporan Nurse |
| `apoteker` | Depo, warehouse, pembelian (termasuk bayar supplier), supplier, laporan Apotek |
| `finance` | Keuangan (COA, pengaturan akun, jurnal, buku besar, neraca saldo, laba rugi, neraca), bayar supplier, laporan FO & Apotek |

The API enforces this in `apps/api/internal/platform/middleware/rbac.go`; the web
menu mirrors it in `apps/web/src/shared/lib/access.ts`.

- Web: http://localhost:5173  
- API: http://localhost:8080/api/health  
- Login: `admin` / `admin123`

## Theme

Global CSS variables in `apps/web/src/styles/themes/clinical-teal.css`.  
Gemini prompt to refine UI: [`docs/gemini-ui-prompt.md`](docs/gemini-ui-prompt.md).

## Modules

Auth, pasien, staff, user, treatment, supplier, bank, perusahaan, cabang, antrian, appointment, perawatan, penjualan, pembelian, barang, warehouse (konversi/produksi/stok-opname/kartu-stok), membership, voucher, promo, dashboard, generate-number, finance.

## Finance

Double-entry accounting in `apps/api/internal/modules/finance`. Cashier payments, deposits/member fees,
package refunds, purchases and supplier payments, and stock opname differences post journals in the same
database transaction, using the accounts chosen in **Keuangan → Pengaturan Akun** (`/finance/mapping`).
A default chart of accounts and mapping are seeded on start. Cancelling or deleting a source document posts
a reversing journal. Transactions made before the module existed are not journaled; record opening balances
with a manual journal. HPP and stock differences are valued at `barang.harga_beli`.
