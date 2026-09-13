/**
 * Hacimli ve ÇEŞİTLİ demo verisi üreticisi.
 *
 * `src/lib/seed.ts` ile karıştırılmamalı: oradaki tohum 15 kayıtlık,
 * küçük ve DEĞERLERİ SABİT -- birçok uçtan uca test o rakamlara
 * dayanıyor, dolayısıyla büyütülemez. Bu dosya ayrı duruyor ve yalnızca
 * doğrulama koşularında kullanılıyor.
 *
 * NEDEN HACİM GEREKİYOR. Tek kayıtla görünmeyen hatalar var: bir ayda
 * hiç rezervasyon olmaması, aynı güne iki seans düşmesi, kaporası
 * tutarından büyük bir kayıt, tamamı iptal olmuş bir ay, tahsilatı
 * tutarını aşan bir rezervasyon. Rapor hesapları bunların hepsinde
 * doğru sonuç vermeli.
 *
 * ÜRETİM RASTGELE AMA TEKRARLANABİLİR. Sabit tohumlu bir sayı üreteci
 * kullanılıyor: aynı tohum her koşuda aynı veriyi veriyor, bu yüzden bir
 * hata çıktığında yeniden üretilebiliyor.
 */
import type {
  CashFlowEntry, CustomerLead, OrganizationType, Payment, PaymentMethod,
  Reservation, ReservationExpense, ReservationStatus, SessionSlot,
} from '../../types';

