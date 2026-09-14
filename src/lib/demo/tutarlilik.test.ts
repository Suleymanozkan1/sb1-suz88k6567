import { beforeEach, describe, expect, it } from 'vitest';
import { seedIfEmpty } from '../seed';
import { clearAll, KEYS, read } from '../storage';
import { leadOzeti, toplamAday } from '../lead';
import { localRepo } from '../repo/local';
import {
  LEAD_SOURCES, LEAD_STATUS_TONES, VARSAYILAN_LEAD_DURUMLARI,
  HIZMET_KATEGORILERI, URUN_KATEGORILERI, ODEME_OLAYLARI,
} from '../../types';
import type {
  CashFlowEntry, CustomerLead, Payment, Reservation, ReservationExpense,
  ReservationVendor, SpecialDay, Vendor,
} from '../../types';
import {
  EXPENSE_CATEGORIES, INCOME_CATEGORIES, ORGANIZATION_TYPES, PAYMENT_METHODS,
} from '../../data/constants';

/**
 * Tanıtım verisi TUTARLILIK denetimi.
 *
 * NEDEN VAR. Tanıtım verisi, kod içinde elle yazılmış metinlerle
 * üretiliyor: durum kodu, organizasyon türü, ödeme tipi, kategori. Bu
 * metinlerin her biri başka bir yerdeki tanımlı listeyle EŞLEŞMEK
 * ZORUNDA, ama derleyici bunu görmüyor -- ikisi de sadece `string`.
 *
 * Bir kez tam olarak bu yüzden hata çıktı: tohum `gorusuldu`, `teklif`,
 * `kazanildi`, `kaybedildi` durumlarını üretiyordu ve hiçbiri tanımlı
 * listede yoktu. Özet ekranı "Toplam 93 müşteri adayı" diyor, kutularda
 * 19 gösteriyordu; aradaki 74 kayıt hiçbir yerde görünmüyordu. Ekranda
 * hata mesajı yoktu, testler geçiyordu -- yalnızca rakamlar tutmuyordu.
 *
 * Bu dosya o sınıfı KAPATIYOR: tek tek hataları değil, "üretilen değer
 * tanımlı listede yok" durumunun kendisini yakalıyor. Yeni bir alan
 * eklendiğinde buraya bir satır eklemek, aynı hatayı bir daha yaşamaktan
 * ucuz.
 */

const BIZ = 'biz_demo';

/** Bir alanın bütün değerleri izin verilen kümede mi? */
function hepsiIcinde<T>(
  kayitlar: T[], alan: (k: T) => string, izinli: readonly string[], ad: string,
) {
  const disarida = [...new Set(
    kayitlar.map(alan).filter((d) => d !== '' && !izinli.includes(d)),
  )];
  expect(disarida, `${ad}: tanımlı listede olmayan değer(ler)`).toEqual([]);
}

describe('tanıtım verisi tanımlı listelerin dışına çıkmıyor', () => {
  beforeEach(() => {
    clearAll();
    seedIfEmpty();
  });

  it('rezervasyon: tür, seans ve durum', () => {
    const liste = read<Reservation[]>(KEYS.reservations, []);
    expect(liste.length).toBeGreaterThan(0);

    hepsiIcinde(liste, (r) => r.organizationType, ORGANIZATION_TYPES, 'organizationType');
    hepsiIcinde(liste, (r) => r.slot, ['Gündüz', 'Gece'], 'slot');
    hepsiIcinde(
      liste, (r) => r.status,
      ['Ön Rezervasyon', 'Kesin Rezervasyon', 'Tamamlandı', 'İptal'], 'status',
    );
    hepsiIcinde(liste, (r) => r.depositMethod ?? '', PAYMENT_METHODS, 'depositMethod');
  });

  it('tahsilat: ödeme tipi', () => {
    const liste = read<Payment[]>(KEYS.payments, []);
    expect(liste.length).toBeGreaterThan(0);
    hepsiIcinde(liste, (p) => p.method, PAYMENT_METHODS, 'payment.method');
  });

  it('gelir/gider: tür, kategori ve ödeme tipi', () => {
    const liste = read<CashFlowEntry[]>(KEYS.cashflow, []);
    expect(liste.length).toBeGreaterThan(0);

    hepsiIcinde(liste, (e) => e.kind, ['Gelir', 'Gider'], 'cashFlow.kind');
    /*
      Ödeme tipi listesi KASA_KANALLARI değil PAYMENT_METHODS: kasa formu
      çek ve seneti de sunuyor. İkisi kasa TOPLAMINA girmiyor (henüz
      tahsil edilmemiş bir vaat), ama defterde satırı var.
    */
    hepsiIcinde(liste, (e) => e.method ?? '', PAYMENT_METHODS, 'cashFlow.method');

    // Kategori, kaydın türüne göre AYRI listeden geliyor: gelir satırında
    // gider kategorisi yazsaydı rapor kalemi yanlış tarafa toplardı.
    hepsiIcinde(
      liste.filter((e) => e.kind === 'Gelir'), (e) => e.category,
      INCOME_CATEGORIES, 'gelir kategorisi',
    );
    hepsiIcinde(
      liste.filter((e) => e.kind === 'Gider'), (e) => e.category,
      EXPENSE_CATEGORIES, 'gider kategorisi',
    );
  });

  it('müşteri adayı: durum kodu ve kaynak', () => {
    const liste = read<CustomerLead[]>(KEYS.leads, []);
    expect(liste.length).toBeGreaterThan(0);

    const kodlar = VARSAYILAN_LEAD_DURUMLARI.map((d) => d.code);
    hepsiIcinde(liste, (l) => l.status, kodlar, 'lead.status');
    hepsiIcinde(liste, (l) => l.source, LEAD_SOURCES, 'lead.source');
  });

  it('tedarikçi: tür ve kategori', () => {
    const liste = read<Vendor[]>(KEYS.vendors, []);
    expect(liste.length).toBeGreaterThan(0);

    hepsiIcinde(liste, (v) => v.kind, ['hizmet', 'urun'], 'vendor.kind');
    hepsiIcinde(
      liste, (v) => v.category,
      [...HIZMET_KATEGORILERI, ...URUN_KATEGORILERI],
      'vendor.category',
    );
  });

  it('ödeme olayı: olay türü', () => {
    const liste = read<{ event: string }[]>(KEYS.paymentEvents, []);
    if (liste.length === 0) return;
    hepsiIcinde(liste, (o) => o.event, ODEME_OLAYLARI, 'paymentEvent.kind');
  });

  it('özel gün: tür ve kaynak', () => {
    const liste = read<SpecialDay[]>(KEYS.specialDays, []);
    expect(liste.length).toBeGreaterThan(0);

    hepsiIcinde(
      liste, (g) => g.kind,
      ['resmi_tatil', 'dini_bayram', 'arife', 'kandil', 'okul', 'ozel'], 'specialDay.kind',
    );
    hepsiIcinde(liste, (g) => g.source ?? '', ['tohum', 'saglayici', 'isletme'], 'specialDay.source');
  });

  it('durum tanımlarının tonu tanımlı listede', () => {
    hepsiIcinde(
      VARSAYILAN_LEAD_DURUMLARI.map((d) => ({ t: d.tone })), (d) => d.t,
      LEAD_STATUS_TONES, 'leadStatus.tone',
    );
  });
});

