import { test, expect, type Page } from '@playwright/test'
import { api, apiData, loginAs, today, uniq, watchProblems } from './support'

async function pick(page: Page, id: string, label: string | RegExp) {
  await page.locator(`#${id}`).click()
  await page.getByRole('option', { name: label }).first().click()
}

// Full visit: patient queued at front office -> perawatan sent to cashier -> paid in the UI
// by the kasir -> journal, FO report and resep queue all reflect it.
test('kunjungan sampai pembayaran perawatan lewat UI kasir', async ({ page }) => {
  const admin = await api('admin')
  const id = uniq()
  const staffList = await apiData<{ id: number; nama: string }[]>(admin, 'get', '/staff?per_page=1')
  const staff = staffList[0]
  const tr = await apiData<{ id: number }>(admin, 'post', '/treatment', { nama: `Facial E2E ${id}`, kategori: 'Perawatan', harga: 250000 })
  const brg = await apiData<{ id: number }>(admin, 'post', '/barang', { nama: `Krim E2E ${id}`, harga_jual: 15000 })
  await apiData(admin, 'patch', `/barang/${brg.id}/stock`, { stok_aktual: 10 }).catch(() => undefined)
  await apiData(admin, 'post', '/stok-opname', { tanggal: today(), details: [{ barang_id: brg.id, stok_fisik: 10 }] })

  const fo = await api('staff')
  const reg = await apiData<{ pasien: { id: number }; antrian: { id: number } }>(fo, 'post', '/antrian/create-pasien-antrian', {
    nama: `Pasien E2E ${id}`, no_telp: '0812' + id.slice(-6), staff_id: staff.id, tanggal: today(),
  })

  const doctor = await api('doctor')
  const pw = await apiData<{ id: number; kode: string }>(doctor, 'post', '/perawatan', {
    pasien_id: reg.pasien.id, staff_id: staff.id, antrian_id: reg.antrian.id, tanggal: today(), status: 'bayar',
    tindakans: [{ treatment_id: tr.id, jumlah: 1, harga: 250000, total: 250000, tanggal: today(), beautician_id: staff.id }],
    reseps: [{ pasien_id: reg.pasien.id, tanggal: today(), barangs: [{ barang_id: brg.id, nama_barang: `Krim E2E ${id}`, jumlah: 1, harga: 15000 }] }],
  })

  // Kasir pays it through the UI.
  await loginAs(page, 'staff')
  const problems = watchProblems(page)
  await page.goto('/pembayaran/perawatan')
  const row = page.locator('tr', { hasText: pw.kode })
  await expect(row).toBeVisible()
  // The queue shows the full bill (tindakan + resep) and treatment names.
  await expect(row, 'queue total should include resep (250.000 + 15.000)').toContainText('265.000')
  await expect(row, 'queue should show treatment name').toContainText(`Facial E2E ${id}`)
  await row.getByRole('button', { name: 'Bayar', exact: true }).click()
  await expect(page.getByText('Sisa Bayar').locator('..')).toContainText('265.000')

  await pick(page, 'paymentmodal-f5', staff.nama)
  await pick(page, 'paymentmodal-f6', 'Tunai')
  await page.locator('#paymentmodal-f8').fill('300000')
  await expect(page.getByText(/Kembalian\s*Rp\s*35\.000/)).toBeVisible()
  await page.getByRole('button', { name: /Bayar & Selesai/ }).click()
  await expect(row).toHaveCount(0, { timeout: 10000 })
  expect(problems, problems.join('\n')).toEqual([])

  // Back office checks.
  const jurnal = await apiData<{ keterangan: string; referensi: string }[]>(admin, 'get', '/finance/jurnal?per_page=50')
  expect(jurnal.length).toBeGreaterThan(0)

  const laporan = await apiData<{ ringkasan: { transaksi: number } }>(fo, 'get', `/laporan/fo?dari=${today()}&sampai=${today()}`)
  expect(laporan.ringkasan.transaksi).toBeGreaterThan(0)

  const reseps = await apiData<{ id: number; pasien_id: number }[]>(admin, 'get', '/resep?status=dibayar&per_page=100')
  const resep = reseps.find((r) => r.pasien_id === reg.pasien.id)
  expect(resep, 'paid resep waiting at depo').toBeTruthy()

  // Apoteker hands the resep over from the depo page.
  await loginAs(page, 'apoteker')
  await page.goto('/depo/resep')
  await expect(page.getByText(`Pasien E2E ${id}`).first()).toBeVisible()

  await page.goto('/finance/jurnal')
  await expect(page).toHaveURL(/\/$/) // apoteker has no finance access
})

test('deposit pasien lewat UI tercatat di data transaksi', async ({ page }) => {
  const fo = await api('staff')
  const id = uniq()
  const pasien = await apiData<{ id: number }>(fo, 'post', '/pasien', { nama: `Deposit E2E ${id}`, no_telp: '0813' + id.slice(-6) })
  const admin = await api('admin')
  const staff = (await apiData<{ id: number }[]>(admin, 'get', '/staff?per_page=1'))[0]
  await apiData(fo, 'post', '/pembayaran/deposit', { pasien_id: pasien.id, staff_id: staff.id, tanggal: today(), jenis: 'pembayaran_deposit', jumlah: 75000, jenis_pembayaran: 'tunai' })

  const saldo = await apiData<{ saldo_deposit: number }>(fo, 'get', `/pembayaran/deposit/saldo?pasien_id=${pasien.id}`)
  expect(saldo.saldo_deposit).toBe(75000)

  await loginAs(page, 'staff')
  await page.goto('/data-transaksi/deposit')
  await expect(page.getByText(`Deposit E2E ${id}`).first()).toBeVisible()
})
