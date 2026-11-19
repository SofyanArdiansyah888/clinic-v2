import { test, expect } from '@playwright/test'
import { api, apiData, expectOwnStaff, loginAs, today } from '../e2e/support'
import { chooseById, createFixtures, expectToast, rupiah } from './helpers'

// Kasus negatif: input yang salah harus ditolak dengan jelas dan tidak menyimpan data.
test.describe('QA · Validasi & kasus negatif', () => {
  test('TC-VAL-01 registrasi kunjungan tanpa dokter tidak tersimpan', async ({ page }) => {
    const nama = `Tanpa Dokter QA ${Date.now()}`
    let posted = false
    page.on('request', (r) => {
      if (r.method() === 'POST' && r.url().includes('/api/antrian')) posted = true
    })
    await loginAs(page, 'staff')
    await page.goto('/resepsionis/kunjungan')
    await page.getByRole('button', { name: 'Registrasi Kunjungan' }).first().click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('button', { name: 'Pasien Baru' }).click()
    await page.locator('#kunjunganpage-f2').fill(nama)
    await page.locator('#kunjunganpage-f3').fill('081299990000')
    await dialog.getByRole('button', { name: 'Masukkan Antrian' }).click()
    await expect(dialog, 'dialog tetap terbuka').toBeVisible()
    expect(posted, 'tidak boleh ada request simpan').toBe(false)
  })

  test('TC-VAL-02 registrasi pasien baru tanpa nama tidak tersimpan', async ({ page }) => {
    let posted = false
    page.on('request', (r) => {
      if (r.method() === 'POST' && r.url().includes('/api/antrian')) posted = true
    })
    const f = await createFixtures()
    await loginAs(page, 'staff')
    await page.goto('/resepsionis/kunjungan')
    await page.getByRole('button', { name: 'Registrasi Kunjungan' }).first().click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('button', { name: 'Pasien Baru' }).click()
    await page.locator('#kunjunganpage-f3').fill('081299990001')
    await chooseById(page, 'kunjunganpage-f4', f.dokter.nama)
    await dialog.getByRole('button', { name: 'Masukkan Antrian' }).click()
    await expect(dialog).toBeVisible()
    expect(posted).toBe(false)
  })

  test('TC-VAL-03 batal antrian butuh konfirmasi dan mengubah status jadi Batal', async ({ page }) => {
    const f = await createFixtures()
    const fo = await api('staff')
    const nama = `Batal QA ${f.id}`
    await apiData(fo, 'post', '/antrian/create-pasien-antrian', { nama, no_telp: '0814' + String(Date.now()).slice(-8), staff_id: f.dokter.id, tanggal: today() })
    await loginAs(page, 'staff')
    await page.goto('/resepsionis/kunjungan')
    const row = page.locator('tr', { hasText: nama })
    await row.getByRole('button', { name: 'Batal' }).click()
    // Menolak konfirmasi: status tidak berubah.
    await page.getByRole('dialog').getByRole('button', { name: /^Batal$|Tidak|Kembali/ }).first().click()
    await expect(row).toContainText('Menunggu')
    await row.getByRole('button', { name: 'Batal' }).click()
    await page.getByRole('button', { name: 'Ya, batalkan' }).click()
    await expect(row).toContainText('Batal')
    await expect(row.getByRole('button', { name: 'Panggil' })).toHaveCount(0)
  })

  test('TC-VAL-04 bayar kurang dari tagihan ditolak, tagihan tetap di kasir', async ({ page }) => {
    const f = await createFixtures({ hargaTreatment: 300000 })
    const fo = await api('staff')
    const nama = `Kurang Bayar QA ${f.id}`
    const reg = await apiData<{ pasien: { id: number }; antrian: { id: number } }>(fo, 'post', '/antrian/create-pasien-antrian', {
      nama, no_telp: '0815' + String(Date.now()).slice(-8), staff_id: f.dokter.id, tanggal: today(),
    })
    const doctor = await api('doctor')
    await apiData(doctor, 'post', '/perawatan', {
      pasien_id: reg.pasien.id, staff_id: f.dokter.id, antrian_id: reg.antrian.id, tanggal: today(), status: 'bayar',
      tindakans: [{ treatment_id: f.treatment.id, jumlah: 1, harga: 300000, total: 300000, tanggal: today(), beautician_id: f.beautician.id }],
    })

    await loginAs(page, 'staff')
    await page.goto('/pembayaran/perawatan')
    const row = page.locator('tr', { hasText: nama })
    await row.getByRole('button', { name: 'Bayar', exact: true }).click()
    await expectOwnStaff(page, 'paymentmodal-f5', 'staff')
    await chooseById(page, 'paymentmodal-f6', 'Tunai')
    await page.locator('#paymentmodal-f8').fill('100000')
    await page.getByRole('button', { name: /Bayar & Selesai/ }).click()
    await expectToast(page, 'Jumlah bayar kurang dari sisa tagihan')
    await page.getByRole('dialog').getByRole('button', { name: 'Batal' }).click()
    await expect(row, 'tagihan masih menunggu pembayaran').toContainText(rupiah(300000))
  })

  test('TC-VAL-05 kode promo tidak valid ditolak di kasir', async ({ page }) => {
    const f = await createFixtures({ hargaTreatment: 200000 })
    const fo = await api('staff')
    const nama = `Promo Salah QA ${f.id}`
    const reg = await apiData<{ pasien: { id: number }; antrian: { id: number } }>(fo, 'post', '/antrian/create-pasien-antrian', {
      nama, no_telp: '0816' + String(Date.now()).slice(-8), staff_id: f.dokter.id, tanggal: today(),
    })
    const doctor = await api('doctor')
    await apiData(doctor, 'post', '/perawatan', {
      pasien_id: reg.pasien.id, staff_id: f.dokter.id, antrian_id: reg.antrian.id, tanggal: today(), status: 'bayar',
      tindakans: [{ treatment_id: f.treatment.id, jumlah: 1, harga: 200000, total: 200000, tanggal: today(), beautician_id: f.beautician.id }],
    })

    await loginAs(page, 'staff')
    await page.goto('/pembayaran/perawatan')
    await page.locator('tr', { hasText: nama }).getByRole('button', { name: 'Bayar', exact: true }).click()
    await page.locator('#paymentmodal-f1').fill('PRM-TIDAK-ADA-QA')
    await page.getByRole('dialog').getByRole('button', { name: /Terapkan|Cek|Pakai/ }).first().click()
    await expect(page.getByRole('dialog')).toContainText(/tidak (ditemukan|valid|berlaku)/i)
    await expect(page.getByRole('button', { name: /Bayar & Selesai/ })).toBeDisabled()
  })
})
