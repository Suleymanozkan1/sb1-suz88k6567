import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Deneyim anketinin herkese açık ucu (madde 31).
 *
 * Testlerin ağırlığı KAPILARDA. Bu uç nokta oturum aramıyor: müşterinin
 * sistemde hesabı yok ve yetkisini yalnızca bağlantıdaki jeton
 * taşıyor. Yanlış bir kapı, bağlantıyı ele geçirmeden de anket
 * yazılabilmesi ya da başkasının kişisel verisinin okunması demek.
 */
const JWT = 'test-icin-en-az-otuz-iki-karakterlik-sir';
const ESKI_ENV = { ...process.env };
const JETON = 'a'.repeat(48);

let anketSatiri: Record<string, unknown> | null = null;
let yazilanYama: Record<string, unknown>[] = [];
let gidenPosta: Record<string, unknown>[] = [];
let isletmeSatiri: Record<string, unknown> = { name: 'Grand Sahra', survey_email: '' };
let hizSiniri = true;

async function moduluYukle(env: Record<string, string | undefined> = {}) {
  process.env = {
    ...ESKI_ENV,
    PGRST_URL: 'http://veri.yerel',
    JWT_SECRET: JWT,
    MAIL_API_URL: undefined,
    MAIL_API_KEY: undefined,
    MAIL_FROM: undefined,
    ...env,
  };
  vi.resetModules();
  return import('./anket-yanit');
}

function oku(jeton = JETON): Request {
  return new Request(`https://x/api/anket-yanit?jeton=${jeton}`);
}

function yaz(govde: unknown): Request {
  return new Request('https://x/api/anket-yanit', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(govde),
  });
}

beforeEach(() => {
  yazilanYama = [];
  gidenPosta = [];
  hizSiniri = true;
  isletmeSatiri = { name: 'Grand Sahra', survey_email: '' };
  anketSatiri = {
    id: 'anket-1', business_id: 'biz-1', reservation_id: 'rez-1',
    answered_at: null, sent_at: '2026-09-19T06:00:00Z',
  };

  vi.stubGlobal('fetch', vi.fn(async (girdi: string | URL, init?: RequestInit) => {
    const adres = String(girdi);
    const yontem = init?.method ?? 'GET';

    if (adres.includes('/rpc/check_rate_limit')) {
      return new Response(JSON.stringify(hizSiniri), { status: 200 });
    }
    if (adres.includes('posta.yerel')) {
      gidenPosta.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return new Response('{}', { status: 200 });
    }
    if (adres.includes('surveys')) {
      if (yontem === 'PATCH') {
        yazilanYama.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        return new Response(null, { status: 204 });
      }
      return new Response(JSON.stringify(anketSatiri ? [anketSatiri] : []), { status: 200 });
    }
    if (adres.includes('businesses')) {
      return new Response(JSON.stringify([isletmeSatiri]), { status: 200 });
    }
    if (adres.includes('reservations')) {
      return new Response(JSON.stringify([{ date: '2026-09-12' }]), { status: 200 });
    }
    return new Response('[]', { status: 200 });
  }));
});

afterEach(() => {
  process.env = { ...ESKI_ENV };
  vi.unstubAllGlobals();
});

describe('kapılar', () => {
  it('jeton biçimi tutmuyorsa sorguya hiç gitmez', async () => {
    const { default: handler } = await moduluYukle();
    const yanit = await handler(oku('kisa'));

    expect(yanit.status).toBe(400);
    expect(yazilanYama).toHaveLength(0);
  });

  /*
    Jeton sorgu dizesine gidiyor; onaltılık dışı bir karakter geçerse
    süzgeç ifadesi bozulabilir. Biçim doğrulaması bunu en dışarıda
    kesiyor.
  */
  it('onaltılık olmayan jetonu reddeder', async () => {
    const { default: handler } = await moduluYukle();
    expect((await handler(oku(`${'a'.repeat(47)}*`))).status).toBe(400);
    expect((await handler(oku(`${'a'.repeat(40)}.eq.x`))).status).toBe(400);
  });

  it('bilinmeyen yöntemi reddeder', async () => {
    const { default: handler } = await moduluYukle();
    const yanit = await handler(new Request('https://x/api/anket-yanit', { method: 'DELETE' }));
    expect(yanit.status).toBe(405);
  });

  it('hız sınırına takılan isteği geçirmez', async () => {
    hizSiniri = false;
    const { default: handler } = await moduluYukle();
    expect((await handler(oku())).status).toBe(429);
  });

  it('veritabanı yapılandırılmamışsa çalışmaz', async () => {
    const { default: handler } = await moduluYukle({ JWT_SECRET: 'kisa' });
    expect((await handler(oku())).status).toBe(500);
  });
});

describe('okuma', () => {
  it('anketin durumunu ve organizasyonu verir', async () => {
    const { default: handler } = await moduluYukle();
    const govde = await (await handler(oku())).json() as Record<string, unknown>;

    expect(govde).toEqual({ business: 'Grand Sahra', date: '2026-09-12', answered: false });
  });

  /*
    Müşteri adı, telefonu ve TC kimlik numarası DÖNMÜYOR. Bağlantıyı ele
    geçiren biri, anketi cevaplamanın ötesinde kişisel veriye de
    ulaşmamalı (KVKK).
  */
  it('kişisel veri döndürmez', async () => {
    const { default: handler } = await moduluYukle();
    const metin = await (await handler(oku())).text();

    expect(metin).not.toContain('customer');
    expect(metin).not.toContain('identity');
    expect(metin).not.toContain('phone');
  });

  it('bulunmayan ankette 404 döner', async () => {
    anketSatiri = null;
    const { default: handler } = await moduluYukle();
    expect((await handler(oku())).status).toBe(404);
  });

  it('cevaplanmış anketi işaretler', async () => {
    anketSatiri = { ...anketSatiri, answered_at: '2026-09-20T10:00:00Z' };
    const { default: handler } = await moduluYukle();
    const govde = await (await handler(oku())).json() as { answered: boolean };
    expect(govde.answered).toBe(true);
  });
});

