/** Uygulama genelinde kullanılan tip tanımları */

export type Currency = 'TL' | 'EUR' | 'USD' | 'GBP';

export type OrganizationType =
  | 'Düğün'
  | 'Sünnet'
  | 'Nişan'
  | 'Kına'
  | 'Konferans'
  | 'Kokteyl'
  | 'Nikâh'
  | 'Doğum Günü'
  | 'Toplantı'
  | 'Diğer';

/** Gündüz / Gece seans ayrımı: orijinal sistemdeki "gündüz ve gece" takibi */
export type SessionSlot = 'Gündüz' | 'Gece';

/**
 * Müşteri işletmeye hangi kanaldan ulaştı.
 *
 * Sabit bir liste: serbest metin "Instagram", "instagram", "İnstagram" diye
 * üç ayrı kanal üretip yıl sonu raporunu anlamsız kılardı.
 */
export type LeadChannel = 'Instagram' | 'Düğün.com' | 'Google' | 'Referans' | 'Diğer';

export type ReservationStatus = 'Ön Rezervasyon' | 'Kesin Rezervasyon' | 'Tamamlandı' | 'İptal';

export interface Payment {
  id: string;
  reservationId: string;
  date: string; // ISO yyyy-mm-dd
  amount: number;
  method: 'Nakit' | 'Kredi Kartı' | 'Havale/EFT' | 'Çek' | 'Senet';
  note?: string;
  createdAt: string;
}

export interface Reservation {
  id: string;
  businessId: string;
  hallId: string;
  menuId?: string;
  code: string; // Kod doğrulama ekranında sorgulanan rezervasyon kodu
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  secondPersonName?: string;
  /** İkinci kişinin telefonu; sözleşmedeki "Gelin Cep" satırı. */
  secondPhone?: string;
  /**
   * Sözleşmeyi imzalayanın TC kimlik numarası (11 hane).
   * KVKK: yalnızca sözleşme düzenlemek için tutulur, kod doğrulama
   * ekranına hiçbir koşulda çıkmaz.
   */
  identityNo?: string;
  date: string; // ISO yyyy-mm-dd
  /** Başlangıç saati HH:mm; sözleşmedeki "Saat" satırı. İsteğe bağlı. */
  startTime?: string;
  /** Bitiş saati HH:mm. Gece yarısını aşan törenlerde başlangıçtan küçük olabilir. */
  endTime?: string;
  slot: SessionSlot;
  organizationType: OrganizationType;
  guestCount: number;
  totalAmount: number;
  deposit: number; // Kapora
  currency: Currency;
  status: ReservationStatus;
  colorKey: string; // Rezervasyon Renk Ayarları ile eşleşen anahtar
  note?: string;
  services: string[];
  address?: string;
  /** Müşteri bize hangi kanaldan ulaştı; yıl sonu kanal raporunun kaynağı. */
  sourceChannel?: LeadChannel;
  /** Referansta tavsiye edenin adı, "Diğer"de açıklama. */
  sourceDetail?: string;
  createdAt: string;
  updatedAt: string;
}

/** Bir işletmedeki fiziksel salon. Çakışma kuralı salon bazında işler. */
export interface Hall {
  id: string;
  businessId: string;
  name: string;
  capacity: number;
  note: string;
  isActive: boolean;
  createdAt: string;
}

/** Menü fiyatı kişi başı ya da sabit olabilir. */
export type MenuPricing = 'kisi_basi' | 'sabit';

export const MENU_PRICING_LABELS: Record<MenuPricing, string> = {
  kisi_basi: 'Kişi başı',
  sabit: 'Sabit tutar',
};

export interface Menu {
  id: string;
  businessId: string;
  name: string;
  pricing: MenuPricing;
  /** Kuruş cinsinden tamsayı; ondalık aritmetik kuruş kaydırır. */
  priceKurus: number;
  description: string;
  isActive: boolean;
  createdAt: string;
}

/** Rezervasyona bağlı tek bir masa. */
export interface SeatingTable {
  id: string;
  reservationId: string;
  tableNo: number;
  seats: number;
  label: string;
}

/** Etkinlik günü iş emri satırı. */
export interface EventTask {
  id: string;
  reservationId: string;
  atTime: string;
  title: string;
  responsible: string;
  done: boolean;
}

export interface Vendor {
  id: string;
  businessId: string;
  name: string;
  category: string;
  phone: string;
  note: string;
  isActive: boolean;
  createdAt: string;
}

/** Bir tedarikçinin belirli bir organizasyona atanması. */
export interface ReservationVendor {
  id: string;
  reservationId: string;
  vendorId: string;
  arriveAt?: string;
  cost: number;
  note: string;
}

export const VENDOR_CATEGORIES = [
  'Orkestra / Müzik', 'Fotoğraf / Video', 'Çiçek / Süsleme', 'Pasta',
  'Gelin Arabası', 'Ses ve Işık', 'İkram / Catering', 'Diğer',
] as const;

export type CashFlowKind = 'Gelir' | 'Gider';

