import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';

/**
 * Giriş SMS doğrulaması.
 *
 * Buradaki en kritik davranış, kodun kendisinin hiçbir zaman yanıt gövdesine
 * konmamasıdır; istemci yalnızca imzalı özeti görür. Testler ayrıca imzanın
 * telefon, kod ve son kullanma anını birlikte bağladığını doğruluyor: üçünden
 * biri değiştirilirse belirteç geçersiz olmalı.
 */
const SIR = 'a'.repeat(48);
const ESKI_ENV = { ...process.env };

async function handlerYukle(env: Record<string, string | undefined> = {}) {
  process.env = {
    ...ESKI_ENV,
    OTP_SECRET: SIR,
    SUPABASE_URL: 'https://ornek.supabase.co',
    VITE_SUPABASE_URL: undefined,
    SUPABASE_SERVICE_ROLE_KEY: 'service-anahtari',
    NETGSM_USER: 'kullanici',
    NETGSM_PASS: 'sifre',
    NETGSM_HEADER: 'SAHRATAKIP',
    ...env,
  };
  vi.resetModules();
  return (await import('./otp')).default;
}

interface Senaryo {
  sinirAsildi?: boolean;
  /** /api/sms yanıtı */
  sms?: { sent?: boolean; error?: string };
}

function fetchTakli(senaryo: Senaryo = {}) {
  const cagrilar: { adres: string; govde: unknown }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const adres = String(url);
    cagrilar.push({ adres, govde: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (adres.endsWith('/rpc/check_rate_limit')) {
      return new Response(String(!senaryo.sinirAsildi));
    }
    if (adres.endsWith('/api/sms')) {
      return new Response(JSON.stringify(senaryo.sms ?? { sent: true }));
    }
    return new Response('{}');
  }));
  return cagrilar;
}

function istek(govde: unknown, method = 'POST'): Request {
  return new Request('https://ornek.test/api/otp', {
    method,
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.7' },
    body: method === 'POST' ? JSON.stringify(govde) : undefined,
  });
}

/** Uç noktanın kullandığı imzanın aynısı; testin beklentisini üretir. */
function imzala(phone: string, code: string, expiresAt: number): string {
  return createHmac('sha256', SIR).update(`${phone}|${code}|${expiresAt}`).digest('hex');
}

beforeEach(() => { vi.unstubAllGlobals(); });
afterEach(() => { process.env = { ...ESKI_ENV }; vi.unstubAllGlobals(); });

describe('otp uç noktası, istek doğrulaması', () => {
  it('POST dışındaki yöntemleri reddeder', async () => {
    const handler = await handlerYukle();
    fetchTakli();
    expect((await handler(istek(null, 'GET'))).status).toBe(405);
  });

  it('bozuk JSON gövdesini reddeder', async () => {
    const handler = await handlerYukle();
    fetchTakli();
    const bozuk = new Request('https://ornek.test/api/otp', { method: 'POST', body: 'değil-json' });
    expect((await handler(bozuk)).status).toBe(400);
  });

  it('geçersiz telefon numarasını reddeder', async () => {
    const handler = await handlerYukle();
    fetchTakli();
    const yanit = await handler(istek({ action: 'issue', phone: '123' }));
    expect(yanit.status).toBe(400);
    await expect(yanit.json()).resolves
      .toEqual({ error: 'Geçerli bir cep telefonu numarası gerekli.' });
  });

  it('bilinmeyen işlemi reddeder', async () => {
    const handler = await handlerYukle();
    fetchTakli();
    const yanit = await handler(istek({ action: 'sil', phone: '5321234567' }));
    expect(yanit.status).toBe(400);
    await expect(yanit.json()).resolves.toEqual({ error: 'Bilinmeyen işlem.' });
  });

  it('OTP_SECRET kısa ya da tanımsızsa hata ayrıntısı sızdırmadan 500 döner', async () => {
    const handler = await handlerYukle({ OTP_SECRET: 'kisa' });
    fetchTakli();
    const yanit = await handler(istek({ action: 'issue', phone: '5321234567' }));
    expect(yanit.status).toBe(500);
    const metin = await yanit.text();
    expect(metin).toBe(JSON.stringify({ error: 'Doğrulama servisi şu anda kullanılamıyor.' }));
    expect(metin).not.toContain('OTP_SECRET');
  });
});

