import { describe, expect, it } from 'vitest';
import { scrub } from './monitoring';

describe('scrub — hata bildirimlerinde kişisel veri maskeleme', () => {
  it('e-posta adresini maskeler', () => {
    expect(scrub('Kullanıcı ahmet.yaz@ornek.com giriş yapamadı'))
      .toBe('Kullanıcı [e-posta] giriş yapamadı');
  });

  it('cep telefonunu maskeler', () => {
    expect(scrub('Numara 5321234567 bulunamadı')).toBe('Numara [telefon] bulunamadı');
    expect(scrub('Numara 05321234567 bulunamadı')).toBe('Numara [telefon] bulunamadı');
    expect(scrub('Numara +905321234567 bulunamadı')).toBe('Numara [telefon] bulunamadı');
  });

  it('aynı metindeki birden fazla veriyi maskeler', () => {
    expect(scrub('a@b.com ve c@d.com, 5321234567'))
      .toBe('[e-posta] ve [e-posta], [telefon]');
  });

  it('kişisel veri yoksa metni değiştirmez', () => {
    expect(scrub('Rezervasyon kaydedilemedi')).toBe('Rezervasyon kaydedilemedi');
  });

  it('rezervasyon kodunu telefon sanmaz', () => {
    expect(scrub('DT-2026-4821 bulunamadı')).toBe('DT-2026-4821 bulunamadı');
  });
});
