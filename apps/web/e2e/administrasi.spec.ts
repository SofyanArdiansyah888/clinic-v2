import { test, expect } from '@playwright/test'
import { ROLE_PASSWORD, api, apiData, loginAs, uniq, watchProblems } from './support'

type Fill = Record<string, string | ((id: string) => string)>

// Master-data pages built on ResourceListPage: create one record through the dialog,
// then make sure it shows in the table and the request succeeded.
const PAGES: { path: string; button: string; fill: Fill; shows: string }[] = [
  { path: '/administrasi/pasien', button: 'Tambah Pasien', fill: { nama: (id) => `Pasien UI ${id}`, no_telp: '081234567' }, shows: 'nama' },
  { path: '/administrasi/staff', button: 'Tambah Staff / Dokter', fill: { nama: (id) => `Staff UI ${id}` }, shows: 'nama' },
  { path: '/administrasi/treatment', button: 'Tambah Treatment', fill: { nama: (id) => `Treatment UI ${id}`, harga: '150000' }, shows: 'nama' },
  { path: '/administrasi/supplier', button: 'Tambah Supplier', fill: { nama: (id) => `Supplier UI ${id}` }, shows: 'nama' },
  { path: '/administrasi/bank', button: 'Tambah Bank', fill: { nama: (id) => `Bank UI ${id}`, no_rekening: '1234567890' }, shows: 'nama' },
  { path: '/administrasi/cabang', button: 'Tambah Cabang', fill: { nama: (id) => `Cabang UI ${id}` }, shows: 'nama' },
  { path: '/administrasi/perusahaan', button: 'Tambah Perusahaan', fill: { nama: (id) => `Perusahaan UI ${id}` }, shows: 'nama' },
  { path: '/administrasi/promo', button: 'Tambah Promo', fill: { nama: (id) => `Promo UI ${id}`, nilai_diskon: '10' }, shows: 'nama' },
  { path: '/administrasi/voucher', button: 'Tambah Voucher', fill: { nama: (id) => `Voucher UI ${id}`, nilai_diskon: '5000' }, shows: 'nama' },
  { path: '/administrasi/template-informed-consent', button: 'Tambah Template', fill: { judul: (id) => `Consent UI ${id}`, isi: 'Saya setuju.' }, shows: 'judul' },
  {
    path: '/administrasi/user', button: 'Tambah User',
    fill: { name: (id) => `User UI ${id}`, username: (id) => `ui_${id}`, email: (id) => `ui_${id}@e2e.test`, password: ROLE_PASSWORD },
    shows: 'name',
  },
]

test.describe('administrasi create via UI', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin')
  })

  for (const p of PAGES) {
    test(`create on ${p.path}`, async ({ page }) => {
      const id = uniq()
      const problems = watchProblems(page)
      await page.goto(p.path)
      await page.getByRole('button', { name: p.button }).first().click()
      for (const [name, v] of Object.entries(p.fill)) {
        await page.locator(`#create-${name}`).fill(typeof v === 'function' ? v(id) : v)
      }
      const saved = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().includes('/api/'))
      await page.getByRole('button', { name: 'Simpan', exact: true }).click()
      const res = await saved
      expect(res.status(), await res.text()).toBeLessThan(300)
      const shown = p.fill[p.shows]
      await expect(page.getByText(typeof shown === 'function' ? shown(id) : shown).first()).toBeVisible()
      expect(problems, problems.join('\n')).toEqual([])
    })
  }

  test('create membership by picking a pasien', async ({ page }) => {
    const admin = await api('admin')
    const id = uniq()
    const pasien = await apiData<{ id: number }>(admin, 'post', '/pasien', { nama: `Member UI ${id}` })
    await page.goto('/administrasi/membership')
    await page.getByRole('button', { name: 'Tambah Membership' }).first().click()
    await page.locator('#create-pasien_id').selectOption(String(pasien.id))
    const saved = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().includes('/api/membership'))
    await page.getByRole('button', { name: 'Simpan', exact: true }).click()
    expect((await saved).status()).toBeLessThan(300)
    await expect(page.getByText(`Member UI ${id}`).first()).toBeVisible()
  })

  test('edit pasien via UI', async ({ page }) => {
    const admin = await api('admin')
    const id = uniq()
    const pasien = await apiData<{ id: number; kode: string }>(admin, 'post', '/pasien', { nama: `Edit Me ${id}` })
    await page.goto('/administrasi/pasien')
    const row = page.locator('tr', { hasText: `Edit Me ${id}` })
    await row.getByRole('button', { name: /edit|ubah/i }).first().click()
    await page.locator('#edit-nama').fill(`Sudah Diedit ${id}`)
    await page.getByRole('button', { name: 'Simpan Perubahan' }).click()
    await expect(page.getByText(`Sudah Diedit ${id}`).first()).toBeVisible()
    const after = await apiData<{ nama: string }>(admin, 'get', `/pasien/${pasien.id}`)
    expect(after.nama).toBe(`Sudah Diedit ${id}`)
  })
})
