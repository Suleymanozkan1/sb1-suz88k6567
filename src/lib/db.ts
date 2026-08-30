/**
 * Uygulama veri erişim katmanı (repository).
 * Tüm okuma/yazma işlemleri buradan geçer; UI katmanı localStorage'ı doğrudan bilmez.
 */
import { KEYS, read, write } from './storage';
import { addDays, todayIso, toIso } from './format';
import { DEFAULT_COLOR_SETTINGS, ORG_TO_COLOR_KEY, OWNER_PERMISSIONS, TRIAL_DAYS } from '../data/constants';
import type {
  Business,
  CashFlowEntry,
  ColorSetting,
  ContactMessage,
  Payment,
  Reservation,
  SmsLogEntry,
  User,
} from '../types';

export function uid(prefix = 'id'): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** DT-2026-4821 biçiminde rezervasyon kodu */
export function makeReservationCode(): string {
  const year = new Date().getFullYear();
  const n = Math.floor(1000 + Math.random() * 9000);
  return `DT-${year}-${n}`;
}

export function makeReferralCode(companyName: string): string {
  const base = companyName
    .toLocaleUpperCase('tr-TR')
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 4)
    .padEnd(4, 'X');
  return `${base}${Math.floor(100 + Math.random() * 900)}`;
}

/* ------------------------------------------------------------------ Users */

export function getUsers(): User[] {
  return read<User[]>(KEYS.users, []);
}
export function saveUsers(users: User[]): void {
  write(KEYS.users, users);
}
/**
 * E-posta karşılaştırması locale-bağımsız yapılır: Türkçe küçültme kuralı
 * ASCII "I" harfini "ı"ya çevirdiği için e-posta/kod eşleşmesini bozar.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function findUserByEmail(email: string): User | undefined {
  const needle = normalizeEmail(email);
  return getUsers().find((u) => normalizeEmail(u.email) === needle);
}
export function getUser(id: string): User | undefined {
  return getUsers().find((u) => u.id === id);
}
export function upsertUser(user: User): User {
  const users = getUsers();
  const idx = users.findIndex((u) => u.id === user.id);
  if (idx >= 0) users[idx] = user;
  else users.push(user);
  saveUsers(users);
  return user;
}
export function deleteUser(id: string): void {
  saveUsers(getUsers().filter((u) => u.id !== id));
}

/* -------------------------------------------------------------- Businesses */

export function getBusinesses(ownerId?: string): Business[] {
  const all = read<Business[]>(KEYS.businesses, []);
  return ownerId ? all.filter((b) => b.ownerId === ownerId) : all;
}
export function getBusiness(id: string): Business | undefined {
  return getBusinesses().find((b) => b.id === id);
}
export function upsertBusiness(business: Business): Business {
  const all = read<Business[]>(KEYS.businesses, []);
  const idx = all.findIndex((b) => b.id === business.id);
  if (idx >= 0) all[idx] = business;
  else all.push(business);
  write(KEYS.businesses, all);
  return business;
}
export function deleteBusiness(id: string): void {
  write(KEYS.businesses, getBusinesses().filter((b) => b.id !== id));
  write(KEYS.reservations, getReservations().filter((r) => r.businessId !== id));
  write(KEYS.cashflow, getCashFlow().filter((c) => c.businessId !== id));
}

/* ------------------------------------------------------------ Reservations */

export function getReservations(businessId?: string): Reservation[] {
  const all = read<Reservation[]>(KEYS.reservations, []);
  return businessId ? all.filter((r) => r.businessId === businessId) : all;
}
export function getReservation(id: string): Reservation | undefined {
  return getReservations().find((r) => r.id === id);
}
export function findReservationByCode(code: string): Reservation | undefined {
  const needle = code.trim().toUpperCase();
  return getReservations().find((r) => r.code.toUpperCase() === needle);
}
export function upsertReservation(reservation: Reservation): Reservation {
  const all = read<Reservation[]>(KEYS.reservations, []);
  const idx = all.findIndex((r) => r.id === reservation.id);
  const next = { ...reservation, updatedAt: new Date().toISOString() };
  if (idx >= 0) all[idx] = next;
  else all.push(next);
  write(KEYS.reservations, all);
  return next;
}
export function deleteReservation(id: string): void {
  write(KEYS.reservations, getReservations().filter((r) => r.id !== id));
  write(KEYS.payments, getPayments().filter((p) => p.reservationId !== id));
}