export interface CashFlowEntry {
  id: string;
  businessId: string;
  kind: CashFlowKind;
  date: string;
  category: string;
  amount: number;
  description?: string;
  reservationId?: string;
  createdAt: string;
}

/** Çelik kasa hareketinin yönü */
export type SafeDirection = 'Giriş' | 'Çıkış';

/**
 * Çelik kasa (fiziksel kasa) hareketi.
 *
 * Kasa bakiyesi (gelir - gider) muhasebe hesabıdır; çelik kasa ise
 * kasadaki gerçek paradır. Havaleyle gelen tahsilat kasaya girmez,
 * kasadan alınıp bankaya yatırılan para kasadan çıkar ama gelir kaydı
 * yerinde durur. Bu yüzden iki bakiye ayrı tutulur.
 */
export interface SafeMovement {
  id: string;
  businessId: string;
  date: string;
  direction: SafeDirection;
  amount: number;
  description: string;
  /** Hareketi doğuran gelir/gider satırının türü */
  sourceKind: 'cash_flow' | 'reservation';
  /** cash_flow kimliği ya da "kapora:<id>" / "tahsilat:<id>" */
  sourceId: string;
  createdAt: string;
}

/** Müşteri adayının nereden geldiği. */
export type LeadSource = 'Instagram' | 'WhatsApp' | 'Web Sitesi' | 'Telefon' | 'Manuel' | 'Diğer';

export const LEAD_SOURCES: LeadSource[] = [
  'Instagram', 'WhatsApp', 'Web Sitesi', 'Telefon', 'Manuel', 'Diğer',
];

/**
 * Müşteri adayının takip durumu.
 *
 * Sıra, akışın kendisi: aranmamış bir aday soldan sağa ilerliyor. Ekranda
 * da bu sırayla görünüyor ki personel listede aradığını yerinde bulsun.
 */
export type LeadStatus =
  | 'Aranmadı'
  | 'Arandı'
  | 'Ulaşılamadı'
  | 'Tekrar Aranacak'
  | 'Tekrar Arandı'
  | "WhatsApp'tan İletişim Kuruldu"
  | 'İletişim Sağlandı'
  | 'Teklif Gönderildi'
  | 'Rezervasyona Döndü'
  | 'Olumsuz'
  | 'İptal';

export const LEAD_STATUSES: LeadStatus[] = [
  'Aranmadı', 'Arandı', 'Ulaşılamadı', 'Tekrar Aranacak', 'Tekrar Arandı',
  "WhatsApp'tan İletişim Kuruldu", 'İletişim Sağlandı', 'Teklif Gönderildi',
  'Rezervasyona Döndü', 'Olumsuz', 'İptal',
];

/**
 * Müşteri adayı.
 *
 * Rezervasyona dönüşmemiş kişi de takip edilebilsin diye ayrı bir kayıt.
 * Müşteriler ekranı rezervasyonlardan türetilen bir görünümdür ve öyle
 * kalıyor; aday oraya karışmıyor.
 */
