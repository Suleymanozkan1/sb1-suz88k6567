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
import { CSP, GUVENLIK_BASLIKLARI } from './basliklar.js';

const KOK = join(dirname(fileURLToPath(import.meta.url)), '..');

interface Yapilandirma {
  builds: { src: string; use: string }[];
  routes: ({
    src?: string; dest?: string; handle?: string;
    headers?: Record<string, string>; continue?: boolean;
  })[];
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
 *
 * `continue: true` olan kurallar ATLANMIYOR, sadece yolu bitirmiyor:
 * Vercel onlarda başlıkları ekleyip aramaya devam ediyor. Bu ayrım
 * modellenmeseydi başlık kuralı eklendiği anda bütün yollar "hiçbir
 * yere gitmiyor" görünürdü -- oysa gayet gidiyorlar.
 */
function hedef(yol: string): string | null {
  for (const r of rotalar) {
    if (!r.src) continue;
    const eslesme = new RegExp(`^${r.src}$`).exec(yol);
    if (!eslesme) continue;
    if (r.continue) continue;
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

/*
  GÜVENLİK BAŞLIKLARI İKİ YERDE YAZILI OLMAK ZORUNDA.

  Kendi sunucumuz `sunucu/basliklar.ts` içindeki değerleri çalışma
  anında yanıta koyuyor. Vercel ise statik dosyaları kendi ağından
  sunuyor; uygulama kodu hiç çalışmıyor, dolayısıyla o başlıkları
  ancak `vercel.json` söyleyebiliyor ve JSON bir modülü içe aktaramıyor.

  Kopya kaçınılmaz, SESSİZCE ESKİMESİ değil: bu testler ikisinin
  birebir aynı olmasını şart koşuyor. Daha önce aynı kurallar
  `public/_headers` dosyasındaydı ve onu yalnızca Cloudflare okuyordu;
  taşındıktan sonra site CSP'siz kaldı ve bu kimsenin gözüne çarpmadı.
  Canlı Vercel dağıtımında da aynısı oldu: tek başlık Vercel'in kendi
  HSTS'iydi.
*/
describe('güvenlik başlıkları', () => {
  const basliklar = rotalar.find((r) => r.src === '/(.*)' && r.headers)?.headers;

  it('bütün yollara uygulanıyor ve eşleşmeye devam ediyor', () => {
    const kural = rotalar.find((r) => r.src === '/(.*)' && r.headers);
    expect(kural, 'başlık kuralı yok').toBeDefined();
    /*
      `continue` olmadan Vercel eşleşmeyi burada bitirir ve hiçbir sayfa
      sunulmaz: başlıklar gelir, içerik gelmez.
    */
    expect(kural?.continue).toBe(true);
    expect(rotalar.indexOf(kural!)).toBe(0);
  });

  it('kendi sunucumuzla BİREBİR aynı değerleri veriyor', () => {
    for (const [ad, deger] of Object.entries(GUVENLIK_BASLIKLARI)) {
      expect(basliklar?.[ad], `${ad} eksik ya da farklı`).toBe(deger);
    }
  });

  it('CSP aynı politikayı taşıyor', () => {
    expect(basliklar?.['Content-Security-Policy']).toBe(CSP);
  });

  it('karma adlı dosyalar kalıcı önbelleğe alınıyor', () => {
    /*
      `/assets/` ve `/fonts/` içeriği dosya adında karma taşıyor: içerik
      değişince ad değişiyor, bu yüzden sonsuza dek tutulabilir. Vercel
      bunlara kendiliğinden `max-age=0, must-revalidate` veriyordu --
      her sayfa açılışında her dosya yeniden doğrulanıyordu.
    */
    const kural = rotalar.find((r) => r.headers?.['Cache-Control']);
    expect(kural?.src).toBe('/(assets|fonts)/(.*)');
    expect(kural?.headers?.['Cache-Control']).toContain('immutable');
    expect(kural?.continue).toBe(true);
  });
});
