import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { issueLoginOtp, sendSms, verifyLoginOtp } from './sms';

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };

/** Sunucu yanıtını taklit eder */
function mockFetch(body: unknown, headers: Record<string, string> = JSON_HEADERS) {
  return vi.fn().mockResolvedValue(
    new Response(typeof body === 'string' ? body : JSON.stringify(body), { headers }),
  );
}

beforeEach(() => { vi.restoreAllMocks(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('sendSms', () => {
  it('başarılı gönderimi bildirir', async () => {
    vi.stubGlobal('fetch', mockFetch({ sent: true }));
    expect(await sendSms('5321234567', 'merhaba')).toEqual({ sent: true });
  });

  it('sağlayıcı tanımlı değilse "gönderildi" demez', async () => {
    vi.stubGlobal('fetch', mockFetch({ sent: false, reason: 'provider_not_configured' }));
    expect(await sendSms('5321234567', 'merhaba')).toEqual({ sent: false, notConfigured: true });
  });

  it('sağlayıcı hatasını iletir', async () => {
    vi.stubGlobal('fetch', mockFetch({ sent: false, error: 'Mesaj başlığı tanımlı değil.' }));
    expect(await sendSms('5321234567', 'merhaba'))
      .toEqual({ sent: false, error: 'Mesaj başlığı tanımlı değil.' });
  });

  it('uç nokta yoksa (HTML dönüyorsa) yapılandırılmamış sayar', async () => {
    vi.stubGlobal('fetch', mockFetch('<!doctype html><html></html>', { 'content-type': 'text/html' }));
    expect(await sendSms('5321234567', 'merhaba')).toEqual({ sent: false, notConfigured: true });
  });

  it('ağ hatasında yanlış bilgi vermez', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const result = await sendSms('5321234567', 'merhaba');
    expect(result.sent).toBe(false);
  });
});

describe('issueLoginOtp', () => {
  it('kod isteğini ve süreyi döndürür', async () => {
    vi.stubGlobal('fetch', mockFetch({ issued: true, token: 'abc', expiresAt: 123 }));
    expect(await issueLoginOtp('5321234567')).toEqual({
      challenge: { token: 'abc', expiresAt: 123 },
    });
  });

  it('sağlayıcı yoksa doğrulama adımını atlatır', async () => {
    vi.stubGlobal('fetch', mockFetch({ issued: false, reason: 'provider_not_configured' }));
    expect(await issueLoginOtp('5321234567')).toEqual({ notConfigured: true });
  });

  it('uç nokta olmayan dağıtımda kullanıcıyı girişten kilitlemez', async () => {
    vi.stubGlobal('fetch', mockFetch('<!doctype html>', { 'content-type': 'text/html' }));
    expect(await issueLoginOtp('5321234567')).toEqual({ notConfigured: true });
  });

  it('sağlayıcı hatasını iletir', async () => {
    vi.stubGlobal('fetch', mockFetch({ issued: false, error: 'Kod gönderilemedi.' }));
    expect(await issueLoginOtp('5321234567')).toEqual({ error: 'Kod gönderilemedi.' });
  });
});

describe('verifyLoginOtp', () => {
  const challenge = { token: 'abc', expiresAt: Date.now() + 60_000 };

  it('doğru kodu onaylar', async () => {
    vi.stubGlobal('fetch', mockFetch({ verified: true }));
    expect(await verifyLoginOtp('5321234567', '123456', challenge)).toEqual({ ok: true });
  });

  it('hatalı kodu reddeder', async () => {
    vi.stubGlobal('fetch', mockFetch({ verified: false, error: 'Doğrulama kodu hatalı.' }));
    expect(await verifyLoginOtp('5321234567', '000000', challenge))
      .toEqual({ ok: false, error: 'Doğrulama kodu hatalı.' });
  });

  it('doğrulama adımı başladıysa servis hatasında açık geçmez', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const result = await verifyLoginOtp('5321234567', '123456', challenge);
    expect(result.ok).toBe(false);
  });
});
