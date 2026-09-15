/**
 * Dağıtıcı isteği doğru işleyiciye götürüyor mu?
 *
 * Vercel'de TEK fonksiyon var; bu dosya düşerse hiçbir uç nokta
 * çalışmıyor demektir. Yol tablosu sahteleniyor: burada sınanan
 * işleyicilerin kendi davranışı değil, DAĞITIMIN doğruluğu.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const cagrilar: { ad: string; url: string; yontem: string; govde: string }[] = [];

function sahteIsleyici(ad: string) {
  return async (istek: Request): Promise<Response> => {
    cagrilar.push({
      ad,
      url: istek.url,
      yontem: istek.method,
      govde: istek.body ? await istek.text() : '',
    });
    return new Response(ad, { status: 200 });
  };
}

vi.mock('../sunucu/rotalar.js', () => ({
  ROTALAR: {
    '/api/login': sahteIsleyici('login'),
    '/api/webhooks/whatsapp': sahteIsleyici('whatsapp'),
    '/api/sms-queue': sahteIsleyici('sms-queue'),
  },
  CRON_GOREVLERI: {},
}));
vi.mock('./veri.js', () => ({ default: sahteIsleyici('veri') }));

const { default: handler } = await import('./index.js');

function cagir(yol: string, ek: RequestInit = {}): Promise<Response> {
  return handler(new Request(
    `https://ornek.com/api/index.ts?__yol=${encodeURIComponent(yol)}`, ek,
  ));
}

describe('dağıtıcı', () => {
  beforeEach(() => { cagrilar.length = 0; });

  it('yolu işleyiciye götürür', async () => {
    expect((await cagir('/api/login', { method: 'POST', body: '{}' })).status).toBe(200);
    expect(cagrilar[0]?.ad).toBe('login');
  });

  it('çok parçalı yolu da bulur', async () => {
    await cagir('/api/webhooks/whatsapp', { method: 'POST', body: '{}' });
    expect(cagrilar[0]?.ad).toBe('whatsapp');
  });

  it('veri yolunu çeviriciye götürür', async () => {
    await cagir('/veri/halls');
    expect(cagrilar[0]?.ad).toBe('veri');
  });

  it('işleyici ASIL yolu görür, dosya adını değil', async () => {
    /*
      İşleyicilerin çoğu adresten bilgi okuyor (api/veri.ts hangi tablo,
      api/hava.ts hangi süzgeç). `/api/index.ts` görselerdi hepsi yanlış
      çalışırdı.
    */
    await cagir('/veri/halls');
    expect(new URL(cagrilar[0]!.url).pathname).toBe('/veri/halls');
  });

  it('sorgu parametrelerini korur, yol parametresini temizler', async () => {
    await handler(new Request(
      'https://ornek.com/api/index.ts?__yol=%2Fveri%2Fhalls&select=name&limit=5',
    ));
    const url = new URL(cagrilar[0]!.url);
    expect(url.searchParams.get('select')).toBe('name');
    expect(url.searchParams.get('limit')).toBe('5');
    expect(url.searchParams.has('__yol')).toBe(false);
  });

  it('gövdeyi ve yöntemi taşır', async () => {
    await cagir('/api/login', { method: 'POST', body: '{"email":"a@b.c"}' });
    expect(cagrilar[0]?.yontem).toBe('POST');
    expect(cagrilar[0]?.govde).toBe('{"email":"a@b.c"}');
  });

  it('bilinmeyen yol 404 döner', async () => {
    const yanit = await cagir('/api/olmayan');
    expect(yanit.status).toBe(404);
    expect(cagrilar).toHaveLength(0);
  });

  it('yol parametresi yoksa adresin kendisine bakar', async () => {
    // Kendi sunucumuzda yol olduğu gibi geliyor; aynı kod orada da çalışsın.
    await handler(new Request('https://ornek.com/api/sms-queue', { method: 'POST' }));
    expect(cagrilar[0]?.ad).toBe('sms-queue');
  });
});
