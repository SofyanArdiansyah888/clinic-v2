import { test, expect } from '@playwright/test'
import { ALL_PAGES, ROLES, loginAs, watchProblems } from './support'
import { canAccess } from '../src/shared/lib/access'

// For each role: pages it may open load without 403s, others send it back to the dashboard.
for (const role of ROLES) {
  test.describe(`role ${role}`, () => {
    test.beforeEach(async ({ page }) => {
      await loginAs(page, role)
    })

    test('allowed pages load without forbidden API calls', async ({ page }) => {
      test.setTimeout(180_000)
      const failures: string[] = []
      for (const path of ALL_PAGES.filter((p) => canAccess(role, p))) {
        const problems = watchProblems(page)
        await page.goto(path)
        await page.waitForLoadState('networkidle')
        if (!page.url().endsWith(path)) failures.push(`${path}: redirected to ${new URL(page.url()).pathname}`)
        for (const p of problems) failures.push(`${path}: ${p}`)
        page.removeAllListeners('console')
        page.removeAllListeners('pageerror')
        page.removeAllListeners('response')
      }
      expect(failures, failures.join('\n')).toEqual([])
    })

    test('blocked pages redirect to dashboard', async ({ page }) => {
      test.setTimeout(180_000)
      const leaks: string[] = []
      for (const path of ALL_PAGES.filter((p) => !canAccess(role, p))) {
        await page.goto(path)
        await page.waitForURL((u) => u.pathname === '/', { timeout: 5000 }).catch(() => undefined)
        if (new URL(page.url()).pathname !== '/') leaks.push(path)
      }
      expect(leaks, `pages ${role} could open: ${leaks.join(', ')}`).toEqual([])
    })
  })
}
