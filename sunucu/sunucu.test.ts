import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Kendi sunucumuz.
 *
 * Cloudflare Worker'ın yerini alan katman. Testlerin ağırlığı, Worker
 * ortamının bedavaya sağladığı ve şimdi elle yazılması gereken
 * şeylerde: güvenlik başlıkları, statik dosya sunumu, dizin dışına
 * çıkma koruması ve zamanlanmış görevler.
 */

const KOK = mkdtempSync(join(tmpdir(), 'sahra-sunucu-'));
mkdirSync(join(KOK, 'assets'), { recursive: true });
writeFileSync(join(KOK, 'index.html'), '<!doctype html><title>Sahra</title>');
writeFileSync(join(KOK, 'assets', 'app-abc123.js'), 'console.log(1)');
process.env.DIST_DIZINI = KOK;
process.env.SITE_HTTPS = '0';

const { istegiKarsila } = await import('./index');
const { CRON_GOREVLERI, ROTALAR, gorevIstegi } = await import('./rotalar');
const { cronEslesir, alanEslesir, zamanlayiciBaslat } = await import('./zamanlayici');
const { onbellekBasligi, CSP } = await import('./basliklar');

let sunucu: Server;
let taban = '';

beforeAll(async () => {
  sunucu = createServer((req, res) => { void istegiKarsila(req, res); });
  await new Promise<void>((coz) => sunucu.listen(0, '127.0.0.1', coz));
  const adres = sunucu.address();
  taban = `http://127.0.0.1:${typeof adres === 'object' && adres ? adres.port : 0}`;
});

afterAll(async () => {
  await new Promise<void>((coz) => { sunucu.close(() => coz()); });
});

describe('yönlendirme', () => {
  it('bilinmeyen /api yolu SPA yerine JSON 404 döndürür', async () => {
    // İstemci JSON beklerken HTML alırsa hata mesajı anlaşılmaz olur.
    const yanit = await fetch(`${taban}/api/yokboyle`);
    expect(yanit.status).toBe(404);
    expect(yanit.headers.get('content-type')).toContain('application/json');
    expect(await yanit.json()).toEqual({ error: 'Uç nokta bulunamadı.' });
  });

  it('api dışındaki bilinmeyen yol siteye düşer', async () => {
    // Tek sayfa uygulaması: yolu yönlendirici çözecek.
    const yanit = await fetch(`${taban}/panel/takvim`);
    expect(yanit.status).toBe(200);
    expect(await yanit.text()).toContain('<!doctype html>');
  });

  it('api önekiyle başlamayan benzer yol siteye gider', async () => {
    const yanit = await fetch(`${taban}/apiler`);
    expect(await yanit.text()).toContain('<!doctype html>');
  });

  it('statik dosya kendi içeriğiyle döner', async () => {
    const yanit = await fetch(`${taban}/assets/app-abc123.js`);
    expect(yanit.status).toBe(200);
    expect(yanit.headers.get('content-type')).toContain('text/javascript');
    expect(await yanit.text()).toBe('console.log(1)');
  });

  it('sorgu dizesi yönlendirmeyi bozmaz', async () => {
    const yanit = await fetch(`${taban}/api/yokboyle?a=1&b=2`);
    expect(yanit.status).toBe(404);
  });
});

describe('dizin dışına çıkma', () => {
  // dist dışına çıkılabilseydi sunucudaki her dosya okunabilirdi.
  const denemeler = [
    '/../../../etc/passwd',
    '/..%2f..%2f..%2fetc%2fpasswd',
    '/%2e%2e/%2e%2e/etc/passwd',
    '/assets/../../../../etc/passwd',
    '/../package.json',
  ];

  it.each(denemeler)('%s dosya sızdırmaz', async (yol) => {
    const yanit = await fetch(`${taban}${yol}`);
    const govde = await yanit.text();
    expect(govde).not.toContain('root:');
    expect(govde).not.toContain('"dependencies"');
  });
});

