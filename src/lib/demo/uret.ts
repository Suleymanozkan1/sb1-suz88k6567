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
  CashFlowEntry, CustomerLead, LeadChannel, OrganizationType, Payment, PaymentMethod,
  Reservation, ReservationExpense, ReservationStatus, SessionSlot,
} from '../../types';
import { VARSAYILAN_LEAD_DURUMLARI } from '../../types';
import {
  ESKI_LEAD_CHANNELS, EXPENSE_CATEGORIES, INCOME_CATEGORIES, LEAD_CHANNELS,
} from '../../data/constants';

/**
 * Tanıtım adaylarının durum kodları.
 *
 * Tek gerçek kaynak `VARSAYILAN_LEAD_DURUMLARI`: kodlar burada elle
 * yazılsaydı liste değiştiğinde tohum sessizce eskir ve ürettiği adaylar
 * hiçbir durum kutusuna düşmezdi -- tam olarak bir kez yaşanan hata bu.
 */
const LEAD_DURUM_KODLARI = VARSAYILAN_LEAD_DURUMLARI.map((d) => d.code);

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
/*
  KANALLAR TANIMLI LİSTEDEN GELİYOR, elle yazılmıyor.

  Burada düz bir dizi vardı ve içinde 'Tabela' geçiyordu -- ne
  `LEAD_CHANNELS` listesinde ne de veritabanındaki `lead_channel`
  türünde böyle bir değer var. Dizi `string[]` olduğu için derleyici de
  susuyordu. Tarayıcı deposu doğrulama yapmadığından tanıtım kipinde
  yıllarca sorun çıkarmadı; aynı veri veritabanına yazılmak istendiğinde
  "invalid input value for enum lead_channel" ile durdu.

  Artık tip `LeadChannel[]`: listede olmayan bir değer yazıldığında
  derleme düşüyor. Eski kanallar da katılıyor, çünkü tanıtım verisi
  gerçek bir kayıt havuzunu taklit ediyor ve orada eski kayıtlar da var.
*/
const KANALLAR: LeadChannel[] = [...LEAD_CHANNELS, ...ESKI_LEAD_CHANNELS];
/** "Diğer" kanalının açıklaması; kısıt boş bırakılmasına izin vermiyor. */
const DIGER_KANAL_ACIKLAMALARI = ['Tabela', 'Fuar', 'Tanıdık esnaf', 'Gazete ilanı'];
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
  /**
   * Sabit yıllar yerine BUGÜNE GÖRE bir pencere.
   *
   * Demo sitesinde takvimin ve "yaklaşan organizasyonlar" listesinin dolu
   * görünmesi için tarihlerin bugünün etrafında olması gerekiyor; sabit
   * yıllar verildiğinde tanıtım ekranı zamanla geçmişe kayıyor.
   */
  pencere?: { baslangicGun: number; bitisGun: number; bugun?: Date };
  /**
   * Bu salon+gün+seans üçlüleri DOLU sayılır ve üretilmez.
   *
   * Demo tohumunun elle yazılmış kayıtlarıyla çakışmamak için:
   * veritabanında aynı salonda aynı gün aynı seans ikinci kez
   * kullanılamıyor, üretilen veri de bunu bozmamalı.
   */
  dolular?: Iterable<string>;
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
    pencere,
    dolular,
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
  const dolu = new Set<string>(dolular ?? []);

  /*
    ZAMAN TUTARLILIĞI. Sözleşme düğünden ÖNCE imzalanır ve para ancak
    tahsil edildiği gün kasaya girer. Üretilen kayıtta bu sıra bozulursa
    ileri tarihli bir düğünün kaporası "bugün kasada duran para" gibi
    görünür ve kasa dağılımı ile gelir raporu gerçekte olmayan parayı
    sayar. Aşağıdaki iki yardımcı, üretilen her tarihi bu sıraya sokuyor.
  */
  const BUGUN = pencere?.bugun ?? new Date();
  const bugunIso = `${BUGUN.getFullYear()}-${iki(BUGUN.getMonth() + 1)}-${iki(BUGUN.getDate())}`;

  const isoYaz = (g: Date): string =>
    `${g.getFullYear()}-${iki(g.getMonth() + 1)}-${iki(g.getDate())}`;

  /** `iso` gününe `gun` ekler. */
  const gunEkle = (iso: string, gun: number): string => {
    const g = new Date(`${iso}T00:00:00Z`);
    g.setUTCDate(g.getUTCDate() + gun);
    return isoYaz(new Date(g.getUTCFullYear(), g.getUTCMonth(), g.getUTCDate()));
  };

  /** İki gün arasındaki fark (gün). */
  const gunFarki = (a: string, b: string): number =>
    Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

  /** Pencere verildiyse bugüne göre bir gün seçer. */
  const pencereGunu = (): string => {
    const { baslangicGun, bitisGun, bugun = new Date() } = pencere!;
    const kayma = baslangicGun + Math.floor(rnd() * (bitisGun - baslangicGun + 1));
    const g = new Date(bugun);
    g.setDate(g.getDate() + kayma);
    return `${g.getFullYear()}-${iki(g.getMonth() + 1)}-${iki(g.getDate())}`;
  };

  for (let i = 0; i < adet; i += 1) {
    const date = pencere ? pencereGunu() : `${sec(yillar)}-${iki(tam(1, 12))}-${iki(tam(1, 28))}`;
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
    const kanal = kanalVar ? sec(KANALLAR) : undefined;

    const ad = `${sec(ADLAR)} ${sec(SOYADLAR)}`;
    const id = `rez_${i}`;

    /*
      Sözleşme günü: düğünden 2-14 ay önce, ama hiçbir zaman bugünden
      sonra. İleri tarihli düğünlerde sözleşme yakın geçmişe düşüyor --
      henüz imzalanmamış bir sözleşme üretilmemeli.
    */
    const onceGun = tam(60, 420);
    const hamSozlesme = gunEkle(date, -onceGun);
    const sozlesmeGunu = hamSozlesme > bugunIso
      ? gunEkle(bugunIso, -tam(0, 90))
      : hamSozlesme;

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
      /*
        "Diğer" seçildiğinde AÇIKLAMA DA yazılıyor. Veritabanı bunu
        kısıtla şart koşuyor (`reservations_source_detail_required`) ve
        sebebi haklı: raporda "Diğer 23 kayıt" satırını görüp içine
        bakamamak, alanı hiç tutmamakla aynı kapıya çıkıyor. Tanıtım
        verisi bu kuralı çiğniyordu; tarayıcı deposu kısıt uygulamadığı
        için fark edilmemişti.
      */
      sourceChannel: kanal,
      sourceDetail: kanal === 'Diğer' ? sec(DIGER_KANAL_ACIKLAMALARI) : undefined,
      createdAt: `${sozlesmeGunu}T09:00:00.000Z`,
      updatedAt: `${sozlesmeGunu}T09:00:00.000Z`,
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
      /*
        Ara ödemeler sözleşme günü ile düğün günü arasına serpiliyor,
        ama bugünü geçmiyor: henüz alınmamış para kasada görünmemeli.
        İleri tarihli düğünlerde bu aralık sözleşme günü ile bugün arası
        oluyor.
      */
      const sonGun = date < bugunIso ? date : bugunIso;
      const aralik = Math.max(gunFarki(sozlesmeGunu, sonGun), 0);
      const parca = tam(1, 3);
      const birim = Math.floor(tahsilEdilen / parca);
      for (let p = 0; p < parca; p += 1) {
        const tutar = p === parca - 1 ? tahsilEdilen - birim * (parca - 1) : birim;
        if (tutar <= 0) continue;
        const odemeGunu = gunEkle(sozlesmeGunu, Math.round((aralik * (p + 1)) / (parca + 1)));
        payments.push({
          id: `ode_${i}_${p}`,
          reservationId: id,
          date: odemeGunu,
          amount: tutar,
          method: sec(ODEME_TIPLERI),
          note: undefined,
          createdAt: `${odemeGunu}T10:00:00.000Z`,
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
        createdAt: `${sozlesmeGunu}T11:00:00.000Z`,
        updatedAt: `${sozlesmeGunu}T11:00:00.000Z`,
      });
    }
  }

  /*
    Kasa hareketleri: rezervasyondan bağımsız gelir/gider satırları.
    Tarihleri son iki yıl ile bugün arasında: elektrik faturası da maaş da
    ödendiği gün deftere girer, ileri tarihli kasa satırı olmaz.
  */
  for (let i = 0; i < 160; i += 1) {
    /*
      KATEGORİ, SATIRIN TÜRÜNDEN GELİYOR.

      Önce tek bir elle yazılmış liste vardı ve türe bakılmadan
      seçiliyordu: gelir satırlarına "Elektrik", "Kira", "Personel Maaş"
      yazılıyordu. Üstelik adlar da tutmuyordu -- "Doğalgaz" (tanımlı ad
      "Doğal gaz"), "Bakım" ("Bakım Onarım"), "Diğer" ("Diğer Gider").

      Sonuç sessizdi: Kasa ekranının kategori süzgeci bu adları hiç
      göstermiyor, gelir/gider raporu kalemi yanlış tarafa topluyordu.
      Artık liste tek gerçek kaynaktan geliyor ve tür değişirse kategori
      de kendiliğinden doğru taraftan seçiliyor.
    */
    const kind: CashFlowEntry['kind'] = i % 3 === 0 ? 'Gelir' : 'Gider';
    cashFlow.push({
      id: `kasa_${i}`,
      businessId,
      kind,
      date: gunEkle(bugunIso, -tam(0, 730)),
      category: sec(kind === 'Gelir' ? [...INCOME_CATEGORIES] : [...EXPENSE_CATEGORIES]),
      amount: tam(1, 60) * 1000,
      method: sec(ODEME_TIPLERI),
      description: 'Demo kaydı',
      createdAt: `${gunEkle(bugunIso, -tam(0, 730))}T12:00:00.000Z`,
    } as CashFlowEntry);
  }

  /*
    Müşteri adayları: dönüşüm raporu için karışık durumlar. Aday kaydı
    geçmişte açılır, sorduğu tarih ise ileridedir -- tersi bir kayıt
    dönüşüm raporunda anlamsız bir satır olurdu.
  */
  for (let i = 0; i < 90; i += 1) {
    const acilisGunu = gunEkle(bugunIso, -tam(0, 540));
    const acilis = `${acilisGunu}T08:00:00.000Z`;
    leads.push({
      id: `aday_${i}`,
      businessId,
      name: `${sec(ADLAR)} ${sec(SOYADLAR)}`,
      phone: `54${String(20000000 + i).slice(0, 8)}`,
      email: '',
      // Kişi sayısı ve tarih bilinmiyor olabilir: ilk görüşmede çoğu
      // zaman bilinmiyor ve uydurulmuş bir değer rapordan daha kötüdür.
      guestCount: i % 4 === 0 ? null : tam(50, 500),
      eventDate: i % 5 === 0 ? '' : gunEkle(acilisGunu, tam(60, 500)),
      eventDateText: i % 5 === 0 ? 'Mayısın ilk haftası' : '',
      organizationType: sec(ORGANIZASYONLAR),
      source: 'WhatsApp',
      sourceDetail: '',
      /*
        Durum kodları TANIMLI LİSTEDEN seçiliyor, elle yazılmıyor.

        Burada `gorusuldu`, `teklif`, `kazanildi`, `kaybedildi` yazılıydı;
        hiçbiri `VARSAYILAN_LEAD_DURUMLARI` içinde yok. Sonuç: 93 adayın
        74'ü hiçbir durum kutusuna düşmüyor, özet ekranı "Toplam 93" deyip
        kutularda 19 gösteriyordu. Liste tek yerden geldiği için kod
        değişirse tohum da kendiliğinden uyuyor.
      */
      status: sec(LEAD_DURUM_KODLARI),
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
