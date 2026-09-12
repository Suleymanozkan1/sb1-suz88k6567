/**
 * Basit, tip güvenli kalıcı depolama katmanı.
 * Gerçek dağıtımda bu modülün yerini bir HTTP API istemcisi alır;
 * uygulamanın geri kalanı yalnızca bu arayüzü tanır.
 */

const PREFIX = 'dt:';

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function read<T>(key: string, fallback: T): T {
  if (!isBrowser()) return fallback;
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function write<T>(key: string, value: T): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* kota dolu veya özel mod, sessizce yoksay */
  }
}

export function remove(key: string): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(PREFIX + key);
  } catch {
    /* yoksay */
  }
}

export function clearAll(): void {
  if (!isBrowser()) return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(PREFIX)) keys.push(k);
    }
    keys.forEach((k) => window.localStorage.removeItem(k));
  } catch {
    /* yoksay */
  }
}

export const KEYS = {
  users: 'users',
  businesses: 'businesses',
  reservations: 'reservations',
  payments: 'payments',
  cashflow: 'cashflow',
  /** Müşteri adayları */
  leads: 'musteri-adaylari',
  /** Adayların iletişim geçmişi */
  leadMessages: 'aday-mesajlari',
  /** Adayların durum değişiklikleri */
  leadStatusHistory: 'aday-durum-gecmisi',
  /** İşletmenin düzenlediği aday durumları */
  leadStatuses: 'aday-durumlari',
  /** Organizasyon içi giderler (garson, DJ, vale...) */
  reservationExpenses: 'dugun-ici-giderler',
  /** WhatsApp numarası eşlemesi ve otomatik cevap ayarları */
  whatsappAccounts: 'whatsapp-hesaplari',
  colors: 'colors',
  sms: 'sms',
  consents: 'consents',
  queue: 'queue',
  invoices: 'invoices',
  halls: 'halls',
  menus: 'menus',
  seating: 'seating',
  templates: 'templates',
  reminderRules: 'reminder-rules',
  tasks: 'tasks',
  vendors: 'vendors',
  resVendors: 'resVendors',
  session: 'session',
  seeded: 'seeded',
  /** Program raporuna elle eklenen serbest notlar */
  programNotes: 'program-notlari',
  /** Demo modu uyarı bandı kullanıcı tarafından kapatıldı mı */
  demoNotice: 'demo-notice',
} as const;
