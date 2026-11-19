import { test, expect } from '@playwright/test'
import { type Role, credentials } from '../e2e/support'

const ROLES_UI: Role[] = ['admin', 'staff', 'doctor', 'nurse', 'apoteker', 'finance']

async function loginForm(page: import('@playwright/test').Page, username: string, password: string) {
  await page.goto('/login')
  await page.locator('#username').fill(username)
  await page.locator('#password').fill(password)
  await page.getByRole('button', { name: /Masuk Sistem/ }).click()
}

test.describe('QA · Login & sesi', () => {
  for (const role of ROLES_UI) {
    test(`TC-AUTH-01 login lewat form sebagai ${role} masuk ke dashboard`, async ({ page }) => {
      const c = credentials(role)
      await loginForm(page, c.username, c.password)
      await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 })
      await expect.poll(() => page.evaluate(() => localStorage.getItem('clinic_access_token'))).toBeTruthy()
    })
  }

  test('TC-AUTH-02 password salah ditolak dan tetap di halaman login', async ({ page }) => {
    await loginForm(page, credentials('admin').username, 'password-salah-qa')
    await expect(page).toHaveURL(/\/login/)
    await expect(page.locator('form p.text-rose-600')).toBeVisible()
    expect(await page.evaluate(() => localStorage.getItem('clinic_access_token'))).toBeNull()
  })

  test('TC-AUTH-03 form kosong tidak mengirim request login', async ({ page }) => {
    let sent = false
    page.on('request', (r) => {
      if (r.url().includes('/api/auth/login')) sent = true
    })
    await page.goto('/login')
    await page.locator('#username').fill('')
    await page.locator('#password').fill('')
    await page.getByRole('button', { name: /Masuk Sistem/ }).click()
    await expect(page).toHaveURL(/\/login/)
    expect(sent, 'login request must not be sent with empty fields').toBe(false)
  })

  test('TC-AUTH-06 form login tidak boleh terisi kredensial bawaan', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('#username'), 'username harus kosong saat halaman dibuka').toHaveValue('')
    await expect(page.locator('#password'), 'password harus kosong saat halaman dibuka').toHaveValue('')
  })

  test('TC-AUTH-04 halaman terproteksi tanpa login diarahkan ke login', async ({ page }) => {
    for (const path of ['/', '/resepsionis/kunjungan', '/pembayaran/perawatan', '/finance/jurnal']) {
      await page.goto(path)
      await expect(page, path).toHaveURL(/\/login/)
    }
  })

  test('TC-AUTH-05 logout menghapus sesi dan kembali ke login', async ({ page }) => {
    const c = credentials('staff')
    await loginForm(page, c.username, c.password)
    await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 })
    await page.getByTitle(/^Keluar/).first().click()
    // Logout may ask for confirmation.
    const confirm = page.getByRole('button', { name: /^(Ya|Keluar)/ })
    if (await confirm.isVisible().catch(() => false)) await confirm.click()
    await expect(page).toHaveURL(/\/login/)
    expect(await page.evaluate(() => localStorage.getItem('clinic_access_token'))).toBeNull()
    await page.goto('/pembayaran/perawatan')
    await expect(page).toHaveURL(/\/login/)
  })
})