/**
 * Aynı tarih + seans için başka rezervasyon var mı?
 * İptal edilmiş kayıtlar çakışma sayılmaz.
 */
export function findSlotConflict(
  businessId: string,
  date: string,
  slot: string,
  excludeId?: string,
): Reservation | undefined {
  return getReservations(businessId).find(
    (r) => r.date === date && r.slot === slot && r.status !== 'İptal' && r.id !== excludeId,
  );
}

/* ---------------------------------------------------------------- Payments */

export function getPayments(reservationId?: string): Payment[] {
  const all = read<Payment[]>(KEYS.payments, []);
  return reservationId ? all.filter((p) => p.reservationId === reservationId) : all;
}
export function upsertPayment(payment: Payment): Payment {
  const all = read<Payment[]>(KEYS.payments, []);
  const idx = all.findIndex((p) => p.id === payment.id);
  if (idx >= 0) all[idx] = payment;
  else all.push(payment);
  write(KEYS.payments, all);
  return payment;
}
export function deletePayment(id: string): void {
  write(KEYS.payments, getPayments().filter((p) => p.id !== id));
}

/** Rezervasyonun kaparo + tahsilat toplamı */
export function totalPaid(reservation: Reservation): number {
  const extra = getPayments(reservation.id).reduce((sum, p) => sum + p.amount, 0);
  return reservation.deposit + extra;
}

/** Kalan alacak bakiyesi (negatife düşmez) */
export function remainingBalance(reservation: Reservation): number {
  return Math.max(0, reservation.totalAmount - totalPaid(reservation));
}

/* --------------------------------------------------------------- Cash flow */

export function getCashFlow(businessId?: string): CashFlowEntry[] {
  const all = read<CashFlowEntry[]>(KEYS.cashflow, []);
  return businessId ? all.filter((c) => c.businessId === businessId) : all;
}
export function upsertCashFlow(entry: CashFlowEntry): CashFlowEntry {
  const all = read<CashFlowEntry[]>(KEYS.cashflow, []);
  const idx = all.findIndex((c) => c.id === entry.id);
  if (idx >= 0) all[idx] = entry;
  else all.push(entry);
  write(KEYS.cashflow, all);
  return entry;
}
export function deleteCashFlow(id: string): void {
  write(KEYS.cashflow, getCashFlow().filter((c) => c.id !== id));
}

/* ---------------------------------------------------------- Color settings */

export function getColorSettings(businessId: string): ColorSetting[] {
  const map = read<Record<string, ColorSetting[]>>(KEYS.colors, {});
  return map[businessId] ?? DEFAULT_COLOR_SETTINGS;
}
export function saveColorSettings(businessId: string, settings: ColorSetting[]): void {
  const map = read<Record<string, ColorSetting[]>>(KEYS.colors, {});
  map[businessId] = settings;
  write(KEYS.colors, map);
}
export function colorForReservation(reservation: Reservation, settings: ColorSetting[]): string {
  const key = reservation.colorKey || ORG_TO_COLOR_KEY[reservation.organizationType] || 'diger';
  return settings.find((s) => s.key === key)?.color ?? '#47b2e4';
}

/* -------------------------------------------------------------------- SMS */

export function getSmsLog(businessId?: string): SmsLogEntry[] {
  const all = read<SmsLogEntry[]>(KEYS.sms, []);
  // Aynı milisaniyede yazılan kayıtlarda ekleme sırası belirleyici olsun diye
  // zaman damgası eşitse orijinal indeks (yeni -> eski) ile kararlı sıralanır.
  const indexed = all.map((entry, index) => ({ entry, index }));
  const list = businessId ? indexed.filter((x) => x.entry.businessId === businessId) : indexed;
  return list
    .sort((a, b) => b.entry.sentAt.localeCompare(a.entry.sentAt) || b.index - a.index)
    .map((x) => x.entry);
}
export function logSms(entry: Omit<SmsLogEntry, 'id' | 'sentAt'>): SmsLogEntry {
  const all = read<SmsLogEntry[]>(KEYS.sms, []);
  const created: SmsLogEntry = { ...entry, id: uid('sms'), sentAt: new Date().toISOString() };
  all.push(created);
  write(KEYS.sms, all);
  return created;
}

/* --------------------------------------------------------------- Messages */

export function getMessages(): ContactMessage[] {
  return read<ContactMessage[]>(KEYS.messages, []);
}
export function addMessage(message: Omit<ContactMessage, 'id' | 'createdAt'>): ContactMessage {
  const all = getMessages();
  const created: ContactMessage = { ...message, id: uid('msg'), createdAt: new Date().toISOString() };
  all.push(created);
  write(KEYS.messages, all);
  return created;
}

