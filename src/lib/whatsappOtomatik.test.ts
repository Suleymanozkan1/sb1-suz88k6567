import { describe, expect, it } from 'vitest';
import {
  MESAI_DISI_ARALIK_SAAT, VARSAYILAN_AYAR, mesaiIcindeMi,
  otomatikCevapSec, saatiDakikayaCevir, yerelAn,
} from './whatsappOtomatik';
import type { OtomatikAyar } from './whatsappOtomatik';

/** UTC'de verilen an; Türkiye saati üç saat ileridedir. */
const utc = (s: string) => new Date(s);

const ayar = (uzerine: Partial<OtomatikAyar> = {}): OtomatikAyar => ({
  ...VARSAYILAN_AYAR,
  autoReplyEnabled: true,
  afterHoursEnabled: true,
  ...uzerine,
});

describe('saatiDakikayaCevir', () => {
  it('saat ve dakikayı dakikaya çevirir', () => {
    expect(saatiDakikayaCevir('09:00')).toBe(540);
    expect(saatiDakikayaCevir('19:30')).toBe(1170);
    expect(saatiDakikayaCevir('09:00:00')).toBe(540);
  });

  it('geçersiz değerde null döner', () => {
    expect(saatiDakikayaCevir('')).toBeNull();
    expect(saatiDakikayaCevir('25:00')).toBeNull();
    expect(saatiDakikayaCevir('09:70')).toBeNull();
    expect(saatiDakikayaCevir('akşam')).toBeNull();
  });
});

describe('yerelAn', () => {
  it('UTC saatini Türkiye saatine çevirir', () => {
    // 2026-09-14 bir pazartesi. UTC 06:00 -> yerel 09:00.
    const { gun, dakika } = yerelAn(utc('2026-09-14T06:00:00Z'));
    expect(gun).toBe(1);
    expect(dakika).toBe(540);
  });

  it('gün sınırını UTC değil yerel saate göre geçer', () => {
    // UTC 22:00 pazartesi, Türkiye'de salı 01:00.
    const { gun, dakika } = yerelAn(utc('2026-09-14T22:00:00Z'));
    expect(gun).toBe(2);
    expect(dakika).toBe(60);
  });

  it('pazarı 7 olarak verir', () => {
    expect(yerelAn(utc('2026-09-13T09:00:00Z')).gun).toBe(7);
  });
});

describe('mesaiIcindeMi', () => {
  const a = ayar({ workStart: '09:00', workEnd: '19:00' });

  it('çalışma saatleri içini tanır', () => {
    expect(mesaiIcindeMi(a, utc('2026-09-14T09:00:00Z'))).toBe(true); // yerel 12:00
  });

  it('açılış saati dahildir, kapanış saati hariçtir', () => {
    expect(mesaiIcindeMi(a, utc('2026-09-14T06:00:00Z'))).toBe(true);  // yerel 09:00
    expect(mesaiIcindeMi(a, utc('2026-09-14T16:00:00Z'))).toBe(false); // yerel 19:00
  });

  it('gece yarısını UTC saatine göre değil yerel saate göre değerlendirir', () => {
    // UTC 17:00 -> yerel 20:00: mesai bitmiş. UTC'ye bakılsaydı içeride sanılırdı.
    expect(mesaiIcindeMi(a, utc('2026-09-14T17:00:00Z'))).toBe(false);
  });

  it('kapalı günde saat uygun olsa da dışarıdadır', () => {
    const haftaIci = ayar({ workStart: '09:00', workEnd: '19:00', workDays: [1, 2, 3, 4, 5] });
    expect(mesaiIcindeMi(haftaIci, utc('2026-09-13T09:00:00Z'))).toBe(false); // pazar
  });

  it('gece yarısını aşan aralığı destekler', () => {
    const gece = ayar({ workStart: '20:00', workEnd: '02:00' });
    expect(mesaiIcindeMi(gece, utc('2026-09-14T18:00:00Z'))).toBe(true);  // yerel 21:00
    expect(mesaiIcindeMi(gece, utc('2026-09-14T22:00:00Z'))).toBe(true);  // yerel salı 01:00
    expect(mesaiIcindeMi(gece, utc('2026-09-15T07:00:00Z'))).toBe(false); // yerel 10:00
  });

  it('bozuk saat ayarında mesai dışı demez', () => {
    // Yanlış yapılandırma yüzünden müşteriye "kapalıyız" yazmak,
    // hiç yazmamaktan kötüdür.
    expect(mesaiIcindeMi(ayar({ workStart: 'aksam', workEnd: '19:00' }), utc('2026-09-14T22:00:00Z')))
      .toBe(true);
  });

  it('açılış ve kapanış aynıysa 24 saat açık sayar', () => {
    expect(mesaiIcindeMi(ayar({ workStart: '00:00', workEnd: '00:00' }), utc('2026-09-14T22:00:00Z')))
      .toBe(true);
  });
});