describe('cevap yazma', () => {
  it('geçerli puanları kaydeder', async () => {
    const { default: handler } = await moduluYukle();
    const yanit = await handler(yaz({ jeton: JETON, puanlar: { salon: 5, ikram: 4 }, yorum: 'Teşekkürler' }));

    expect(yanit.status).toBe(200);
    expect(yazilanYama).toHaveLength(1);
    expect(yazilanYama[0]).toMatchObject({ scores: { salon: 5, ikram: 4 }, comment: 'Teşekkürler' });
    expect(yazilanYama[0]?.answered_at).toBeTruthy();
  });

  /*
    Doğrulama tarayıcıyla AYNI modülden geçiyor. Sunucuda tekrar
    yapılmasaydı, tarayıcıyı atlayan bir istek 9 puan yazabilir ve
    ortalamalar kalıcı olarak bozulurdu.
  */
  it('aralık dışı puanı yazmaz', async () => {
    const { default: handler } = await moduluYukle();
    const yanit = await handler(yaz({ jeton: JETON, puanlar: { salon: 9 } }));

    expect(yanit.status).toBe(400);
    expect(yazilanYama).toHaveLength(0);
  });

  it('boş cevabı yazmaz', async () => {
    const { default: handler } = await moduluYukle();
    expect((await handler(yaz({ jeton: JETON, puanlar: {} }))).status).toBe(400);
    expect(yazilanYama).toHaveLength(0);
  });

  it('bozuk gövdeyi reddeder', async () => {
    const { default: handler } = await moduluYukle();
    const yanit = await handler(new Request('https://x/api/anket-yanit', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{',
    }));
    expect(yanit.status).toBe(400);
  });

  /*
    Bağlantı e-postada duruyor ve tekrar tıklanabilir. Üzerine
    yazılabilseydi aynı çift ortalamayı istediği kadar değiştirebilirdi.
  */
  it('ikinci kez cevaplanamaz', async () => {
    anketSatiri = { ...anketSatiri, answered_at: '2026-09-20T10:00:00Z' };
    const { default: handler } = await moduluYukle();
    const yanit = await handler(yaz({ jeton: JETON, puanlar: { salon: 1 } }));

    expect(yanit.status).toBe(409);
    expect(yazilanYama).toHaveLength(0);
  });

  it('bulunmayan ankete yazmaz', async () => {
    anketSatiri = null;
    const { default: handler } = await moduluYukle();
    expect((await handler(yaz({ jeton: JETON, puanlar: { salon: 5 } }))).status).toBe(404);
    expect(yazilanYama).toHaveLength(0);
  });

  it('uzun yorumu kırpar', async () => {
    const { default: handler } = await moduluYukle();
    await handler(yaz({ jeton: JETON, puanlar: { salon: 5 }, yorum: 'x'.repeat(5000) }));
    expect(String(yazilanYama[0]?.comment)).toHaveLength(2000);
  });
});

describe('yönetici bildirimi', () => {
  it('adres tanımlıysa bildirim gönderir', async () => {
    isletmeSatiri = { name: 'Grand Sahra', survey_email: 'mudur@ornek.com' };
    const { default: handler } = await moduluYukle({
      MAIL_API_URL: 'https://posta.yerel/gonder',
      MAIL_API_KEY: 'anahtar',
      MAIL_FROM: 'sistem@ornek.com',
    });
    await handler(yaz({ jeton: JETON, puanlar: { salon: 5 }, yorum: 'Harika' }));

    expect(gidenPosta).toHaveLength(1);
    expect(gidenPosta[0]).toMatchObject({ to: 'mudur@ornek.com' });
    expect(String(gidenPosta[0]?.text)).toContain('Salon ve düzen: 5/5');
  });

  it('adres tanımlı değilse bildirim göndermez', async () => {
    const { default: handler } = await moduluYukle({
      MAIL_API_URL: 'https://posta.yerel/gonder',
      MAIL_API_KEY: 'anahtar',
      MAIL_FROM: 'sistem@ornek.com',
    });
    await handler(yaz({ jeton: JETON, puanlar: { salon: 5 } }));
    expect(gidenPosta).toHaveLength(0);
  });

  /*
    Bildirim gönderilemese bile CEVAP KAYDEDİLDİ. Posta hatası istek
    başarısız gösterilseydi müşteri anketi yeniden doldurmaya çalışır ve
    "daha önce cevaplanmış" hatası alırdı.
  */
  it('bildirim hatası cevabı başarısız yapmaz', async () => {
    isletmeSatiri = { name: 'Grand Sahra', survey_email: 'mudur@ornek.com' };
    const { default: handler } = await moduluYukle({
      MAIL_API_URL: 'https://ulasilamaz.yerel/gonder',
      MAIL_API_KEY: 'anahtar',
      MAIL_FROM: 'sistem@ornek.com',
    });
    const yanit = await handler(yaz({ jeton: JETON, puanlar: { salon: 5 } }));

    expect(yanit.status).toBe(200);
    expect(yazilanYama).toHaveLength(1);
  });
});