describe('güvenlik başlıkları', () => {
  it('her yanıtta bulunur', async () => {
    const yanit = await fetch(`${taban}/`);
    expect(yanit.headers.get('content-security-policy')).toBe(CSP);
    expect(yanit.headers.get('x-content-type-options')).toBe('nosniff');
    expect(yanit.headers.get('x-frame-options')).toBe('SAMEORIGIN');
    expect(yanit.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
  });

  it('CSP artık Supabase sunucusunu saymaz', () => {
    // Veri kendi kökenimizden geliyor; gereksiz bir köken, XSS bulan
    // birine veriyi dışarı taşıyacak kapıyı açardı.
    expect(CSP).not.toContain('supabase');
    expect(CSP).toContain("connect-src 'self'");
  });

  it('düz HTTP üzerinde HSTS göndermez', async () => {
    // Gönderilseydi tarayıcı localhost adresini bir yıl HTTPS'e kilitlerdi.
    const yanit = await fetch(`${taban}/`);
    expect(yanit.headers.get('strict-transport-security')).toBeNull();
  });

  it('index.html önbelleğe alınmaz, karmalı varlık alınır', () => {
    // Eski index.html, artık var olmayan paketleri isteyip beyaz sayfa verirdi.
    expect(onbellekBasligi('/')).toBe('no-cache');
    expect(onbellekBasligi('/index.html')).toBe('no-cache');
    expect(onbellekBasligi('/assets/app-abc123.js')).toContain('immutable');
    expect(onbellekBasligi('/fonts/x.woff2')).toContain('max-age=31536000');
  });
});

describe('zamanlanmış görevler', () => {
  it('her cron gerçek bir uç noktaya bağlıdır', () => {
    for (const [ifade, yol] of Object.entries(CRON_GOREVLERI)) {
      expect(ifade.trim().split(/\s+/)).toHaveLength(5);
      expect(typeof ROTALAR[yol]).toBe('function');
    }
  });

  it('görev isteği cron sırrını Bearer başlığıyla taşır', () => {
    process.env.CRON_SECRET = 'sir-123';
    const istek = gorevIstegi('/api/backup');
    expect(istek.headers.get('authorization')).toBe('Bearer sir-123');
    delete process.env.CRON_SECRET;
  });

  it('cron sırrı yoksa görev yetkisiz kalır', () => {
    delete process.env.CRON_SECRET;
    expect(gorevIstegi('/api/backup').headers.get('authorization')).toBeNull();
  });
});

describe('cron çözümleyici', () => {
  const an = (iso: string) => new Date(iso);

  it('yıldız her değeri kapsar', () => {
    expect(alanEslesir('*', 0)).toBe(true);
    expect(alanEslesir('*', 59)).toBe(true);
  });

  it('adım ifadesi doğru dakikalarda eşleşir', () => {
    expect(cronEslesir('*/5 * * * *', an('2026-09-14T10:05:00Z'))).toBe(true);
    expect(cronEslesir('*/5 * * * *', an('2026-09-14T10:07:00Z'))).toBe(false);
    expect(cronEslesir('*/15 * * * *', an('2026-09-14T10:30:00Z'))).toBe(true);
    expect(cronEslesir('*/15 * * * *', an('2026-09-14T10:31:00Z'))).toBe(false);
  });

  it('sabit saat yalnızca o dakikada eşleşir', () => {
    expect(cronEslesir('30 2 * * *', an('2026-09-14T02:30:00Z'))).toBe(true);
    expect(cronEslesir('30 2 * * *', an('2026-09-14T02:31:00Z'))).toBe(false);
    expect(cronEslesir('30 2 * * *', an('2026-09-14T03:30:00Z'))).toBe(false);
  });

  it('saatler UTC okunur', () => {
    // Cloudflare de UTC çalışıyordu; yerel saate çevirmek hatırlatmaların
    // gönderim saatini sessizce üç saat kaydırırdı.
    expect(cronEslesir('0 7 * * *', an('2026-09-14T07:00:00Z'))).toBe(true);
    expect(cronEslesir('0 7 * * *', an('2026-09-14T04:00:00Z'))).toBe(false);
  });

  it('aralık ve liste biçimlerini anlar', () => {
    expect(cronEslesir('0 9-17 * * *', an('2026-09-14T12:00:00Z'))).toBe(true);
    expect(cronEslesir('0 9-17 * * *', an('2026-09-14T18:00:00Z'))).toBe(false);
    expect(cronEslesir('0 0 * * 1,3,5', an('2026-09-14T00:00:00Z'))).toBe(true); // pazartesi
    expect(cronEslesir('0 0 * * 1,3,5', an('2026-09-15T00:00:00Z'))).toBe(false); // salı
  });

  it('bozuk ifade eşleşmez', () => {
    expect(cronEslesir('yanlis', an('2026-09-14T00:00:00Z'))).toBe(false);
    expect(cronEslesir('* * *', an('2026-09-14T00:00:00Z'))).toBe(false);
  });
});

describe('zamanlayıcı', () => {
  it('aynı dakikada görevi iki kez çalıştırmaz', async () => {
    // Erken uyanılırsa SMS kuyruğu aynı mesajı iki defa gönderirdi.
    let sayac = 0;
    const sabitAn = new Date('2026-09-14T10:05:00Z');
    const durdur = zamanlayiciBaslat({
      gorevler: { '*/5 * * * *': async () => { sayac += 1; } },
      simdi: () => sabitAn,
    });
    await new Promise((c) => setTimeout(c, 30));
    durdur();
    expect(sayac).toBe(1);
  });

  it('düşen görev diğerlerini durdurmaz', async () => {
    // Yedek alınamadı diye fatura gönderimi de durursa iki iş birden aksar.
    let ikinci = 0;
    const hatalar: string[] = [];
    const sabitAn = new Date('2026-09-14T10:05:00Z');
    const durdur = zamanlayiciBaslat({
      gorevler: {
        '*/5 * * * *': async () => { throw new Error('düştü'); },
        '5 10 * * *': async () => { ikinci += 1; },
      },
      simdi: () => sabitAn,
      gunluk: (m) => hatalar.push(m),
    });
    await new Promise((c) => setTimeout(c, 30));
    durdur();
    expect(ikinci).toBe(1);
    expect(hatalar).toHaveLength(1);
  });
});
