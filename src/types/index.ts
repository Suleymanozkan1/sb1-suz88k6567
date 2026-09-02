/** Uygulama genelinde kullanılan tip tanımları */

export type Currency = 'TL' | 'EUR' | 'USD' | 'GBP';

export type OrganizationType =
  | 'Düğün'
  | 'Sünnet'
  | 'Nişan'
  | 'Kına'
  | 'Konferans'
  | 'Kokteyl'
  | 'Nikah'
  | 'Doğum Günü'
  | 'Toplantı'
  | 'Diğer';

/** Gündüz / Gece seans ayrımı — orijinal sistemdeki "gündüz ve gece" takibi */
export type SessionSlot = 'Gündüz' | 'Gece';

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
  date: string; // ISO yyyy-mm-dd
  slot: SessionSlot;
  organizationType: OrganizationType;
  guestCount: number;
  totalAmount: number;
  deposit: number; // Kaparo
  currency: Currency;
  status: ReservationStatus;
  colorKey: string; // Rezervasyon Renk Ayarları ile eşleşen anahtar
  note?: string;
  services: string[];
  address?: string;
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
 * Mesaj sınıflandırması — İYS yükümlülüğünü belirler.
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

export type MessageKind = 'iletisim' | 'demo' | 'teklif';

/** Talep kutusundaki durum; 'yeni' dışındaki her durumda işleyen ve zaman damgası bulunur. */
export type MessageStatus = 'yeni' | 'islemde' | 'kapatildi';

export interface ContactMessage {
  id: string;
  name: string;
  email: string;
  phone: string;
  message: string;
  kind: MessageKind;
  status: MessageStatus;
  note: string;
  handledAt?: string;
  createdAt: string;
}

export const MESSAGE_KIND_LABELS: Record<MessageKind, string> = {
  iletisim: 'İletişim',
  demo: 'Demo Talebi',
  teklif: 'Salon Teklifi',
};

export const MESSAGE_STATUS_LABELS: Record<MessageStatus, string> = {
  yeni: 'Yeni',
  islemde: 'İşlemde',
  kapatildi: 'Kapatıldı',
};

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
