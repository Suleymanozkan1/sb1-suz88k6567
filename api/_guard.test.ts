import { describe, expect, it } from 'vitest';
import { clientIp } from './_guard';

function istek(basliklar: Record<string, string>): Request {
  return new Request('https://ornek.test/api/login', { headers: basliklar });
}

describe('clientIp — hız sınırı ve giriş kilidinin anahtarı', () => {
  it('Cloudflare başlığını önceler', () => {
    expect(clientIp(istek({ 'cf-connecting-ip': '203.0.113.7' }))).toBe('203.0.113.7');
  });

  it('istemcinin uydurduğu x-forwarded-for değerini kullanmaz', () => {
    // Saldırgan her istekte farklı bir x-forwarded-for göndererek sınırı
    // atlatabilirdi; Cloudflare başlığı varken o kazanmalı.
    const yanit = clientIp(istek({
      'cf-connecting-ip': '203.0.113.7',
      'x-forwarded-for': '1.2.3.4',
    }));
    expect(yanit).toBe('203.0.113.7');
  });

  it('Cloudflare başlığı yoksa x-forwarded-for zincirinin ilkini alır', () => {
    expect(clientIp(istek({ 'x-forwarded-for': '198.51.100.9, 10.0.0.1' }))).toBe('198.51.100.9');
  });

  it('hiçbir başlık yoksa sabit bir değere düşer', () => {
    expect(clientIp(istek({}))).toBe('bilinmeyen');
  });
});
