/**
 * `vercel.json` ile sunucunun rota listesi AYNI şeyi söylüyor mu?
 *
 * İki dağıtım var: kendi sunucumuz `sunucu/rotalar.ts` listesini okuyor,
 * Vercel ise `vercel.json` dosyasını. Liste tek yerde tutulamıyor --
 * Vercel yapılandırmayı uygulama çalışmadan, statik olarak okuyor.
 *
 * TEK FONKSİYON. Vercel'in ücretsiz planı bir dağıtımda en fazla 12
 * sunucusuz fonksiyon kabul ediyor. Önce her uç nokta ayrı fonksiyon
 * olarak yayımlanıyordu (27 tane) ve dağıtım bu yüzden düşüyordu.
 * Artık hepsini `api/index.ts` karşılıyor; o da yol tablosunu okuyup
 * dağıtıyor.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CRON_GOREVLERI, ROTALAR } from './rotalar.js';

const KOK = join(dirname(fileURLToPath(import.meta.url)), '..');

interface Yapilandirma {
  builds: { src: string; use: string }[];
  routes: ({ src?: string; dest?: string; handle?: string })[];
}

const yapilandirma = JSON.parse(
  readFileSync(join(KOK, 'vercel.json'), 'utf8'),
) as Yapilandirma;

const rotalar = yapilandirma.routes;
const fonksiyonlar = yapilandirma.builds.filter((b) => b.use === '@vercel/node');

/**
 * Vercel kurallarını sırayla deneyip bir yolun nereye gittiğini bulur.
 *
 * Yakalama gruplarını (`$1`) da yerine koyuyor -- Vercel'in yaptığı bu.
 * Yerine koymadan bakılsaydı test `__yol=/api/$1` görür ve hedefin
 * gerçekten doğru yolu taşıyıp taşımadığını ölçemezdi.
 */
function hedef(yol: string): string | null {
  for (const r of rotalar) {
    if (!r.src) continue;
    const eslesme = new RegExp(`^${r.src}$`).exec(yol);
    if (!eslesme) continue;
    if (!r.dest) return null;
    return r.dest.replace(/\$(\d)/g, (_, n: string) => eslesme[Number(n)] ?? '');
  }
  return null;
}

describe('vercel.json', () => {
  /*
    ASIL SINIR. Bu test düşerse dağıtım hiç tamamlanmıyor:
    "No more than 12 Serverless Functions can be added to a Deployment
    on the Hobby plan."
  */
  it('ücretsiz planın 12 fonksiyon sınırını aşmıyor', () => {
    expect(fonksiyonlar.length).toBeLessThanOrEqual(12);
  });

  it('dağıtıcı fonksiyon var ve derleniyor', () => {
    expect(existsSync(join(KOK, 'api/index.ts'))).toBe(true);
    expect(fonksiyonlar.some((b) => b.src === 'api/index.ts')).toBe(true);
  });

  it('sunucudaki her uç nokta dağıtıcıya yönleniyor', () => {
    for (const yol of Object.keys(ROTALAR)) {
      expect(hedef(yol), `${yol} yönlenmiyor`).toMatch(/^\/api\/index\.ts\?__yol=/);
    }
  });

  it('asıl yol parametreyle taşınıyor', () => {
    /*
      Vercel isteği dosya adına yeniden yazıyor ve hedef yol adresten
      siliniyor. Parametre olmasaydı dağıtıcı hangi uç noktanın
      istendiğini bilemez, her istek 404 dönerdi.
    */
    expect(hedef('/api/login')).toBe('/api/index.ts?__yol=/api/login');
    expect(hedef('/veri/halls')).toBe('/api/index.ts?__yol=/veri/halls');
  });

  it('tanıtım uçları dağıtıcıya düşmüyor', () => {
    // Genel `/api/(.*)` kuralından ÖNCE gelmeliler; sonra kalsalardı
    // dağıtıcıda karşılıkları olmadığı için 404 dönerlerdi.
    expect(hedef('/api/demo-kur')).toBe('/vercel-api/demo-kur.ts');
  });

  it('zamanlanmış görevlerin uç noktaları da yönleniyor', () => {
    for (const yol of Object.values(CRON_GOREVLERI)) {
      expect(hedef(yol), `${yol} yönlenmiyor`).toMatch(/^\/api\/index\.ts\?__yol=/);
    }
  });

  it('yakalayıcı kural en sonda', () => {
    const son = rotalar[rotalar.length - 1];
    expect(son?.src).toBe('/(.*)');
    expect(son?.dest).toBe('/index.html');
    expect(rotalar.findIndex((r) => r.handle === 'filesystem'))
      .toBeLessThan(rotalar.length - 1);
  });
});
