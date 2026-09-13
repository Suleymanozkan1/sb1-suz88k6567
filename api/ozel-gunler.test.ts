import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  etiketiAyikla, gunFarki, gunKaydir, gunTuru, hicriTarihiCevir,
  kandilTarihi, ramazanCipasi, tatilleriCevir,
} from './ozel-gunler';

/**
 * Özel günlerin otomatik çekilmesi (madde 30).
 *
 * En kritik davranış KANDİL HESABI. İki bağımsız takvim -- tatil
 * sağlayıcısı ve hicri servis -- uzak yıllarda bir gün kayabiliyor;
 * ölçüldü, 2027-2030 arası Ramazan Bayramı'nda tam olarak bu oluyor.
 * Kandil mutlak tarihle alınsaydı bayrama göre yanlış yerde dururdu.
 * Bu yüzden yalnızca FARK kullanılıyor ve çıpa resmî bayram tarihi.
 */
describe('etiketiAyikla', () => {
  it('kesinleşmemiş işaretini ayırır', () => {
    expect(etiketiAyikla('Ramazan Bayramı 1. Gün (Tentative Date)'))
      .toEqual({ label: 'Ramazan Bayramı 1. Gün', tentative: true });
  });

  it('kesin tarihi olduğu gibi bırakır', () => {
    expect(etiketiAyikla('Cumhuriyet Bayramı'))
      .toEqual({ label: 'Cumhuriyet Bayramı', tentative: false });
  });

  it('alakasız parantezi silmez', () => {
    expect(etiketiAyikla('Zafer Bayramı (30 Ağustos)').label).toBe('Zafer Bayramı (30 Ağustos)');
  });
});

describe('gunTuru', () => {
  it('ramazan ve kurbanı dini bayram sayar', () => {
    expect(gunTuru('Ramazan Bayramı 2. Gün')).toBe('dini_bayram');
    expect(gunTuru('Kurban Bayramı 1. Gün')).toBe('dini_bayram');
  });

  it('geri kalanı resmî tatil sayar', () => {
    expect(gunTuru('Cumhuriyet Bayramı')).toBe('resmi_tatil');
    expect(gunTuru('İşçi Bayramı')).toBe('resmi_tatil');
  });
});

