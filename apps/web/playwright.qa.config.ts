import { defineConfig, devices } from '@playwright/test'
import base from './playwright.config'

// QA suite: end-to-end scenarios driven through the UI the way a tester would use the app.
// It CREATES data (pasien, antrian, perawatan, pembayaran, stok, jurnal), so it must only
// ever point at staging or the local e2e stack, never at production.
//
//   Local (default):  pnpm qa            -> local e2e stack (API :8082 + DB clinic_e2e, web :5175)
//   Staging:          QA_BASE_URL=https://staging.example.com pnpm qa   (or put it in .env.qa)

try {
  process.loadEnvFile('.env.qa')
} catch {
  /* no .env.qa: use the process environment / local defaults */
}

const target = process.env.QA_BASE_URL?.replace(/\/+$/, '')

if (target) {
  const host = new URL(target).hostname
  const looksSafe =
    /^(localhost|127\.0\.0\.1|\[::1\])$/.test(host) ||
    /(^|[.-])(staging|stg|dev|qa|test|uat|sandbox|preview)([.-]|$)/i.test(host)
  if (!looksSafe && process.env.QA_ALLOW_HOST !== host) {
    throw new Error(
      `QA suite menulis data dan host "${host}" tidak terlihat seperti staging. ` +
        `Kalau host ini memang staging (bukan prod), set QA_ALLOW_HOST=${host}.`,
    )
  }
  // Shared helpers in e2e/support.ts read E2E_BASE_URL.
  process.env.E2E_BASE_URL = target
}

export default defineConfig({
  testDir: '.',
  testMatch: ['qa/**/*.qa.ts', 'e2e/pages.spec.ts', 'e2e/rbac.spec.ts'],
  // Creates the e2e_<role> logins (idempotent) using the admin account.
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 120_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { outputFolder: 'qa-report', open: 'never' }]],
  outputDir: 'qa-results',
  use: {
    baseURL: target ?? base.use?.baseURL,
    locale: 'id-ID',
    timezoneId: process.env.QA_TIMEZONE ?? 'Asia/Jakarta',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // Only start local servers when not pointed at a deployed environment.
  webServer: target ? undefined : base.webServer,
})