/* ------------------------------------------------------------------- Seed */

const DEMO_EMAIL = 'demo@duguntakip.com';
const DEMO_PASSWORD = 'demo1234';

export const DEMO_CREDENTIALS = { email: DEMO_EMAIL, password: DEMO_PASSWORD };

const DEMO_CUSTOMERS: [string, string, string][] = [
  ['Ahmet & Elif Yılmaz', '5321234567', 'Düğün'],
  ['Mehmet & Zeynep Kaya', '5339876543', 'Düğün'],
  ['Burak & Selin Demir', '5445556677', 'Nişan'],
  ['Emre Çelik', '5051112233', 'Sünnet'],
  ['Hatice Arslan', '5364445566', 'Kına'],
  ['Yusuf & Merve Aydın', '5557778899', 'Düğün'],
  ['Kerem Şahin', '5382223344', 'Doğum Günü'],
  ['Ayşe Koç', '5316667788', 'Nikah'],
  ['Volkan Öztürk', '5429998877', 'Kokteyl'],
  ['Ada Yazılım A.Ş.', '5301114455', 'Konferans'],
  ['Fatma & Ali Doğan', '5347778811', 'Düğün'],
  ['Serkan Polat', '5358889900', 'Toplantı'],
  ['Gizem & Onur Taş', '5461234599', 'Düğün'],
  ['Ceren Aksoy', '5372223311', 'Nişan'],
  ['Murat Güneş', '5384445599', 'Sünnet'],
  ['Deniz & Buse Yıldız', '5395556622', 'Düğün'],
  ['Okan Erdem', '5403334477', 'Kına'],
  ['Selma Kurt', '5416667733', 'Nikah'],
];

/**
 * İlk açılışta demo hesabı ve örnek verileri oluşturur.
 * Bayrak kaybolsa dahi mevcut kayıtların üzerine yazmaz — kullanıcı verisi
 * hiçbir koşulda tohum verisiyle ezilmemelidir.
 */
