import { describe, expect, it } from 'vitest';
import { demoUret } from './demo/uret';
import { makeBalanceLookup } from './money';
import {
  BELIRTILMEMIS, balanceReport, channelReport, ekGiderRaporu, haftalikRapor,
  ilRaporu, isletmeRaporu, karRaporu, lastMonthsReport, monthReport,
  programReport, slotReport, summarize, tahsilatAyRaporu, tavsiyeRaporu,
  yilAyRaporu,
} from './reports';

/**
 * Raporların HACİM ALTINDA ve ÇEŞİTLİ VERİDE doğru sayı verdiği.
 *
 * Mevcut rapor testleri elle kurulmuş üç beş kayıtla çalışıyor ve bir
 * hesabın doğru olduğunu gösteriyor. Burada sorulan soru farklı: 480
 * rezervasyon, üç yıl, iptaller, bedelsiz kayıtlar, fazla tahsilatlar ve
 * boş bırakılmış alanlar karışınca rakamlar hâlâ tutuyor mu?
 *
 * YÖNTEM: BÖLÜŞÜM DEĞİŞMEZİ. Kırılım raporlarının hepsi aynı kümeyi
 * parçalara ayırıyor. Öyleyse satırların toplamı, bütünün toplamına
 * EŞİT olmak zorunda. Bir rapor kayıt düşürürse ya da iki kez sayarsa bu
 * eşitlik bozulur -- tek tek beklenen değer yazmakla yakalanamayacak bir
 * hata sınıfı.
 *
 * Beklenen değerler raporun kendi fonksiyonuyla değil, ham veriden
 * bağımsız olarak hesaplanıyor; yoksa test yalnızca fonksiyonun kendisiyle
 * tutarlı olduğunu gösterirdi.
 */
const VERI = demoUret();
const BAKIYE = makeBalanceLookup(VERI.payments);
const { reservations, payments, cashFlow, expenses } = VERI;

/** Ham veriden bağımsız toplam. */
function hamToplam(liste: typeof reservations) {
  return {
    count: liste.length,
    total: liste.reduce((t, r) => t + r.totalAmount, 0),
    guests: liste.reduce((t, r) => t + r.guestCount, 0),
  };
}

describe('üretilen veri gerçekten çeşitli', () => {
  it('uç durumların hepsi kümede var', () => {
    // Test bu durumları sınadığını sanıp aslında hiç üretilmemiş olmasın.
    expect(reservations.length).toBeGreaterThan(300);
    expect(reservations.some((r) => r.totalAmount === 0)).toBe(true);
    expect(reservations.some((r) => r.status === 'İptal')).toBe(true);
    expect(reservations.some((r) => r.deposit === 0)).toBe(true);
    expect(reservations.some((r) => r.deposit === r.totalAmount && r.totalAmount > 0)).toBe(true);
    expect(reservations.some((r) => !r.city)).toBe(true);
    expect(reservations.some((r) => !r.sourceChannel)).toBe(true);
    // Fazla tahsilat: ödenen, tutarı aşıyor.
    expect(reservations.some((r) => BAKIYE.paid(r) > r.totalAmount - r.deposit)).toBe(true);
    // Üç yıla yayılmış olmalı.
    expect(new Set(reservations.map((r) => r.date.slice(0, 4))).size).toBeGreaterThanOrEqual(3);
  });
});

describe('kalan alacak asla eksiye düşmez', () => {
  it('fazla tahsilat yapılmış kayıtlarda bile', () => {
    /*
      Müşteri fazla ödediğinde "kalan -5.000" yazmak muhasebe hatasıdır;
      alacak sıfırlanır, fazlası ayrı bir iade konusudur. Üretilen kümede
      kasıtlı olarak fazla tahsilatlı kayıtlar var.
    */
    const eksi = reservations.filter((r) => BAKIYE.remaining(r) < 0);
    expect(eksi).toHaveLength(0);
  });

  it('toplam kalan, tek tek kalanların toplamına eşit', () => {
    const t = summarize(reservations, BAKIYE);
    const elle = reservations.reduce((s, r) => s + BAKIYE.remaining(r), 0);
    expect(t.remaining).toBe(elle);
  });
});

