import { defineConfig, devices } from '@playwright/test';

/**
 * Ortamda hazır bulunan Chromium (build 1194) kullanılır; @playwright/test
 * kendi indirdiği sürümü aradığı için çalıştırılabilir yol açıkça verilir.
 */
const CHROMIUM_PATH = '/opt/pw-browsers/chromium';

/*
  Kanıt toplama ayarları ECC (github.com/affaan-m/ECC, MIT) `e2e-testing`
  yönergesinden alındı.

  NEDEN GEREKLİ. Bu paket 181 tarayıcı testi çalıştırıyor ve düşen bir test
  geriye yalnızca bir hata satırı bırakıyordu; sebebi görmek için paket
  baştan çalıştırılıp üç dakika bekleniyordu. İz, ekran görüntüsü ve video
  yalnızca DÜŞEN testte tutuluyor: her koşuda tutulsaydı disk dolar ve koşu
  yavaşlardı.
*/
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  // Yerelde sıfır: burada tekrar deneme, kırılgan testi gizler. CI'da iki,
  // çünkü orada bir kez düşen test bütün dağıtımı durduruyor.
  retries: process.env.CI ? 2 : 0,
  workers: 2,
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never' }], ['junit', { outputFile: 'test-results/junit.xml' }]]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
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
