import { type APIRequestContext, type Page, expect, request } from '@playwright/test'

// Runs against the dedicated e2e stack (API on :8082 with DB clinic_e2e, web on :5175),
// so nothing here touches the normal dev database.
export const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:5175'

// Seed admin from apps/api/internal/server/seed.go, overridable for other environments.
export const ADMIN = {
  username: process.env.E2E_ADMIN_USER ?? 'admin',
  password: process.env.E2E_ADMIN_PASSWORD ?? 'admin123',
}

// Test-only accounts the global setup creates in the e2e database.
export const ROLE_PASSWORD = process.env.E2E_ROLE_PASSWORD ?? 'e2e-role-pass-123'
export const ROLES = ['doctor', 'staff', 'apoteker', 'nurse', 'finance'] as const
export type Role = 'admin' | (typeof ROLES)[number]

export const credentials = (role: Role) =>
  role === 'admin' ? ADMIN : { username: `e2e_${role}`, password: ROLE_PASSWORD }

export const ALL_PAGES = [
  '/',
  '/resepsionis/kunjungan',
  '/resepsionis/appointment',
  '/perawatan',
  '/perawatan/riwayat',
  '/pembayaran/perawatan',
  '/pembayaran/produk',
  '/pembayaran/deposit',
  '/pembayaran/pembatalan',
  '/depo/penjualan-langsung',
  '/depo/resep',
  '/warehouse/barang',
  '/warehouse/stok-opname',
  '/warehouse/produksi',
  '/warehouse/konversi',
  '/warehouse/kartu-stok',
  '/data-transaksi/penjualan',
  '/data-transaksi/pembelian',
  '/data-transaksi/deposit',
  '/administrasi/pengaturan-umum',
  '/administrasi/pasien',
  '/administrasi/staff',
  '/administrasi/treatment',
  '/administrasi/supplier',
  '/administrasi/user',
  '/administrasi/bank',
  '/administrasi/cabang',
  '/administrasi/perusahaan',
  '/administrasi/membership',
  '/administrasi/voucher',
  '/administrasi/promo',
  '/administrasi/template-informed-consent',
  '/laporan/fo',
  '/laporan/apotek',
  '/laporan/nurse',
  '/laporan/dm',
  '/finance/akun',
  '/finance/pengaturan-akun',
  '/finance/jurnal',
  '/finance/buku-besar',
  '/finance/neraca-saldo',
  '/finance/laba-rugi',
  '/finance/neraca',
] as const

type LoginData = { access_token: string; refresh_token: string; user: unknown }

export async function apiLogin(role: Role): Promise<LoginData> {
  const ctx = await request.newContext({ baseURL: BASE_URL })
  const res = await ctx.post('/api/auth/login', { data: credentials(role) })
  expect(res.ok(), `login ${role}: ${res.status()}`).toBeTruthy()
  const body = await res.json()
  await ctx.dispose()
  return body.data as LoginData
}

/** An API client authenticated as the given role. */
export async function api(role: Role = 'admin'): Promise<APIRequestContext> {
  const { access_token } = await apiLogin(role)
  return request.newContext({ baseURL: BASE_URL, extraHTTPHeaders: { Authorization: `Bearer ${access_token}` } })
}

export async function apiData<T = any>(ctx: APIRequestContext, method: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string, data?: unknown): Promise<T> {
  const res = await ctx[method]('/api' + path, data === undefined ? undefined : { data })
  const body = await res.json().catch(() => ({}))
  expect(res.ok(), `${method.toUpperCase()} ${path}: ${res.status()} ${body?.message ?? ''}`).toBeTruthy()
  return body.data as T
}

/** Skips the login form by putting the tokens where the app keeps them. */
export async function loginAs(page: Page, role: Role) {
  const data = await apiLogin(role)
  await page.goto('/login')
  await page.evaluate((d) => {
    localStorage.setItem('clinic_access_token', d.access_token)
    localStorage.setItem('clinic_refresh_token', d.refresh_token)
    localStorage.setItem('clinic_user', JSON.stringify(d.user))
  }, data)
}

/** Collects console errors, uncaught page errors and failed API calls while a page is used. */
export function watchProblems(page: Page) {
  const problems: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`console: ${m.text()}`)
  })
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))
  page.on('response', (r) => {
    if (r.url().includes('/api/') && r.status() >= 400) problems.push(`api ${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`)
  })
  return problems
}

export const today = () => new Date().toISOString().slice(0, 10)
export const uniq = () => Date.now().toString(36) + Math.floor(Math.random() * 1e4)
