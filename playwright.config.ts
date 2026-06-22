import { defineConfig, devices } from "@playwright/test";

// The provisioned Chromium lives at /opt/pw-browsers (the Playwright CDN is
// blocked by network egress), so we point Playwright at it directly.
const CHROMIUM = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: false,
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL: "http://localhost:5173",
    screenshot: "on",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
    launchOptions: {
      executablePath: CHROMIUM,
      args: ["--no-sandbox"],
    },
  },
  // Seed a throwaway DB, then bring up the full app (API + client).
  webServer: {
    command:
      "bash -c 'rm -f data/e2e.sqlite*; VSME_DB_PATH=data/e2e.sqlite npm run seed && VSME_DB_PATH=data/e2e.sqlite npm run dev'",
    url: "http://localhost:5173",
    timeout: 120_000,
    reuseExistingServer: true,
    stdout: "pipe",
    stderr: "pipe",
  },
});
