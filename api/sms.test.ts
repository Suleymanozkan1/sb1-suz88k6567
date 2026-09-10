import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * SMS gönderim uç noktası.
 *
 * En önemli iki davranış: sağlayıcı şifresi hiçbir yanıtta görünmemeli ve
 * sağlayıcı tanımlı değilken "gönderildi" denmemeli. Ayrıca Netgsm'in kod
 * tablosu burada Türkçe hata metinlerine çevriliyor; yanlış eşleme
 * kullanıcıya anlamsız hata gösterir.
 */
const ESKI_ENV = { ...process.env };

async function moduluYukle(env: Record<string, string | undefined> = {}) {
  process.env = {
    ...ESKI_ENV,
    NETGSM_USER: 'abone',
    NETGSM_PASS: 'gizli-sifre',
    NETGSM_HEADER: 'SAHRATAKIP',
    SUPABASE_URL: 'https://ornek.supabase.co',
    VITE_SUPABASE_URL: undefined,
    SUPABASE_SERVICE_ROLE_KEY: 'service-anahtari',
    ...env,
  };
  vi.resetModules();
  return import('./sms');
}

interface Senaryo {
  /** Netgsm yanıt metni */
  saglayici?: string | 'aglaHata';
  /** check_rate_limit sonucu; kova adına göre */
  sinirAsilan?: 'sms-ip' | 'sms-phone';
}

function fetchTakli(senaryo: Senaryo = {}) {
  const cagrilar: { adres: string; govde: unknown }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const adres = String(url);
    cagrilar.push({ adres, govde: init?.body ? JSON.parse(String(init.body)) : undefined });

    if (adres.endsWith('/rpc/check_rate_limit')) {
      const kova = (JSON.parse(String(init!.body)) as { p_bucket: string }).p_bucket;
      return new Response(String(kova !== senaryo.sinirAsilan));
    }
    if (adres.startsWith('https://api.netgsm.com.tr/')) {
      if (senaryo.saglayici === 'aglaHata') throw new Error('bağlantı koptu');
      return new Response(senaryo.saglayici ?? '00 987654321');
    }
    return new Response('{}');
  }));
  return cagrilar;
}

function istek(govde: unknown, method = 'POST'): Request {
  return new Request('https://ornek.test/api/sms', {
    method,
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.7' },
    body: method === 'POST' ? JSON.stringify(govde) : undefined,
  });
}

beforeEach(() => { vi.unstubAllGlobals(); });
afterEach(() => { process.env = { ...ESKI_ENV }; vi.unstubAllGlobals(); });

describe('isProviderConfigured', () => {
  it('üç değişken de tanımlıysa doğru döner', async () => {
    const sms = await moduluYukle();
    expect(sms.isProviderConfigured()).toBe(true);
  });

  it('başlık eksikse yanlış döner', async () => {
    const sms = await moduluYukle({ NETGSM_HEADER: undefined });
    expect(sms.isProviderConfigured()).toBe(false);
  });

  it('şifre eksikse yanlış döner', async () => {
    const sms = await moduluYukle({ NETGSM_PASS: undefined });
    expect(sms.isProviderConfigured()).toBe(false);
  });

  it('kullanıcı eksikse yanlış döner', async () => {
    const sms = await moduluYukle({ NETGSM_USER: undefined });
    expect(sms.isProviderConfigured()).toBe(false);
  });
});