export function seedIfEmpty(): void {
  if (read<boolean>(KEYS.seeded, false)) return;
  const hasData =
    read<User[]>(KEYS.users, []).length > 0 ||
    read<Business[]>(KEYS.businesses, []).length > 0 ||
    read<Reservation[]>(KEYS.reservations, []).length > 0;
  write(KEYS.seeded, true);
  if (hasData) return;

  const now = new Date().toISOString();
  const ownerId = 'user_demo';
  const businessId = 'biz_demo';

  const owner: User = {
    id: ownerId,
    companyName: 'Grand Yıldız Düğün Sarayı',
    fullName: 'Demo Kullanıcı',
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    mobile: '5320001122',
    role: 'owner',
    permissions: OWNER_PERMISSIONS,
    city: 'İstanbul',
    district: 'Beylikdüzü',
    category: 'Düğün Salonu',
    capacity: 600,
    currency: 'TL',
    instagram: 'grandyildizdugun',
    referralCode: 'GRAN482',
    trialEndsAt: addDays(todayIso(), TRIAL_DAYS),
    subscriptionEndsAt: addDays(todayIso(), 240),
    createdAt: now,
    activeBusinessId: businessId,
  };

  const staff: User = {
    id: 'user_staff',
    companyName: 'Grand Yıldız Düğün Sarayı',
    fullName: 'Ayşe Personel',
    email: 'personel@duguntakip.com',
    password: 'personel1234',
    mobile: '5320003344',
    role: 'staff',
    ownerId,
    permissions: ['rezervasyon.goruntule', 'rezervasyon.duzenle', 'rapor.goruntule'],
    city: 'İstanbul',
    district: 'Beylikdüzü',
    category: 'Düğün Salonu',
    capacity: 600,
    currency: 'TL',
    referralCode: 'AYSE100',
    trialEndsAt: addDays(todayIso(), TRIAL_DAYS),
    subscriptionEndsAt: addDays(todayIso(), 240),
    createdAt: now,
    activeBusinessId: businessId,
  };

  saveUsers([owner, staff]);

  const businesses: Business[] = [
    {
      id: businessId,
      ownerId,
      name: 'Grand Yıldız Düğün Sarayı',
      category: 'Düğün Salonu',
      city: 'İstanbul',
      district: 'Beylikdüzü',
      phone: '5320001122',
      capacity: 600,
      currency: 'TL',
      address: 'Barış Mah. Gül Cad. No:12 Beylikdüzü / İstanbul',
      instagram: 'grandyildizdugun',
      about: 'Şehrin merkezinde, geniş otoparkı ve modern ses-ışık sistemleri ile hizmetinizde.',
      createdAt: now,
    },
    {
      id: 'biz_demo2',
      ownerId,
      name: 'Yıldız Kır Bahçesi',
      category: 'Kır Düğünü / Bahçe',
      city: 'İstanbul',
      district: 'Silivri',
      phone: '5320005566',
      capacity: 350,
      currency: 'TL',
      address: 'Selimpaşa Mah. Sahil Yolu No:44 Silivri / İstanbul',
      about: 'Havuz başı konsept düğünler ve kır düğünü organizasyonları.',
      createdAt: now,
    },
  ];
  write(KEYS.businesses, businesses);

  // Bir yıla yayılmış örnek rezervasyonlar
  const reservations: Reservation[] = [];
  const payments: Payment[] = [];
  const base = new Date();
  base.setDate(1);

  DEMO_CUSTOMERS.forEach((customer, i) => {
    const [name, phone, org] = customer;
    const d = new Date(base);
    d.setMonth(base.getMonth() - 4 + i);
    d.setDate(5 + ((i * 7) % 22));
    const date = toIso(d);
    const total = 60000 + (i % 7) * 25000;
    const deposit = Math.round(total * (0.2 + (i % 4) * 0.1));
    const isPast = date < todayIso();
    const orgType = org as Reservation['organizationType'];

    const reservation: Reservation = {
      id: `res_seed_${i}`,
      businessId: i % 5 === 4 ? 'biz_demo2' : businessId,
      code: `DT-${d.getFullYear()}-${1000 + i * 37}`,
      customerName: name,
      customerPhone: phone,
      customerEmail: '',
      date,
      slot: i % 3 === 0 ? 'Gündüz' : 'Gece',
      organizationType: orgType,
      guestCount: 120 + (i % 9) * 45,
      totalAmount: total,
      deposit,
      currency: 'TL',
      status: isPast ? 'Tamamlandı' : i % 6 === 5 ? 'Ön Rezervasyon' : 'Kesin Rezervasyon',
      colorKey: ORG_TO_COLOR_KEY[orgType] ?? 'diger',
      note: i % 4 === 0 ? 'Nikah masası ve sahne süslemesi dahil.' : '',
      services: ['Yemek (Açık Büfe)', 'Orkestra', 'Masa Süsleme'].slice(0, 1 + (i % 3)),
      createdAt: now,
      updatedAt: now,
    };
    reservations.push(reservation);

    if (isPast) {
      payments.push({
        id: `pay_seed_${i}`,
        reservationId: reservation.id,
        date,
        amount: total - deposit,
        method: i % 2 === 0 ? 'Nakit' : 'Havale/EFT',
        note: 'Organizasyon günü kalan tahsilat',
        createdAt: now,
      });
    } else if (i % 3 === 0) {
      payments.push({
        id: `pay_seed_${i}`,
        reservationId: reservation.id,
        date: todayIso(),
        amount: Math.round(total * 0.15),
        method: 'Kredi Kartı',
        note: 'Ara ödeme',
        createdAt: now,
      });
    }
  });

  write(KEYS.reservations, reservations);
  write(KEYS.payments, payments);

  // Örnek gelir / gider kayıtları
  const cash: CashFlowEntry[] = [];
  for (let i = 0; i < 14; i += 1) {
    const d = new Date(base);
    d.setMonth(base.getMonth() - (i % 6));
    d.setDate(3 + (i % 20));
    cash.push({
      id: `cf_seed_${i}`,
      businessId,
      kind: i % 3 === 0 ? 'Gider' : 'Gelir',
      date: toIso(d),
      category: i % 3 === 0 ? ['Personel Maaş', 'Elektrik', 'Yemek / Catering'][i % 3] : 'Rezervasyon Tahsilatı',
      amount: i % 3 === 0 ? 12000 + i * 900 : 35000 + i * 2500,
      description: i % 3 === 0 ? 'Aylık sabit gider' : 'Organizasyon tahsilatı',
      createdAt: now,
    });
  }
  write(KEYS.cashflow, cash);

  logSms({
    businessId,
    to: '5321234567',
    body: 'Sayin Ahmet & Elif Yilmaz, rezervasyonunuz kayit edilmistir. Kod: DT-2026-1000',
    kind: 'Rezervasyon',
  });
}
