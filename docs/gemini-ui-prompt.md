# Gemini UI/UX Prompt — Clinic OS (Clinical Teal)

Copy everything below the line into Gemini. After generation, paste tokens into `apps/web/src/styles/themes/clinical-teal.css` and screen notes into `docs/design-system/MASTER.md`.

---

Design a complete UI/UX design system and high-fidelity screen templates for **Clinic OS**, an Indonesian clinic operations SaaS used daily by resepsionis, perawat/dokter, kasir, depo, warehouse, and admin staff.

## Product context
- Language: Indonesian UI copy
- App type: internal operations dashboard (not a marketing landing page)
- Modules: Dashboard, Resepsionis (kunjungan/antrian, appointment), Perawatan, Pembayaran/Kasir, Depo, Warehouse (barang, stok opname, produksi, konversi), Data Transaksi, Administrasi (pasien, staff, treatment, supplier, user, bank, cabang, perusahaan, membership, voucher, promo), Laporan shells

## Visual direction (LOCKED)
- Style: **Clinical teal / medical calm** — trustworthy, clean, high-contrast for all-day use
- Primary: teal (`#0F766E` range) on slate neutrals
- Surfaces: soft slate/gray hierarchy, subtle borders, restrained shadows
- Typography: distinctive readable pairing — **Plus Jakarta Sans** for UI; tabular numbers for money/IDs
- Icons: SVG only (Lucide-style), no emoji icons

## Hard anti-patterns (DO NOT use)
- Purple / indigo SaaS gradients
- Warm cream background + terracotta + high-contrast serif (AI default look)
- Broadsheet/newspaper dense columns with hairline rules
- Dark-mode-first
- Glow effects, neon, glassmorphism overload
- Excessive card nesting in hero/dashboard
- Rounded-full pill clusters, multi-layer shadows
- Flat single-color page with no hierarchy

## Brand
- Product name **Clinic OS** must be a clear identity in the app shell (sidebar header)
- Not a consumer marketing site — prioritize speed and clarity for staff workflows

## Layout system
- Collapsible sidebar grouped by role/module
- Dense but breathable data tables
- Pattern: PageHeader + filter/search bar + primary CTA
- Forms in Dialog/Sheet
- Kasir: sticky order summary
- Perawatan: split view (patient context | actions)
- Status chips for queue: menunggu / diproses / selesai / bayar (color + text label)

## Screens to template (desktop 1440 + mobile 390)
1. Login
2. Dashboard KPI
3. Pasien list + form
4. Kunjungan / Antrian board
5. Detail Perawatan
6. Pembayaran / Kasir
7. Warehouse stok list + stok opname
8. Empty / loading / error states

## Components
Button, Input, Select, DatePicker, Badge/Status, DataTable, Dialog/Sheet, Tabs, Sidebar nav item, Lookup modal, Toast, Skeleton

## UX rules
- Touch targets ≥ 44px
- Visible focus rings
- Disable submit while loading
- Field-adjacent errors
- Keyboard-friendly lookups
- Respect `prefers-reduced-motion`
- Body text ≥ 16px on mobile
- Contrast ≥ 4.5:1

## Required output format
1. **Design tokens** as CSS variables (`--background`, `--foreground`, `--primary`, `--primary-foreground`, `--muted`, `--border`, `--sidebar`, `--success`, `--warning`, `--danger`, `--radius`, `--font-sans`) AND equivalent JSON
2. **Component rules** (sizes, radii, spacing)
3. **Annotated wireframe descriptions** per screen (layout regions, hierarchy, key interactions)
4. **Do / Don’t** list
5. **Spacing scale**: 4 / 8 / 12 / 16 / 24 / 32
6. Sample Indonesian microcopy for buttons, empty states, errors

Keep the system theme-swappable via `[data-theme="clinical-teal"]`.
