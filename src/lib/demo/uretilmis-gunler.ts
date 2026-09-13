/**
 * ÜRETİLMİŞ DOSYA -- ELLE DÜZENLEMEYİN.
 *
 * `npm run demo:veri` ile yeniden üretilir. İçerik, canlıdaki
 * zamanlanmış görevlerin kullandığı kaynaklardan çekilmiştir:
 *   - Resmî tatil ve dini bayram: date.nager.at
 *   - Kandil: api.aladhan.com (bayram tarihiyle çapraz doğrulanmış)
 *   - Okul takvimi: meb.gov.tr duyuruları
 *
 * Demo modunda zamanlanmış görev çalışmadığı için takvim bu dosyadan
 * doluyor. Gerçek kurulumda bu dosya KULLANILMIYOR; veriyi görevler
 * veritabanına yazıyor.
 *
 * Üretim tarihi: 2026-09-13
 * Kapsanan yıllar: 2025, 2026, 2027, 2028, 2029
 */
import type { SpecialDay } from '../../types';

type UretilmisGun = Pick<SpecialDay, 'day' | 'label' | 'kind'> & { tentative?: boolean };

export const URETIM_TARIHI = '2026-09-13';

export const URETILMIS_GUNLER: UretilmisGun[] = [
  {
    day: "2025-01-01",
    label: "Yılbaşı",
    kind: "resmi_tatil",
    tentative: false
  },
  {
    day: "2025-01-26",
    label: "Miraç Kandili",
    kind: "kandil",
    tentative: true
  },
  {
    day: "2025-02-13",
    label: "Berat Kandili",
    kind: "kandil",
    tentative: true
  },
  {
    day: "2025-03-26",
    label: "Kadir Gecesi",
    kind: "kandil",
    tentative: true
  },
  {
    day: "2025-03-29",
    label: "Ramazan Bayramı arifesi",
    kind: "arife",
    tentative: false
  },
  {
    day: "2025-03-30",
    label: "Ramazan Bayramı 1. Gün",
    kind: "dini_bayram",
    tentative: false
  },
  {
    day: "2025-03-31",
    label: "Ramazan Bayramı 2. Gün",
    kind: "dini_bayram",
    tentative: false
  },
  {
    day: "2025-04-01",
    label: "Ramazan Bayramı 3. Gün",
    kind: "dini_bayram",
    tentative: false
  },
  {
    day: "2025-04-23",
    label: "Ulusal Egemenlik ve Çocuk Bayramı",
    kind: "resmi_tatil",
    tentative: false
  },
  {
    day: "2025-05-01",
    label: "İşçi Bayramı",
    kind: "resmi_tatil",
    tentative: false
  },
  {
    day: "2025-05-19",
    label: "Atatürk'ü Anma, Gençlik ve Spor Bayramı",
    kind: "resmi_tatil",
    tentative: false
  },
  {
    day: "2025-06-05",
    label: "Kurban Bayramı arifesi",
    kind: "arife",
    tentative: false
  },
  {
    day: "2025-06-06",
    label: "Kurban Bayramı 1. Gün",
    kind: "dini_bayram",
    tentative: false
  },
  {
    day: "2025-06-07",
    label: "Kurban Bayramı 2. Gün",
    kind: "dini_bayram",
    tentative: false
  },
  {
    day: "2025-06-08",
    label: "Kurban Bayramı 3. Gün",
    kind: "dini_bayram",
    tentative: false
  },
  {
    day: "2025-06-09",
    label: "Kurban Bayramı 4. Gün",
    kind: "dini_bayram",
    tentative: false
  },
  {
    day: "2025-07-15",
    label: "Demokrasi ve Millî Birlik Günü",
    kind: "resmi_tatil",
    tentative: false
  },
  {
    day: "2025-08-30",
    label: "Zafer Bayramı",
    kind: "resmi_tatil",
    tentative: false
  },
  {
    day: "2025-09-03",
    label: "Mevlid Kandili",
    kind: "kandil",
    tentative: true
  },
  {
    day: "2025-09-08",
    label: "Okullar açılıyor",
    kind: "okul"
  },
  {
    day: "2025-10-28",
    label: "Cumhuriyet Bayramı arifesi",
    kind: "arife",
    tentative: false
  },
  {
    day: "2025-10-29",
    label: "Cumhuriyet Bayramı",
    kind: "resmi_tatil",
    tentative: false
  },
  {
    day: "2025-11-10",
    label: "1. ara tatil",
    kind: "okul"
  },
  {
    day: "2025-11-11",
    label: "1. ara tatil",
    kind: "okul"
  },
  {
    day: "2025-11-12",
    label: "1. ara tatil",
    kind: "okul"
  },
  {
    day: "2025-11-13",
    label: "1. ara tatil",
    kind: "okul"
  },
  {
    day: "2025-11-14",
    label: "1. ara tatil",
    kind: "okul"
  },
  {
    day: "2026-01-01",
    label: "Yılbaşı",
    kind: "resmi_tatil",
    tentative: false
  },
  {
    day: "2026-01-15",
    label: "Miraç Kandili",
    kind: "kandil",
    tentative: true
  },
  {
    day: "2026-01-19",
    label: "Yarıyıl tatili",
    kind: "okul"
  },
  {
    day: "2026-01-20",
    label: "Yarıyıl tatili",
    kind: "okul"
  },
  {
    day: "2026-01-21",
    label: "Yarıyıl tatili",
    kind: "okul"
  },
  {
    day: "2026-01-22",
    label: "Yarıyıl tatili",
    kind: "okul"
  },
  {
    day: "2026-01-23",
    label: "Yarıyıl tatili",
    kind: "okul"
  },
  {
    day: "2026-01-24",
    label: "Yarıyıl tatili",
    kind: "okul"
  },
  {
    day: "2026-01-25",
    label: "Yarıyıl tatili",
    kind: "okul"
  },
  {
    day: "2026-01-26",
    label: "Yarıyıl tatili",
    kind: "okul"
  },
  {
    day: "2026-01-27",
    label: "Yarıyıl tatili",
    kind: "okul"
  },
  {
    day: "2026-01-28",
    label: "Yarıyıl tatili",
    kind: "okul"
  },
  {
    day: "2026-01-29",
    label: "Yarıyıl tatili",
    kind: "okul"
  },
  {
    day: "2026-01-30",
    label: "Yarıyıl tatili",
    kind: "okul"
  },
  {
    day: "2026-02-02",
    label: "Berat Kandili",
    kind: "kandil",
    tentative: true
  },
  {
    day: "2026-03-15",
    label: "Kadir Gecesi",
    kind: "kandil",
    tentative: true
  },
  {
    day: "2026-03-16",
    label: "2. ara tatil",
    kind: "okul"
  },
  {
    day: "2026-03-17",
    label: "2. ara tatil",
    kind: "okul"
  },
  {
    day: "2026-03-18",
    label: "2. ara tatil",
    kind: "okul"
  },
  {
    day: "2026-03-19",
    label: "Ramazan Bayramı arifesi",
    kind: "arife",
    tentative: false
  },
  {
    day: "2026-03-19",
    label: "2. ara tatil",
    kind: "okul"
  },
  {
    day: "2026-03-20",
    label: "Ramazan Bayramı 1. Gün",
    kind: "dini_bayram",
    tentative: false
  },
  {
    day: "2026-03-20",
    label: "2. ara tatil",
    kind: "okul"
  },
  {
    day: "2026-03-21",
    label: "Ramazan Bayramı 2. Gün",
    kind: "dini_bayram",
    tentative: false
  },
  {
    day: "2026-03-22",
    label: "Ramazan Bayramı 3. Gün",
    kind: "dini_bayram",
    tentative: false
  },
  {
    day: "2026-04-23",
    label: "Ulusal Egemenlik ve Çocuk Bayramı",
    kind: "resmi_tatil",
    tentative: false
  },
  {
    day: "2026-05-01",
    label: "İşçi Bayramı",
    kind: "resmi_tatil",
    tentative: false
  },
  {
    day: "2026-05-19",
    label: "Atatürk'ü Anma, Gençlik ve Spor Bayramı",
    kind: "resmi_tatil",
    tentative: false
  },
  {
    day: "2026-05-26",
    label: "Kurban Bayramı arifesi",
    kind: "arife",
    tentative: false
  },
  {
    day: "2026-05-27",
    label: "Kurban Bayramı 1. Gün",
    kind: "dini_bayram",
    tentative: false
  },
  {
    day: "2026-05-28",
    label: "Kurban Bayramı 2. Gün",
    kind: "dini_bayram",
    tentative: false
  },
  {
    day: "2026-05-29",
    label: "Kurban Bayramı 3. Gün",
    kind: "dini_bayram",
    tentative: false
  },
  {
    day: "2026-05-30",
    label: "Kurban Bayramı 4. Gün",
    kind: "dini_bayram",
    tentative: false
  },
  {
    day: "2026-06-26",
    label: "Okullar kapanıyor",
    kind: "okul"
  },
  {
    day: "2026-07-15",
    label: "Demokrasi ve Millî Birlik Günü",
    kind: "resmi_tatil",
    tentative: false
  },
  {
    day: "2026-08-25",
    label: "Mevlid Kandili",
    kind: "kandil",
    tentative: true
  },
  {
    day: "2026-08-30",
    label: "Zafer Bayramı",
    kind: "resmi_tatil",
    tentative: false
  },
  {
    day: "2026-09-14",
    label: "Okullar açılıyor",
    kind: "okul"
  },
  {
    day: "2026-10-28",
    label: "Cumhuriyet Bayramı arifesi",
    kind: "arife",
    tentative: false
  },
  {
    day: "2026-10-29",
    label: "Cumhuriyet Bayramı",
    kind: "resmi_tatil",
    tentative: false
  },
  {
    day: "2026-11-16",
    label: "1. ara tatil",
    kind: "okul"
  },
  {
    day: "2026-11-17",
    label: "1. ara tatil",
    kind: "okul"
  },
  {
    day: "2026-11-18",
    label: "1. ara tatil",
    kind: "okul"
  },
  {
    day: "2026-11-19",
    label: "1. ara tatil",
    kind: "okul"
  },
  {
    day: "2026-11-20",
    label: "1. ara tatil",
    kind: "okul"
  },
  {
    day: "2027-01-01",
    label: "Yılbaşı",
    kind: "resmi_tatil",
    tentative: false
  },
  {
    day: "2027-01-25",
    label: "Yarıyıl tatili",
    kind: "okul"
  },
  {
    day: "2027-01-26",
    label: "Yarıyıl tatili",
    kind: "okul"
  },
  {
    day: "2027-01-27",
    label: "Yarıyıl tatili",
    kind: "okul"
  },
  {
    day: "2027-01-28",
    label: "Yarıyıl tatili",
    kind: "okul"
  },
  {
    day: "2027-01-29",
    label: "Yarıyıl tatili",
    kind: "okul"
  },
  {
    day: "2027-01-30",
    label: "Yarıyıl tatili",
    kind: "okul"
  },
  {
    day: "2027-01-31",
    label: "Yarıyıl tatili",
    kind: "okul"
  },
  {
    day: "2027-02-01",
    label: "Yarıyıl tatili",
    kind: "okul"
  },
  {
    day: "2027-02-02",
    label: "Yarıyıl tatili",
    kind: "okul"
  },
  {
    day: "2027-02-03",
    label: "Yarıyıl tatili",
    kind: "okul"
  },
  {
    day: "2027-02-04",
    label: "Yarıyıl tatili",
    kind: "okul"
  },
  {
    day: "2027-02-05",
    label: "Yarıyıl tatili",
    kind: "okul"
  },
  {
    day: "2027-03-08",
    label: "2. ara tatil",
    kind: "okul"
  },
  {
    day: "2027-03-09",
    label: "Ramazan Bayramı arifesi",
    kind: "arife",
    tentative: true
  },
  {
    day: "2027-03-09",
    label: "2. ara tatil",
    kind: "okul"
  },
  {
    day: "2027-03-10",
    label: "Ramazan Bayramı 1. Gün",
    kind: "dini_bayram",
    tentative: true
  },
  {
    day: "2027-03-10",
    label: "2. ara tatil",
    kind: "okul"
  },
  {
    day: "2027-03-11",
    label: "Ramazan Bayramı 2. Gün",
    kind: "dini_bayram",
    tentative: true
  },
  {
    day: "2027-03-11",
    label: "2. ara tatil",
    kind: "okul"
  },
  {
    day: "2027-03-12",
    label: "Ramazan Bayramı 3. Gün",
    kind: "dini_bayram",
    tentative: true
  },
  {
    day: "2027-03-12",
    label: "2. ara tatil",
    kind: "okul"
  },
  {
    day: "2027-04-23",
    label: "Ulusal Egemenlik ve Çocuk Bayramı",
    kind: "resmi_tatil",
    tentative: false
  },
  {
    day: "2027-05-01",
    label: "İşçi Bayramı",
    kind: "resmi_tatil",
    tentative: false
  },
  {
    day: "2027-05-15",
    label: "Kurban Bayramı arifesi",
    kind: "arife",
    tentative: true
  },
  {
    day: "2027-05-16",
    label: "Kurban Bayramı 1. Gün",
    kind: "dini_bayram",
    tentative: true
  },
  {
    day: "2027-05-17",
    label: "Kurban Bayramı 2. Gün",
    kind: "dini_bayram",
    tentative: true
  },
  {
    day: "2027-05-18",
    label: "Kurban Bayramı 3. Gün",
    kind: "dini_bayram",
    tentative: true
  },
  {
    day: "2027-05-19",
    label: "Atatürk'ü Anma, Gençlik ve Spor Bayramı",
    kind: "resmi_tatil",
    tentative: false
  },
  {
    day: "2027-05-19",
    label: "Kurban Bayramı 4. Gün",
    kind: "dini_bayram",
    tentative: true
  },
  {
    day: "2027-06-25",
    label: "Okullar kapanıyor",
    kind: "okul"
  },
  {
    day: "2027-07-15",
    label: "Demokrasi ve Millî Birlik Günü",
    kind: "resmi_tatil",
    tentative: false
  },
  {
    day: "2027-08-14",
    label: "Mevlid Kandili",
    kind: "kandil",
    tentative: true
  },
  {
    day: "2027-08-30",
    label: "Zafer Bayramı",
    kind: "resmi_tatil",
    tentative: false
  },
  {
    day: "2027-10-28",
    label: "Cumhuriyet Bayramı arifesi",
    kind: "arife",
    tentative: false
  },
  {
    day: "2027-10-29",
    label: "Cumhuriyet Bayramı",
    kind: "resmi_tatil",
    tentative: false
  },
  {
    day: "2027-12-25",
    label: "Miraç Kandili",
    kind: "kandil",
    tentative: true
  },
  {
    day: "2028-01-01",
    label: "Yılbaşı",
    kind: "resmi_tatil",
    tentative: false
  },
  {
    day: "2028-01-12",
    label: "Berat Kandili",
    kind: "kandil",
    tentative: true
  },
  {
    day: "2028-02-23",
    label: "Kadir Gecesi",
    kind: "kandil",
    tentative: true
  },
  {
    day: "2028-02-26",
    label: "Ramazan Bayramı arifesi",
    kind: "arife",
    tentative: true
  },
  {
    day: "2028-02-27",
    label: "Ramazan Bayramı 1. Gün",
    kind: "dini_bayram",
    tentative: true
  },
  {
    day: "2028-02-28",
    label: "Ramazan Bayramı 2. Gün",
    kind: "dini_bayram",
    tentative: true
  },
  {
    day: "2028-02-29",
    label: "Ramazan Bayramı 3. Gün",
    kind: "dini_bayram",
    tentative: true
  },
  {
    day: "2028-04-23",
    label: "Ulusal Egemenlik ve Çocuk Bayramı",
    kind: "resmi_tatil",
    tentative: false
  },
  {
    day: "2028-05-01",
    label: "İşçi Bayramı",
    kind: "resmi_tatil",
    tentative: false
  },
  {
    day: "2028-05-04",
    label: "Kurban Bayramı arifesi",
    kind: "arife",
    tentative: true
  },
  {
    day: "2028-05-05",
    label: "Kurban Bayramı 1. Gün",
    kind: "dini_bayram",
    tentative: true
  },
  {
    day: "2028-05-06",
    label: "Kurban Bayramı 2. Gün",
    kind: "dini_bayram",
    tentative: true
  },
  {
    day: "2028-05-07",
    label: "Kurban Bayramı 3. Gün",
    kind: "dini_bayram",
    tentative: true
  },
  {
    day: "2028-05-08",
    label: "Kurban Bayramı 4. Gün",
    kind: "dini_bayram",
    tentative: true
  },
  {
    day: "2028-05-19",
    label: "Atatürk'ü Anma, Gençlik ve Spor Bayramı",
    kind: "resmi_tatil",
    tentative: false
  },
  {
    day: "2028-07-15",
    label: "Demokrasi ve Millî Birlik Günü",
    kind: "resmi_tatil",
    tentative: false
  },
  {
    day: "2028-08-03",
    label: "Mevlid Kandili",
    kind: "kandil",
    tentative: true
  },
  {
    day: "2028-08-30",
    label: "Zafer Bayramı",
    kind: "resmi_tatil",
    tentative: false
  },
  {
    day: "2028-10-28",
    label: "Cumhuriyet Bayramı arifesi",
    kind: "arife",
    tentative: false
  },
  {
    day: "2028-10-29",
    label: "Cumhuriyet Bayramı",
    kind: "resmi_tatil",
    tentative: false
  },
  {
    day: "2028-12-14",
    label: "Miraç Kandili",
    kind: "kandil",
    tentative: true
  },
  {
    day: "2028-12-31",
    label: "Berat Kandili",
    kind: "kandil",
    tentative: true
  },
  {
    day: "2029-01-01",
    label: "Yılbaşı",
    kind: "resmi_tatil",
    tentative: false
  },
  {
    day: "2029-02-11",
    label: "Kadir Gecesi",
    kind: "kandil",
    tentative: true
  },
  {
    day: "2029-02-14",
    label: "Ramazan Bayramı arifesi",
    kind: "arife",
    tentative: true
  },
  {
    day: "2029-02-15",
    label: "Ramazan Bayramı 1. Gün",
    kind: "dini_bayram",
    tentative: true
  },
  {
    day: "2029-02-16",
    label: "Ramazan Bayramı 2. Gün",
    kind: "dini_bayram",
    tentative: true
  },
  {
    day: "2029-02-17",
    label: "Ramazan Bayramı 3. Gün",
    kind: "dini_bayram",
    tentative: true
  },
  {
    day: "2029-04-23",
    label: "Ulusal Egemenlik ve Çocuk Bayramı",
    kind: "resmi_tatil",
    tentative: false
  },
  {
    day: "2029-04-23",
    label: "Kurban Bayramı arifesi",
    kind: "arife",
    tentative: true
  },
  {
    day: "2029-04-24",
    label: "Kurban Bayramı 1. Gün",
    kind: "dini_bayram",
    tentative: true
  },
  {
    day: "2029-04-25",
    label: "Kurban Bayramı 2. Gün",
    kind: "dini_bayram",
    tentative: true
  },
  {
    day: "2029-04-26",
    label: "Kurban Bayramı 3. Gün",
    kind: "dini_bayram",
    tentative: true
  },
  {
    day: "2029-04-27",
    label: "Kurban Bayramı 4. Gün",
    kind: "dini_bayram",
    tentative: true
  },
  {
    day: "2029-05-01",
    label: "İşçi Bayramı",
    kind: "resmi_tatil",
    tentative: false
  },
  {
    day: "2029-05-19",
    label: "Atatürk'ü Anma, Gençlik ve Spor Bayramı",
    kind: "resmi_tatil",
    tentative: false
  },
  {
    day: "2029-07-15",
    label: "Demokrasi ve Millî Birlik Günü",
    kind: "resmi_tatil",
    tentative: false
  },
  {
    day: "2029-08-30",
    label: "Zafer Bayramı",
    kind: "resmi_tatil",
    tentative: false
  },
  {
    day: "2029-10-28",
    label: "Cumhuriyet Bayramı arifesi",
    kind: "arife",
    tentative: false
  },
  {
    day: "2029-10-29",
    label: "Cumhuriyet Bayramı",
    kind: "resmi_tatil",
    tentative: false
  }
] as UretilmisGun[];
