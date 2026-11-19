import { test, expect } from '@playwright/test'
import { apiData, expectOwnStaff, loginAs, watchProblems } from '../e2e/support'
import { chooseById, createFixtures, expectToast, rupiah, stokBarang } from './helpers'

// Pembelian obat tanpa perawatan: apoteker input di depo -> kasir bayar -> stok berkurang.
test('TC-DEPO-01 penjualan langsung di depo dibayar di kasir', async ({ page }) => {
  const f = await createFixtures({ hargaBarang: 42000, stok: 10 })
  const pasien = await apiData<{ id: number; nama: string }>(f.admin, 'post', '/pasien', { nama: `Pembeli QA ${f.id}`, no_telp: '0813' + String(Date.now()).slice(-8) })
  const qty = 2
  const total = qty * f.hargaBarang
  const stokAwal = await stokBarang(f)
  const problems = watchProblems(page)

  await test.step('Apoteker: input penjualan langsung', async () => {
    await loginAs(page, 'apoteker')
    await page.goto('/depo/penjualan-langsung')
    await chooseById(page, 'penjualanlangsungpage-f2', pasien.nama)
    await expectOwnStaff(page, 'penjualanlangsungpage-f3', 'apoteker')
    await chooseById(page, 'penjualanlangsungpage-f4', f.barang.nama)
    await expect(page.locator('#penjualanlangsungpage-f6'), 'harga terisi otomatis dari master barang').toHaveValue(rupiah(f.hargaBarang))
    await page.locator('#penjualanlangsungpage-f5').fill(String(qty))
    await page.getByRole('button', { name: /Kirim ke Kasir|Proses Ke Kasir/ }).click()
    await expectToast(page, 'Penjualan berhasil diproses')
  })

  await test.step('Kasir: bayar produk dengan tunai uang pas', async () => {
    await loginAs(page, 'staff')
    await page.goto('/pembayaran/produk')
    const row = page.locator('tr', { hasText: pasien.nama })
    await expect(row).toHaveCount(1)
    await expect(row).toContainText(rupiah(total))
    await row.getByRole('button', { name: 'Bayar', exact: true }).click()
    await expectOwnStaff(page, 'paymentmodal-f5', 'staff')
    await chooseById(page, 'paymentmodal-f6', 'Tunai')
    await expect(page.locator('#paymentmodal-f8'), 'jumlah bayar default = sisa tagihan').toHaveValue(rupiah(total))
    await page.getByRole('button', { name: /Bayar & Selesai/ }).click()
    await expectToast(page, 'Pembayaran produk berhasil')
  })

  await test.step('Stok berkurang sesuai qty', async () => {
    expect(await stokBarang(f)).toBe(stokAwal - qty)
  })

  expect(problems, problems.join('\n')).toEqual([])
})