describe('otp uç noktası, telefon normalleştirme', () => {
  const bicimler = [
    ['5321234567', 'sade'],
    ['0532 123 45 67', 'başında sıfır ve boşluklu'],
    ['+90 532 123 45 67', 'ülke koduyla'],
    ['(532) 123-45-67', 'parantezli'],
  ] as const;

  for (const [girdi, aciklama] of bicimler) {
    it(`${aciklama} numarayı kabul eder`, async () => {
      const handler = await handlerYukle();
      const cagrilar = fetchTakli();
      const yanit = await handler(istek({ action: 'issue', phone: girdi }));
      expect(yanit.status).toBe(200);
      const sms = cagrilar.find((c) => c.adres.endsWith('/api/sms'));
      expect((sms?.govde as { to: string }).to).toBe('5321234567');
    });
  }

  it('5 ile başlamayan numarayı reddeder', async () => {
    const handler = await handlerYukle();
    fetchTakli();
    expect((await handler(istek({ action: 'issue', phone: '2121234567' }))).status).toBe(400);
  });

  it('eksik haneli numarayı reddeder', async () => {
    const handler = await handlerYukle();
    fetchTakli();
    expect((await handler(istek({ action: 'issue', phone: '532123456' }))).status).toBe(400);
  });
});

describe('otp uç noktası, kod üretimi', () => {
  it('kodu gövdeye koymadan imzalı belirteç döndürür', async () => {
    const handler = await handlerYukle();
    const cagrilar = fetchTakli();

    const yanit = await handler(istek({ action: 'issue', phone: '5321234567' }));
    const govde = await yanit.json() as { issued: boolean; token: string; expiresAt: number };

    expect(govde.issued).toBe(true);
    expect(govde.token).toMatch(/^[0-9a-f]{64}$/);

    // SMS'e giden kod yanıt gövdesinde geçmemeli.
    const sms = cagrilar.find((c) => c.adres.endsWith('/api/sms'))!;
    const kod = /(\d{6})/.exec((sms.govde as { body: string }).body)![1];
    expect(JSON.stringify(govde)).not.toContain(kod);

    // Belirteç, gerçekten o kodun imzası olmalı.
    expect(govde.token).toBe(imzala('5321234567', kod, govde.expiresAt));
  });

  it('kod 6 haneli ve başı sıfırla doldurulmuş olur', async () => {
    const handler = await handlerYukle();
    const cagrilar = fetchTakli();
    await handler(istek({ action: 'issue', phone: '5321234567' }));
    const sms = cagrilar.find((c) => c.adres.endsWith('/api/sms'))!;
    expect((sms.govde as { body: string }).body).toMatch(/kodunuz: \d{6}$/);
  });

  it('geçerlilik süresi 5 dakikadır', async () => {
    const handler = await handlerYukle();
    fetchTakli();
    const once = Date.now();
    const govde = await (await handler(istek({ action: 'issue', phone: '5321234567' }))).json();
    const { expiresAt } = govde as { expiresAt: number };
    expect(expiresAt).toBeGreaterThanOrEqual(once + 5 * 60 * 1000);
    expect(expiresAt).toBeLessThanOrEqual(Date.now() + 5 * 60 * 1000);
  });

  it('sağlayıcı tanımlı değilse kod gönderildiğini iddia etmez', async () => {
    const handler = await handlerYukle({ NETGSM_USER: undefined, NETGSM_PASS: undefined });
    const cagrilar = fetchTakli();

    const yanit = await handler(istek({ action: 'issue', phone: '5321234567' }));

    expect(yanit.status).toBe(200);
    await expect(yanit.json()).resolves
      .toEqual({ issued: false, reason: 'provider_not_configured' });
    expect(cagrilar.some((c) => c.adres.endsWith('/api/sms'))).toBe(false);
  });

  it('SMS gönderilemezse 502 ve sağlayıcı hatasını döndürür', async () => {
    const handler = await handlerYukle();
    fetchTakli({ sms: { sent: false, error: 'Kontör yetersiz.' } });
    const yanit = await handler(istek({ action: 'issue', phone: '5321234567' }));
    expect(yanit.status).toBe(502);
    await expect(yanit.json()).resolves.toEqual({ issued: false, error: 'Kontör yetersiz.' });
  });

  it('numara başına kod isteme sınırı uygulanır', async () => {
    const handler = await handlerYukle();
    const cagrilar = fetchTakli({ sinirAsildi: true });

    const yanit = await handler(istek({ action: 'issue', phone: '5321234567' }));

    expect(yanit.status).toBe(429);
    expect(yanit.headers.get('retry-after')).toBe('900');
    const sinir = cagrilar.find((c) => c.adres.endsWith('/rpc/check_rate_limit'));
    expect(sinir?.govde).toEqual({
      p_bucket: 'otp-issue', p_identifier: '5321234567', p_limit: 5, p_window_seconds: 900,
    });
    expect(cagrilar.some((c) => c.adres.endsWith('/api/sms'))).toBe(false);
  });
});

