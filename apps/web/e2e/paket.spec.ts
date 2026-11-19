import { test, expect, type Page } from '@playwright/test'
import { api, apiData, bukaShift, loginAs, today, uniq, watchProblems } from './support'

async function pick(page: Page, id: string, label: string | RegExp) {
  await page.locator(`#${id}`).click()
  await page.getByRole('option', { name: label }).first().click()
}

type PaketAktif = {
  id: number
  kode: string
  items: { id: number; treatment_id: number; sisa_sesi: number; total_sesi: number }[]
}

// Admin fills a paket with several treatments in the catalog, the pasien buys it, the
// doctor redeems one session from the "Pakai Paket" panel and the kasir settles a Rp 0
// bill that shows the paket badge; the session comes off that item only.
test('isi paket multi-treatment lalu pakai satu sesi sampai kasir', async ({ page }) => {
  const id = uniq()
  const admin = await api('admin')
  const facial = await apiData<{ id: number }>(admin, 'post', '/treatment', { nama: `Facial Paket ${id}`, kategori: 'Skin Care', harga: 300000 })
  const peeling = await apiData<{ id: number }>(admin, 'post', '/treatment', { nama: `Peeling Paket ${id}`, kategori: 'Skin Care', harga: 200000 })
  const paket = await apiData<{ id: number }>(admin, 'post', '/treatment', { nama: `Paket Glow ${id}`, kategori: 'Paket', harga: 1000000, sesi_paket: 1 })

  // 1. Catalog editor: 3x Facial + 2x Peeling.
  await loginAs(page, 'admin')
  const problems = watchProblems(page)
  await page.goto('/administrasi/treatment')
  await page.getByRole('searchbox', { name: /Cari treatment/ }).fill(`Paket Glow ${id}`)
  await page.getByRole('searchbox', { name: /Cari treatment/ }).press('Enter')
  const row = page.locator('tr', { hasText: `Paket Glow ${id}` })
  await expect(row).toBeVisible()
  await row.getByRole('button', { name: `Isi Paket Paket Glow ${id}` }).click()
  const form = page.getByTestId('paket-items-form')
  await pick(page, 'paket-item-treatment-0', `Facial Paket ${id}`)
  await page.locator('#paket-item-sesi-0').fill('3')
  await form.getByRole('button', { name: 'Tambah Treatment' }).click()
  await pick(page, 'paket-item-treatment-1', `Peeling Paket ${id}`)
  await page.locator('#paket-item-sesi-1').fill('2')
  await expect(page.getByTestId('paket-total-sesi')).toHaveText('5x')
  await form.getByRole('button', { name: 'Simpan Isi Paket' }).click()
  await expect(form).toHaveCount(0)
  await expect(page.getByTestId(`isi-paket-${paket.id}`)).toContainText(`3x Facial Paket ${id} + 2x Peeling Paket ${id}`)

  const tr = await apiData<{ sesi_paket: number; items: { treatment_id: number; sesi: number }[] }>(admin, 'get', `/treatment/${paket.id}`)
  expect(tr.sesi_paket).toBe(5)
  expect(tr.items.map((i) => [i.treatment_id, i.sesi])).toEqual([[facial.id, 3], [peeling.id, 2]])

  // 2. The pasien buys the paket (API), paid by the kasir.
  await bukaShift('staff')
  const staff = (await apiData<{ id: number }[]>(admin, 'get', '/staff?per_page=1'))[0]
  const fo = await api('staff')
  const pasien = await apiData<{ id: number }>(fo, 'post', '/pasien', { nama: `Pasien Paket ${id}`, no_telp: '0816' + id.slice(-6) })
  const beli = await apiData<{ id: number }>(admin, 'post', '/perawatan', {
    pasien_id: pasien.id, staff_id: staff.id, tanggal: today(), status: 'bayar',
    tindakans: [{ treatment_id: paket.id, jumlah: 1, harga: 1000000, total: 1000000, tanggal: today() }],
  })
  await apiData(fo, 'post', '/pembayaran/bayar', {
    source_type: 'perawatan', source_id: beli.id, staff_id: (await apiData<{ staff_id: number }>(fo, 'get', '/auth/me')).staff_id,
    jenis_pembayaran: 'tunai', jumlah_bayar: 1000000, tanggal: today(),
  })
  const [pk] = await apiData<PaketAktif[]>(admin, 'get', `/pembayaran/paket/aktif?pasien_id=${pasien.id}`)
  const facialItem = pk.items.find((i) => i.treatment_id === facial.id)!
  expect(facialItem.sisa_sesi).toBe(3)

  // 3. Doctor redeems one facial from the "Pakai Paket" panel.
  await loginAs(page, 'doctor')
  await page.goto(`/perawatan/detail?pasien_id=${pasien.id}`)
  await page.getByRole('tab', { name: /Pasien & Foto/ }).click()
  await pick(page, 'detailperawatanpage-f5', /Petugas E2E doctor/)
  await page.getByRole('tab', { name: /Tindakan/ }).click()
  const panel = page.getByTestId('pakai-paket-panel')
  await expect(panel).toContainText(pk.kode)
  const pakai = page.getByTestId(`pakai-paket-item-${facialItem.id}`)
  await expect(pakai).toContainText('3/3')
  await pakai.click()
  await expect(page.getByTestId('tindakan-paket-badge-0')).toContainText('Sesi paket')
  await expect(pakai, 'the panel counts the session already added').toContainText('2/3')
  await expect(page.locator('#tindakan-harga-0')).toBeDisabled()
  await page.getByRole('button', { name: /Simpan EMR/ }).click()
  await expect(page).toHaveURL(/\/perawatan$/, { timeout: 10000 })

  const doctor = await api('doctor')
  const list = await apiData<{ id: number; kode: string; pasien_id: number; tindakans: { paket_item_id: number | null; total: number }[] }[]>(
    doctor, 'get', '/perawatan?status=bayar&per_page=50')
  const pw = list.find((p) => p.pasien_id === pasien.id && p.id !== beli.id)!
  expect(pw.tindakans.map((t) => [t.paket_item_id, t.total])).toEqual([[facialItem.id, 0]])

  // 4. Kasir settles the Rp 0 bill; the line carries the paket badge.
  await loginAs(page, 'staff')
  await page.goto('/pembayaran/perawatan')
  const qrow = page.locator('tr', { hasText: pw.kode })
  await expect(qrow).toBeVisible()
  await qrow.getByRole('button', { name: 'Bayar', exact: true }).click()
  await expect(page.getByTestId('tagihan-paket-badge')).toContainText(`${pk.kode} · sisa 3 → 2`)
  await expect(page.getByText('Sisa Bayar').locator('..')).toContainText('Rp 0')
  await page.getByRole('button', { name: /Bayar & Selesai/ }).click()
  await expect(page.getByText('Pembayaran berhasil', { exact: true })).toBeVisible()

  const [after] = await apiData<PaketAktif[]>(admin, 'get', `/pembayaran/paket/aktif?pasien_id=${pasien.id}`)
  expect(after.items.map((i) => [i.treatment_id, i.sisa_sesi])).toEqual([[facial.id, 2], [peeling.id, 2]])
  expect(problems, problems.join('\n')).toEqual([])
})

