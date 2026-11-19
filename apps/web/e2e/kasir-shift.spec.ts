import { test, expect, type Page } from '@playwright/test'
import { api, apiData, loginAs, ownStaffId, today, tutupShift, uniq, watchProblems } from './support'

async function pick(page: Page, id: string, label: string | RegExp) {
  await page.locator(`#${id}`).click()
  await page.getByRole('option', { name: label }).first().click()
}

// Kasir opens the cashier with a float, takes a cash payment, then closes by counting the
// drawer: the expected cash and the shortfall are shown and the cash-up report prints.
test('buka kasir, bayar tunai, tutup kasir dengan selisih', async ({ page, context }) => {
  await context.addInitScript(() => {
    const w = window as unknown as { __printed: number }
    w.__printed = 0
    window.print = () => {
      w.__printed++
    }
  })
  await tutupShift('staff')

  const admin = await api('admin')
  const id = uniq()
  const staff = (await apiData<{ id: number }[]>(admin, 'get', '/staff?per_page=1'))[0]
  const tr = await apiData<{ id: number }>(admin, 'post', '/treatment', { nama: `Peeling Shift ${id}`, kategori: 'Perawatan', harga: 120000 })
  const pasien = await apiData<{ id: number }>(admin, 'post', '/pasien', { nama: `Pasien Shift ${id}`, no_telp: '0815' + id.slice(-6) })
  const doctor = await api('doctor')
  const pw = await apiData<{ id: number; kode: string }>(doctor, 'post', '/perawatan', {
    pasien_id: pasien.id, staff_id: staff.id, tanggal: today(), status: 'bayar',
    tindakans: [{ treatment_id: tr.id, jumlah: 1, harga: 120000, total: 120000, tanggal: today(), beautician_id: staff.id }],
  })

  await loginAs(page, 'staff')
  const problems = watchProblems(page)

  // Without an open shift the cashier cannot take the payment.
  await page.goto('/pembayaran/perawatan')
  const row = page.locator('tr', { hasText: pw.kode })
  await row.getByRole('button', { name: 'Bayar', exact: true }).click()
  await expect(page.getByTestId('shift-belum-dibuka')).toBeVisible()
  await expect(page.getByRole('button', { name: /Bayar & Selesai/ })).toBeDisabled()
  await page.getByTestId('shift-belum-dibuka').getByRole('link', { name: 'Buka kasir sekarang' }).click()
  await expect(page).toHaveURL(/\/pembayaran\/kasir$/)

  // Open with a 200.000 float.
  await page.locator('#kasir-saldo-awal').fill('200000')
  await page.getByRole('button', { name: 'Buka Kasir' }).click()
  await expect(page.getByText(/Kasir terbuka/)).toBeVisible()
  const kode = (await page.getByTestId('shift-kode').textContent())!.trim()
  expect(kode).toMatch(/^SHF-/)
  await expect(page.getByText('Kas Diharapkan (Tunai)').locator('..')).toContainText(/Rp\s*200\.000/)

  // Pay 120.000 with 150.000 cash: only the bill stays in the drawer.
  await page.goto('/pembayaran/perawatan')
  await row.getByRole('button', { name: 'Bayar', exact: true }).click()
  await expect(page.getByTestId('shift-belum-dibuka')).toHaveCount(0)
  await pick(page, 'paymentmodal-f6', 'Tunai')
  await page.locator('#paymentmodal-f8').fill('150000')
  await page.getByRole('button', { name: /Bayar & Selesai/ }).click()
  await expect(page.getByText('Pembayaran berhasil', { exact: true })).toBeVisible()
  const invoice = (await page.getByTestId('paid-invoice').textContent())!.trim()
  await page.getByRole('button', { name: 'Selesai' }).click()

  await page.goto('/pembayaran/kasir')
  await expect(page.getByText('Kas Diharapkan (Tunai)').locator('..')).toContainText(/Rp\s*320\.000/)
  await expect(page.locator('tr', { hasText: invoice })).toContainText(/Rp\s*120\.000/)

  // Count 310.000: 10.000 short.
  await page.getByRole('button', { name: 'Tutup Kasir' }).click()
  await expect(page.getByTestId('tutup-expected')).toContainText(/Rp\s*320\.000/)
  await page.locator('#kasir-fisik').fill('310000')
  await expect(page.getByTestId('tutup-selisih')).toContainText(/Kurang/)
  await expect(page.getByTestId('tutup-selisih')).toContainText(/-\s*Rp\s*10\.000/)
  await page.locator('#kasir-catatan-tutup').fill('Uang receh kurang')
  const [popup] = await Promise.all([page.waitForEvent('popup'), page.getByRole('button', { name: /Tutup & Cetak/ }).click()])

  await expect(popup.getByText('LAPORAN TUTUP KASIR')).toBeVisible()
  await expect(popup.getByText(kode)).toBeVisible()
  await expect(popup.getByText(invoice)).toBeVisible()
  await expect(popup.getByText(/Uang receh kurang/)).toBeVisible()
  await expect.poll(() => popup.evaluate(() => (window as unknown as { __printed: number }).__printed)).toBe(1)
  await popup.close()

  const ditutup = page.getByTestId('shift-ditutup')
  await expect(ditutup).toContainText(kode)
  await expect(ditutup).toContainText(/selisih\s*-\s*Rp\s*10\.000\s*\(Kurang\)/)
  await expect(page.getByRole('button', { name: 'Buka Kasir' })).toBeVisible()

  // The history lists the closed shift with its shortfall.
  await page.goto('/data-transaksi/shift')
  await expect(page.locator('tr', { hasText: kode })).toContainText(/-\s*Rp\s*10\.000/)
  expect(problems, problems.join('\n')).toEqual([])

  // After closing, the server refuses money again.
  const fo = await api('staff')
  const res = await fo.post('/api/pembayaran/deposit', {
    data: { pasien_id: pasien.id, staff_id: await ownStaffId('staff'), tanggal: today(), jenis: 'pembayaran_deposit', jumlah: 10000, jenis_pembayaran: 'tunai' },
  })
  expect(res.status()).toBe(400)
  expect((await res.json()).message).toContain('Kasir belum dibuka')
})
