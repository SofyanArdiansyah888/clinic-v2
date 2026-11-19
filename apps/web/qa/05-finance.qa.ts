import { test, expect, type Page } from '@playwright/test'
import { api, apiData, loginAs, today, watchProblems } from '../e2e/support'
import { rupiah } from './helpers'

type Ringkasan = { dari: string; sampai: string; pendapatan: number; laba_kotor: number; laba_bersih: number }
type Highlights = { periode: Ringkasan; posisi: { kas_bank: number } }

/** Stubs the print dialog and returns the document title it was opened with (the PDF file name). */
async function clickPdf(page: Page) {
  await page.evaluate(() => {
    ;(window as unknown as { __printed?: string }).__printed = undefined
    window.print = () => {
      ;(window as unknown as { __printed?: string }).__printed = document.title
    }
  })
  await page.getByRole('button', { name: 'PDF', exact: true }).click()
  return page.evaluate(() => (window as unknown as { __printed?: string }).__printed)
}

test.describe('QA · Finance: Financial Highlights & PDF', () => {
  test('TC-FIN-01 Financial Highlights cocok dengan laba rugi dan bisa dicetak A4 landscape', async ({ page }, info) => {
    // A known income entry today, reversed afterwards so the ledger is left as it was.
    const finance = await api('finance')
    const akuns = await apiData<{ id: number; kode: string }[]>(finance, 'get', '/finance/akun')
    const kas = akuns.find((a) => a.kode === '1-1101')!
    const pendapatan = akuns.find((a) => a.kode === '4-1101')!
    const jurnal = await apiData<{ id: number }>(finance, 'post', '/finance/jurnal', {
      tanggal: today(), keterangan: 'QA Financial Highlights',
      details: [{ akun_id: kas.id, debit: 1234000 }, { akun_id: pendapatan.id, kredit: 1234000 }],
    })

    try {
      await loginAs(page, 'finance')
      const problems = watchProblems(page)
      const loaded = page.waitForResponse((r) => r.url().includes('/api/finance/laporan/highlights'))
      await page.goto('/finance/highlights')
      const h = ((await (await loaded).json()) as { data: Highlights }).data

      await test.step('Angka di halaman sama dengan API dan dengan laporan laba rugi', async () => {
        const lr = await apiData<{ total_pendapatan: number; laba_bersih: number }>(
          finance, 'get', `/finance/laporan/laba-rugi?dari=${h.periode.dari}&sampai=${h.periode.sampai}`,
        )
        expect(h.periode.pendapatan, 'pendapatan highlights = laba rugi').toBe(lr.total_pendapatan)
        expect(h.periode.laba_bersih, 'laba bersih highlights = laba rugi').toBe(lr.laba_bersih)
        expect(h.periode.pendapatan).toBeGreaterThanOrEqual(1234000)

        await expect(page.getByText('Pendapatan', { exact: true }).first().locator('..')).toContainText(rupiah(h.periode.pendapatan))
        await expect(page.getByText('Kas & bank', { exact: true }).first().locator('..')).toContainText(rupiah(h.posisi.kas_bank))
        for (const panel of ['Operasional', 'Tren pendapatan 12 bulan', 'Komposisi pendapatan', 'Perbandingan laba rugi', 'Posisi keuangan']) {
          await expect(page.getByRole('heading', { name: panel }), panel).toBeVisible()
        }
      })

      await test.step('Tombol PDF membuka dialog cetak dengan nama file berisi periode', async () => {
        const title = await clickPdf(page)
        expect(title).toBe(`Financial Highlights ${h.periode.dari} sd ${h.periode.sampai}`)
      })

      await test.step('Tampilan cetak: kop klinik tampil, menu dan tombol tersembunyi', async () => {
        await page.emulateMedia({ media: 'print' })
        await expect(page.getByText('Dicetak oleh', { exact: false })).toBeVisible()
        await expect(page.getByText('Disetujui oleh', { exact: false })).toBeVisible()
        await expect(page.getByRole('button', { name: 'PDF', exact: true })).toBeHidden()
        await expect(page.getByRole('link', { name: 'Financial Highlights' })).toBeHidden()
        const path = info.outputPath('financial-highlights.pdf')
        const pdf = await page.pdf({ path, format: 'A4', landscape: true, printBackground: true, preferCSSPageSize: true })
        expect(pdf.byteLength).toBeGreaterThan(10_000)
        await info.attach('financial-highlights.pdf', { path, contentType: 'application/pdf' })
        await page.emulateMedia({ media: 'screen' })
      })

      expect(problems, problems.join('\n')).toEqual([])
    } finally {
      await apiData(finance, 'post', `/finance/jurnal/${jurnal.id}/reverse`, { tanggal: today() })
    }
  })

  test('TC-FIN-02 Laba rugi bisa disimpan sebagai PDF A4', async ({ page }, info) => {
    await loginAs(page, 'finance')
    await page.goto('/finance/laba-rugi')
    await expect(page.getByText(/LABA BERSIH|RUGI BERSIH/)).toBeVisible()
    const title = await clickPdf(page)
    expect(title).toMatch(/^Laba Rugi \d{4}-\d{2}-\d{2} sd \d{4}-\d{2}-\d{2}$/)
    await page.emulateMedia({ media: 'print' })
    await expect(page.locator('#lap-dari'), 'filter tanggal tidak ikut tercetak').toBeHidden()
    const path = info.outputPath('laba-rugi.pdf')
    await page.pdf({ path, format: 'A4', printBackground: true, preferCSSPageSize: true })
    await info.attach('laba-rugi.pdf', { path, contentType: 'application/pdf' })
  })

  test('TC-FIN-03 role selain admin/finance tidak bisa membuka Financial Highlights', async ({ page }) => {
    await loginAs(page, 'staff')
    await page.goto('/finance/highlights')
    await page.waitForURL((u) => u.pathname === '/', { timeout: 5000 })
    const staff = await api('staff')
    const res = await staff.get('/api/finance/laporan/highlights')
    expect(res.status()).toBe(403)
  })
})