describe('summarize ham veriyle birebir', () => {
  it('adet, tutar ve kişi sayısı', () => {
    const t = summarize(reservations, BAKIYE);
    const ham = hamToplam(reservations);
    expect(t.count).toBe(ham.count);
    expect(t.total).toBe(ham.total);
    expect(t.guests).toBe(ham.guests);
  });

  it('tahsilat = kaporalar + ödeme satırları', () => {
    /*
      `totalPaid` KAPORAYI DA sayıyor (src/lib/money.ts): kapora ayrı bir
      ödeme satırı olarak yazılmıyor, rezervasyonun kendi alanında
      duruyor. Beklenen toplam bu yüzden ikisinin toplamı.
    */
    const t = summarize(reservations, BAKIYE);
    const kaporalar = reservations.reduce((s, r) => s + r.deposit, 0);
    const odemeler = payments.reduce((s, p) => s + p.amount, 0);
    expect(t.collected).toBe(kaporalar + odemeler);
  });
});

/**
 * Kırılım raporlarının hepsi aynı kümeyi böler. Her biri için:
 * satır toplamları = bütünün toplamı.
 */
describe('kırılım raporları kümeyi eksiksiz böler', () => {
  const butun = summarize(reservations, BAKIYE);

  const kirilimlar: [string, { count: number; total: number; guests: number }[]][] = [
    ['program', programReport(reservations, BAKIYE)],
    ['ay', monthReport(reservations, BAKIYE)],
    ['seans', slotReport(reservations, BAKIYE)],
    ['kanal', channelReport(reservations, BAKIYE)],
    ['il', ilRaporu(reservations, BAKIYE)],
    ['işletme', isletmeRaporu(reservations, BAKIYE, () => 'Demo Salon')],
    ['hafta', haftalikRapor(reservations, BAKIYE)],
  ];

  it.each(kirilimlar)('%s raporu: adet toplamı bütüne eşit', (_ad, satirlar) => {
    const toplam = satirlar.reduce((s, r) => s + r.count, 0);
    expect(toplam).toBe(butun.count);
  });

  it.each(kirilimlar)('%s raporu: tutar toplamı bütüne eşit', (_ad, satirlar) => {
    const toplam = satirlar.reduce((s, r) => s + r.total, 0);
    expect(toplam).toBe(butun.total);
  });

  it.each(kirilimlar)('%s raporu: kişi sayısı toplamı bütüne eşit', (_ad, satirlar) => {
    const toplam = satirlar.reduce((s, r) => s + r.guests, 0);
    expect(toplam).toBe(butun.guests);
  });
});

describe('bilerek SÜZEN raporlar', () => {
  /*
    Bu ikisi kümeyi bölmüyor, süzüyor. Bölüşüm değişmezine sokulmamalı;
    ama süzgecin doğru süzdüğü ayrıca sınanmalı -- yoksa süzgeç bozulup
    rapor boşaldığında kimse fark etmez.
  */
  it('tavsiye raporu yalnızca tavsiye/referans ile gelenleri alır', () => {
    const satirlar = tavsiyeRaporu(reservations, BAKIYE);
    const beklenen = reservations.filter(
      (r) => r.sourceChannel === 'Tavsiye' || r.sourceChannel === 'Referans',
    ).length;
    const toplam = satirlar.reduce((s, r) => s + r.count, 0);
    expect(toplam).toBe(beklenen);
    expect(beklenen).toBeGreaterThan(0);
  });

  it('bakiye raporu iptal edilenleri dışlar', () => {
    // Olmamış bir düğünün alacağı takip edilmez.
    const satirlar = balanceReport(reservations, BAKIYE, '2026-09-13');
    expect(satirlar.some((s) => s.reservation.status === 'İptal')).toBe(false);

    const iptalAlacakli = reservations.filter(
      (r) => r.status === 'İptal' && BAKIYE.remaining(r) > 0,
    ).length;
    // Dışlama gerçekten iş yapıyor olmalı, boş küme üzerinde değil.
    expect(iptalAlacakli).toBeGreaterThan(0);
  });
});

