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

- Web: http://localhost:5173  
- API: http://localhost:8080/api/health  
- Login: `admin` / `admin123`

## Theme

Global CSS variables in `apps/web/src/styles/themes/clinical-teal.css`.  
Gemini prompt to refine UI: [`docs/gemini-ui-prompt.md`](docs/gemini-ui-prompt.md).

## Modules

Auth, pasien, staff, user, treatment, supplier, bank, perusahaan, cabang, antrian, appointment, perawatan, penjualan, pembelian, barang, warehouse (konversi/produksi/stok-opname/kartu-stok), membership, voucher, promo, dashboard, generate-number.
