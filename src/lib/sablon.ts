/**
 * Hatırlatma şablonları.
 *
 * Bir şablon, yer tutucular içeren taslak bir SMS metnidir. Aynı doldurma
 * işi iki yerde yapılır: kullanıcı panelden tek tuşla gönderdiğinde burada,
 * gece görevinde ise veritabanındaki `render_template` fonksiyonunda.
 * İkisinin aynı sonucu üretmesi şart — kullanıcı önizlemede gördüğü metnin
 * gittiğinden emin olmalı. Bu yüzden kural ikisinde de birebir aynı:
 * yalnızca {süslü parantez} içindeki adlar değiştirilir, bilinmeyen bir ad
 * olduğu gibi bırakılır.
 *
 * Bilinmeyeni boşa çevirmemek bilinçli: "Sayın ," diye başlayan bir mesaj
 * müşteriye gitmektense, yer tutucunun kendisi görünür kalsın ve gönderen
 * hatayı önizlemede fark etsin.
 */
import { formatDate, formatMoney } from './format';
import type { Reservation, Payment } from '../types';

/** Veritabanındaki `template_key` enum'unun karşılığı. */
export type SablonAnahtari =
  | 'rezervasyon_onay'
  | 'tarih_hatirlatma'
  | 'odeme_hatirlatma'
  | 'tahsilat_bildirimi'
  | 'etkinlik_gunu'
  | 'tesekkur'
  | 'kampanya';

export type MesajSinifi = 'islem' | 'ticari';

export interface Sablon {
  id: string;
  businessId: string;
  key: SablonAnahtari;
  title: string;
  body: string;
  kind: string;
  category: MesajSinifi;
  isActive: boolean;
}

export interface HatirlatmaKurali {
  id: string;
  businessId: string;
  key: SablonAnahtari;
  enabled: boolean;
  /** Organizasyondan kaç gün önce. 0 = etkinlik günü, negatif = sonrası. */
  daysBefore: number;
  sendHour: number;
}

/** Kullanıcıya gösterilen sıra ve başlıklar. */
export const SABLON_SIRASI: SablonAnahtari[] = [
  'rezervasyon_onay',
  'tarih_hatirlatma',
  'odeme_hatirlatma',
  'tahsilat_bildirimi',
  'etkinlik_gunu',
  'tesekkur',
  'kampanya',
];

export const SABLON_ADI: Record<SablonAnahtari, string> = {
  rezervasyon_onay: 'Rezervasyon onayı',
  tarih_hatirlatma: 'Tarih hatırlatması',
  odeme_hatirlatma: 'Ödeme hatırlatması',
  tahsilat_bildirimi: 'Tahsilat bildirimi',
  etkinlik_gunu: 'Etkinlik günü',
  tesekkur: 'Teşekkür',
  kampanya: 'Kampanya duyurusu',
};

/** Otomatik gönderilebilen şablonlar; diğerleri yalnızca elle gönderilir. */
export const OTOMATIK_OLABILEN: SablonAnahtari[] = [
  'tarih_hatirlatma', 'odeme_hatirlatma', 'etkinlik_gunu', 'tesekkur',
];

/** Yer tutucu adları ve ne anlama geldikleri — düzenleme ekranında listelenir. */
export const YER_TUTUCULAR: [string, string][] = [
  ['{musteri}', 'Müşteri adı'],
  ['{isletme}', 'İşletme adı'],
  ['{salon}', 'Salon adı'],
  ['{tarih}', 'Organizasyon tarihi'],
  ['{seans}', 'Gündüz / Gece'],
  ['{tur}', 'Organizasyon türü'],
  ['{kod}', 'Rezervasyon sorgu kodu'],
  ['{tutar}', 'Toplam tutar'],
  ['{odenen}', 'Tahsil edilen'],
  ['{kalan}', 'Kalan alacak'],
];

/**
 * Yer tutucuları değiştirir.
 *
 * Değerler tek geçişte yerleştirilir: art arda `replace` çağırmak, bir
 * değerin içinde geçen "{tarih}" gibi bir metnin ikinci turda yeniden
 * değiştirilmesine yol açıyordu.
 */
export function doldur(govde: string, degerler: Record<string, string>): string {
  return govde.replace(/\{(\w+)\}/g, (tam, ad: string) =>
    Object.prototype.hasOwnProperty.call(degerler, ad) ? degerler[ad]! : tam);
}

/** Bir rezervasyondan yer tutucu değerlerini çıkarır. */
export function degerler(
  reservation: Reservation,
  payments: Payment[],
  isletmeAdi: string,
  salonAdi: string,
): Record<string, string> {
  const odenen = payments.reduce((sum, p) => sum + p.amount, 0);
  const kalan = Math.max(0, reservation.totalAmount - odenen);
  // Tutarlarda para simgesi yazılmaz: SMS'te "₺" bazı operatörlerde
  // karakter sayısını Türkçe alfabe moduna düşürüp mesajı ikiye bölüyor.
  const para = (n: number) => formatMoney(n, reservation.currency).replace(/\s*₺\s*$/, '');
  return {
    musteri: reservation.customerName,
    isletme: isletmeAdi,
    salon: salonAdi,
    tarih: formatDate(reservation.date),
    seans: reservation.slot,
    tur: reservation.organizationType,
    kod: reservation.code,
    tutar: para(reservation.totalAmount),
    odenen: para(odenen),
    kalan: para(kalan),
  };
}

/**
 * SMS uzunluğu.
 *
 * Türkçe'ye özgü harfler (ş, ğ, İ, ı, ö, ç, ü) GSM-7 alfabesinde yoktur;
 * bir tanesi bile geçtiğinde mesaj UCS-2'ye düşer ve tek parça 160 yerine
 * 70 karakter olur. Kullanıcı "kısa yazdım" sanıp iki üç katı ücret
 * ödemesin diye parça sayısı düzenleme ekranında gösterilir.
 */
const GSM7 = new Set(
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?'
  + '¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà'
  + '^{}\\[~]|€',
);

export interface MesajOlcusu {
  karakter: number;
  parca: number;
  /** Türkçe karakter yüzünden 70'lik moda düşüldü mü. */
  turkce: boolean;
}

export function olc(metin: string): MesajOlcusu {
  const turkce = [...metin].some((c) => !GSM7.has(c));
  const karakter = [...metin].length;
  if (karakter === 0) return { karakter: 0, parca: 0, turkce };

  const tek = turkce ? 70 : 160;
  const cok = turkce ? 67 : 153;
  return {
    karakter,
    parca: karakter <= tek ? 1 : Math.ceil(karakter / cok),
    turkce,
  };
}
