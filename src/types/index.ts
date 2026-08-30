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
  referredBy?: string;
  referralCode: string;
  heardFrom?: string;
  trialEndsAt: string;
  subscriptionEndsAt: string;
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

export interface SmsLogEntry {
  id: string;
  businessId: string;
  to: string;
  body: string;
  kind: 'Rezervasyon' | 'Doğrulama' | 'Hatırlatma' | 'Bilgilendirme';
  sentAt: string;
}

export interface ContactMessage {
  id: string;
  name: string;
  email: string;
  phone: string;
  message: string;
  kind: 'iletisim' | 'demo';
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
  name: string;
  category: string;
  city: string;
  district: string;
  capacity?: number;
  about: string;
}
