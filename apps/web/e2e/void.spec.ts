import { test, expect } from '@playwright/test'
import { api, apiData, bukaShift, loginAs, today, uniq, watchProblems } from './support'

type Penjualan = { id: number; kode: string; no_invoice: string; status: string; alasan_batal?: string }

// A visit paid at the kasir: the staff sees the receipt but no void button; the admin
// voids it from Data Penjualan with a reason, the refund leaves the admin's shift and the
// perawatan goes back to the kasir queue.
test('admin membatalkan transaksi lunas, staff tidak melihat tombol Batalkan', async ({ page }) => {
  const id = uniq()
  await bukaShift('staff')
  await bukaShift('admin')
  const admin = await api('admin')
  const fo = await api('staff')
  const tr = await apiData<{ id: number }>(admin, 'post', '/treatment', { nama: `Facial Void ${id}`, kategori: 'Skin Care', harga: 250000 })
  const pasien = await apiData<{ id: number }>(fo, 'post', '/pasien', { nama: `Pasien Void ${id}`, no_telp: '0817' + id.slice(-6) })
  const staffId = (await apiData<{ staff_id: number }>(fo, 'get', '/auth/me')).staff_id
  const pw = await apiData<{ id: number }>(admin, 'post', '/perawatan', {
    pasien_id: pasien.id, staff_id: staffId, tanggal: today(), status: 'bayar',
    tindakans: [{ treatment_id: tr.id, jumlah: 1, harga: 250000, total: 250000, tanggal: today() }],
  })
  const pj = await apiData<Penjualan>(fo, 'post', '/pembayaran/bayar', {
    source_type: 'perawatan', source_id: pw.id, staff_id: staffId, jenis_pembayaran: 'tunai', jumlah_bayar: 250000, tanggal: today(),
  })

  const cari = async () => {
    await page.goto('/data-transaksi/penjualan')
    const search = page.getByRole('searchbox', { name: 'Cari data penjualan' })
    await search.fill(pj.no_invoice)
    await search.press('Enter')
    const row = page.locator('tr', { hasText: pj.no_invoice })
    await expect(row).toBeVisible()
    return row
  }

  // Staff: receipt yes, void no.
  await loginAs(page, 'staff')
  let row = await cari()
  await expect(row.getByRole('button', { name: `Cetak kwitansi ${pj.no_invoice}` })).toBeVisible()
  await expect(row.getByRole('button', { name: `Batalkan ${pj.no_invoice}` })).toHaveCount(0)
  await expect(row.getByRole('button', { name: `Hapus ${pj.kode}` }), 'a paid sale is never deleted').toHaveCount(0)

  // Admin: the dialog shows the refund, needs a reason, then voids.
  await loginAs(page, 'admin')
  const problems = watchProblems(page)
  row = await cari()
  await row.getByRole('button', { name: `Batalkan ${pj.no_invoice}` }).click()
  const form = page.getByTestId('void-penjualan-form')
  await expect(page.getByTestId('void-refund')).toContainText('250.000')
  const submit = form.getByRole('button', { name: 'Batalkan Transaksi' })
  await expect(submit, 'a reason is required').toBeDisabled()
  await page.locator('#void-alasan').fill('Salah input treatment')
  await submit.click()
  await expect(form).toHaveCount(0)
  await expect(row).toContainText('Dibatalkan')
  await expect(row.getByRole('button', { name: `Batalkan ${pj.no_invoice}` })).toHaveCount(0)
  await expect(row.getByRole('button', { name: `Cetak kwitansi ${pj.no_invoice}` }), 'the voided receipt stays printable').toBeVisible()

  const after = await apiData<Penjualan>(admin, 'get', `/penjualan/${pj.id}`)
  expect(after.status).toBe('cancelled')
  expect(after.alasan_batal).toBe('Salah input treatment')
  const perawatan = await apiData<{ status: string }>(admin, 'get', `/perawatan/${pw.id}`)
  expect(perawatan.status, 'the visit is back at the kasir').toBe('bayar')
  const shift = await apiData<{ mutasi: { source_type: string; source_id: number; keluar: number }[] }>(admin, 'get', '/kasir/shift/aktif')
  expect(shift.mutasi.find((m) => m.source_type === 'void' && m.source_id === pj.id)?.keluar).toBe(250000)
  expect(problems).toEqual([])

  await admin.dispose()
  await fo.dispose()
})
