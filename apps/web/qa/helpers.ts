import { type Locator, type Page, expect } from '@playwright/test'
import { api, apiData, today, uniq } from '../e2e/support'

/** Opens a SearchableSelect (by its trigger) and picks the option with the given label. */
export async function choose(page: Page, trigger: Locator, label: string | RegExp) {
  await expect(trigger).toBeEnabled()
  await trigger.click()
  const listbox = page.getByRole('listbox')
  await expect(listbox).toBeVisible()
  // Type into the dropdown's search box so the option is found even in long lists.
  if (typeof label === 'string') await listbox.locator('xpath=preceding::input[1]').fill(label)
  await listbox.getByRole('option', { name: label }).first().click()
}

/** SearchableSelect that has an id on its trigger button. */
export const chooseById = (page: Page, id: string, label: string | RegExp) => choose(page, page.locator(`#${id}`), label)

/** SearchableSelect without an id, found by its placeholder text inside a scope. */
export const chooseByPlaceholder = (page: Page, scope: Page | Locator, placeholder: string, label: string | RegExp) =>
  choose(page, scope.getByRole('button', { name: placeholder }).last(), label)

/** Waits for a toast; if a different one shows (e.g. an error), the failure message includes it. */
/** A tab control, whether rendered as role=tab or as a plain button. */
export const tab = (page: Page, name: string | RegExp) =>
  page.getByRole('tab', { name }).or(page.getByRole('button', { name })).first()

export async function expectToast(page: Page, text: string | RegExp) {
  const toasts = page.locator('[role=status], [role=alert]')
  const seen = new Set<string>()
  await expect
    .poll(
      async () => {
        for (const t of await toasts.allInnerTexts()) if (t.trim()) seen.add(t.trim())
        return [...seen].some((t) => (typeof text === 'string' ? t.includes(text) : text.test(t)))
      },
      { message: `toast "${text}" tidak muncul`, timeout: 10_000 },
    )
    .toBe(true)
    .catch((e: Error) => {
      throw new Error(`${e.message}\nToast yang muncul: ${[...seen].join(' | ') || '(tidak ada)'}`)
    })
}

/** A 1x1 PNG, used wherever the UI requires a photo upload. */
export const PHOTO = {
  name: 'foto-qa.png',
  mimeType: 'image/png',
  buffer: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
    'base64',
  ),
}

export const rupiah = (n: number) => n.toLocaleString('id-ID')

export type Fixtures = Awaited<ReturnType<typeof createFixtures>>

/**
 * Master data a scenario needs, created fresh by the admin account so tests never depend on
 * whatever happens to exist in staging. Every name carries the run id, so leftovers are easy
 * to find and the same suite can run repeatedly.
 */
export async function createFixtures(opts: { hargaTreatment?: number; hargaBarang?: number; stok?: number } = {}) {
  const id = uniq()
  const hargaTreatment = opts.hargaTreatment ?? 250000
  const hargaBarang = opts.hargaBarang ?? 15000
  const admin = await api('admin')
  const dokter = await apiData<{ id: number; nama: string }>(admin, 'post', '/staff', { nama: `Dr. QA ${id}`, jabatan: 'Dokter', is_active: true })
  const beautician = await apiData<{ id: number; nama: string }>(admin, 'post', '/staff', { nama: `Beautician QA ${id}`, jabatan: 'Beautician', is_active: true })
  const kasir = await apiData<{ id: number; nama: string }>(admin, 'post', '/staff', { nama: `Kasir QA ${id}`, jabatan: 'Kasir', is_active: true })
  const treatment = await apiData<{ id: number; nama: string }>(admin, 'post', '/treatment', { nama: `Facial QA ${id}`, kategori: 'Perawatan', harga: hargaTreatment })
  const barang = await apiData<{ id: number; nama: string }>(admin, 'post', '/barang', { nama: `Krim QA ${id}`, harga_jual: hargaBarang })
  await apiData(admin, 'post', '/stok-opname', { tanggal: today(), details: [{ barang_id: barang.id, stok_fisik: opts.stok ?? 20 }] })
  return { id, admin, dokter, beautician, kasir, treatment, barang, hargaTreatment, hargaBarang }
}

export async function stokBarang(f: Fixtures) {
  return (await apiData<{ stok_aktual: number }>(f.admin, 'get', `/barang/${f.barang.id}`)).stok_aktual
}
