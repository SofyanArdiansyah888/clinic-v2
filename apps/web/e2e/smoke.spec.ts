import { test, expect } from "@playwright/test";

test.describe("Clinic OS smoke", () => {
  test("login page renders", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/Clinic OS|Masuk|Login/i).first()).toBeVisible();
  });

  test("can login with seed admin", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/username|pengguna/i).fill("admin");
    await page.getByLabel(/password|kata sandi/i).fill("admin123");
    await page.getByRole("button", { name: /masuk|login/i }).click();
    await expect(page).toHaveURL(/dashboard|\//, { timeout: 15000 });
  });
});