export interface CustomerLead {
  id: string;
  businessId: string;
  name: string;
  /** On haneye indirgenmiş numara. Aynı kişinin iki kayda düşmemesi buna bağlı. */
  phone: string;
  email: string;
  guestCount: number | null;
  /** ISO tarih; çözülemediyse boş. */
  eventDate: string;
  /** "Mayısın ilk haftası" gibi çözülemeyen ifade. Uydurulmuş bir güne yeğdir. */
  eventDateText: string;
  organizationType: string;
  source: LeadSource;
  sourceDetail: string;
  status: LeadStatus;
  assignedTo?: string;
  nextFollowupAt: string;
  lastContactAt: string;
  reservationId?: string;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export type LeadMessageDirection = 'gelen' | 'giden' | 'olay';

/** İletişim geçmişindeki bir satır: mesaj ya da sistem olayı. */
export interface LeadMessage {
  id: string;
  businessId: string;
  leadId: string;
  direction: LeadMessageDirection;
  channel: 'whatsapp' | 'telefon' | 'eposta' | 'sistem';
  body: string;
  waMessageId?: string;
  actorEmail: string;
  createdAt: string;
}

/** Durum değişikliği kaydı; tetikleyici yazar, istemci atlayamaz. */
export interface LeadStatusChange {
  id: string;
  leadId: string;
  fromStatus: LeadStatus | null;
  toStatus: LeadStatus;
  actorEmail: string;
  createdAt: string;
}

export interface Business {
  id: string;
  ownerId: string;
  name: string;
  category: string;
  city: string;
  district: string;
  phone: string;
  capacity: number;
  currency: Currency;
  address?: string;
  facebook?: string;
  instagram?: string;
  about?: string;
  createdAt: string;
}

export type UserRole = 'owner' | 'staff';

export interface User {
  id: string;
  companyName: string;
  fullName: string;
  email: string;
  password: string; // Demo amaçlı; gerçek dağıtımda sunucu tarafında hash'lenir
  mobile: string;
  role: UserRole;
  ownerId?: string; // Alt kullanıcı ise bağlı olduğu ana üye
  permissions: Permission[];
  city: string;
  district: string;
  category: string;
  capacity: number;
  currency: Currency;
  facebook?: string;
  instagram?: string;
  createdAt: string;
  activeBusinessId: string;
}

export type Permission =
  | 'rezervasyon.goruntule'
  | 'rezervasyon.duzenle'
  | 'rezervasyon.sil'
  | 'kasa.goruntule'
  | 'kasa.duzenle'
  | 'rapor.goruntule'
  | 'ayarlar.duzenle';

export const ALL_PERMISSIONS: { key: Permission; label: string }[] = [
  { key: 'rezervasyon.goruntule', label: 'Rezervasyonları görüntüle' },
  { key: 'rezervasyon.duzenle', label: 'Rezervasyon ekle / düzenle' },
  { key: 'rezervasyon.sil', label: 'Rezervasyon sil' },
  { key: 'kasa.goruntule', label: 'Gelir / gider görüntüle' },
  { key: 'kasa.duzenle', label: 'Gelir / gider ekle / düzenle' },
  { key: 'rapor.goruntule', label: 'Raporları görüntüle' },
  { key: 'ayarlar.duzenle', label: 'Ayarları düzenle' },
];

export interface ColorSetting {
  key: string;
  label: string;
  color: string;
}

/**
 * Mesaj sınıflandırması, İYS yükümlülüğünü belirler.
 *   islem : rezervasyon onayı, hatırlatma, doğrulama kodu, ödeme bildirimi
 *           -> İYS onayı GEREKMEZ (muaf)
 *   ticari: kampanya, indirim, tanıtım
 *           -> İYS onayı ŞARTTIR
 */
export type MessageCategory = 'islem' | 'ticari';

export type ConsentStatus = 'ONAY' | 'RET';

export interface SmsConsent {
  id: string;
  businessId: string;
  phone: string;
  status: ConsentStatus;
  source: string;
  consentDate: string;
  iysSyncedAt?: string;
  iysError?: string;
  note?: string;
}

export type QueueStatus = 'bekliyor' | 'gonderiliyor' | 'gonderildi' | 'basarisiz' | 'iptal';

export interface SmsQueueEntry {
  id: string;
  phone: string;
  body: string;
  kind: SmsLogEntry['kind'];
  category: MessageCategory;
  status: QueueStatus;
  attempts: number;
  nextAttemptAt: string;
  lastError?: string;
  createdAt: string;
  sentAt?: string;
}

export interface EnqueueResult {
  queued: boolean;
  reason?: string;
}

export interface SmsLogEntry {
  id: string;
  businessId: string;
  to: string;
  body: string;
  kind: 'Rezervasyon' | 'Doğrulama' | 'Hatırlatma' | 'Bilgilendirme';
  sentAt: string;
}

export type InvoiceKind = 'e-Arsiv' | 'e-Fatura';
export type InvoiceStatus =
  | 'taslak' | 'gonderiliyor' | 'gonderildi' | 'onaylandi' | 'reddedildi' | 'iptal';
export type BuyerKind = 'bireysel' | 'kurumsal';

export interface InvoiceLine {
  lineNo: number;
  description: string;
  quantity: number;
  unit: string;
  unitPriceKurus: number;
  discountRate: number;
  vatRate: number;
  baseKurus: number;
  vatKurus: number;
  totalKurus: number;
}

export interface Invoice {
  id: string;
  businessId: string;
  reservationId?: string;
  invoiceNumber: string;
  kind: InvoiceKind;
  status: InvoiceStatus;
  issueDate: string;
  serviceDate?: string;
  buyerKind: BuyerKind;
  buyerName: string;
  buyerTaxId?: string;
  buyerTaxOffice?: string;
  buyerAddress?: string;
  buyerEmail?: string;
  buyerPhone?: string;
  grossKurus: number;
  discountKurus: number;
  baseKurus: number;
  vatKurus: number;
  totalKurus: number;
  providerError?: string;
  sentAt?: string;
  cancelReason?: string;
  note?: string;
  createdAt: string;
  lines?: InvoiceLine[];
}

export interface SystemHealth {
  kuyrukBekleyen: number;
  kuyrukBasarisiz: number;
  kuyrukEngellenen: number;
  kuyrukEnEskiDakika: number;
  iysAktarilmamis: number;
  basarisizGiris24s: number;
  sonYedek: { zaman: string; durum: string; yasSaat: number; yasDakika: number } | null;
}

export interface AuditEntry {
  id: number;
  actorEmail: string;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  tableName: string;
  recordId?: string;
  summary?: string;
  /** Değişen alanlar: { alan: { eski, yeni } } */
  changed?: Record<string, { eski: unknown; yeni: unknown }>;
  createdAt: string;
}

export interface Testimonial {
  business: string;
  author: string;
  text: string;
}

export interface NewsItem {
  slug: string;
  title: string;
  date: string;
  excerpt: string;
  body: string[];
}

export interface DirectoryMember {
  id: string;
  /** /salon/<slug> adresinde kullanılan benzersiz anahtar */
  slug: string;
  name: string;
  category: string;
  city: string;
  district: string;
  capacity?: number;
  address?: string;
  phone?: string;
  about: string;
}