describe('boş bırakılmış alanlar kayboluyor mu', () => {
  it('ili girilmemiş kayıtlar Belirtilmemiş satırında toplanır', () => {
    const ilsiz = reservations.filter((r) => !r.city).length;
    const satir = ilRaporu(reservations, BAKIYE).find((s) => s.etiket === BELIRTILMEMIS);
    expect(satir?.count).toBe(ilsiz);
  });

  it('kanalı girilmemiş kayıtlar da bir satıra düşer', () => {
    const kanalsiz = reservations.filter((r) => !r.sourceChannel).length;
    const toplam = channelReport(reservations, BAKIYE).reduce((s, r) => s + r.count, 0);
    // Kanalsızlar düşürülseydi toplam eksik kalırdı.
    expect(toplam).toBe(reservations.length);
    expect(kanalsiz).toBeGreaterThan(0);
  });
});

describe('yıl/ay matrisi', () => {
  const satirlar = yilAyRaporu(reservations);

  it('her yılın 12 ay hücresi var', () => {
    satirlar.forEach((s) => expect(s.aylar).toHaveLength(12));
  });

  it('ay hücrelerinin toplamı yıl toplamına eşit', () => {
    satirlar.forEach((s) => {
      const adet = s.aylar.reduce((t, a) => t + a.count, 0);
      const tutar = s.aylar.reduce((t, a) => t + a.total, 0);
      expect(adet).toBe(s.toplam.count);
      expect(tutar).toBe(s.toplam.total);
    });
  });

  it('bütün yılların toplamı kümenin tamamı', () => {
    const adet = satirlar.reduce((t, s) => t + s.toplam.count, 0);
    expect(adet).toBe(reservations.length);
  });
});

describe('aylık tahsilat raporu', () => {
  const satirlar = tahsilatAyRaporu(payments);

  it('tutar toplamı ödemelerin toplamına eşit', () => {
    const toplam = satirlar.reduce((s, r) => s + r.tutar, 0);
    const ham = payments.reduce((s, p) => s + p.amount, 0);
    expect(toplam).toBe(ham);
  });

  it('adet toplamı ödeme satırı sayısına eşit', () => {
    const toplam = satirlar.reduce((s, r) => s + r.adet, 0);
    expect(toplam).toBe(payments.length);
  });

  it('ödeme tipi dağılımı ay toplamını verir', () => {
    // Tip kırılımı da bir bölüşüm: eksik ya da fazla sayarsa tutmaz.
    satirlar.forEach((s) => {
      const tipToplam = Object.values(s.tipler).reduce((t, v) => t + v, 0);
      expect(tipToplam).toBe(s.tutar);
    });
  });
});

describe('ciro / gider / kâr raporu', () => {
  it('iptal edilen organizasyonlar ciroya girmez', () => {
    const satirlar = karRaporu(reservations, BAKIYE, [], [], true);
    const ciro = satirlar.reduce((s, r) => s + r.ciro, 0);
    const beklenen = reservations
      .filter((r) => r.status !== 'İptal')
      .reduce((s, r) => s + r.totalAmount, 0);
    expect(ciro).toBe(beklenen);
  });

  it('kâr = ciro + diğer gelir − gider', () => {
    const giderler = expenses.map((g) => ({
      date: reservations.find((r) => r.id === g.reservationId)!.date,
      amount: g.unitCount * g.unitPrice,
    }));
    const satirlar = karRaporu(reservations, BAKIYE, cashFlow, giderler, true);
    satirlar.forEach((s) => {
      expect(s.kar).toBe(s.ciro + s.otherIncome - s.expense);
    });
  });

  it('kasa satırları doğru yöne yazılır', () => {
    const satirlar = karRaporu(reservations, BAKIYE, cashFlow, [], true);
    const gelir = satirlar.reduce((s, r) => s + r.otherIncome, 0);
    const gider = satirlar.reduce((s, r) => s + r.expense, 0);
    expect(gelir).toBe(cashFlow.filter((c) => c.kind === 'Gelir')
      .reduce((s, c) => s + c.amount, 0));
    expect(gider).toBe(cashFlow.filter((c) => c.kind === 'Gider')
      .reduce((s, c) => s + c.amount, 0));
  });

  it('aylık kırılımın toplamı yıllık kırılımla aynı', () => {
    // Aynı veri, iki farklı dönem anahtarı: toplamlar ayrışmamalı.
    const yillik = karRaporu(reservations, BAKIYE, cashFlow, [], true);
    const aylik = karRaporu(reservations, BAKIYE, cashFlow, [], false);
    const topla = (l: { ciro: number; expense: number }[]) => ({
      ciro: l.reduce((s, r) => s + r.ciro, 0),
      gider: l.reduce((s, r) => s + r.expense, 0),
    });
    expect(topla(aylik)).toEqual(topla(yillik));
  });
});

