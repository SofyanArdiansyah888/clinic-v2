import { test, expect } from '@playwright/test'
import { api, apiData, loginAs, today, uniq, watchProblems } from './support'

// Doctor signs an informed consent on the canvas inside the EMR; it is stored as a
// snapshot with the placeholders filled, printable, and cancellable with a reason.
test('informed consent ditandatangani di canvas dan tersimpan per perawatan', async ({ page, context }) => {
  await context.addInitScript(() => {
    const w = window as unknown as { __printed: number }
    w.__printed = 0
    window.print = () => {
      w.__printed++
    }
  })
  const id = uniq()
  const admin = await api('admin')
  const staff = (await apiData<{ id: number }[]>(admin, 'get', '/staff?per_page=1'))[0]
  const tr = await apiData<{ id: number }>(admin, 'post', '/treatment', { nama: `Laser E2E ${id}`, kategori: 'Perawatan', harga: 100000 })
  await apiData(admin, 'post', '/template-informed-consent', {
    judul: `Consent ${id} {treatment}`,
    kategori: 'Umum',
    isi: 'Saya {nama_pasien} menyetujui tindakan {treatment}.',
    is_active: true,
  })
  const fo = await api('staff')
  const pasien = await apiData<{ id: number }>(fo, 'post', '/pasien', { nama: `Consent E2E ${id}`, no_telp: '0814' + id.slice(-6) })
  const doctor = await api('doctor')
  const pw = await apiData<{ id: number }>(doctor, 'post', '/perawatan', {
    pasien_id: pasien.id, staff_id: staff.id, tanggal: today(), status: 'draft',
    tindakans: [{ treatment_id: tr.id, jumlah: 1, harga: 100000, total: 100000, tanggal: today() }],
  })

  await loginAs(page, 'doctor')
  const problems = watchProblems(page)
  await page.goto(`/perawatan/detail?id=${pw.id}`)
  await page.getByRole('tab', { name: /Pasien & Foto/ }).click()
  await page.getByRole('button', { name: /Informed Consent/ }).click()

  await page.locator('#consent-template').click()
  await page.getByRole('option', { name: new RegExp(`Consent ${id}`) }).first().click()
  await expect(page.getByText(`Saya Consent E2E ${id} menyetujui tindakan Laser E2E ${id}.`)).toBeVisible()
  await expect(page.locator('#consent-nama')).toHaveValue(`Consent E2E ${id}`)

  const save = page.getByRole('button', { name: 'Simpan Consent' })
  await expect(save, 'tanpa tanda tangan belum bisa disimpan').toBeDisabled()
  const box = (await page.locator('#consent-ttd-pasien').boundingBox())!
  await page.mouse.move(box.x + 30, box.y + box.height / 2)
  await page.mouse.down()
  for (let i = 1; i <= 10; i++) await page.mouse.move(box.x + 30 + i * 20, box.y + box.height / 2 + (i % 2 ? 15 : -15))
  await page.mouse.up()
  await save.click()

  const list = page.getByTestId('consent-list')
  await expect(list).toContainText(`Consent ${id} Laser E2E ${id}`)
  await expect(page.getByTestId('consent-count')).toHaveText('1')

  const consents = await apiData<{ id: number; isi: string; ttd_pasien_url: string; status: string }[]>(doctor, 'get', `/perawatan/${pw.id}/consent`)
  expect(consents).toHaveLength(1)
  expect(consents[0].isi).toBe(`Saya Consent E2E ${id} menyetujui tindakan Laser E2E ${id}.`)
  expect(consents[0].ttd_pasien_url).toContain('/uploads/files/')

  // A4 print copy with the signature image.
  const [popup] = await Promise.all([page.waitForEvent('popup'), list.getByRole('button', { name: 'Cetak consent' }).click()])
  await expect(popup.getByRole('heading', { name: `Consent ${id} Laser E2E ${id}` })).toBeVisible()
  await expect(popup.getByAltText('Tanda tangan Pasien / Wali')).toBeVisible()
  await expect.poll(() => popup.evaluate(() => (window as unknown as { __printed: number }).__printed)).toBe(1)
  await popup.close()

  // Doctor cancels it with a reason; it stays on record, marked cancelled.
  await list.getByRole('button', { name: 'Batalkan consent' }).click()
  await page.getByLabel('Alasan pembatalan').fill('Salah template')
  await list.getByRole('button', { name: 'Batalkan', exact: true }).click()
  await expect(list).toContainText('Dibatalkan: Salah template')
  expect(problems, problems.join('\n')).toEqual([])
})

// On a perawatan that is not saved yet the consent is kept aside and stored right after
// the EMR is created.
test('consent pada perawatan baru tersimpan setelah EMR disimpan', async ({ page }) => {
  const id = uniq()
  const admin = await api('admin')
  await apiData(admin, 'post', '/template-informed-consent', { judul: `Consent Baru ${id}`, isi: 'Saya {nama_pasien} setuju.', is_active: true })
  const fo = await api('staff')
  const pasien = await apiData<{ id: number }>(fo, 'post', '/pasien', { nama: `Pending E2E ${id}`, no_telp: '0815' + id.slice(-6) })

  await loginAs(page, 'doctor')
  const problems = watchProblems(page)
  await page.goto(`/perawatan/detail?pasien_id=${pasien.id}`)
  await page.getByRole('tab', { name: /Pasien & Foto/ }).click()
  await page.locator('#detailperawatanpage-f5').click()
  await page.getByRole('option', { name: /Petugas E2E doctor/ }).first().click()

  await page.getByRole('button', { name: /Informed Consent/ }).click()
  await page.locator('#consent-template').click()
  await page.getByRole('option', { name: new RegExp(`Consent Baru ${id}`) }).first().click()
  await page.locator('#consent-nama').fill(`Pending E2E ${id}`)
  const box = (await page.locator('#consent-ttd-pasien').boundingBox())!
  await page.mouse.move(box.x + 40, box.y + 40)
  await page.mouse.down()
  await page.mouse.move(box.x + 200, box.y + 90, { steps: 8 })
  await page.mouse.up()
  await page.getByRole('button', { name: 'Simpan Consent' }).click()
  await expect(page.getByTestId('consent-list')).toContainText('menunggu EMR disimpan')
  await page.getByRole('button', { name: 'Tutup', exact: true }).last().click()
  await expect(page.getByTestId('consent-count')).toHaveText('1')

  await page.getByRole('button', { name: /Simpan EMR/ }).click()
  await expect(page).toHaveURL(/\/perawatan$/, { timeout: 10000 })

  const doctor = await api('doctor')
  const list = await apiData<{ id: number; pasien_id: number }[]>(doctor, 'get', `/perawatan?status=bayar&per_page=20`)
  const pw = list.find((p) => p.pasien_id === pasien.id)
  expect(pw, 'perawatan baru tersimpan').toBeTruthy()
  const consents = await apiData<{ isi: string }[]>(doctor, 'get', `/perawatan/${pw!.id}/consent`)
  expect(consents.map((c) => c.isi)).toEqual([`Saya Pending E2E ${id} setuju.`])
  expect(problems, problems.join('\n')).toEqual([])
})
