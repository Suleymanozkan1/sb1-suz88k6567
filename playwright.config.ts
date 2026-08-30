import { defineConfig, devices } from '@playwright/test';

/**
 * Ortamda hazır bulunan Chromium (build 1194) kullanılır; @playwright/test
 * kendi indirdiği sürümü aradığı için çalıştırılabilir yol açıkça verilir.
 */
const CHROMIUM_PATH = '/opt/pw-browsers/chromium';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: 0,
  workers: 2,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'off',
    launchOptions: { executablePath: CHROMIUM_PATH },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run preview -- --port 4173 --host 127.0.0.1',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
