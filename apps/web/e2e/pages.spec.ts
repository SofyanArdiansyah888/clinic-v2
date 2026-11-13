import { test, expect } from '@playwright/test'
import { ALL_PAGES, loginAs, watchProblems } from './support'

// Admin can open every page; each one must render without JS errors or failing API calls.
test.describe('every page as admin', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin')
  })

  for (const path of ALL_PAGES) {
    test(`renders ${path}`, async ({ page }) => {
      const problems = watchProblems(page)
      await page.goto(path)
      await page.waitForLoadState('networkidle')
      await expect(page).toHaveURL(new RegExp(path === '/' ? '/$' : path.replace(/\//g, '\\/')))
      await expect(page.locator('main, [role=main], #root').first()).toBeVisible()
      expect(problems, problems.join('\n')).toEqual([])
    })
  }
})
