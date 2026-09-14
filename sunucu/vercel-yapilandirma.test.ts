/**
 * `vercel.json` ile sunucunun rota listesi AYNI şeyi söylüyor mu?
 *
 * İki dağıtım var: kendi sunucumuz `sunucu/rotalar.ts` listesini okuyor,
 * Vercel ise `vercel.json` dosyasını. Liste tek yerde tutulamıyor --
 * Vercel yapılandırmayı uygulama çalışmadan, statik olarak okuyor. O
 * yüzden ikisi ELDE eşleniyor ve burada karşılaştırılıyor.
 *
 * Bu test olmasaydı yeni bir uç nokta eklendiğinde kendi sunucumuzda
 * çalışır, Vercel'de 404 dönerdi; üstelik site açıldığı için sorun ancak
 * o özelliğe dokunan bir müşteri tarafından fark edilirdi.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CRON_GOREVLERI, ROTALAR } from './rotalar.js';

const KOK = join(dirname(fileURLToPath(import.meta.url)), '..');

interface Yapilandirma {
  builds: { src: string }[];
  routes: ({ src?: string; dest?: string; handle?: string })[];
}

const yapilandirma = JSON.parse(
  readFileSync(join(KOK, 'vercel.json'), 'utf8'),
) as Yapilandirma;

const rotalar = yapilandirma.routes;
const hedefler = new Map(
  rotalar.filter((r) => r.src && r.dest).map((r) => [r.src!, r.dest!]),
);
const derlenenler = new Set(yapilandirma.builds.map((b) => b.src));

describe('vercel.json', () => {
  it('sunucudaki her uç noktayı yayımlıyor', () => {
    const eksik = Object.keys(ROTALAR).filter((yol) => !hedefler.has(yol));
    expect(eksik).toEqual([]);
  });

  it('yayımlanan her uç noktanın dosyası var ve derleniyor', () => {
    for (const [yol, hedef] of hedefler) {
      const kaynak = hedef.replace(/^\//, '').split('?')[0]!;
      if (!kaynak.endsWith('.ts')) continue;
      expect(existsSync(join(KOK, kaynak)), `${yol} -> ${kaynak} yok`).toBe(true);
      expect(derlenenler.has(kaynak), `${kaynak} builds listesinde yok`).toBe(true);
    }
  });

  it('tarayıcının veri yolu çeviriciye gidiyor', () => {
    /*
      `src/lib/repo/supabase.ts` bütün sorguları `/veri` altına
      gönderiyor. Bu rota olmasaydı istekler yakalayıcı kurala düşer,
      index.html dönerdi: istemci HTML'i JSON diye çözmeye çalışır ve
      her ekran "veri okunamadı" derdi.
    */
    /*
      Hedef, yakalanan parçayı BİR PARAMETREYLE taşıyor. nginx yolu
      olduğu gibi geçirdiği için kendi sunucumuzda buna gerek yok; Vercel
      ise isteği dosya adına yeniden yazıyor ve hangi tablonun istendiği
      adresten silinmiş oluyor. Parametre olmasaydı her sorgu "Geçersiz
      yol" hatasıyla dönerdi (api/veri.ts, YOL_PARAMETRESI).
    */
    expect(hedefler.get('/veri/(.*)')).toBe('/api/veri.ts?veriYolu=$1');
  });

  it('yakalayıcı kural en sonda', () => {
    // Önde olsaydı bütün uç noktaları yutardı.
    const son = rotalar[rotalar.length - 1];
    expect(son?.src).toBe('/(.*)');
    expect(son?.dest).toBe('/index.html');
    expect(rotalar.findIndex((r) => r.handle === 'filesystem'))
      .toBeLessThan(rotalar.length - 1);
  });

  it('uç nokta kuralları yakalayıcıdan önce geliyor', () => {
    const yakalayici = rotalar.findIndex((r) => r.src === '/(.*)');
    for (const yol of Object.keys(ROTALAR)) {
      expect(rotalar.findIndex((r) => r.src === yol)).toBeLessThan(yakalayici);
    }
  });

  it('zamanlanmış görevlerin uç noktaları da yayımlanıyor', () => {
    /*
      Vercel'in kendi zamanlayıcısı bu görevlerin hepsini
      çalıştıramıyor (ücretsiz planda sayı ve sıklık sınırı var); dışarıdan
      CRON_SECRET ile çağrılıyorlar. Çağrılabilmeleri için yine de
      yayımlanmış olmaları gerekiyor.
    */
    const eksik = Object.values(CRON_GOREVLERI).filter((yol) => !hedefler.has(yol));
    expect(eksik).toEqual([]);
  });
});
