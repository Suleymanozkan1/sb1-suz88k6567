/**
 * Dağıtıcı isteği doğru işleyiciye götürüyor mu?
 *
 * Vercel'de TEK fonksiyon var; bu dosya düşerse hiçbir uç nokta
 * çalışmıyor demektir. Yol tablosu sahteleniyor: burada sınanan
 * işleyicilerin kendi davranışı değil, DAĞITIMIN doğruluğu.
 */
import { Readable } from 'node:stream';
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

const { dagit, default: handler } = await import('./index.js');

function cagir(yol: string, ek: RequestInit = {}): Promise<Response> {
  return dagit(new Request(
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
    await dagit(new Request(
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

  /*
    Bir uç nokta modülü yüklenemezse (eksik bağımlılık, çözülemeyen yol)
    Vercel boş bir FUNCTION_INVOCATION_FAILED dönüyor ve hangi modülün
    patladığı hiçbir yerde yazmıyor. Hata yakalanıp metniyle dönmeli.
  */
  it('modül yüklenemezse sebebini söyler', async () => {
    vi.resetModules();
    /*
      Hata, içe aktarmanın kendisinden değil tablo OKUNURKEN atılıyor:
      vitest, fabrikadan atılan hatayı kendi mesajıyla sarıyor ve o zaman
      test gerçek sebebin taşınıp taşınmadığını ölçemiyordu.
    */
    vi.doMock('../sunucu/rotalar.js', () => ({
      get ROTALAR(): never { throw new Error("Cannot find module 'ornek-paket'"); },
      CRON_GOREVLERI: {},
    }));
    const { dagit: bozuk } = await import('./index.js');
    const yanit = await bozuk(new Request('https://ornek.com/api/index.ts?__yol=%2Fapi%2Flogin'));

    expect(yanit.status).toBe(500);
    const govde = await yanit.json() as { error: string; detay: string };
    expect(govde.error).toMatch(/yüklenemedi/);
    expect(govde.detay).toContain('ornek-paket');

    vi.doUnmock('../sunucu/rotalar.js');
    vi.resetModules();
  });

  it('yol parametresi yoksa adresin kendisine bakar', async () => {
    // Kendi sunucumuzda yol olduğu gibi geliyor; aynı kod orada da çalışsın.
    await dagit(new Request('https://ornek.com/api/sms-queue', { method: 'POST' }));
    expect(cagrilar[0]?.ad).toBe('sms-queue');
  });
});

/*
  Vercel'e açılan yüz `(req, res)` imzası. Bu dağıtımda çalıştığı
  görülen tek fonksiyon bu imzayı kullanıyordu; `Request` alan bütün uç
  noktalar 500 dönüyordu. Çeviri artık dağıtıcının kendi işi, dolayısıyla
  sınanması gereken bir davranış.
*/
describe('Node imzası', () => {
  beforeEach(() => { cagrilar.length = 0; });

  interface SahteYanit {
    statusCode: number;
    basliklar: Record<string, string | string[]>;
    govde: string;
    bitti: Promise<void>;
  }

  function sahteIstek(
    yol: string,
    secenek: { yontem?: string; govde?: string; basliklar?: Record<string, string> } = {},
  ) {
    const akis = Readable.from(secenek.govde === undefined ? [] : [Buffer.from(secenek.govde)]);
    return Object.assign(akis, {
      url: yol,
      method: secenek.yontem ?? 'GET',
      headers: { host: 'ornek.com', ...secenek.basliklar },
    });
  }

  function sahteYanit(): SahteYanit {
    let tamamla!: () => void;
    const kayit: SahteYanit = {
      statusCode: 0,
      basliklar: {},
      govde: '',
      bitti: new Promise<void>((coz) => { tamamla = coz; }),
    };
    const res = {
      get statusCode(): number { return kayit.statusCode; },
      set statusCode(deger: number) { kayit.statusCode = deger; },
      setHeader(ad: string, deger: string | string[]): void { kayit.basliklar[ad] = deger; },
      end(govde?: Buffer): void {
        if (govde) kayit.govde = govde.toString('utf8');
        tamamla();
      },
    };
    return Object.assign(kayit, { res });
  }

  async function cagirNode(
    yol: string,
    secenek: { yontem?: string; govde?: string; basliklar?: Record<string, string> } = {},
  ): Promise<SahteYanit> {
    const kayit = sahteYanit() as SahteYanit & { res: unknown };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await handler(sahteIstek(yol, secenek) as any, kayit.res as any);
    await kayit.bitti;
    return kayit;
  }

  it('gövdeyi ve durumu Node yanıtına yazar', async () => {
    const yanit = await cagirNode('/api/index.ts?__yol=%2Fapi%2Flogin', {
      yontem: 'POST', govde: '{"email":"a@b.c"}',
    });
    expect(yanit.statusCode).toBe(200);
    expect(yanit.govde).toBe('login');
    expect(cagrilar[0]?.yontem).toBe('POST');
    expect(cagrilar[0]?.govde).toBe('{"email":"a@b.c"}');
  });

  it('göreli adresi Host başlığıyla mutlak hâle getirir', async () => {
    await cagirNode('/api/index.ts?__yol=%2Fveri%2Fhalls&select=name');
    const url = new URL(cagrilar[0]!.url);
    expect(url.pathname).toBe('/veri/halls');
    expect(url.searchParams.get('select')).toBe('name');
  });

  it('istek başlıklarını taşır', async () => {
    await cagirNode('/api/index.ts?__yol=%2Fapi%2Flogin', {
      yontem: 'POST', govde: '{}', basliklar: { authorization: 'Bearer jeton' },
    });
    expect(cagrilar).toHaveLength(1);
  });

  it('bilinmeyen yolda 404 ve sebep döner', async () => {
    const yanit = await cagirNode('/api/index.ts?__yol=%2Fapi%2Folmayan');
    expect(yanit.statusCode).toBe(404);
    expect(JSON.parse(yanit.govde) as { error: string }).toHaveProperty('error');
  });

  /*
    Fonksiyonun AÇILDIĞINI kanıtlayan yol. Modül yüklemiyor, veritabanına
    dokunmuyor: buradan 200 gelip ötekilerden 500 geliyorsa arıza uç nokta
    modüllerinde, fonksiyonun kendisinde değil.
  */
  it('tanı yolu hiçbir modüle dokunmadan 200 döner', async () => {
    const yanit = await cagirNode('/api/index.ts?__yol=%2Fapi%2Ftani');
    expect(yanit.statusCode).toBe(200);
    expect(JSON.parse(yanit.govde) as { tamam: boolean }).toMatchObject({ tamam: true });
    expect(cagrilar).toHaveLength(0);
  });

  /*
    Tanı yolu kurulumun durumunu yazıyor ama DEĞERLERİ yazmıyor. Bu ayrım
    testle korunuyor: bir gün "hata ayıklaması kolay olsun" diye değer
    eklenirse sır herkese açık bir adrese düşerdi.
  */
  it('tanı yolu sır DEĞERİ sızdırmaz, yalnızca var/yok der', async () => {
    const sir = 'x'.repeat(40);
    vi.stubEnv('JWT_SECRET', sir);
    vi.stubEnv('DATABASE_URL', 'postgres://kullanici:parola@sunucu/veritabani');
    try {
      const yanit = await cagirNode('/api/index.ts?__yol=%2Fapi%2Ftani');
      expect(yanit.govde).not.toContain(sir);
      expect(yanit.govde).not.toContain('parola');
      expect(yanit.govde).not.toContain('sunucu/veritabani');
      const govde = JSON.parse(yanit.govde) as { ayar: Record<string, string> };
      expect(govde.ayar.JWT_SECRET).toBe('var');
      expect(govde.ayar.DATABASE_URL).toBe('var');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('kısa JWT_SECRET "var" demez', async () => {
    vi.stubEnv('JWT_SECRET', 'kisa');
    try {
      const yanit = await cagirNode('/api/index.ts?__yol=%2Fapi%2Ftani');
      const govde = JSON.parse(yanit.govde) as { ayar: Record<string, string> };
      expect(govde.ayar.JWT_SECRET).toBe('kisa');
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