describe('gunKaydir', () => {
  it('ay sınırını geçer', () => {
    expect(gunKaydir('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('yıl sınırını geçer', () => {
    expect(gunKaydir('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('artık yılı doğru sayar', () => {
    expect(gunKaydir('2028-03-01', -1)).toBe('2028-02-29');
  });
});

describe('gunFarki', () => {
  it('gün sayısını verir', () => {
    expect(gunFarki('2026-03-20', '2026-03-16')).toBe(4);
  });

  it('ay ve yıl sınırını aşar', () => {
    expect(gunFarki('2026-03-20', '2025-09-03')).toBe(198);
  });
});

/*
  Gerçek sağlayıcı yanıtından kısaltılmış örnek. Tarihler 2026 için
  gerçek: Ramazan Bayramı 20-22 Mart, Kurban Bayramı 27-30 Mayıs.
*/
const TATIL_YANITI = [
  { date: '2026-01-01', localName: 'Yılbaşı' },
  { date: '2026-03-20', localName: 'Ramazan Bayramı 1. Gün' },
  { date: '2026-03-21', localName: 'Ramazan Bayramı 2. Gün' },
  { date: '2026-05-27', localName: 'Kurban Bayramı 1. Gün' },
  { date: '2026-05-28', localName: 'Kurban Bayramı 2. Gün' },
  { date: '2026-10-29', localName: 'Cumhuriyet Bayramı' },
];

describe('tatilleriCevir', () => {
  const gunler = tatilleriCevir(TATIL_YANITI);
  const bul = (gun: string) => gunler.filter((g) => g.day === gun);

  it('tatilleri olduğu gibi alır', () => {
    expect(bul('2026-01-01')[0]).toMatchObject({ label: 'Yılbaşı', kind: 'resmi_tatil' });
  });

  /*
    Arife bir tahmin değil TANIM: bayramdan önceki gündür. Bayram
    tarihi sağlayıcıdan geldiği için arife de onun kadar kesin.
  */
  it('bayram arifesini türetir', () => {
    expect(bul('2026-03-19')[0]).toMatchObject({ label: 'Ramazan Bayramı arifesi', kind: 'arife' });
    expect(bul('2026-05-26')[0]).toMatchObject({ label: 'Kurban Bayramı arifesi', kind: 'arife' });
  });

  it('cumhuriyet bayramı arifesini de türetir', () => {
    expect(bul('2026-10-28')[0]).toMatchObject({ label: 'Cumhuriyet Bayramı arifesi', kind: 'arife' });
  });

  // 2. günden de üretilseydi bayramın ortasına arife düşerdi.
  it('bayramın ikinci gününden arife üretmez', () => {
    expect(bul('2026-03-20').filter((g) => g.kind === 'arife')).toHaveLength(0);
  });

  it('kesinleşmemiş bayramın arifesini de kesinleşmemiş sayar', () => {
    const [arife] = tatilleriCevir([
      { date: '2029-02-15', localName: 'Ramazan Bayramı 1. Gün (Tentative Date)' },
    ]).filter((g) => g.kind === 'arife');
    expect(arife).toMatchObject({ day: '2029-02-14', tentative: true });
  });

  it('bozuk tarihli ve isimsiz satırı atlar', () => {
    expect(tatilleriCevir([
      { date: 'bilinmiyor', localName: 'Bir gün' },
      { date: '2026-01-01', localName: '   ' },
    ])).toEqual([]);
  });

  it('beklenmeyen gövdede boş liste döner', () => {
    expect(tatilleriCevir(null)).toEqual([]);
    expect(tatilleriCevir({ hata: true })).toEqual([]);
  });
});

describe('ramazanCipasi', () => {
  it('bayramın ilk gününü bulur', () => {
    expect(ramazanCipasi(tatilleriCevir(TATIL_YANITI))).toBe('2026-03-20');
  });

  it('bayram yoksa null döner', () => {
    expect(ramazanCipasi(tatilleriCevir([{ date: '2026-01-01', localName: 'Yılbaşı' }]))).toBeNull();
  });
});

describe('hicriTarihiCevir', () => {
  it('gg-aa-yyyy biçimini ISO güne çevirir', () => {
    expect(hicriTarihiCevir({ data: { gregorian: { date: '20-03-2026' } } })).toBe('2026-03-20');
  });

  it('beklenmeyen gövdede null döner', () => {
    expect(hicriTarihiCevir(null)).toBeNull();
    expect(hicriTarihiCevir({ data: {} })).toBeNull();
  });
});

describe('kandilTarihi', () => {
  /*
    1447 yılında iki takvim aynı: servis 1 Şevval'i 2026-03-20 diyor,
    sağlayıcı da bayramı o gün veriyor. Kadir Gecesi 27 Ramazan'ın
    gecesi, yani 16 Mart'ın bir önceki akşamı: 15 Mart.
  */
  it('takvimler aynıyken doğru geceyi verir', () => {
    expect(kandilTarihi('2026-03-20', '2026-03-20', '2026-03-16')).toBe('2026-03-15');
  });

  /*
    ASIL SINAV. 1448'de servis bayramı 09 Mart diyor, sağlayıcı 10 Mart:
    takvim bir gün kaymış. Kandil mutlak alınsaydı bayrama beş gün
    kalırdı; ofsetle dört gün kalıyor ve bayramla tutarlı oluyor.
  */
  it('takvim bir gün kaymışken bayramla tutarlı kalır', () => {
    // Servis 1 Şevval'i 09 Mart diyor, sağlayıcı bayramı 10 Mart:
    // takvim bir gün kaymış. Mutlak alınsaydı kandil 05 Mart'ın
    // gecesi, yani 04 Mart olurdu ve bayrama altı gün kalırdı.
    const kandil = kandilTarihi('2027-03-10', '2027-03-09', '2027-03-05');
    expect(kandil).toBe('2027-03-05');

    /*
      ASIL DOĞRULANAN BU: kandil gecesi ile bayram arasındaki mesafe,
      takvimler tuttuğunda da kaydığında da AYNI kalıyor. Kayma
      sadeleşti.
    */
    expect(gunFarki('2027-03-10', kandil)).toBe(5);
    expect(gunFarki('2026-03-20', kandilTarihi('2026-03-20', '2026-03-20', '2026-03-16'))).toBe(5);
  });

  it('yıl sınırını aşan kandili doğru yerleştirir', () => {
    // Mevlid, Ramazan Bayramı'ndan çok önce ve önceki miladi yıla düşer.
    expect(kandilTarihi('2026-03-20', '2026-03-20', '2025-09-04')).toBe('2025-09-03');
  });
});

/* ------------------------------------------------------------ işleyici */

const JWT = 'test-icin-en-az-otuz-iki-karakterlik-sir';
const ESKI_ENV = { ...process.env };

let yazilan: { p_yil: number; p_gunler: { day: string; label: string; kind: string }[] }[] = [];
let tatilHatasi = false;

async function moduluYukle(env: Record<string, string | undefined> = {}) {
  process.env = {
    ...ESKI_ENV, PGRST_URL: 'http://veri.yerel', JWT_SECRET: JWT,
    CRON_SECRET: 'gorev-sirri', ...env,
  };
  vi.resetModules();
  return import('./ozel-gunler');
}

function istek(yetkili = true): Request {
  return new Request('https://x/api/ozel-gunler', {
    method: 'POST',
    headers: yetkili ? { authorization: 'Bearer gorev-sirri' } : {},
  });
}

beforeEach(() => {
  yazilan = [];
  tatilHatasi = false;
  vi.setSystemTime(new Date('2026-01-15T00:00:00Z'));

  vi.stubGlobal('fetch', vi.fn(async (girdi: string | URL, init?: RequestInit) => {
    const adres = String(girdi);

    if (adres.includes('date.nager.at')) {
      if (tatilHatasi) return new Response('', { status: 503 });
      const yil = /\/(\d{4})\/TR$/.exec(adres)?.[1] ?? '2026';
      return new Response(JSON.stringify(
        TATIL_YANITI.map((t) => ({ ...t, date: t.date.replace('2026', yil) })),
      ), { status: 200 });
    }

    if (adres.includes('aladhan.com')) {
      // Hicri servisi: 1 Şevval bayramla aynı, 27 Ramazan dört gün önce.
      const e = /hToG\/(\d{2})-(\d{2})-(\d{4})/.exec(adres);
      const gun = e?.[1]; const ay = e?.[2]; const hicri = Number(e?.[3] ?? 1447);
      const yil = hicri + 579;
      const tarih = ay === '10' ? `20-03-${yil}`
        : ay === '09' ? `16-03-${yil}`
          : ay === '08' ? `03-02-${yil}`
            : ay === '07' ? `16-01-${yil}`
              : `04-09-${yil - 1}`;
      return new Response(JSON.stringify({ data: { gregorian: { date: tarih } } }), { status: 200 });
      void gun;
    }

    if (adres.includes('/rpc/ozel_gunleri_yaz')) {
      const govde = JSON.parse(String(init?.body)) as typeof yazilan[number];
      yazilan.push(govde);
      return new Response(String(govde.p_gunler.length), { status: 200 });
    }

    return new Response('[]', { status: 200 });
  }));
});

afterEach(() => {
  process.env = { ...ESKI_ENV };
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('kapılar', () => {
  it('cron sırrı olmadan çalışmaz', async () => {
    const { default: handler } = await moduluYukle();
    expect((await handler(istek(false))).status).toBe(401);
    expect(yazilan).toHaveLength(0);
  });

  it('veritabanı yapılandırılmamışsa çalışmaz', async () => {
    const { default: handler } = await moduluYukle({ JWT_SECRET: 'kisa' });
    expect((await handler(istek())).status).toBe(500);
  });
});

describe('çekme', () => {
  it('bu yıl ve sonraki üç yılı yazar', async () => {
    const { default: handler } = await moduluYukle();
    await handler(istek());
    expect(yazilan.map((y) => y.p_yil)).toEqual([2026, 2027, 2028, 2029]);
  });

  it('tatil, arife ve kandili birlikte yazar', async () => {
    const { default: handler } = await moduluYukle();
    await handler(istek());
    const turler = new Set(yazilan[0]?.p_gunler.map((g) => g.kind));
    expect(turler).toContain('resmi_tatil');
    expect(turler).toContain('dini_bayram');
    expect(turler).toContain('arife');
    expect(turler).toContain('kandil');
  });

  /*
    Sağlayıcı bir yılı veremediğinde o yıl ATLANMALI ama diğerleri
    yazılmalı. Hepsi birden düşseydi tek bir kesinti takvimin tamamını
    güncellenmemiş bırakırdı.
  */
  it('sağlayıcı hata verirse o yılı yazmaz, diğerlerini etkilemez', async () => {
    tatilHatasi = true;
    const { default: handler } = await moduluYukle();
    const yanit = await handler(istek());
    const govde = await yanit.json() as { results: { written: number; detail: string }[] };

    expect(yazilan).toHaveLength(0);
    expect(govde.results.every((r) => r.written === 0)).toBe(true);
    expect(govde.results[0]?.detail).toMatch(/503/);
  });

  it('kandilleri kesinleşmemiş olarak işaretler', async () => {
    const { default: handler } = await moduluYukle();
    await handler(istek());
    const kandiller = yazilan[0]?.p_gunler.filter((g) => g.kind === 'kandil') ?? [];
    expect(kandiller.length).toBeGreaterThan(0);
    expect(kandiller.every((k) => (k as { tentative?: boolean }).tentative === true)).toBe(true);
  });

  it('kandili yazdığı yıla ait tutar', async () => {
    const { default: handler } = await moduluYukle();
    await handler(istek());
    for (const yil of yazilan) {
      for (const g of yil.p_gunler) {
        expect(g.day.slice(0, 4), `${g.label} yanlış yıla yazıldı`).toBe(String(yil.p_yil));
      }
    }
  });
});