/**
 * EKRANLARDAKİ RAKAMLAR BİRBİRİNİ TUTUYOR MU.
 *
 * Yukarıdaki testler "değer tanımlı mı" diye soruyor; buradakiler
 * "toplam, parçaların toplamına eşit mi" diye. İkisi ayrı hata sınıfı:
 * değerin tanımlı olması, ekranda doğru sayıldığı anlamına gelmiyor.
 */
describe('özet rakamları parçalarıyla tutarlı', () => {
  beforeEach(() => {
    clearAll();
    seedIfEmpty();
  });

  it('müşteri adayı toplamı durum kutularının toplamına eşit', async () => {
    const adaylar = read<CustomerLead[]>(KEYS.leads, []);
    const durumlar = await localRepo.listLeadStatuses(BIZ);
    const kutular = leadOzeti(adaylar, durumlar);

    /*
      "Bugün aranacak" ve "Geciken takip" kutuları ALT KÜME, parça değil:
      bir aday hem "Yeni" hem "bugün aranacak" olabilir. Toplamı
      karşılaştırırken yalnızca durum kutuları sayılıyor.
    */
    const durumKutulari = kutular.filter((k) => k.durumKodu || k.anahtar === 'tanimsiz');
    const kutuToplami = durumKutulari.reduce((t, k) => t + k.deger, 0);

    expect(kutuToplami, 'kutuların toplamı ekrandaki toplamı tutmalı')
      .toBe(toplamAday(adaylar));
  });

  it('tanımsız durumda aday kalmadı', () => {
    // Tohum artık tanımlı listeden seçiyor; kutu hiç çıkmamalı.
    const adaylar = read<CustomerLead[]>(KEYS.leads, []);
    const kodlar = new Set(VARSAYILAN_LEAD_DURUMLARI.map((d) => d.code));
    expect(adaylar.filter((l) => !kodlar.has(l.status))).toEqual([]);
  });

  it('rezervasyon tedarikçileri var olan rezervasyona ve tedarikçiye bağlı', () => {
    const atamalar = read<ReservationVendor[]>(KEYS.resVendors, []);
    const rezIds = new Set(read<Reservation[]>(KEYS.reservations, []).map((r) => r.id));
    const vendorIds = new Set(read<Vendor[]>(KEYS.vendors, []).map((v) => v.id));

    expect(atamalar.filter((rv) => !rezIds.has(rv.reservationId)), 'öksüz tedarikçi ataması')
      .toEqual([]);
    expect(atamalar.filter((rv) => !vendorIds.has(rv.vendorId)), 'var olmayan tedarikçi')
      .toEqual([]);
  });

  it('tahsilat ve gider satırları var olan rezervasyona bağlı', () => {
    const rezIds = new Set(read<Reservation[]>(KEYS.reservations, []).map((r) => r.id));

    expect(
      read<Payment[]>(KEYS.payments, []).filter((p) => !rezIds.has(p.reservationId)),
      'öksüz tahsilat',
    ).toEqual([]);
    expect(
      read<ReservationExpense[]>(KEYS.reservationExpenses, [])
        .filter((g) => !rezIds.has(g.reservationId)),
      'öksüz düğün içi gider',
    ).toEqual([]);
  });
});
