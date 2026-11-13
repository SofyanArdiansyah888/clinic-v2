import { defineConfig, devices } from "@playwright/test";

// Dedicated e2e stack so tests never write into the normal dev database:
// API on :8082 using database clinic_e2e (create it once: CREATE DATABASE clinic_e2e),
// web on :5175 proxying /api to it. Running servers are reused.
const API_PORT = process.env.E2E_API_PORT ?? "8082";
const WEB_PORT = process.env.E2E_WEB_PORT ?? "5175";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "go run ./cmd/api",
      cwd: "../api",
      port: Number(API_PORT),
      env: { APP_PORT: API_PORT, DB_NAME: process.env.E2E_DB_NAME ?? "clinic_e2e", AUTO_MIGRATE: "true", SEED_ON_STARTUP: "true" },
      reuseExistingServer: true,
      timeout: 180_000,
    },
    {
      command: `pnpm dev --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      env: { API_PROXY_TARGET: `http://localhost:${API_PORT}` },
      reuseExistingServer: true,
    },
  ],
});
