/**
 * GİB e-Fatura doğrudan entegrasyon istemcisi.
 *
 * KAPSAM UYARISI. Doğrudan entegrasyon izni, izni alan MÜKELLEFİN KENDİ
 * faturaları içindir. Sahra Takip'i kullanan salonların faturaları bu
 * yolla kesilemez -- başka mükellefler adına fatura kesmek özel
 * entegratör lisansı gerektiriyor. Bu modül bu yüzden yalnızca
 * `GIB_VKN` ile eşleşen işletme için çalışıyor; eşleşmeyen bir işletme
 * faturası entegratöre (`_parasut.ts`) gidiyor.
 *
 * ÖN KOŞULLAR (ikisi de kodla sağlanamaz):
 *   1. GİB'den "entegrasyon yöntemi" onayı
 *   2. TÜBİTAK KamuSM'den mali mühür sertifikası
 * İkisi tamamlanmadan bu modül yapılandırılmamış sayılır ve devreye
 * girmez.
 */
import { ublFaturaUret, type GibFatura, type GibSatir } from './_gib_ubl';
import { muhurAyari } from './_gib_imza';

/** GİB servis kökü; test ve üretim ortamı ayrı. */
export const GIB_KOKU = process.env.GIB_SERVIS_URL
  ?? 'https://efaturatest.gib.gov.tr/EFaturaServis';

export class GibError extends Error {}

/**
 * Modül yapılandırılmış mı?
 *
 * Mali mühür, VKN ve servis kullanıcısı olmadan tek bir fatura bile
 * gönderilemez; eksikse hiç denenmiyor ve entegratör yolu kullanılıyor.
 */
export function isConfigured(): boolean {
  return Boolean(
    process.env.GIB_VKN
    && process.env.GIB_KULLANICI
    && process.env.GIB_PAROLA
    && muhurAyari(),
  );
}

/** Bu fatura doğrudan entegrasyonla mı gidecek? */
export function dogrudanGider(saticiVkn: string): boolean {
  const kendi = (process.env.GIB_VKN ?? '').trim();
  return Boolean(kendi) && saticiVkn.trim() === kendi;
}

/**
 * Alıcının e-Fatura mükellefi olup olmadığına göre senaryo seçer.
 *
 * Mükellef DEĞİLSE belge e-Arşiv'dir ve GİB'e zarfla değil, rapor olarak
 * bildirilir. Düğün müşterileri şahıs olduğu için pratikte hemen her
 * fatura bu yola düşüyor.
 */
export function senaryoSec(aliciMukellef: boolean): 'TEMELFATURA' | 'EARSIVFATURA' {
  return aliciMukellef ? 'TEMELFATURA' : 'EARSIVFATURA';
}

/**
 * GİB zarf durum kodlarının okunur karşılığı.
 *
 * Kod ham hâliyle bırakılsaydı ekranda "1230" yazardı ve kullanıcı ne
 * yapması gerektiğini anlamazdı. Liste GİB'in zarf durum kodlarından.
 */
export const ZARF_DURUMLARI: Record<string, string> = {
  '1000': 'Zarf kuyruğa alındı',
  '1100': 'Zarf işleniyor',
  '1110': 'Zarf başarıyla işlendi',
  '1120': 'Zarf teslim edildi',
  '1130': 'Zarf imza doğrulaması başarısız',
  '1140': 'Zarf şema doğrulamasından geçemedi',
  '1150': 'Zarf şematron doğrulamasından geçemedi',
  '1160': 'Zarf paket bütünlüğü bozuk',
  '1161': 'Zarf içeriği okunamadı',
  '1170': 'Zarf tekrar gönderilmiş (aynı zarf numarası)',
  '1175': 'Zarf zaten işlenmiş',
  '1190': 'Zarf sistem hatası nedeniyle işlenemedi',
  '1200': 'Zarf alıcıya ulaştırıldı',
  '1215': 'Alıcı posta kutusu bulunamadı',
  '1220': 'Zarf reddedildi',
  '1230': 'Zarf hatalı, alıcıya ulaştırılamadı',
};

export function zarfDurumu(kod: string): string {
  const temiz = kod.trim();
  return ZARF_DURUMLARI[temiz] ?? `Bilinmeyen durum kodu (${temiz || '-'})`;
}

/** Durum kodu kalıcı bir hata mı, yoksa beklemeye devam mı? */
export function durumKalici(kod: string): boolean {
  const temiz = kod.trim();
  // 11x0 ailesindeki doğrulama hataları ve 12xx retleri kalıcı.
  return ['1130', '1140', '1150', '1160', '1161', '1215', '1220', '1230'].includes(temiz);
}

