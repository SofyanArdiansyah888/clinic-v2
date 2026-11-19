import { test, expect } from '@playwright/test'
import { api, apiData, loginAs, watchProblems } from '../e2e/support'
import { PHOTO, chooseById, chooseByPlaceholder, createFixtures, expectToast, rupiah, stokBarang, tab } from './helpers'

// Satu kunjungan pasien baru dari awal sampai akhir, semuanya lewat UI dengan role yang benar:
// FO registrasi -> panggil -> layani (foto) -> dokter isi SOAP, resep, tindakan -> kasir bayar
// -> apoteker serahkan obat -> data muncul di laporan & jurnal.
test('TC-FLOW-01 kunjungan pasien baru sampai obat diserahkan', async ({ page }) => {
  const startedAt = Date.now()
  const f = await createFixtures({ hargaTreatment: 250000, hargaBarang: 15000, stok: 20 })
  const pasien = `Pasien QA ${f.id}`
  const total = f.hargaTreatment + f.hargaBarang
  const stokAwal = await stokBarang(f)
  const problems = watchProblems(page)

  await test.step('FO: registrasi kunjungan pasien baru', async () => {
    await loginAs(page, 'staff')
    await page.goto('/resepsionis/kunjungan')
    await page.getByRole('button', { name: 'Registrasi Kunjungan' }).first().click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('button', { name: 'Pasien Baru' }).click()
    await page.locator('#kunjunganpage-f2').fill(pasien)
    await page.locator('#kunjunganpage-f3').fill('0812' + String(Date.now()).slice(-8))
    await chooseById(page, 'kunjunganpage-f4', f.dokter.nama)
    await page.locator('#kunjunganpage-f6').fill('Konsultasi kulit kusam (QA)')
    await page.locator('#kunjunganpage-f7').uncheck()
    await dialog.getByRole('button', { name: 'Masukkan Antrian' }).click()
    await expectToast(page, 'Kunjungan berhasil didaftarkan')
    await expect(page.locator('tr', { hasText: pasien })).toContainText('Menunggu')
  })

  await test.step('FO: panggil pasien', async () => {
    const row = page.locator('tr', { hasText: pasien })
    await row.getByRole('button', { name: 'Panggil' }).click()
    await expect(row).toContainText('Dipanggil')
  })

  await test.step('FO: layani pasien dengan foto sebelum perawatan', async () => {
    await page.locator('tr', { hasText: pasien }).getByRole('button', { name: 'Layani' }).click()
    const dialog = page.getByRole('dialog').filter({ hasText: 'Foto Sebelum Perawatan' })
    await expect(dialog.getByRole('button', { name: 'Lanjut ke Perawatan' })).toBeDisabled()
    await dialog.locator('input[type=file]').setInputFiles(PHOTO)
    await dialog.getByRole('button', { name: 'Lanjut ke Perawatan' }).click()
    await expect(page).toHaveURL(/\/perawatan$/, { timeout: 20_000 })
  })

  await test.step('Dokter: isi SOAP, resep, dan tindakan lalu kirim ke kasir', async () => {
    await loginAs(page, 'doctor')
    await page.goto('/perawatan')
    const row = page.locator('tr', { hasText: pasien }).first()
    await expect(row).toBeVisible()
    await row.getByTitle('Input SOAP & Treatment').click()
    await expect(page).toHaveURL(/\/perawatan\/detail/)

    await page.locator('#detailperawatanpage-f1').fill('Kulit kusam dan kering sejak 2 minggu.')
    await page.locator('#detailperawatanpage-f2').fill('Dehidrasi kulit ringan')
    await page.locator('#detailperawatanpage-f3').fill('Facial + krim pelembab, kontrol 2 minggu')

    await page.getByRole('button', { name: 'Input Resep Dokter' }).click()
    const resep = page.getByRole('dialog').filter({ hasText: 'Input Resep Dokter' })
    await resep.getByRole('button', { name: 'Tambah Barang' }).click()
    await chooseByPlaceholder(page, resep, 'Cari & pilih barang / obat...', f.barang.nama)
    await resep.getByRole('button', { name: 'Masukkan ke Resep' }).click()
    await expect(page.getByText(f.barang.nama).first()).toBeVisible()

    await tab(page, /Tindakan Medis/).click()
    await page.getByRole('button', { name: 'Tambah Tindakan' }).click()
    await chooseByPlaceholder(page, page, 'Cari & pilih treatment...', f.treatment.nama)
    await chooseByPlaceholder(page, page, 'Cari & pilih beautician...', f.beautician.nama)
    await expect(page.getByText(rupiah(f.hargaTreatment)).first()).toBeVisible()

    // Dokter pemeriksa harus terisi otomatis dari antrian.
    await tab(page, /Pasien(,| &) Foto/).click()
    const dokter = page.locator('#detailperawatanpage-f5')
    await expect.soft(dokter, 'dokter pemeriksa terisi otomatis dari antrian').toContainText(f.dokter.nama)
    if (!(await dokter.innerText()).includes(f.dokter.nama)) await chooseById(page, 'detailperawatanpage-f5', f.dokter.nama)

    await page.getByRole('button', { name: 'Simpan EMR & Kirim ke Kasir' }).click()
    await expectToast(page, /dikirim ke kasir/)
    await expect(page).toHaveURL(/\/perawatan$/, { timeout: 10_000 })
  })

  let kodePerawatan = ''
  await test.step('Kasir: tagihan benar, bayar tunai, kembalian benar', async () => {
    await loginAs(page, 'staff')
    await page.goto('/pembayaran/perawatan')
    const row = page.locator('tr', { hasText: pasien })
    await expect(row, 'pasien harus muncul satu kali di antrian kasir').toHaveCount(1)
    await expect(row, 'tagihan = tindakan + resep').toContainText(rupiah(total))
    kodePerawatan = (await row.locator('td').first().innerText()).trim()
    await row.getByRole('button', { name: 'Bayar', exact: true }).click()
    await expect(page.getByText('Sisa Bayar').locator('..')).toContainText(rupiah(total))
    await chooseById(page, 'paymentmodal-f5', f.kasir.nama)
    await chooseById(page, 'paymentmodal-f6', 'Tunai')
    await page.locator('#paymentmodal-f8').fill(String(total + 35000))
    await expect(page.getByText(new RegExp(`Kembalian\\s*Rp\\s*${rupiah(35000).replace('.', '\\.')}`))).toBeVisible()
    await page.getByRole('button', { name: /Bayar & Selesai/ }).click()
    await expect(row).toHaveCount(0, { timeout: 10_000 })
  })

  await test.step('Stok berkurang sesuai resep setelah dibayar', async () => {
    expect(await stokBarang(f)).toBe(stokAwal - 1)
  })

  await test.step('Apoteker: serahkan obat dari depo', async () => {
    await loginAs(page, 'apoteker')
    await page.goto('/depo/resep')
    // Obat dibuat unik per run, jadi baris resep dicari lewat nama obat.
    const row = page.locator('tr', { hasText: f.barang.nama })
    await expect(row).toBeVisible()
    await expect.soft(row, 'resep di depo harus menampilkan nama pasien').toContainText(pasien)
    await expect.soft(row, 'resep di depo harus menampilkan dokter').toContainText(f.dokter.nama)
    await row.getByRole('button', { name: 'Serahkan' }).click()
    await expect(row).toHaveCount(0, { timeout: 10_000 })
    await tab(page, 'Sudah Diserahkan').click()
    await expect(page.locator('tr', { hasText: f.barang.nama })).toBeVisible()
  })

  await test.step('Back office: antrian selesai dan transaksi masuk jurnal', async () => {
    const admin = await api('admin')
    type Jurnal = { kode: string; created_at: string; total_debit: number; total_kredit: number; source_type: string }
    const jurnal = await apiData<Jurnal[]>(admin, 'get', '/finance/jurnal?per_page=50')
    const baru = jurnal.filter((j) => new Date(j.created_at).getTime() >= startedAt - 5_000)
    expect(
      baru.some((j) => j.total_debit === total && j.total_kredit === total),
      `jurnal seimbang senilai ${rupiah(total)} untuk pembayaran ${kodePerawatan}; jurnal baru: ${JSON.stringify(baru.map((j) => [j.kode, j.total_debit, j.total_kredit]))}`,
    ).toBe(true)

    await loginAs(page, 'staff')
    await page.goto('/resepsionis/kunjungan')
    await expect(page.locator('tr', { hasText: pasien })).toContainText(/Selesai/)
  })

  expect(problems, problems.join('\n')).toEqual([])
})