describe('otomatikCevapSec', () => {
  const mesaiIci = utc('2026-09-14T09:00:00Z');  // yerel 12:00
  const mesaiDisi = utc('2026-09-14T20:00:00Z'); // yerel 23:00

  it('kapalıyken hiçbir şey göndermez', () => {
    const kapali = ayar({ autoReplyEnabled: false, afterHoursEnabled: false });
    expect(otomatikCevapSec(kapali, { yeniAday: true, gecmis: [], zaman: mesaiDisi })).toBeNull();
  });

  it('mesai içinde yeni adaya karşılama gönderir', () => {
    const secim = otomatikCevapSec(ayar(), { yeniAday: true, gecmis: [], zaman: mesaiIci });
    expect(secim).toEqual({ kind: 'karsilama', body: VARSAYILAN_AYAR.welcomeMessage });
  });

  it('mevcut adaya ikinci mesajda karşılama göndermez', () => {
    expect(otomatikCevapSec(ayar(), { yeniAday: false, gecmis: [], zaman: mesaiIci })).toBeNull();
  });

  it('karşılama bir kez gider', () => {
    const gecmis = [{ kind: 'karsilama' as const, at: '2026-09-10T10:00:00Z' }];
    expect(otomatikCevapSec(ayar(), { yeniAday: true, gecmis, zaman: mesaiIci })).toBeNull();
  });

  it('mesai dışında bilgilendirme gönderir', () => {
    const secim = otomatikCevapSec(ayar(), { yeniAday: true, gecmis: [], zaman: mesaiDisi });
    expect(secim?.kind).toBe('mesai_disi');
  });

  it('mesai dışı bilgilendirmesi karşılamanın önüne geçer', () => {
    // İkisi birden gönderilirse müşteri arka arkaya iki mesaj alır.
    const secim = otomatikCevapSec(ayar(), { yeniAday: true, gecmis: [], zaman: mesaiDisi });
    expect(secim?.kind).toBe('mesai_disi');
    expect(secim?.body).toBe(VARSAYILAN_AYAR.afterHoursMessage);
  });

  it('aynı akşam ikinci mesajda bilgilendirmeyi tekrarlamaz', () => {
    const birSaatOnce = new Date(mesaiDisi.getTime() - 60 * 60 * 1000).toISOString();
    const gecmis = [{ kind: 'mesai_disi' as const, at: birSaatOnce }];
    expect(otomatikCevapSec(ayar(), { yeniAday: false, gecmis, zaman: mesaiDisi })).toBeNull();
  });

  it('aradan yeterli süre geçtiyse yeniden gönderir', () => {
    const eski = new Date(mesaiDisi.getTime() - (MESAI_DISI_ARALIK_SAAT + 1) * 3600 * 1000)
      .toISOString();
    const gecmis = [{ kind: 'mesai_disi' as const, at: eski }];
    expect(otomatikCevapSec(ayar(), { yeniAday: false, gecmis, zaman: mesaiDisi })?.kind)
      .toBe('mesai_disi');
  });

  it('mesai dışı kapalıysa mesai dışında karşılamaya düşmez', () => {
    // Salon kapalıyken "en kısa sürede döneceğiz" demek yanlış bir söz olurdu.
    const yalnizKarsilama = ayar({ afterHoursEnabled: false });
    const secim = otomatikCevapSec(yalnizKarsilama, {
      yeniAday: true, gecmis: [], zaman: mesaiDisi,
    });
    expect(secim?.kind).toBe('karsilama');
  });

  it('boş metinli ayar mesaj göndermez', () => {
    const bos = ayar({ welcomeMessage: '   ', afterHoursMessage: '  ' });
    expect(otomatikCevapSec(bos, { yeniAday: true, gecmis: [], zaman: mesaiIci })).toBeNull();
    expect(otomatikCevapSec(bos, { yeniAday: true, gecmis: [], zaman: mesaiDisi })).toBeNull();
  });

  it('bozuk geçmiş damgası gönderimi engellemez', () => {
    const gecmis = [{ kind: 'mesai_disi' as const, at: 'bozuk' }];
    expect(otomatikCevapSec(ayar(), { yeniAday: false, gecmis, zaman: mesaiDisi })?.kind)
      .toBe('mesai_disi');
  });
});