describe('ek gider raporu', () => {
  it('satır toplamı ham giderlerin toplamına eşit', () => {
    const satirlar = ekGiderRaporu(expenses);
    const toplam = satirlar.reduce((s, r) => s + r.tutar, 0);
    const ham = expenses.reduce((s, g) => s + g.unitCount * g.unitPrice, 0);
    expect(toplam).toBe(ham);
  });
});

describe('son aylar raporu', () => {
  it('istenen ay sayısı kadar kova döner', () => {
    const satirlar = lastMonthsReport(reservations, 6, '2026-06-15', BAKIYE);
    expect(satirlar).toHaveLength(6);
  });

  it('kovalar o aya ait kayıtları sayar', () => {
    const satirlar = lastMonthsReport(reservations, 6, '2026-06-15', BAKIYE);
    satirlar.forEach((s, i) => {
      // Kovanın kendi ayını ham veriden bağımsız sayıyoruz.
      const ay = new Date(2026, 5 - (satirlar.length - 1 - i), 1);
      const anahtar = `${ay.getFullYear()}-${String(ay.getMonth() + 1).padStart(2, '0')}`;
      const beklenen = reservations.filter((r) => r.date.startsWith(anahtar)).length;
      expect(s.count).toBe(beklenen);
    });
  });
});

describe('bakiye raporu', () => {
  it('yalnızca alacağı olan kayıtları listeler', () => {
    const satirlar = balanceReport(reservations, BAKIYE, '2026-09-13');
    satirlar.forEach((s) => expect(s.remaining).toBeGreaterThan(0));
  });

  it('iptal dışındaki alacaklı kayıtların hiçbiri atlanmaz', () => {
    const satirlar = balanceReport(reservations, BAKIYE, '2026-09-13');
    const beklenen = reservations.filter(
      (r) => r.status !== 'İptal' && BAKIYE.remaining(r) > 0,
    ).length;
    expect(satirlar).toHaveLength(beklenen);
  });
});

/* ===================================================================
   FARKLI VERİ KÜMELERİ

   Tek bir kümede tutan hesap, başka bir kümede tutmayabilir: bütün
   kayıtların iptal olduğu bir yıl, tek aya sıkışmış bir sezon, tamamı
   bedelsiz nikâhlardan oluşan bir liste. Aşağıdaki koşular aynı
   değişmezleri altı ayrı tohumda ve dört uç biçimde tekrar sınıyor.
   =================================================================== */

const TOHUMLAR = [1, 7, 99, 20250101, 20261231, 987654321];

describe.each(TOHUMLAR)('tohum %i ile üretilen kümede değişmezler', (tohum) => {
  const veri = demoUret({ tohum, adet: 250 });
  const bakiye = makeBalanceLookup(veri.payments);
  const butun = summarize(veri.reservations, bakiye);

  it('kalan alacak eksiye düşmez', () => {
    expect(veri.reservations.filter((r) => bakiye.remaining(r) < 0)).toHaveLength(0);
  });

  it('program kırılımı kümeyi eksiksiz böler', () => {
    const satirlar = programReport(veri.reservations, bakiye);
    expect(satirlar.reduce((s, r) => s + r.count, 0)).toBe(butun.count);
    expect(satirlar.reduce((s, r) => s + r.total, 0)).toBe(butun.total);
  });

  it('ay kırılımı kümeyi eksiksiz böler', () => {
    const satirlar = monthReport(veri.reservations, bakiye);
    expect(satirlar.reduce((s, r) => s + r.count, 0)).toBe(butun.count);
    expect(satirlar.reduce((s, r) => s + r.total, 0)).toBe(butun.total);
  });

  it('tahsilat raporu ödeme toplamını korur', () => {
    const satirlar = tahsilatAyRaporu(veri.payments);
    expect(satirlar.reduce((s, r) => s + r.tutar, 0))
      .toBe(veri.payments.reduce((s, p) => s + p.amount, 0));
  });

  it('kâr formülü her dönemde tutar', () => {
    const satirlar = karRaporu(veri.reservations, bakiye, veri.cashFlow, [], true);
    satirlar.forEach((s) => expect(s.kar).toBe(s.ciro + s.otherIncome - s.expense));
  });
});

