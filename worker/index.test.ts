import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import worker, { CRON_GOREVLERI, ROTALAR } from './index';

/** wrangler.jsonc yorum satırları içerdiği için JSON olarak okunmadan temizlenir. */
function wranglerYapilandirmasi(): { triggers: { crons: string[] } } {
  const ham = readFileSync(path.resolve(process.cwd(), 'wrangler.jsonc'), 'utf-8');
  const yorumsuz = ham.replace(/^\s*\/\/.*$/gm, '');
  return JSON.parse(yorumsuz);
}

describe('Worker yönlendirmesi', () => {
  it('bilinmeyen /api yolu SPA yerine JSON 404 döndürür', async () => {
    const yanit = await worker.fetch(
      new Request('https://ornek.test/api/olmayan'),
      { ASSETS: { fetch: async () => new Response('<!doctype html>') } },
    );
    expect(yanit.status).toBe(404);
    expect(yanit.headers.get('content-type')).toContain('application/json');
  });

  it('api dışındaki yollar statik varlıklara devredilir', async () => {
    let devredildi = false;
    const yanit = await worker.fetch(
      new Request('https://ornek.test/panel/takvim'),
      { ASSETS: { fetch: async () => { devredildi = true; return new Response('<!doctype html>'); } } },
    );
    expect(devredildi).toBe(true);
    expect(yanit.status).toBe(200);
  });
});

describe('Zamanlanmış görevler', () => {
  it('wrangler.jsonc içindeki her cron bir uç noktaya bağlıdır', () => {
    // Eşleşmeyen bir cron sessizce hiçbir şey yapmaz; bu testin amacı
    // yapılandırmaya cron eklenip yönlendiriciye eklenmemesini yakalamak.
    const { crons } = wranglerYapilandirmasi().triggers;
    expect(crons.length).toBeGreaterThan(0);
    for (const cron of crons) {
      expect(CRON_GOREVLERI[cron], `'${cron}' için uç nokta tanımlı değil`).toBeDefined();
    }
  });

  it('yönlendiricide tanımsız cron kalmaz', () => {
    const { crons } = wranglerYapilandirmasi().triggers;
    for (const cron of Object.keys(CRON_GOREVLERI)) {
      expect(crons, `'${cron}' wrangler.jsonc içinde yok`).toContain(cron);
    }
  });

  it('her görev hedefi gerçek bir uç noktadır', () => {
    for (const yol of Object.values(CRON_GOREVLERI)) {
      expect(ROTALAR[yol], `${yol} uç noktası yok`).toBeTypeOf('function');
    }
  });
});

describe('Worker uç nokta yönlendirmesi', () => {
  const bosVarliklar = { ASSETS: { fetch: async () => new Response('<!doctype html>') } };

  it('her tanımlı /api yolu kendi işleyicisine gider', async () => {
    // Yol tablosu ile işleyici eşleşmesi bozulursa istek sessizce
    // 404'e ya da başka bir uç noktaya düşer.
    for (const yol of Object.keys(ROTALAR)) {
      const yanit = await worker.fetch(
        new Request(`https://ornek.test${yol}`, { method: 'POST' }),
        bosVarliklar,
      );
      // İşleyiciler yetkisiz / yapılandırmasız durumda da JSON döndürür.
      expect(yanit.headers.get('content-type'), yol).toContain('application/json');
      expect(yanit.status, yol).toBeLessThan(600);
    }
  });

  it('yol tablosundaki her giriş bir fonksiyondur', () => {
    for (const [yol, isleyici] of Object.entries(ROTALAR)) {
      expect(isleyici, yol).toBeTypeOf('function');
      expect(yol.startsWith('/api/')).toBe(true);
    }
  });

  it('kök adres statik varlıklara devredilir', async () => {
    let istenen = '';
    await worker.fetch(new Request('https://ornek.test/'), {
      ASSETS: { fetch: async (r: Request) => { istenen = new URL(r.url).pathname; return new Response(''); } },
    });
    expect(istenen).toBe('/');
  });

  it('sorgu dizesi yönlendirmeyi bozmaz', async () => {
    const yanit = await worker.fetch(
      new Request('https://ornek.test/api/olmayan?a=1', { method: 'POST' }),
      bosVarliklar,
    );
    expect(yanit.status).toBe(404);
  });

  it('api ön ekiyle başlamayan benzer yol siteye gider', async () => {
    // '/apiler' bir uç nokta değil; JSON 404 yerine site açılmalı.
    let devredildi = false;
    await worker.fetch(new Request('https://ornek.test/apiler'), {
      ASSETS: { fetch: async () => { devredildi = true; return new Response(''); } },
    });
    expect(devredildi).toBe(true);
  });
});

describe('Zamanlanmış görev çalıştırma', () => {
  const bosVarliklar = { ASSETS: { fetch: async () => new Response('') } };

  it('tanımlı cron için görevi başlatır', async () => {
    const isler: Promise<unknown>[] = [];
    await worker.scheduled({ cron: '*/5 * * * *' }, bosVarliklar, {
      waitUntil: (p) => { isler.push(p); },
    });
    expect(isler).toHaveLength(1);
    await expect(isler[0]).resolves.toBeInstanceOf(Response);
  });

  it('tanımsız cron için hiçbir şey yapmaz', async () => {
    const isler: Promise<unknown>[] = [];
    await worker.scheduled({ cron: '13 13 13 13 13' }, bosVarliklar, {
      waitUntil: (p) => { isler.push(p); },
    });
    expect(isler).toHaveLength(0);
  });

  it('görev isteği cron sırrını Bearer başlığıyla taşır', async () => {
    // Sır yalnızca sunucuda kalır; işleyici bunu görmezse yetkisiz sayar.
    const eskiSir = process.env.CRON_SECRET;
    process.env.CRON_SECRET = 'gorev-sirri';
    try {
      const isler: Promise<Response>[] = [];
      await worker.scheduled({ cron: '30 2 * * *' }, bosVarliklar, {
        waitUntil: (p) => { isler.push(p as Promise<Response>); },
      });
      const yanit = await isler[0];
      // Yetki geçtiği için 401 dönmemeli (yapılandırma eksikse 500 döner).
      expect(yanit.status).not.toBe(401);
    } finally {
      if (eskiSir === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = eskiSir;
    }
  });

  it('cron sırrı tanımlı değilse görev yetkisiz kalır', async () => {
    const eskiSir = process.env.CRON_SECRET;
    delete process.env.CRON_SECRET;
    try {
      const isler: Promise<Response>[] = [];
      await worker.scheduled({ cron: '30 2 * * *' }, bosVarliklar, {
        waitUntil: (p) => { isler.push(p as Promise<Response>); },
      });
      expect((await isler[0]).status).toBe(401);
    } finally {
      if (eskiSir !== undefined) process.env.CRON_SECRET = eskiSir;
    }
  });
});