// Bought and first session in the same visit: the facial row offers "pakai dari paket ini"
// once the paket row is on the perawatan; ticked, it is saved at Rp 0 linked to that row.
test('sesi pertama dari paket yang dibeli di kunjungan yang sama', async ({ page }) => {
  const id = uniq()
  const admin = await api('admin')
  const facial = await apiData<{ id: number }>(admin, 'post', '/treatment', { nama: `Facial Baru ${id}`, kategori: 'Skin Care', harga: 300000 })
  const paket = await apiData<{ id: number }>(admin, 'post', '/treatment', {
    nama: `Paket Baru ${id}`, kategori: 'Paket', harga: 800000, items: [{ treatment_id: facial.id, sesi: 4 }],
  })
  const fo = await api('staff')
  const pasien = await apiData<{ id: number }>(fo, 'post', '/pasien', { nama: `Pasien Baru ${id}`, no_telp: '0817' + id.slice(-6) })

  await loginAs(page, 'doctor')
  const problems = watchProblems(page)
  await page.goto(`/perawatan/detail?pasien_id=${pasien.id}`)
  await page.getByRole('tab', { name: /Pasien & Foto/ }).click()
  await pick(page, 'detailperawatanpage-f5', /Petugas E2E doctor/)
  await page.getByRole('tab', { name: /Tindakan/ }).click()
  await page.getByRole('button', { name: 'Tambah Tindakan' }).click()
  await pick(page, 'tindakan-treatment-0', `Paket Baru ${id}`)
  await page.getByRole('button', { name: 'Tambah Tindakan' }).click()
  await pick(page, 'tindakan-treatment-1', `Facial Baru ${id}`)
  const toggle = page.getByTestId('tindakan-pakai-paket-ini-1')
  await expect(toggle).toBeVisible()
  await toggle.check()
  await expect(page.locator('#tindakan-harga-1')).toBeDisabled()
  await page.getByRole('button', { name: /Simpan EMR/ }).click()
  await expect(page).toHaveURL(/\/perawatan$/, { timeout: 10000 })

  const doctor = await api('doctor')
  const list = await apiData<{ pasien_id: number; tindakans: { id: number; total: number; paket_beli_tindakan_id: number | null }[] }[]>(
    doctor, 'get', '/perawatan?status=bayar&per_page=50')
  const pw = list.find((p) => p.pasien_id === pasien.id)!
  expect(pw.tindakans).toHaveLength(2)
  expect(pw.tindakans[1].paket_beli_tindakan_id).toBe(pw.tindakans[0].id)
  expect(pw.tindakans[1].total).toBe(0)
  expect(problems, problems.join('\n')).toEqual([])
})