describe('uç biçimli kümeler', () => {
  const bosBakiye = makeBalanceLookup([]);

  it('hiç kayıt yokken raporlar boş döner, çökmez', () => {
    expect(programReport([], bosBakiye)).toEqual([]);
    expect(monthReport([], bosBakiye)).toEqual([]);
    expect(ilRaporu([], bosBakiye)).toEqual([]);
    expect(yilAyRaporu([])).toEqual([]);
    expect(tahsilatAyRaporu([])).toEqual([]);
    expect(karRaporu([], bosBakiye, [], [], true)).toEqual([]);
    expect(summarize([], bosBakiye)).toEqual({
      count: 0, total: 0, collected: 0, remaining: 0, guests: 0,
    });
  });

  it('tek kayıtla da doğru çalışır', () => {
    const veri = demoUret({ tohum: 5, adet: 1 });
    const bakiye = makeBalanceLookup(veri.payments);
    const butun = summarize(veri.reservations, bakiye);
    expect(butun.count).toBe(veri.reservations.length);
    expect(programReport(veri.reservations, bakiye)
      .reduce((s, r) => s + r.count, 0)).toBe(butun.count);
  });

  it('tamamı tek aya sıkışmış sezonda ay raporu tek satır verir', () => {
    const veri = demoUret({ tohum: 11, adet: 120 });
    // Hepsini aynı aya çekiyoruz: yoğun bir sezon ayı.
    const tekAy = veri.reservations.map((r) => ({ ...r, date: `2026-06-${r.date.slice(8)}` }));
    const bakiye = makeBalanceLookup(veri.payments);
    const satirlar = monthReport(tekAy, bakiye);
    expect(satirlar).toHaveLength(1);
    expect(satirlar[0]!.count).toBe(tekAy.length);
  });

  it('tamamı iptal edilmiş kümede ciro sıfır, adet korunur', () => {
    const veri = demoUret({ tohum: 13, adet: 80 });
    const hepsiIptal = veri.reservations.map((r) => ({ ...r, status: 'İptal' as const }));
    const bakiye = makeBalanceLookup(veri.payments);

    // Kâr raporu iptalleri saymaz.
    expect(karRaporu(hepsiIptal, bakiye, [], [], true)
      .reduce((s, r) => s + r.ciro, 0)).toBe(0);

    // Program raporu SAYAR: "kaç iptal oldu" da bir sorudur.
    expect(programReport(hepsiIptal, bakiye)
      .reduce((s, r) => s + r.count, 0)).toBe(hepsiIptal.length);
  });

  it('tamamı bedelsiz kümede tutar sıfır, bölme hatası olmaz', () => {
    const veri = demoUret({ tohum: 17, adet: 60 });
    const bedelsiz = veri.reservations.map((r) => ({
      ...r, totalAmount: 0, deposit: 0,
    }));
    const bakiye = makeBalanceLookup([]);
    const butun = summarize(bedelsiz, bakiye);
    expect(butun.total).toBe(0);
    expect(butun.remaining).toBe(0);
    // Yüzde hesabı yapan raporlarda NaN/Infinity çıkmamalı.
    programReport(bedelsiz, bakiye).forEach((s) => {
      expect(Number.isFinite(s.total)).toBe(true);
      expect(Number.isFinite(s.collected)).toBe(true);
    });
  });
});