/** Tekrarlanabilir sözde rastgele üreteç (mulberry32). */
export function uretec(tohum: number): () => number {
  let t = tohum >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

const ORGANIZASYONLAR: OrganizationType[] = [
  'Düğün', 'Nişan', 'Kına', 'Sünnet', 'Nikâh', 'Doğum Günü', 'Kokteyl',
  'Toplantı', 'Konferans', 'Diğer',
];
const DURUMLAR: ReservationStatus[] = [
  'Ön Rezervasyon', 'Kesin Rezervasyon', 'Tamamlandı', 'İptal',
];
const SEANSLAR: SessionSlot[] = ['Gündüz', 'Gece'];
const ODEME_TIPLERI: PaymentMethod[] = [
  'Nakit', 'Kredi Kartı', 'Havale/EFT', 'Çek', 'Senet',
];
const ILLER: [string, string][] = [
  ['Konya', 'Meram'], ['Konya', 'Selçuklu'], ['Ankara', 'Çankaya'],
  ['İstanbul', 'Kadıköy'], ['İzmir', 'Bornova'], ['Antalya', 'Muratpaşa'],
];
const KANALLAR = ['Instagram', 'Referans', 'Tabela', 'Google', 'WhatsApp', 'Diğer'];
const ADLAR = [
  'Ahmet', 'Elif', 'Mehmet', 'Zeynep', 'Burak', 'Selin', 'Emre', 'Hatice',
  'Yusuf', 'Merve', 'Kerem', 'Ayşe', 'Volkan', 'Fatma', 'Ali', 'Ceren',
];
const SOYADLAR = [
  'Yılmaz', 'Kaya', 'Demir', 'Çelik', 'Arslan', 'Aydın', 'Şahin', 'Koç',
  'Öztürk', 'Doğan', 'Polat', 'Taş', 'Aksoy', 'Güneş',
];

export interface UretimAyari {
  tohum?: number;
  businessId?: string;
  hallIds?: string[];
  /** Kaç rezervasyon üretilsin. */
  adet?: number;
  /** Rezervasyonların yayılacağı yıllar. */
  yillar?: number[];
}

export interface DemoVeri {
  reservations: Reservation[];
  payments: Payment[];
  cashFlow: CashFlowEntry[];
  expenses: ReservationExpense[];
  leads: CustomerLead[];
}

function iki(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Veriyi üretir.
 *
 * UÇ DURUMLAR KASITLI olarak serpiştiriliyor; rapor hesapları bunlarda
 * da doğru çalışmalı:
 *   - tahsilatı hiç olmayan rezervasyon
 *   - tutarının tamamı tahsil edilmiş rezervasyon
 *   - FAZLA tahsilat (kalan eksiye düşmemeli)
 *   - kaporası tutarına eşit rezervasyon
 *   - tutarı sıfır olan kayıt (bedelsiz nikâh)
 *   - iptal edilmiş, tahsilatı duran kayıt
 *   - ili/kanalı boş bırakılmış kayıt ("Belirtilmemiş" kırılımı)
 */
export function demoUret(ayar: UretimAyari = {}): DemoVeri {
  const {
    tohum = 20260913,
    businessId = 'biz_demo',
    hallIds = ['hall_demo_1', 'hall_demo_2', 'hall_demo_3'],
    adet = 480,
    yillar = [2024, 2025, 2026],
  } = ayar;

  const rnd = uretec(tohum);
  const sec = <T,>(liste: T[]): T => liste[Math.floor(rnd() * liste.length)]!;
  const tam = (alt: number, ust: number) => alt + Math.floor(rnd() * (ust - alt + 1));

  const reservations: Reservation[] = [];
  const payments: Payment[] = [];
  const cashFlow: CashFlowEntry[] = [];
  const expenses: ReservationExpense[] = [];
  const leads: CustomerLead[] = [];

  // Aynı salon + gün + seans ikinci kez kullanılamaz (veritabanındaki
  // benzersizlik kuralı); üretim de bunu bozmamalı, yoksa gerçek
  // veritabanına yüklenemez.
  const dolu = new Set<string>();

  for (let i = 0; i < adet; i += 1) {
    const yil = sec(yillar);
    const ay = tam(1, 12);
    const gun = tam(1, 28);
    const date = `${yil}-${iki(ay)}-${iki(gun)}`;
    const hallId = sec(hallIds);
    const slot = sec(SEANSLAR);

    const anahtar = `${hallId}|${date}|${slot}`;
    if (dolu.has(anahtar)) continue;
    dolu.add(anahtar);

    const organizationType = sec(ORGANIZASYONLAR);
    const status = sec(DURUMLAR);
    const guestCount = tam(40, 600);

    // Tutar: her 40. kayıt bedelsiz (nikâh), gerisi organizasyona göre.
    const bedelsiz = i % 40 === 0;
    const totalAmount = bedelsiz ? 0 : tam(20, 400) * 1000;

    // Kapora: bazen tutara eşit, bazen sıfır.
    const kaporaTipi = i % 7;
    const deposit = bedelsiz ? 0
      : kaporaTipi === 0 ? 0
      : kaporaTipi === 1 ? totalAmount
      : Math.round(totalAmount * (0.1 + rnd() * 0.3));

    const ilVar = i % 11 !== 0;
    const [city, district] = ilVar ? sec(ILLER) : ['', ''];
    const kanalVar = i % 9 !== 0;

    const ad = `${sec(ADLAR)} ${sec(SOYADLAR)}`;
    const id = `rez_${i}`;

    reservations.push({
      id,
      businessId,
      hallId,
      code: `DMO${String(i).padStart(5, '0')}`,
      customerName: ad,
      customerPhone: `53${String(10000000 + i).slice(0, 8)}`,
      date,
      slot,
      organizationType,
      guestCount,
      totalAmount,
      deposit,
      depositMethod: deposit > 0 ? sec(ODEME_TIPLERI) : undefined,
      currency: 'TL',
      status,
      colorKey: 'dugun',
      services: [],
      city: city || undefined,
      district: district || undefined,
      sourceChannel: kanalVar ? sec(KANALLAR) : undefined,
      createdAt: `${date}T09:00:00.000Z`,
      updatedAt: `${date}T09:00:00.000Z`,
    } as Reservation);

    /*
      Tahsilatlar. İptal edilmiş kayıtlara da tahsilat yazılıyor: gerçek
      hayatta kapora alınıp sonra iptal ediliyor ve raporun bunu doğru
      göstermesi gerekiyor.
    */
    const kalanHedef = Math.max(totalAmount - deposit, 0);
    const tahsilatTipi = i % 6;
    let tahsilEdilen = 0;

    if (tahsilatTipi === 0) {
      tahsilEdilen = 0;                       // hiç tahsilat yok
    } else if (tahsilatTipi === 1) {
      tahsilEdilen = kalanHedef;              // tamamı tahsil edildi
    } else if (tahsilatTipi === 2) {
      tahsilEdilen = kalanHedef + 5_000;      // FAZLA tahsilat
    } else {
      tahsilEdilen = Math.round(kalanHedef * (0.2 + rnd() * 0.6));
    }

    if (tahsilEdilen > 0) {
      const parca = tam(1, 3);
      const birim = Math.floor(tahsilEdilen / parca);
      for (let p = 0; p < parca; p += 1) {
        const tutar = p === parca - 1 ? tahsilEdilen - birim * (parca - 1) : birim;
        if (tutar <= 0) continue;
        payments.push({
          id: `ode_${i}_${p}`,
          reservationId: id,
          date: `${yil}-${iki(ay)}-${iki(Math.min(gun + p, 28))}`,
          amount: tutar,
          method: sec(ODEME_TIPLERI),
          note: undefined,
          createdAt: `${date}T10:00:00.000Z`,
        } as Payment);
      }
    }

    // Düğün içi giderler: her üçüncü kayıtta.
    if (i % 3 === 0) {
      expenses.push({
        id: `gid_${i}`,
        businessId,
        reservationId: id,
        kind: sec(['Garson', 'Müzik', 'Fotoğraf', 'Süsleme']),
        unitCount: tam(1, 12),
        unitPrice: tam(500, 4000),
        note: '',
        createdAt: `${date}T11:00:00.000Z`,
        updatedAt: `${date}T11:00:00.000Z`,
      });
    }
  }

  // Kasa hareketleri: rezervasyondan bağımsız gelir/gider satırları.
  for (let i = 0; i < 160; i += 1) {
    const yil = sec(yillar);
    const ay = tam(1, 12);
    const gun = tam(1, 28);
    cashFlow.push({
      id: `kasa_${i}`,
      businessId,
      kind: i % 3 === 0 ? 'Gelir' : 'Gider',
      date: `${yil}-${iki(ay)}-${iki(gun)}`,
      category: sec(['Personel Maaş', 'Elektrik', 'Doğalgaz', 'Bakım', 'Kira', 'Diğer']),
      amount: tam(1, 60) * 1000,
      method: sec(ODEME_TIPLERI),
      description: 'Demo kaydı',
      createdAt: `${yil}-${iki(ay)}-${iki(gun)}T12:00:00.000Z`,
    } as CashFlowEntry);
  }

  // Müşteri adayları: dönüşüm raporu için karışık durumlar.
  for (let i = 0; i < 90; i += 1) {
    const yil = sec(yillar);
    const ay = tam(1, 12);
    const gun = tam(1, 28);
    const acilis = `${yil}-${iki(ay)}-${iki(gun)}T08:00:00.000Z`;
    leads.push({
      id: `aday_${i}`,
      businessId,
      name: `${sec(ADLAR)} ${sec(SOYADLAR)}`,
      phone: `54${String(20000000 + i).slice(0, 8)}`,
      email: '',
      // Kişi sayısı ve tarih bilinmiyor olabilir: ilk görüşmede çoğu
      // zaman bilinmiyor ve uydurulmuş bir değer rapordan daha kötüdür.
      guestCount: i % 4 === 0 ? null : tam(50, 500),
      eventDate: i % 5 === 0 ? '' : `${yil + 1}-${iki(tam(1, 12))}-${iki(tam(1, 28))}`,
      eventDateText: i % 5 === 0 ? 'Mayısın ilk haftası' : '',
      organizationType: sec(ORGANIZASYONLAR),
      source: 'WhatsApp',
      sourceDetail: '',
      status: sec(['yeni', 'gorusuldu', 'teklif', 'kazanildi', 'kaybedildi']),
      nextFollowupAt: '',
      lastContactAt: acilis,
      requestText: '',
      note: '',
      createdAt: acilis,
      updatedAt: acilis,
    });
  }

  return { reservations, payments, cashFlow, expenses, leads };
}
