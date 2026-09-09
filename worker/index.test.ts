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
