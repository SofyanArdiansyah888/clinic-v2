# Clinic OS Design System — MASTER

Applied from Gemini clinical-teal template (Aug 2026).

## Direction
Clinical teal / medical calm — dark slate shell + teal actions + dense operational tables.

## Typography
- UI: **Plus Jakarta Sans**
- Codes / money / IDs: **JetBrains Mono** + `tabular-nums`

## Color tokens (`styles/themes/clinical-teal.css`)
| Token | Value (intent) |
|-------|----------------|
| `--primary` | Teal 600 `#0D9488` |
| `--primary-strong` | Teal 700 `#0F766E` |
| `--background` | Slate 100 `#F1F5F9` |
| `--foreground` / sidebar | Slate 900 `#0F172A` |
| `--border` | Slate 200 |
| Status menunggu | Amber soft |
| Status diproses | Sky soft |
| Status bayar | Teal soft |
| Status selesai | Emerald soft |
| Status batal | Rose soft |

## Shell patterns
- Sidebar: `bg-slate-900`, header `bg-slate-950`, active nav `bg-teal-700`
- Groups: Operasional Utama / Farmasi & Gudang / Administrasi & Laporan
- Branch switcher widget under brand
- Topbar: white sticky, breadcrumb `Clinic OS / …`, live datetime chip

## Page patterns
- PageHeader: title + short description + primary teal CTA, bottom border
- Filter bar: white card, search + selects
- Tables: slate-50 thead uppercase 11px, dense body, hover slate-50
- Forms: Dialog/Sheet with slate-900 header strip where modal
- Login: split panel (branding slate-900 | form white)

## Do
- Always pair status color with text label (`.status-badge-*`)
- Use mono/tabular for RM codes, invoice, money
- Keep touch targets ≥ 40–44px on primary actions

## Don’t
- Purple gradients, cream+terracotta, glow, emoji icons
- Flat white page without slate hierarchy
- Color-only status indicators

## Theme swap
Set `data-theme` on `<html>` and load matching file under `styles/themes/`.
