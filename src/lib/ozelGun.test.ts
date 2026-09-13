import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  SABIT_RESMI_TATILLER, ayinGunleri, gunlereGore, ortakGun, resmiTatiller,
  turdekiler, yaklasanGunler,
} from './ozelGun';
import type { SpecialDay } from '../types';

/**
 * Takvimdeki özel günler (madde 30).
 *
 * Kritik nokta: sabit tarihli resmî tatil listesi İKİ YERDE duruyor --
 * veritabanı göçünde ve burada (tanıtım kipinde veritabanı yok). İkisi
 * ayrışırsa aynı sistemde iki farklı tatil takvimi olur.
 */
function gun(patch: Partial<SpecialDay>): SpecialDay {
  return {
    id: patch.id ?? 'g1',
    day: patch.day ?? '2026-10-29',
    label: patch.label ?? 'Cumhuriyet Bayramı',
    kind: patch.kind ?? 'resmi_tatil',
    createdAt: '2026-01-01T00:00:00Z',
    ...patch,
  };
}

describe('SABIT_RESMI_TATILLER', () => {
  it('göçteki tohum listesiyle birebir aynı', () => {
    const sql = readFileSync('supabase/migrations/0034_kur_hava_ozel_gun_anket.sql', 'utf8');

    for (const tatil of SABIT_RESMI_TATILLER) {
      // SQL'de tek tırnak ikilenerek kaçırılıyor: Atatürk'ü -> Atatürk''ü
      const etiket = tatil.label.replace(/'/g, "''");
      const satir = `make_date(p_yil, ${String(tatil.ay).padStart(2, ' ')}, ${String(tatil.gun).padStart(2, ' ')})`;
      expect(sql, `${tatil.label} göçte bulunamadı`).toContain(etiket);
      expect(sql, `${tatil.label} tarihi göçte farklı`).toContain(satir);
    }
  });

  it('göçte fazladan tatil yok', () => {
    const sql = readFileSync('supabase/migrations/0034_kur_hava_ozel_gun_anket.sql', 'utf8');
    const tohum = sql.slice(sql.indexOf('resmi_tatilleri_tohumla'));
    const satirSayisi = (tohum.match(/make_date\(p_yil,/g) ?? []).length;
    expect(satirSayisi).toBe(SABIT_RESMI_TATILLER.length);
  });

  /*
    Dini günler ve okul tarihleri hesaplanmıyor: Diyanet ve MEB'in
    açıkladığı takvime bağlılar ve hesaplanmış bir hicri tarih
    gerçeğinden bir gün sapabilir. Uydurulmuş bir bayram günü, salonun o
    güne düğün koymamasına yol açardı.
  */
  it('dini gün ve okul tarihi içermez', () => {
    for (const t of SABIT_RESMI_TATILLER) {
      expect(['resmi_tatil', 'arife']).toContain(t.kind);
    }
  });
});

describe('resmiTatiller', () => {
  it('verilen yılın tarihlerini üretir', () => {
    const liste = resmiTatiller(2027);
    expect(liste).toHaveLength(SABIT_RESMI_TATILLER.length);
    expect(liste.some((t) => t.day === '2027-01-01' && t.label === 'Yılbaşı')).toBe(true);
    expect(liste.some((t) => t.day === '2027-10-29')).toBe(true);
  });

  it('tek haneli ay ve günü iki haneye tamamlar', () => {
    expect(resmiTatiller(2026).some((t) => t.day === '2026-05-01')).toBe(true);
  });
});

describe('gunlereGore', () => {
  it('aynı güne düşen kayıtları birlikte toplar', () => {
    const harita = gunlereGore([
      gun({ id: 'a', day: '2026-10-28', label: 'Arife', kind: 'arife' }),
      gun({ id: 'b', day: '2026-10-28', label: 'Okul tatili', kind: 'okul' }),
      gun({ id: 'c', day: '2026-10-29' }),
    ]);
    expect(harita.get('2026-10-28')).toHaveLength(2);
    expect(harita.get('2026-10-29')).toHaveLength(1);
  });

  // Sıra sabit olmasaydı takvim her açılışta farklı etiketi öne alırdı.
  it('aynı gündeki kayıtları ada göre sıralar', () => {
    const harita = gunlereGore([
      gun({ id: 'a', day: '2026-10-28', label: 'Zafer' }),
      gun({ id: 'b', day: '2026-10-28', label: 'Arife' }),
    ]);
    expect(harita.get('2026-10-28')?.map((g) => g.label)).toEqual(['Arife', 'Zafer']);
  });

  it('boş listede boş harita döner', () => {
    expect(gunlereGore([]).size).toBe(0);
  });
});

describe('ortakGun', () => {
  it('işletmesi olmayan gün ortaktır', () => {
    expect(ortakGun(gun({ businessId: undefined }))).toBe(true);
  });

  it('işletmeye ait gün ortak değildir', () => {
    expect(ortakGun(gun({ businessId: 'b1' }))).toBe(false);
  });
});

describe('ayinGunleri', () => {
  const liste = [
    gun({ id: 'a', day: '2026-10-29' }),
    gun({ id: 'b', day: '2026-10-28' }),
    gun({ id: 'c', day: '2026-11-10' }),
  ];

  it('yalnızca o ayın günlerini tarihe göre verir', () => {
    // Ay parametresi 0 tabanlı: 9 = Ekim.
    expect(ayinGunleri(liste, 2026, 9).map((g) => g.day)).toEqual(['2026-10-28', '2026-10-29']);
  });

  it('kayıt olmayan ayda boş döner', () => {
    expect(ayinGunleri(liste, 2026, 0)).toEqual([]);
  });
});

describe('yaklasanGunler', () => {
  const liste = [
    gun({ id: 'a', day: '2026-01-01' }),
    gun({ id: 'b', day: '2026-10-29' }),
    gun({ id: 'c', day: '2026-12-31' }),
  ];

  it('bugünden önceki günleri atar', () => {
    expect(yaklasanGunler(liste, '2026-09-12').map((g) => g.day))
      .toEqual(['2026-10-29', '2026-12-31']);
  });

  it('bugünün kendisini dahil eder', () => {
    expect(yaklasanGunler(liste, '2026-10-29')[0]?.day).toBe('2026-10-29');
  });

  it('istenen adetle sınırlar', () => {
    expect(yaklasanGunler(liste, '2026-01-01', 2)).toHaveLength(2);
  });
});

describe('turdekiler', () => {
  it('yalnızca istenen türü verir', () => {
    const liste = [gun({ id: 'a' }), gun({ id: 'b', kind: 'kandil' })];
    expect(turdekiler(liste, 'kandil').map((g) => g.id)).toEqual(['b']);
  });
});