describe('otp uç noktası, kod doğrulama', () => {
  const TELEFON = '5321234567';
  const KOD = '123456';

  function gecerliGovde(over: Record<string, unknown> = {}) {
    const expiresAt = Date.now() + 60_000;
    return {
      action: 'verify', phone: TELEFON, code: KOD, expiresAt,
      token: imzala(TELEFON, KOD, expiresAt), ...over,
    };
  }

  it('doğru kodu kabul eder', async () => {
    const handler = await handlerYukle();
    fetchTakli();
    const yanit = await handler(istek(gecerliGovde()));
    expect(yanit.status).toBe(200);
    await expect(yanit.json()).resolves.toEqual({ verified: true });
  });

  it('6 hane olmayan kodu reddeder', async () => {
    const handler = await handlerYukle();
    fetchTakli();
    const yanit = await handler(istek(gecerliGovde({ code: '12345' })));
    expect(yanit.status).toBe(400);
    await expect(yanit.json()).resolves
      .toEqual({ verified: false, error: 'Doğrulama kodu 6 haneli olmalıdır.' });
  });

  it('rakam dışı karakter içeren kodu reddeder', async () => {
    const handler = await handlerYukle();
    fetchTakli();
    expect((await handler(istek(gecerliGovde({ code: '12345a' })))).status).toBe(400);
  });

  it('süresi geçmiş kodu reddeder', async () => {
    const handler = await handlerYukle();
    fetchTakli();
    const gecmis = Date.now() - 1_000;
    const yanit = await handler(istek({
      action: 'verify', phone: TELEFON, code: KOD,
      expiresAt: gecmis, token: imzala(TELEFON, KOD, gecmis),
    }));
    expect(yanit.status).toBe(400);
    await expect(yanit.json()).resolves.toMatchObject({ verified: false });
    expect((await (await handler(istek({
      action: 'verify', phone: TELEFON, code: KOD,
      expiresAt: gecmis, token: imzala(TELEFON, KOD, gecmis),
    }))).json() as { error: string }).error).toContain('süresi doldu');
  });

  it('yanlış kodu reddeder', async () => {
    const handler = await handlerYukle();
    fetchTakli();
    const yanit = await handler(istek(gecerliGovde({ code: '000000' })));
    expect(yanit.status).toBe(400);
    await expect(yanit.json()).resolves
      .toEqual({ verified: false, error: 'Doğrulama kodu hatalı.' });
  });

  it('başka numara için üretilmiş belirteci kabul etmez', async () => {
    const handler = await handlerYukle();
    fetchTakli();
    const expiresAt = Date.now() + 60_000;
    const yanit = await handler(istek({
      action: 'verify', phone: TELEFON, code: KOD, expiresAt,
      token: imzala('5339998877', KOD, expiresAt),
    }));
    expect(yanit.status).toBe(400);
  });

  it('son kullanma anı ileri alınmış belirteci kabul etmez', async () => {
    // İmza expiresAt değerini de kapsıyor; istemci süreyi uzatamamalı.
    const handler = await handlerYukle();
    fetchTakli();
    const expiresAt = Date.now() + 60_000;
    const yanit = await handler(istek({
      action: 'verify', phone: TELEFON, code: KOD,
      expiresAt: expiresAt + 3_600_000,
      token: imzala(TELEFON, KOD, expiresAt),
    }));
    expect(yanit.status).toBe(400);
  });

  it('farklı uzunlukta belirteçte çökmeden reddeder', async () => {
    const handler = await handlerYukle();
    fetchTakli();
    const yanit = await handler(istek(gecerliGovde({ token: 'kisa' })));
    expect(yanit.status).toBe(400);
    await expect(yanit.json()).resolves.toMatchObject({ verified: false });
  });

  it('belirteç hiç gönderilmezse reddeder', async () => {
    const handler = await handlerYukle();
    fetchTakli();
    const expiresAt = Date.now() + 60_000;
    const yanit = await handler(istek({ action: 'verify', phone: TELEFON, code: KOD, expiresAt }));
    expect(yanit.status).toBe(400);
  });

  it('deneme sınırı numara ve IP birlikte anahtarlanarak uygulanır', async () => {
    const handler = await handlerYukle();
    const cagrilar = fetchTakli({ sinirAsildi: true });

    const yanit = await handler(istek(gecerliGovde()));

    expect(yanit.status).toBe(429);
    const sinir = cagrilar.find((c) => c.adres.endsWith('/rpc/check_rate_limit'));
    expect(sinir?.govde).toEqual({
      p_bucket: 'otp-verify', p_identifier: '5321234567|203.0.113.7',
      p_limit: 8, p_window_seconds: 900,
    });
  });
});
