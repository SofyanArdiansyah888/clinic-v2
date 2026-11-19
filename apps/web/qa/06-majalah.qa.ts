import { test, expect, type Page } from '@playwright/test'
import { api, loginAs, watchProblems } from '../e2e/support'
import { expectToast } from './helpers'

const BAB = ['Front Office & Kasir', 'Dokter', 'Terapis & Nurse', 'Apotek & Depo', 'Keuangan']

async function periode(page: Page) {
  return { dari: await page.locator('#mj-dari').inputValue(), sampai: await page.locator('#mj-sampai').inputValue() }
}

async function stubPrint(page: Page) {
  await page.evaluate(() => {
    window.print = () => {
      ;(window as unknown as { __printed?: string }).__printed = document.title
    }
  })
}

/** Removes notes written by the test (an empty note deletes it). */
async function clearNote(role: 'admin' | 'staff', divisi: string, p: { dari: string; sampai: string }) {
  const ctx = await api(role)
  await ctx.put('/api/laporan/catatan', { data: { divisi, ...p, isi: '' } })
  await ctx.dispose()
}

test.describe('QA · Majalah Kinerja', () => {
  test('TC-MJ-01 admin: sampul, ringkasan, 5 bab, catatan, dan PDF landscape', async ({ page }, info) => {
    await loginAs(page, 'admin')
    const problems = watchProblems(page)
    await page.goto('/laporan/majalah')
    const p = await periode(page)
    const note = `Fokus bulan depan: kurangi antrian jam sibuk (QA ${Date.now()})`

    try {
      await test.step('Semua lembar tampil dengan temuan otomatis', async () => {
        await expect(page.getByRole('region', { name: 'Sampul' })).toBeVisible()
        await expect(page.getByRole('region', { name: 'Ringkasan eksekutif' })).toBeVisible()
        for (const b of BAB) {
          const sheet = page.getByRole('region', { name: `Bab ${b}` })
          await expect(sheet, b).toBeVisible()
          await expect(sheet.getByText('Temuan'), `${b} punya temuan`).toBeVisible()
          await expect(sheet.getByText(`Memuat data`), `${b} selesai dimuat`).toHaveCount(0, { timeout: 15_000 })
        }
        await expect(page.getByRole('region', { name: 'Sampul' })).toContainText('Ringkasan eksekutif')
      })

      await test.step('Catatan pimpinan tersimpan dan tetap ada setelah dimuat ulang', async () => {
        await page.locator('#catatan-eksekutif').fill(note)
        await page.getByRole('region', { name: 'Ringkasan eksekutif' }).getByRole('button', { name: 'Simpan catatan' }).click()
        await expectToast(page, 'Catatan disimpan')
        await page.reload()
        await expect(page.locator('#catatan-eksekutif')).toHaveValue(note)
      })

      await test.step('Cetak: nama file, catatan ikut tercetak, kontrol tersembunyi, 7 halaman A4', async () => {
        await stubPrint(page)
        await page.getByRole('button', { name: 'Cetak / PDF' }).click()
        expect(await page.evaluate(() => (window as unknown as { __printed?: string }).__printed)).toMatch(
          new RegExp(`^Laporan Kinerja .+ ${p.dari} sd ${p.sampai}$`),
        )
        await page.emulateMedia({ media: 'print' })
        await expect(page.locator('#catatan-eksekutif')).toBeHidden()
        await expect(page.getByRole('region', { name: 'Ringkasan eksekutif' }).locator('p', { hasText: note })).toBeVisible()
        await expect(page.locator('#mj-dari')).toBeHidden()
        const path = info.outputPath('majalah-kinerja.pdf')
        const pdf = await page.pdf({ path, format: 'A4', landscape: true, printBackground: true, margin: { top: '12mm', bottom: '12mm', left: '12mm', right: '12mm' } })
        const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length
        expect(pages, 'sampul + ringkasan + 5 bab').toBe(7)
        await info.attach('majalah-kinerja.pdf', { path, contentType: 'application/pdf' })
        await page.emulateMedia({ media: 'screen' })
      })

      await test.step('Bab yang tidak dicentang hilang dari majalah dan daftar isi', async () => {
        await page.locator('#bab-apotek').uncheck()
        await expect(page.getByRole('region', { name: 'Bab Apotek & Depo' })).toHaveCount(0)
        await expect(page.getByRole('region', { name: 'Sampul' })).not.toContainText('Apotek & Depo')
      })

      expect(problems, problems.join('\n')).toEqual([])
    } finally {
      await clearNote('admin', 'eksekutif', p)
    }
  })

  test('TC-MJ-02 staff hanya melihat dan menulis bab Front Office', async ({ page }) => {
    await loginAs(page, 'staff')
    await page.goto('/laporan/majalah')
    const p = await periode(page)
    try {
      await expect(page.getByRole('region', { name: 'Bab Front Office & Kasir' })).toBeVisible()
      await expect(page.getByRole('region', { name: 'Ringkasan eksekutif' })).toHaveCount(0)
      for (const b of BAB.slice(1)) await expect(page.getByRole('region', { name: `Bab ${b}` }), b).toHaveCount(0)

      await page.locator('#catatan-fo').fill('Tambah satu petugas FO di jam 10-12 (QA)')
      await page.getByRole('button', { name: 'Simpan catatan' }).click()
      await expectToast(page, 'Catatan disimpan')

      // Writing another division's note is refused by the API.
      const staff = await api('staff')
      const r = await staff.put('/api/laporan/catatan', { data: { divisi: 'finance', ...p, isi: 'tidak boleh' } })
      expect(r.status()).toBe(403)
    } finally {
      await clearNote('staff', 'fo', p)
    }
  })
})