describe('sendOne', () => {
  it('kimlik ve mesajı sorgu dizesinde sağlayıcıya iletir', async () => {
    const sms = await moduluYukle();
    const cagrilar = fetchTakli();

    const sonuc = await sms.sendOne('5321234567', 'Sayin Ayse, rezervasyonunuz alinmistir.');

    expect(sonuc).toEqual({ ok: true, reference: '987654321' });
    const adres = new URL(cagrilar[0].adres);
    expect(adres.searchParams.get('gsmno')).toBe('5321234567');
    expect(adres.searchParams.get('msgheader')).toBe('SAHRATAKIP');
    expect(adres.searchParams.get('message')).toBe('Sayin Ayse, rezervasyonunuz alinmistir.');
    expect(adres.searchParams.get('dil')).toBe('TR');
  });

  it('01 ve 02 kodlarını da başarı sayar', async () => {
    for (const kod of ['01', '02']) {
      const sms = await moduluYukle();
      fetchTakli({ saglayici: `${kod} 111` });
      await expect(sms.sendOne('5321234567', 'metin')).resolves.toEqual({ ok: true, reference: '111' });
    }
  });

  const hatalar: [string, string][] = [
    ['20', 'Mesaj metni çok uzun veya karakter sorunu var.'],
    ['30', 'Geçersiz kullanıcı adı, şifre veya API erişim izni yok.'],
    ['40', 'Mesaj başlığı (gönderici adı) sistemde tanımlı değil.'],
    ['50', 'Abone hesabı IYS kontrollü gönderime uygun değil.'],
    ['51', 'IYS marka bilgisi bulunamadı.'],
    ['70', 'Gönderilen parametreler hatalı.'],
    ['85', 'Aynı numaraya çok sık gönderim yapıldı.'],
  ];

  for (const [kod, metin] of hatalar) {
    it(`${kod} kodunu "${metin.slice(0, 24)}..." olarak çevirir`, async () => {
      const sms = await moduluYukle();
      fetchTakli({ saglayici: kod });
      await expect(sms.sendOne('5321234567', 'metin')).resolves.toEqual({ ok: false, error: metin });
    });
  }

  it('bilinmeyen kodu ham metniyle bildirir', async () => {
    const sms = await moduluYukle();
    fetchTakli({ saglayici: '99' });
    await expect(sms.sendOne('5321234567', 'metin'))
      .resolves.toEqual({ ok: false, error: 'Sağlayıcı hatası (kod: 99)' });
  });

  it('yanıttaki baştaki ve sondaki boşluğu yok sayar', async () => {
    const sms = await moduluYukle();
    fetchTakli({ saglayici: '  00 555  ' });
    await expect(sms.sendOne('5321234567', 'metin')).resolves.toEqual({ ok: true, reference: '555' });
  });
});

describe('sms uç noktası, istek doğrulaması', () => {
  it('POST dışındaki yöntemleri reddeder', async () => {
    const sms = await moduluYukle();
    fetchTakli();
    expect((await sms.default(istek(null, 'GET'))).status).toBe(405);
  });

  it('bozuk JSON gövdesini reddeder', async () => {
    const sms = await moduluYukle();
    fetchTakli();
    const bozuk = new Request('https://ornek.test/api/sms', { method: 'POST', body: 'değil-json' });
    expect((await sms.default(bozuk)).status).toBe(400);
  });

  it('geçersiz numarayı reddeder', async () => {
    const sms = await moduluYukle();
    fetchTakli();
    const yanit = await sms.default(istek({ to: '123', body: 'metin' }));
    expect(yanit.status).toBe(400);
    await expect(yanit.json()).resolves
      .toEqual({ error: 'Geçerli bir cep telefonu numarası giriniz.' });
  });

  it('boş mesajı reddeder', async () => {
    const sms = await moduluYukle();
    fetchTakli();
    const yanit = await sms.default(istek({ to: '5321234567', body: '   ' }));
    expect(yanit.status).toBe(400);
    await expect(yanit.json()).resolves.toEqual({ error: 'Mesaj metni boş olamaz.' });
  });

  it('900 karakterden uzun mesajı reddeder', async () => {
    const sms = await moduluYukle();
    fetchTakli();
    const yanit = await sms.default(istek({ to: '5321234567', body: 'a'.repeat(901) }));
    expect(yanit.status).toBe(400);
    await expect(yanit.json()).resolves.toEqual({ error: 'Mesaj metni çok uzun.' });
  });

  it('tam 900 karakteri kabul eder', async () => {
    const sms = await moduluYukle();
    fetchTakli();
    const yanit = await sms.default(istek({ to: '5321234567', body: 'a'.repeat(900) }));
    expect(yanit.status).toBe(200);
  });

  it('ülke kodlu numarayı normalleştirir', async () => {
    const sms = await moduluYukle();
    const cagrilar = fetchTakli();
    await sms.default(istek({ to: '+90 532 123 45 67', body: 'metin' }));
    const netgsm = cagrilar.find((c) => c.adres.startsWith('https://api.netgsm'))!;
    expect(new URL(netgsm.adres).searchParams.get('gsmno')).toBe('5321234567');
  });
});

