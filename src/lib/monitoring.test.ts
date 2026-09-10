import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Hata izleme.
 *
 * Buradaki asıl güvence, hata raporunun müşteri verisi taşımaması: bir
 * hata mesajında geçen telefon numarası ya da e-posta adresi Sentry'ye
 * gittiğinde KVKK açısından aktarım sayılır. `scrub` ve `beforeSend`
 * birlikte bunu engelliyor; testler ikisini de doğruluyor.
 *
 * İkinci güvence: DSN tanımlı değilse hiçbir şey yüklenmez ve dışarıya
 * istek gitmez. Statik `import` bunu bozuyordu.
 */
const ESKI_DSN = import.meta.env.VITE_SENTRY_DSN;

type Olay = {
  message?: string;
  exception?: { values?: { value?: string }[] };
  request?: { url?: string };
  user?: unknown;
};

const sentryTakli = {
  init: vi.fn(),
  captureException: vi.fn(),
};

vi.mock('@sentry/react', () => sentryTakli);

async function moduluYukle(dsn?: string) {
  if (dsn === undefined) vi.stubEnv('VITE_SENTRY_DSN', '');
  else vi.stubEnv('VITE_SENTRY_DSN', dsn);
  vi.resetModules();
  return import('./monitoring');
}

beforeEach(() => { sentryTakli.init.mockClear(); sentryTakli.captureException.mockClear(); });
afterEach(() => { vi.unstubAllEnvs(); void ESKI_DSN; });

describe('scrub', () => {
  it('e-posta adresini maskeler', async () => {
    const { scrub } = await moduluYukle();
    expect(scrub('Kullanıcı ayse.yilmaz@ornek.com giriş yapamadı'))
      .toBe('Kullanıcı [e-posta] giriş yapamadı');
  });

  it('artı işaretli e-postayı da maskeler', async () => {
    const { scrub } = await moduluYukle();
    expect(scrub('a+etiket@alt.ornek.com.tr')).toBe('[e-posta]');
  });

  it('cep telefonunu maskeler', async () => {
    const { scrub } = await moduluYukle();
    expect(scrub('5321234567 numarasına gönderilemedi')).toBe('[telefon] numarasına gönderilemedi');
  });

  it('başında sıfır ve ülke kodu olan numarayı da maskeler', async () => {
    const { scrub } = await moduluYukle();
    expect(scrub('05321234567')).toBe('[telefon]');
    expect(scrub('+905321234567')).toBe('[telefon]');
    expect(scrub('905321234567')).toBe('[telefon]');
  });

  it('aynı metinde birden çok değeri maskeler', async () => {
    const { scrub } = await moduluYukle();
    expect(scrub('a@b.com ve 5321234567 ve c@d.com'))
      .toBe('[e-posta] ve [telefon] ve [e-posta]');
  });

  it('sabit kimlik ve tutarlara dokunmaz', async () => {
    const { scrub } = await moduluYukle();
    expect(scrub('Rezervasyon ABC12345 tutarı 250000')).toBe('Rezervasyon ABC12345 tutarı 250000');
  });

  it('on haneden uzun sayı dizisini telefon saymaz', async () => {
    const { scrub } = await moduluYukle();
    expect(scrub('53212345678901')).toBe('53212345678901');
  });
});

describe('initMonitoring', () => {
  it('DSN tanımlı değilse hiçbir şey yüklemez', async () => {
    const { initMonitoring } = await moduluYukle();
    await initMonitoring();
    expect(sentryTakli.init).not.toHaveBeenCalled();
  });

  it('DSN tanımlıysa izlemeyi kurar ve kişisel veri göndermez', async () => {
    const { initMonitoring } = await moduluYukle('https://abc@ornek.ingest.sentry.io/1');
    await initMonitoring();

    expect(sentryTakli.init).toHaveBeenCalledTimes(1);
    const secenekler = sentryTakli.init.mock.calls[0][0] as { sendDefaultPii: boolean };
    expect(secenekler.sendDefaultPii).toBe(false);
  });

  it('beforeSend hata mesajını, istisnayı ve adresi temizler', async () => {
    const { initMonitoring } = await moduluYukle('https://abc@ornek.ingest.sentry.io/1');
    await initMonitoring();

    const { beforeSend } = sentryTakli.init.mock.calls[0][0] as {
      beforeSend: (olay: Olay) => Olay;
    };

    const temiz = beforeSend({
      message: 'a@b.com için hata',
      exception: { values: [{ value: '5321234567 numarası reddedildi' }, { value: undefined }] },
      request: { url: 'https://ornek.test/panel?mail=a@b.com' },
      user: { id: 'u1', email: 'a@b.com' },
    });

    expect(temiz.message).toBe('[e-posta] için hata');
    expect(temiz.exception?.values?.[0].value).toBe('[telefon] numarası reddedildi');
    expect(temiz.request?.url).toBe('https://ornek.test/panel?mail=[e-posta]');
    // Kullanıcı kimliği hiçbir koşulda gönderilmez.
    expect(temiz.user).toBeUndefined();
  });

  it('beforeSend eksik alanlarda çökmez', async () => {
    const { initMonitoring } = await moduluYukle('https://abc@ornek.ingest.sentry.io/1');
    await initMonitoring();
    const { beforeSend } = sentryTakli.init.mock.calls[0][0] as {
      beforeSend: (olay: Olay) => Olay;
    };
    expect(() => beforeSend({})).not.toThrow();
  });
});

describe('reportError', () => {
  it('izleme kapalıyken sessizce yok sayar', async () => {
    const { reportError } = await moduluYukle();
    expect(() => reportError(new Error('deneme'))).not.toThrow();
    expect(sentryTakli.captureException).not.toHaveBeenCalled();
  });

  it('kurulum tamamlanmadan çağrılırsa da uygulamayı durdurmaz', async () => {
    const { reportError } = await moduluYukle('https://abc@ornek.ingest.sentry.io/1');
    expect(() => reportError(new Error('deneme'))).not.toThrow();
    expect(sentryTakli.captureException).not.toHaveBeenCalled();
  });

  it('kurulumdan sonra hatayı bildirir', async () => {
    const { initMonitoring, reportError } = await moduluYukle('https://abc@ornek.ingest.sentry.io/1');
    await initMonitoring();

    const hata = new Error('deneme');
    reportError(hata);

    expect(sentryTakli.captureException).toHaveBeenCalledWith(hata, undefined);
  });

  it('bağlam verilirse ek bilgi olarak geçirir', async () => {
    const { initMonitoring, reportError } = await moduluYukle('https://abc@ornek.ingest.sentry.io/1');
    await initMonitoring();

    reportError(new Error('deneme'), { ekran: 'Rezervasyonlar' });

    expect(sentryTakli.captureException).toHaveBeenCalledWith(
      expect.any(Error), { extra: { ekran: 'Rezervasyonlar' } },
    );
  });
});
