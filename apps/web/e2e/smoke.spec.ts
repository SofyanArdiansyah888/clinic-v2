import { test, expect } from "@playwright/test";
import { ADMIN } from "./support";

test.describe("Clinic OS smoke", () => {
  test("login page renders", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText("Masuk ke Akun Staf")).toBeVisible();
  });

  test("wrong password is rejected", async ({ page }) => {
    await page.goto("/login");
    await page.locator("#username").fill(ADMIN.username);
    await page.locator("#password").fill("salah-password");
    await page.getByRole("button", { name: /Masuk Sistem/ }).click();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator("form p.text-rose-600")).toBeVisible();
  });

  test("can login with seed admin and logout", async ({ page }) => {
    await page.goto("/login");
    await page.locator("#username").fill(ADMIN.username);
    await page.locator("#password").fill(ADMIN.password);
    await page.getByRole("button", { name: /Masuk Sistem/ }).click();
    await expect(page).not.toHaveURL(/\/login/, { timeout: 15000 });
    await expect.poll(() => page.evaluate(() => localStorage.getItem("clinic_access_token"))).toBeTruthy();
  });
});