describe('sms uç noktası, hız sınırı', () => {
  it('IP sınırı aşıldığında 429 döner ve sağlayıcıya gitmez', async () => {
    const sms = await moduluYukle();
    const cagrilar = fetchTakli({ sinirAsilan: 'sms-ip' });

    const yanit = await sms.default(istek({ to: '5321234567', body: 'metin' }));

    expect(yanit.status).toBe(429);
    expect(yanit.headers.get('retry-after')).toBe('3600');
    expect(cagrilar.some((c) => c.adres.startsWith('https://api.netgsm'))).toBe(false);
  });

  it('numara sınırı aşıldığında 429 döner', async () => {
    const sms = await moduluYukle();
    const cagrilar = fetchTakli({ sinirAsilan: 'sms-phone' });

    const yanit = await sms.default(istek({ to: '5321234567', body: 'metin' }));

    expect(yanit.status).toBe(429);
    expect(cagrilar.some((c) => c.adres.startsWith('https://api.netgsm'))).toBe(false);
  });

  it('numara sınırı saatte 5 mesajdır', async () => {
    const sms = await moduluYukle();
    const cagrilar = fetchTakli();
    await sms.default(istek({ to: '5321234567', body: 'metin' }));
    const numaraSiniri = cagrilar
      .filter((c) => c.adres.endsWith('/rpc/check_rate_limit'))
      .find((c) => (c.govde as { p_bucket: string }).p_bucket === 'sms-phone');
    expect(numaraSiniri?.govde).toEqual({
      p_bucket: 'sms-phone', p_identifier: '5321234567', p_limit: 5, p_window_seconds: 3600,
    });
  });
});

describe('sms uç noktası, gönderim', () => {
  it('başarılı gönderimde sent:true döner', async () => {
    const sms = await moduluYukle();
    fetchTakli();
    const yanit = await sms.default(istek({ to: '5321234567', body: 'metin' }));
    expect(yanit.status).toBe(200);
    await expect(yanit.json()).resolves.toEqual({ sent: true });
  });

  it('sağlayıcı tanımlı değilken gönderildiğini iddia etmez', async () => {
    const sms = await moduluYukle({ NETGSM_PASS: undefined });
    const cagrilar = fetchTakli();

    const yanit = await sms.default(istek({ to: '5321234567', body: 'metin' }));

    expect(yanit.status).toBe(200);
    await expect(yanit.json()).resolves.toEqual({ sent: false, reason: 'provider_not_configured' });
    expect(cagrilar.some((c) => c.adres.startsWith('https://api.netgsm'))).toBe(false);
  });

  it('sağlayıcı hatasında 502 ve çevrilmiş metin döner', async () => {
    const sms = await moduluYukle();
    fetchTakli({ saglayici: '40' });
    const yanit = await sms.default(istek({ to: '5321234567', body: 'metin' }));
    expect(yanit.status).toBe(502);
    await expect(yanit.json()).resolves
      .toEqual({ sent: false, error: 'Mesaj başlığı (gönderici adı) sistemde tanımlı değil.' });
  });

  it('sağlayıcıya ulaşılamazsa 502 döner', async () => {
    const sms = await moduluYukle();
    fetchTakli({ saglayici: 'aglaHata' });
    const yanit = await sms.default(istek({ to: '5321234567', body: 'metin' }));
    expect(yanit.status).toBe(502);
    await expect(yanit.json()).resolves
      .toEqual({ sent: false, error: 'SMS sağlayıcısına ulaşılamadı.' });
  });

  it('sağlayıcı şifresini hiçbir yanıtta sızdırmaz', async () => {
    for (const senaryo of [{}, { saglayici: '30' }, { saglayici: 'aglaHata' as const }]) {
      const sms = await moduluYukle();
      fetchTakli(senaryo);
      const metin = await (await sms.default(istek({ to: '5321234567', body: 'metin' }))).text();
      expect(metin).not.toContain('gizli-sifre');
      expect(metin).not.toContain('abone');
    }
  });
});