export function durumBasarili(kod: string): boolean {
  return ['1110', '1120', '1200'].includes(kod.trim());
}

/* --------------------------------------------------------- fatura kurma */

export interface InvoiceRow {
  id: string;
  business_id: string;
  invoice_number: string;
  uuid_ettn: string;
  issue_date: string;
  buyer_kind: 'bireysel' | 'kurumsal';
  buyer_name: string;
  buyer_tax_id: string | null;
  buyer_tax_office: string | null;
  buyer_address: string | null;
  buyer_city: string | null;
  buyer_district: string | null;
  buyer_email: string | null;
  buyer_phone: string | null;
  gross_kurus: number;
  discount_kurus: number;
  base_kurus: number;
  vat_kurus: number;
  total_kurus: number;
  currency: string;
  note: string | null;
}

export interface LineRow {
  line_no: number;
  description: string;
  quantity: number;
  unit: string;
  unit_price_kurus: number;
  discount_rate: number;
  vat_rate: number;
  gross_kurus: number;
  base_kurus: number;
  vat_kurus: number;
}

export interface SaticiAyari {
  vkn: string;
  unvan: string;
  vergiDairesi: string;
  adres: string;
  ilce: string;
  il: string;
}

export function saticiAyari(): SaticiAyari | null {
  const vkn = process.env.GIB_VKN;
  const unvan = process.env.GIB_UNVAN;
  if (!vkn || !unvan) return null;
  return {
    vkn,
    unvan,
    vergiDairesi: process.env.GIB_VERGI_DAIRESI ?? '',
    adres: process.env.GIB_ADRES ?? '',
    ilce: process.env.GIB_ILCE ?? '',
    il: process.env.GIB_IL ?? '',
  };
}

/** Veritabanı satırlarını UBL belgesine hazır yapıya çevirir. */
export function faturayiKur(
  invoice: InvoiceRow,
  lines: LineRow[],
  satici: SaticiAyari,
  aliciMukellef: boolean,
): GibFatura {
  const satirlar: GibSatir[] = lines
    .slice()
    .sort((a, b) => a.line_no - b.line_no)
    .map((l) => ({
      siraNo: l.line_no,
      aciklama: l.description,
      miktar: Number(l.quantity),
      birim: l.unit,
      birimFiyatKurus: l.unit_price_kurus,
      /*
        İskonto TUTAR olarak hesaplanıyor: veritabanında oran duruyor ama
        GİB tutar istiyor. Oran yazılsaydı belge toplamıyla satır
        toplamı tutmazdı.
      */
      iskontoKurus: l.gross_kurus - l.base_kurus,
      kdvOrani: l.vat_rate,
      matrahKurus: l.base_kurus,
      kdvKurus: l.vat_kurus,
    }));

  return {
    ettn: invoice.uuid_ettn,
    faturaNo: invoice.invoice_number,
    tarih: invoice.issue_date,
    saat: new Date().toISOString().slice(11, 19),
    senaryo: senaryoSec(aliciMukellef),
    paraBirimi: invoice.currency || 'TRY',
    satici: {
      vknTckn: satici.vkn,
      unvan: satici.unvan,
      vergiDairesi: satici.vergiDairesi,
      adres: satici.adres,
      ilce: satici.ilce,
      il: satici.il,
    },
    alici: {
      vknTckn: invoice.buyer_tax_id ?? undefined,
      unvan: invoice.buyer_name,
      vergiDairesi: invoice.buyer_tax_office ?? undefined,
      adres: invoice.buyer_address ?? undefined,
      ilce: invoice.buyer_district ?? undefined,
      il: invoice.buyer_city ?? undefined,
      telefon: invoice.buyer_phone ?? undefined,
      eposta: invoice.buyer_email ?? undefined,
      bireysel: invoice.buyer_kind === 'bireysel',
    },
    satirlar,
    brutKurus: invoice.gross_kurus,
    iskontoKurus: invoice.discount_kurus,
    matrahKurus: invoice.base_kurus,
    kdvKurus: invoice.vat_kurus,
    toplamKurus: invoice.total_kurus,
    not: invoice.note ?? undefined,
  };
}

/** İmzalanmamış ham UBL belgesi; tanı ve önizleme için. */
export function ublOnizle(
  invoice: InvoiceRow, lines: LineRow[], aliciMukellef = false,
): string {
  const satici = saticiAyari();
  if (!satici) throw new GibError('GIB_VKN ve GIB_UNVAN tanımlı değil.');
  return ublFaturaUret(faturayiKur(invoice, lines, satici, aliciMukellef));
}
