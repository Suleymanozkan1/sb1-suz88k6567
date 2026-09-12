/**
 * Tarayıcı belleği tabanlı veri erişimi.
 *
 * Supabase yapılandırılmadığında devreye girer: demo modu ve otomatik testler
 * bu uygulamayı kullanır. Şifreler burada düz metin tutulur; bu yüzden demo
 * modu gerçek veri için kullanılmamalıdır (arayüzde uyarı gösterilir).
 */
import { KEYS, read, remove, write } from '../storage';
import { DEFAULT_COLOR_SETTINGS, seedIfEmpty } from '../seed';
import { nextContractCode, normalizeEmail, uid } from '../ids';
import { RepoError, type PublicReservation, type Repository, type StaffInput } from './types';
import { SABLON_SIRASI, type HatirlatmaKurali, type Sablon } from '../sablon';
import type {
  Business, CashFlowEntry, ColorSetting, EnqueueResult, Invoice,
  EventTask, Hall, Menu, Payment, PaymentAlert, PaymentAlertRecipient, PaymentEvent,
  PaymentEventKind, QuickReply, Reservation, ReservationExpense, ReservationVendor,
  SeatingTable, SmsConsent, SmsLogEntry, Vendor,
  CustomerLead, LeadMessage, LeadStatusChange, LeadStatusDef, WhatsappAccount,
  SmsQueueEntry, User,
} from '../../types';
import { ODEME_OLAYLARI, VARSAYILAN_LEAD_DURUMLARI } from '../../types';
import { odemeOlaylari } from '../odemeOlayi';
import { takipTarihi } from '../lead';
import { computeInvoice, formatInvoiceNumber } from '../invoice';

const wait = <T,>(value: T): Promise<T> => Promise.resolve(value);

function users(): User[] { return read<User[]>(KEYS.users, []); }
function saveUsers(list: User[]) { write(KEYS.users, list); }
function businesses(): Business[] { return read<Business[]>(KEYS.businesses, []); }
function reservations(): Reservation[] { return read<Reservation[]>(KEYS.reservations, []); }
function payments(): Payment[] { return read<Payment[]>(KEYS.payments, []); }
function cash(): CashFlowEntry[] { return read<CashFlowEntry[]>(KEYS.cashflow, []); }
function leads(): CustomerLead[] { return read<CustomerLead[]>(KEYS.leads, []); }
function leadMessages(): LeadMessage[] { return read<LeadMessage[]>(KEYS.leadMessages, []); }
function statusHistory(): LeadStatusChange[] {
  return read<LeadStatusChange[]>(KEYS.leadStatusHistory, []);
}
function dugunGiderleri(): ReservationExpense[] {
  return read<ReservationExpense[]>(KEYS.reservationExpenses, []);
}
function leadStatuses(): LeadStatusDef[] {
  return read<LeadStatusDef[]>(KEYS.leadStatuses, []);
}
/**
 * İşletmenin durum listesi.
 *
 * Kaydedilmiş satır yoksa varsayılan akış dönüyor ve bu liste DEPOYA
 * YAZILMIYOR: durumlar sunucuda tetikleyiciyle tohumlanıyor, tanıtım
 * kipinde de aynı davranış korunuyor. Ayrı ayrı hesaplanmaması önemli --
 * otomatik takip bu listedeki gün sayısına bakıyor ve boş bir liste,
 * takibin sessizce hiç kurulmamasına yol açardı.
 */
function isletmeDurumlari(businessId: string): LeadStatusDef[] {
  const kayitli = leadStatuses().filter((d) => d.businessId === businessId);
  if (kayitli.length > 0) return [...kayitli].sort((a, b) => a.sortOrder - b.sortOrder);
  return VARSAYILAN_LEAD_DURUMLARI.map((d) => ({
    ...d, id: `durum_${businessId}_${d.code}`, businessId,
  }));
}

function hizliYanitlar(): QuickReply[] {
  return read<QuickReply[]>(KEYS.quickReplies, []);
}

function odemeOlaylariKaydi(): PaymentEvent[] {
  return read<PaymentEvent[]>(KEYS.paymentEvents, []);
}
function odemeKurallari(): PaymentAlert[] {
  return read<PaymentAlert[]>(KEYS.paymentAlerts, []);
}
function odemeAlicilari(): PaymentAlertRecipient[] {
  return read<PaymentAlertRecipient[]>(KEYS.paymentAlertRecipients, []);
}

/**
 * Sunucudaki `payment_alerts_tohumla` ile aynı metinler.
 *
 * Hepsi KAPALI: yeni kurulan bir salonda yönetici metni okumadan SMS
 * gitmeye başlamamalı, SMS ücretli.
 */
const VARSAYILAN_ODEME_METNI: Record<PaymentEventKind, string> = {
  tahsilat_eklendi: '{isletme}: {kod} sozlesmesine {tutar} tahsilat girildi ({tip}). Kalan: {kalan}. Islem: {kullanici}',
  tutar_degisti: '{isletme}: {kod} sozlesmesinde tahsilat {eski_tutar} -> {tutar} olarak degistirildi. Kalan: {kalan}. Islem: {kullanici}',
  tip_degisti: '{isletme}: {kod} sozlesmesinde {tutar} tahsilatin odeme tipi {eski_tip} -> {tip} oldu. Islem: {kullanici}',
  tarih_degisti: '{isletme}: {kod} sozlesmesinde {tutar} tahsilatin tarihi degistirildi. Islem: {kullanici}',
  tahsilat_silindi: '{isletme}: {kod} sozlesmesinden {tutar} tahsilat SILINDI. Kalan: {kalan}. Islem: {kullanici}',
  kasaya_girmedi: '{isletme}: {kod} sozlesmesinde {tutar} tahsilat {tip} olarak alindi, kasaya girmedi. Islem: {kullanici}',
};

/**
 * Tanıtım kipinde olay kaydını yazar.
 *
 * Gerçek kurulumda bunu veritabanı tetikleyicisi yapıyor; kural ortak bir
 * modülde (`odemeOlaylari`) duruyor ki iki taraf aynı olayı üretsin.
 * Burada SMS kuyruğa ALINMIYOR: tanıtım kipinde gönderecek bir sağlayıcı
 * yok ve olmayan bir gönderimi kuyrukta göstermek yanıltıcı olurdu.
 */
function olayYaz(oncesi: Payment | null, sonrasi: Payment | null): void {
  const kayit = sonrasi ?? oncesi;
  if (!kayit) return;
  const rezervasyon = reservations().find((r) => r.id === kayit.reservationId);
  if (!rezervasyon) return;

  const simdi = new Date().toISOString();
  const satirlar: PaymentEvent[] = odemeOlaylari(oncesi, sonrasi).map((event) => ({
    id: uid('odeme-olay'),
    businessId: rezervasyon.businessId,
    reservationId: rezervasyon.id,
    paymentId: kayit.id,
    event,
    amount: kayit.amount,
    oldAmount: oncesi && sonrasi ? oncesi.amount : undefined,
    method: kayit.method,
    oldMethod: oncesi && sonrasi ? oncesi.method : undefined,
    actorEmail: '',
    createdAt: simdi,
  }));

  if (satirlar.length > 0) write(KEYS.paymentEvents, [...odemeOlaylariKaydi(), ...satirlar]);
}

/**
 * Hareketi doğuran satır gelir mi gider mi?
 *
 * Rezervasyondan türeyen satırlar (kapora / tahsilat) her zaman gelirdir;
 * elle girilen satırın türü kasa defterinde yazılıdır. Kaynak bulunamazsa
 * gelir varsayılır: kasaya işlenemeyecek bir kayıttır ve diğer kurallar
 * zaten devreye girer.
 */
function consents(): SmsConsent[] { return read<SmsConsent[]>(KEYS.consents, []); }
function queue(): SmsQueueEntry[] { return read<SmsQueueEntry[]>(KEYS.queue, []); }
function invoices(): Invoice[] { return read<Invoice[]>(KEYS.invoices, []); }

/** 5321234567 biçimine indirger */
function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '').replace(/^90/, '').replace(/^0/, '');
  return /^5\d{9}$/.test(digits) ? digits : null;
}

/** Oturumdaki kullanıcı; oturum yoksa null. */

const halls = () => read<Hall[]>(KEYS.halls, []);
const menus = () => read<Menu[]>(KEYS.menus, []);
const seating = () => read<SeatingTable[]>(KEYS.seating, []);
/**
 * Varsayılan taslak metinler.
 *
 * Metinler `supabase/migrations/0010_hatirlatma_sablonlari.sql` içindeki
 * `seed_message_templates` ile birebir aynıdır; demo ile gerçek kurulumun
 * farklı mesaj göstermesi kullanıcı için hatadır.
 */
const VARSAYILAN_SABLON: Record<
  Sablon['key'], { title: string; body: string; kind: string; category: Sablon['category'] }
> = {
  rezervasyon_onay: {
    title: 'Rezervasyon onayı', kind: 'Rezervasyon', category: 'islem',
    body: 'Sayin {musteri}, {tarih} {seans} rezervasyonunuz alinmistir. Sorgu kodu: {kod}',
  },
  tarih_hatirlatma: {
    title: 'Tarih hatırlatması', kind: 'Hatırlatma', category: 'islem',
    body: 'Sayin {musteri}, {tarih} tarihli organizasyonunuz yaklasiyor. {salon}',
  },
  odeme_hatirlatma: {
    title: 'Ödeme hatırlatması', kind: 'Hatırlatma', category: 'islem',
    body: 'Sayin {musteri}, {tarih} organizasyonunuz icin kalan tutar {kalan} TL',
  },
  tahsilat_bildirimi: {
    title: 'Tahsilat bildirimi', kind: 'Bilgilendirme', category: 'islem',
    body: 'Sayin {musteri}, {odenen} TL odemeniz alinmistir. Kalan {kalan} TL',
  },
  etkinlik_gunu: {
    title: 'Etkinlik günü', kind: 'Hatırlatma', category: 'islem',
    body: 'Sayin {musteri}, bugun {seans} seansinda {salon} sizi bekliyor',
  },
  /*
    Madde 14'teki yeni türler. Üçü de OLAYA bağlı, takvime değil: prova
    randevusu alındığında, albüm hazır olduğunda gönderilir. Otomatik
    kurala bağlanmamalarının sebebi bu -- tarihe bağlı bir gönderim,
    hazır olmayan bir albümü "hazır" diye duyururdu.
  */
  prova: {
    title: 'Prova', kind: 'Hatırlatma', category: 'islem',
    body: 'Sayin {musteri}, {tarih} organizasyonunuz icin prova randevunuzu belirleyelim. Bizi arayabilirsiniz.',
  },
  foto_secim: {
    title: 'Fotoğraf / video seçimi', kind: 'Bilgilendirme', category: 'islem',
    body: 'Sayin {musteri}, dugun fotograf ve video seciminiz icin bizi bekliyoruz. Uygun gununuzu bildiriniz.',
  },
  foto_hazir: {
    title: 'Fotoğraflar hazır', kind: 'Bilgilendirme', category: 'islem',
    body: 'Sayin {musteri}, {tarih} organizasyonunuzun fotograf ve videolari hazir. Teslim icin bizi ariniz.',
  },
  tesekkur: {
    title: 'Teşekkür', kind: 'Bilgilendirme', category: 'ticari',
    body: 'Sayin {musteri}, bizi tercih ettiginiz icin tesekkur ederiz',
  },
  kampanya: {
    title: 'Kampanya duyurusu', kind: 'Bilgilendirme', category: 'ticari',
    body: 'Sayin {musteri}, sezon fiyatlarimiz icin bizi arayabilirsiniz',
  },
};

function varsayilanSablonlar(businessId: string): Sablon[] {
  return SABLON_SIRASI.map((key) => ({
    id: `tpl-${businessId}-${key}`, businessId, key,
    ...VARSAYILAN_SABLON[key], isActive: true,
  }));
}

/** Açık gelen iki kural, mevzuat açısından muaf olan işlem bildirimleridir. */
const VARSAYILAN_KURAL: Partial<
  Record<Sablon['key'], { enabled: boolean; daysBefore: number; sendHour: number }>
> = {
  tarih_hatirlatma: { enabled: true, daysBefore: 7, sendHour: 10 },
  odeme_hatirlatma: { enabled: true, daysBefore: 3, sendHour: 10 },
  etkinlik_gunu: { enabled: false, daysBefore: 0, sendHour: 9 },
  tesekkur: { enabled: false, daysBefore: -1, sendHour: 12 },
};

function varsayilanKurallar(businessId: string): HatirlatmaKurali[] {
  return (Object.keys(VARSAYILAN_KURAL) as Sablon['key'][]).map((key) => ({
    id: `rule-${businessId}-${key}`, businessId, key, ...VARSAYILAN_KURAL[key]!,
  }));
}

const templates = () => read<Sablon[]>(KEYS.templates, []);
const rules = () => read<HatirlatmaKurali[]>(KEYS.reminderRules, []);

const tasks = () => read<EventTask[]>(KEYS.tasks, []);
const vendors = () => read<Vendor[]>(KEYS.vendors, []);
const resVendors = () => read<ReservationVendor[]>(KEYS.resVendors, []);

function requireUser(id: string): User {
  const found = users().find((u) => u.id === id);
  if (!found) throw new RepoError('Kullanıcı bulunamadı.');
  return found;
}

/** Kullanıcının veri sahibi kapsamı: personel ise bağlı olduğu yönetici */
function scopeOf(user: User): string {
  return user.role === 'staff' ? user.ownerId ?? user.id : user.id;
}

/** Kuyruk kaydını yazar (demo modunda gönderim yapılmaz) */
function pushQueue(
  input: { businessId: string; body: string; kind: SmsLogEntry['kind']; category: SmsQueueEntry['category'] },
  phone: string,
  status: SmsQueueEntry['status'],
  lastError?: string,
): void {
  const now = new Date().toISOString();
  write(KEYS.queue, [...queue(), {
    id: uid('q'), phone, body: input.body, kind: input.kind, category: input.category,
    status, attempts: 0, nextAttemptAt: now, lastError, createdAt: now,
  }]);
}

export const localRepo: Repository = {
  kind: 'local',

  async getSession() {
    seedIfEmpty();
    const id = read<string | null>(KEYS.session, null);
    if (!id) return null;
    const found = users().find((u) => u.id === id);
    if (!found) { remove(KEYS.session); return null; }
    return wait(found);
  },

  async signIn(email, password) {
    seedIfEmpty();
    const needle = normalizeEmail(email);
    const found = users().find((u) => normalizeEmail(u.email) === needle);
    if (!found) throw new RepoError('Bu e-posta adresi ile kayıtlı hesap bulunamadı.');
    if (found.password !== password) throw new RepoError('E-posta veya şifreniz hatalı.');
    write(KEYS.session, found.id);
    return wait(found);
  },

  async signOut() { remove(KEYS.session); },

  async requestPasswordReset() {
    throw new RepoError('Şifre sıfırlama yalnızca veritabanı bağlıyken kullanılabilir.');
  },

  async changePassword(currentPassword, nextPassword) {
    const id = read<string | null>(KEYS.session, null);
    if (!id) throw new RepoError('Oturumunuz bulunamadı.');
    const user = requireUser(id);
    if (user.password !== currentPassword) throw new RepoError('Mevcut şifreniz hatalı.');
    saveUsers(users().map((u) => (u.id === id ? { ...u, password: nextPassword } : u)));
  },

  async updateProfile(patch) {
    const id = read<string | null>(KEYS.session, null);
    if (!id) throw new RepoError('Oturumunuz bulunamadı.');
    const next = { ...requireUser(id), ...patch };
    saveUsers(users().map((u) => (u.id === id ? next : u)));
    return wait(next);
  },

  async listStaff(ownerId) {
    return wait(users().filter((u) => u.role === 'staff' && u.ownerId === ownerId));
  },

  async saveStaff(ownerId, input: StaffInput) {
    const owner = requireUser(ownerId);
    const duplicate = users().find(
      (u) => normalizeEmail(u.email) === normalizeEmail(input.email) && u.id !== input.id,
    );
    if (duplicate) throw new RepoError('Bu e-posta adresi başka bir kullanıcıya ait.');

    const existing = input.id ? users().find((u) => u.id === input.id) : undefined;
    const record: User = {
      id: input.id ?? uid('user'),
      companyName: owner.companyName,
      fullName: input.fullName,
      email: input.email.trim(),
      password: input.password || existing?.password || 'personel1234',
      mobile: input.mobile,
      role: 'staff',
      ownerId,
      permissions: input.permissions,
      city: owner.city, district: owner.district, category: owner.category,
      capacity: owner.capacity, currency: owner.currency,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      activeBusinessId: owner.activeBusinessId,
    };
    const list = users();
    const idx = list.findIndex((u) => u.id === record.id);
    if (idx >= 0) list[idx] = record; else list.push(record);
    saveUsers(list);
  },

  async deleteStaff(id) { saveUsers(users().filter((u) => u.id !== id)); },

  async listBusinesses(ownerId) {
    return wait(businesses().filter((b) => b.ownerId === ownerId));
  },

  async saveBusiness(business) {
    const list = businesses();
    const record: Business = { ...business, createdAt: business.createdAt ?? new Date().toISOString() };
    const idx = list.findIndex((b) => b.id === record.id);
    if (idx >= 0) list[idx] = record; else list.push(record);
    write(KEYS.businesses, list);
    return wait(record);
  },

  async deleteBusiness(id) {
    write(KEYS.businesses, businesses().filter((b) => b.id !== id));
    const removed = reservations().filter((r) => r.businessId === id).map((r) => r.id);
    write(KEYS.reservations, reservations().filter((r) => r.businessId !== id));
    write(KEYS.payments, payments().filter((p) => !removed.includes(p.reservationId)));
    write(KEYS.cashflow, cash().filter((c) => c.businessId !== id));
  },

  async listReservations(businessId) {
    return wait(reservations()
      .filter((r) => r.businessId === businessId)
      .sort((a, b) => b.date.localeCompare(a.date)));
  },

  async getReservation(id) {
    return wait(reservations().find((r) => r.id === id) ?? null);
  },

  async saveReservation(reservation) {
    // Veritabanındaki tetikleyicinin karşılığı: kod boşsa sıradaki
    // sözleşme numarası atanır, dolu kod hiçbir zaman değiştirilmez.
    if (!reservation.code.trim()) {
      const kodlar = reservations()
        .filter((r) => r.businessId === reservation.businessId)
        .map((r) => r.code);
      /*
        Yıl ORGANİZASYON GÜNÜNDEN geliyor, bugünden değil (madde 13):
        2026'da satılan bir 2027 düğünü "2026-41" olarak numaralanıyordu
        ve salon o dosyayı 2027 klasöründe arayıp bulamıyordu.
      */
      const yil = Number(reservation.date.slice(0, 4)) || new Date().getFullYear();
      reservation = { ...reservation, code: nextContractCode(kodlar, yil) };
    }
    // Veritabanındaki benzersizlik kısıtının karşılığı: çakışma SALON bazındadır
    const conflict = reservations().find(
      (r) => r.hallId === reservation.hallId && r.date === reservation.date &&
             r.slot === reservation.slot && r.status !== 'İptal' && r.id !== reservation.id,
    );
    if (conflict && reservation.status !== 'İptal') {
      throw new RepoError('Bu salonda seçilen tarih ve seans için zaten bir rezervasyon var.');
    }
    if (reservation.deposit > reservation.totalAmount) {
      throw new RepoError('Kapora, toplam tutardan büyük olamaz.');
    }
    // Salon ve menü, rezervasyonun işletmesine ait olmalı (0007 tetikleyicisi)
    const hall = halls().find((h) => h.id === reservation.hallId);
    if (!hall || hall.businessId !== reservation.businessId) {
      throw new RepoError('Salon bu işletmeye ait değil.');
    }
    if (reservation.menuId) {
      const menu = menus().find((m) => m.id === reservation.menuId);
      if (!menu || menu.businessId !== reservation.businessId) {
        throw new RepoError('Menü bu işletmeye ait değil.');
      }
    }

    const list = reservations();
    const next = { ...reservation, updatedAt: new Date().toISOString() };
    const idx = list.findIndex((r) => r.id === next.id);
    if (idx >= 0) list[idx] = next; else list.push(next);
    write(KEYS.reservations, list);
    return wait(next);
  },

  async deleteReservation(id) {
    write(KEYS.reservations, reservations().filter((r) => r.id !== id));
    write(KEYS.payments, payments().filter((p) => p.reservationId !== id));
  },

  async verifyCode(code) {
    const needle = code.trim().toUpperCase();
    const found = reservations().find((r) => r.code.toUpperCase() === needle);
    if (!found) return null;
    const business = businesses().find((b) => b.id === found.businessId);
    return wait<PublicReservation>({
      code: found.code,
      customerName: found.customerName,
      // Veritabanı fonksiyonundaki maskeleme ile aynı davranış
      customerPhone: found.customerPhone.replace(/^(\d{3})\d{5}(\d{2})$/, '$1*****$2'),
      date: found.date, slot: found.slot, organizationType: found.organizationType,
      guestCount: found.guestCount, totalAmount: found.totalAmount, status: found.status,
      businessName: business?.name ?? '',
    });
  },

  async listPayments(businessId) {
    const ids = new Set(reservations().filter((r) => r.businessId === businessId).map((r) => r.id));
    return wait(payments().filter((p) => ids.has(p.reservationId)));
  },

  async addPayment(payment) {
    write(KEYS.payments, [...payments(), payment]);
    olayYaz(null, payment);
  },

  async updatePayment(payment) {
    const onceki = payments().find((p) => p.id === payment.id) ?? null;
    write(KEYS.payments, payments().map((p) => (p.id === payment.id ? payment : p)));
    olayYaz(onceki, payment);
  },

  async deletePayment(id) {
    const onceki = payments().find((p) => p.id === id) ?? null;
    write(KEYS.payments, payments().filter((p) => p.id !== id));
    olayYaz(onceki, null);
  },

  async listPaymentEvents(businessId) {
    return wait(odemeOlaylariKaydi()
      .filter((o) => o.businessId === businessId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  },

  async listPaymentAlerts(businessId) {
    const kayitli = odemeKurallari().filter((k) => k.businessId === businessId);
    // Tohumlama sunucuda tetikleyiciyle yapılıyor; yerel kipte ilk
    // okumada üretiliyor ki ekran boş bir listeyle açılmasın.
    if (kayitli.length > 0) return wait(kayitli);
    const varsayilan = ODEME_OLAYLARI.map((event) => ({
      id: uid('odeme-kural'), businessId, event, enabled: false,
      body: VARSAYILAN_ODEME_METNI[event],
    }));
    write(KEYS.paymentAlerts, [...odemeKurallari(), ...varsayilan]);
    return wait(varsayilan);
  },

  async savePaymentAlert(alert) {
    const hepsi = odemeKurallari();
    const yeni = hepsi.some((k) => k.id === alert.id)
      ? hepsi.map((k) => (k.id === alert.id ? alert : k))
      : [...hepsi, alert];
    write(KEYS.paymentAlerts, yeni);
    return wait(alert);
  },

  async listPaymentAlertRecipients(businessId) {
    return wait(odemeAlicilari()
      .filter((a) => a.businessId === businessId)
      .sort((a, b) => a.name.localeCompare(b.name, 'tr')));
  },

  async savePaymentAlertRecipient(alici) {
    const hepsi = odemeAlicilari();
    const yeni = hepsi.some((a) => a.id === alici.id)
      ? hepsi.map((a) => (a.id === alici.id ? alici : a))
      : [...hepsi, alici];
    write(KEYS.paymentAlertRecipients, yeni);
    return wait(alici);
  },

  async deletePaymentAlertRecipient(id) {
    write(KEYS.paymentAlertRecipients, odemeAlicilari().filter((a) => a.id !== id));
  },

  async listCashFlow(businessId) {
    return wait(cash()
      .filter((c) => c.businessId === businessId)
      .sort((a, b) => b.date.localeCompare(a.date)));
  },

  async listReservationExpenses(businessId) {
    return wait(dugunGiderleri()
      .filter((g) => g.businessId === businessId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  },

  async saveReservationExpense(expense) {
    const hepsi = dugunGiderleri();
    const simdi = new Date().toISOString();
    const eski = hepsi.find((g) => g.id === expense.id);
    const kayit = {
      ...expense,
      createdAt: eski?.createdAt || expense.createdAt || simdi,
      updatedAt: simdi,
    };
    write(KEYS.reservationExpenses, eski
      ? hepsi.map((g) => (g.id === expense.id ? kayit : g))
      : [...hepsi, kayit]);
    return wait(undefined);
  },

  async deleteReservationExpense(id) {
    write(KEYS.reservationExpenses, dugunGiderleri().filter((g) => g.id !== id));
    return wait(undefined);
  },

  async addCashFlow(entry) { write(KEYS.cashflow, [...cash(), entry]); },

  async deleteCashFlow(id) {
    write(KEYS.cashflow, cash().filter((c) => c.id !== id));
  },


  async listLeads(businessId) {
    return wait(leads()
      .filter((l) => l.businessId === businessId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
  },

  async getLead(id) {
    return wait(leads().find((l) => l.id === id) ?? null);
  },

  async saveLead(lead) {
    const hepsi = leads();
    // Aynı numaradan ikinci kayıt açılmamalı; veritabanındaki benzersiz
    // indeksin karşılığı.
    const cakisan = hepsi.find((l) => l.id !== lead.id
      && l.businessId === lead.businessId
      && l.phone.trim() !== '' && l.phone === lead.phone);
    if (cakisan) {
      throw new RepoError('Bu telefon numarasıyla kayıtlı bir müşteri adayı zaten var.');
    }

    const now = new Date().toISOString();
    const eski = hepsi.find((l) => l.id === lead.id);
    const kayit: CustomerLead = {
      ...lead,
      // Otomatik takip: sunucuda tetikleyici yapıyor, tanıtım kipinde
      // burada. Kural ortak modülde (`takipTarihi`) duruyor ki iki taraf
      // aynı günü kursun.
      nextFollowupAt: takipTarihi(lead, eski ?? null, isletmeDurumlari(lead.businessId)),
      createdAt: eski?.createdAt || lead.createdAt || now,
      updatedAt: now,
    };
    write(KEYS.leads, eski
      ? hepsi.map((l) => (l.id === lead.id ? kayit : l))
      : [...hepsi, kayit]);

    // Durum değiştiyse geçmişe yaz; veritabanındaki tetikleyicinin karşılığı.
    if (!eski || eski.status !== kayit.status) {
      write(KEYS.leadStatusHistory, [...statusHistory(), {
        id: uid('durum'), leadId: kayit.id,
        fromStatus: eski ? eski.status : null,
        toStatus: kayit.status, actorEmail: '', createdAt: now,
      }]);
    }
    return wait(kayit);
  },

  async deleteLead(id) {
    write(KEYS.leads, leads().filter((l) => l.id !== id));
    write(KEYS.leadMessages, leadMessages().filter((m) => m.leadId !== id));
    write(KEYS.leadStatusHistory, statusHistory().filter((h) => h.leadId !== id));
  },

  async listLeadMessages(leadId) {
    return wait(leadMessages()
      .filter((m) => m.leadId === leadId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
  },

  async addLeadMessage(message) {
    write(KEYS.leadMessages, [...leadMessages(), message]);
  },

  /**
   * İşletmenin durumları.
   *
   * Demo modunda tablo boş olabilir; o zaman varsayılan akış üretiliyor.
   * Boş liste dönseydi aday ekranı hiç durum gösteremezdi.
   */
  async listQuickReplies(businessId) {
    return wait(hizliYanitlar()
      .filter((y) => y.businessId === businessId)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, 'tr')));
  },

  async saveQuickReply(yanit) {
    const hepsi = hizliYanitlar();
    const ayniBaslik = hepsi.find((y) => y.id !== yanit.id
      && y.businessId === yanit.businessId
      && y.title.trim().toLocaleLowerCase('tr') === yanit.title.trim().toLocaleLowerCase('tr'));
    if (ayniBaslik) throw new RepoError('Bu başlıkla bir hızlı yanıt zaten var.');

    const yeni = hepsi.some((y) => y.id === yanit.id)
      ? hepsi.map((y) => (y.id === yanit.id ? yanit : y))
      : [...hepsi, yanit];
    write(KEYS.quickReplies, yeni);
    return wait(yanit);
  },

  async deleteQuickReply(id) {
    write(KEYS.quickReplies, hizliYanitlar().filter((y) => y.id !== id));
  },

  async listLeadStatuses(businessId) {
    return wait(isletmeDurumlari(businessId));
  },

  async saveLeadStatus(durum) {
    const hepsi = leadStatuses();
    const ayniKod = hepsi.find((d) => d.id !== durum.id
      && d.businessId === durum.businessId && d.code === durum.code);
    if (ayniKod) throw new RepoError('Bu kodla bir durum zaten var.');

    // Veritabanındaki tekil indekslerin karşılığı: başlangıç ve kazanım
    // durumu işletmede tek olmalı.
    const digerleri = (bizim: LeadStatusDef[]) => bizim.map((d) => {
      if (d.businessId !== durum.businessId || d.id === durum.id) return d;
      return {
        ...d,
        isInitial: durum.isInitial ? false : d.isInitial,
        isWon: durum.isWon ? false : d.isWon,
      };
    });

    const temel = hepsi.length > 0 ? hepsi
      : VARSAYILAN_LEAD_DURUMLARI.map((d) => ({
        ...d, id: `durum_${durum.businessId}_${d.code}`, businessId: durum.businessId,
      }));
    const eski = temel.find((d) => d.id === durum.id);
    const sonraki = digerleri(temel);
    write(KEYS.leadStatuses, eski
      ? sonraki.map((d) => (d.id === durum.id ? durum : d))
      : [...sonraki, durum]);
    return wait(durum);
  },

  async deleteLeadStatus(id) {
    const hepsi = leadStatuses();
    const durum = hepsi.find((d) => d.id === id);
    if (!durum) return wait(undefined);
    if (durum.isInitial) {
      throw new RepoError(
        'Başlangıç durumu silinemez. Önce başka bir durumu başlangıç yapın.');
    }
    // Yabancı anahtarın karşılığı: kullanımdaki durum silinemez.
    const kullanan = leads().some((l) => l.businessId === durum.businessId
      && l.status === durum.code);
    if (kullanan) {
      throw new RepoError(
        'Bu durumu kullanan müşteri adayları var. Silmek yerine pasife alın.');
    }
    write(KEYS.leadStatuses, hepsi.filter((d) => d.id !== id));
    return wait(undefined);
  },

  async listLeadStatusHistory(leadId) {
    // Aynı milisaniyede iki değişiklik olabiliyor; damga eşitse yazılma
    // sırası karar veriyor. Yoksa geçmiş kendi içinde ters görünürdü.
    const hepsi = statusHistory();
    return wait(hepsi
      .map((h, i) => ({ h, i }))
      .filter((x) => x.h.leadId === leadId)
      .sort((a, b) => b.h.createdAt.localeCompare(a.h.createdAt) || b.i - a.i)
      .map((x) => x.h));
  },

  async getWhatsappAccount(businessId) {
    const hepsi = read<WhatsappAccount[]>(KEYS.whatsappAccounts, []);
    return wait(hepsi.find((h) => h.businessId === businessId) ?? null);
  },

  async saveWhatsappAccount(account) {
    const hepsi = read<WhatsappAccount[]>(KEYS.whatsappAccounts, []);
    // Numara kimliği birincil anahtar; işletme başına tek numara tutuluyor,
    // bu yüzden numara değiştiğinde eski satır kalmamalı.
    const kalan = hepsi.filter(
      (h) => h.businessId !== account.businessId && h.phoneNumberId !== account.phoneNumberId,
    );
    kalan.push(account);
    write(KEYS.whatsappAccounts, kalan);
    return wait(account);
  },

  async getColorSettings(businessId) {
    const map = read<Record<string, ColorSetting[]>>(KEYS.colors, {});
    return wait(map[businessId] ?? DEFAULT_COLOR_SETTINGS);
  },

  async saveColorSettings(businessId, settings) {
    const map = read<Record<string, ColorSetting[]>>(KEYS.colors, {});
    map[businessId] = settings;
    write(KEYS.colors, map);
  },

  async listSms(businessId) {
    const all = read<SmsLogEntry[]>(KEYS.sms, []);
    // Zaman damgası eşitse ekleme sırası belirleyici olsun diye kararlı sıralama
    return wait(all
      .map((entry, index) => ({ entry, index }))
      .filter((x) => x.entry.businessId === businessId)
      .sort((a, b) => b.entry.sentAt.localeCompare(a.entry.sentAt) || b.index - a.index)
      .map((x) => x.entry));
  },

  async logSms(entry) {
    const all = read<SmsLogEntry[]>(KEYS.sms, []);
    all.push({ ...entry, id: uid('sms'), sentAt: new Date().toISOString() });
    write(KEYS.sms, all);
  },

  /**
   * Demo modunda denetim kaydı yoktur: kayıt veritabanı tetikleyicileriyle
   * yazılır ve tarayıcıda karşılığı bulunmaz. Ekran bunu açıkça bildirir.
   */
  async listAuditLog() {
    return wait([]);
  },

  /**
   * Veritabanındaki enqueue_sms fonksiyonu ile aynı kuralları uygular:
   * işlem bildirimleri muaftır, ticari ileti İYS onayı ister.
   */
  async enqueueSms(input) {
    const phone = normalizePhone(input.phone);
    if (!phone) return wait<EnqueueResult>({ queued: false, reason: 'Geçersiz cep telefonu numarası.' });

    const record = consents().find((c) => c.businessId === input.businessId && c.phone === phone);

    if (input.category === 'ticari') {
      if (record?.status === 'RET') {
        pushQueue(input, phone, 'iptal', 'Alıcı ticari ileti almayı reddetmiş (İYS: RET).');
        return wait<EnqueueResult>({ queued: false, reason: 'Alıcı ticari ileti almayı reddetmiş.' });
      }
      if (record?.status !== 'ONAY') {
        pushQueue(input, phone, 'iptal', 'İYS onayı bulunmuyor.');
        return wait<EnqueueResult>({ queued: false, reason: 'Bu numara için İYS onayı bulunmuyor.' });
      }
    }

    pushQueue(input, phone, 'bekliyor');
    return wait<EnqueueResult>({ queued: true });
  },

  async listSmsQueue(businessId, limit) {
    void businessId;
    return wait(queue().slice(-limit).reverse());
  },

  async listConsents(businessId) {
    return wait(consents()
      .filter((c) => c.businessId === businessId)
      .sort((a, b) => b.consentDate.localeCompare(a.consentDate)));
  },

  async saveConsent(input) {
    const phone = normalizePhone(input.phone);
    if (!phone) throw new RepoError('Geçersiz cep telefonu numarası.');

    const list = consents();
    const idx = list.findIndex((c) => c.businessId === input.businessId && c.phone === phone);
    const record: SmsConsent = {
      id: idx >= 0 ? list[idx].id : uid('cns'),
      businessId: input.businessId,
      phone,
      status: input.status,
      source: input.source,
      consentDate: new Date().toISOString(),
      note: input.note,
    };
    if (idx >= 0) list[idx] = record; else list.push(record);
    write(KEYS.consents, list);
  },

  async deleteConsent(id) {
    write(KEYS.consents, consents().filter((c) => c.id !== id));
  },

  async listInvoices(businessId) {
    return wait(invoices()
      .filter((i) => i.businessId === businessId)
      .sort((a, b) => b.issueDate.localeCompare(a.issueDate)));
  },

  async getInvoice(id) {
    return wait(invoices().find((i) => i.id === id) ?? null);
  },

  async createInvoice(input) {
    const totals = computeInvoice(input.lines);
    const list = invoices();
    const year = new Date().getFullYear();
    // Sıra numarası aynı seri içinde kesintisiz ilerlemeli
    const sequence = list.filter((i) => i.businessId === input.businessId).length + 1;

    const record: Invoice = {
      id: uid('inv'),
      businessId: input.businessId,
      reservationId: input.reservationId,
      invoiceNumber: formatInvoiceNumber('DGT', year, sequence),
      kind: input.kind,
      status: 'taslak',
      issueDate: new Date().toISOString().slice(0, 10),
      serviceDate: input.serviceDate,
      buyerKind: input.buyerKind,
      buyerName: input.buyerName,
      buyerTaxId: input.buyerTaxId,
      buyerTaxOffice: input.buyerTaxOffice,
      buyerAddress: input.buyerAddress,
      buyerEmail: input.buyerEmail,
      buyerPhone: input.buyerPhone,
      grossKurus: totals.grossKurus,
      discountKurus: totals.discountKurus,
      baseKurus: totals.baseKurus,
      vatKurus: totals.vatKurus,
      totalKurus: totals.totalKurus,
      note: input.note,
      createdAt: new Date().toISOString(),
      lines: input.lines.map((line, index) => ({
        lineNo: index + 1,
        description: line.description,
        quantity: line.quantity,
        unit: line.unit,
        unitPriceKurus: Math.round(line.unitPrice * 100),
        discountRate: line.discountRate ?? 0,
        vatRate: line.vatRate,
        baseKurus: totals.lines[index].baseKurus,
        vatKurus: totals.lines[index].vatKurus,
        totalKurus: totals.lines[index].totalKurus,
      })),
    };

    write(KEYS.invoices, [...list, record]);
    return wait(record);
  },

  async sendInvoice() {
    return wait({
      sent: false,
      reason: 'Demo modunda fatura gönderilmez; e-Fatura entegratörü gereklidir.',
    });
  },

  async cancelInvoice(id, reason) {
    write(KEYS.invoices, invoices().map((i) =>
      i.id === id ? { ...i, status: 'iptal' as const, cancelReason: reason } : i));
  },

  /** Demo modunda kuyruk ve izin verileri tarayıcıdan okunur; yedek alınmaz. */
  async getSystemHealth() {
    const pending = queue().filter((q) => q.status === 'bekliyor' || q.status === 'gonderiliyor');
    const oldest = pending.reduce<number>((max, q) => {
      const minutes = Math.floor((Date.now() - new Date(q.createdAt).getTime()) / 60000);
      return Math.max(max, minutes);
    }, 0);

    return wait({
      kuyrukBekleyen: pending.length,
      kuyrukBasarisiz: queue().filter((q) => q.status === 'basarisiz').length,
      kuyrukEngellenen: queue().filter((q) => q.status === 'iptal').length,
      kuyrukEnEskiDakika: oldest,
      iysAktarilmamis: consents().filter((c) => !c.iysSyncedAt).length,
      basarisizGiris24s: 0,
      sonYedek: null,
    });
  },

  /** Demo modunda dışa aktarım tarayıcıdaki kayıtlardan üretilir. */
  async exportData(ownerId) {
    const owned = businesses().filter((b) => b.ownerId === ownerId).map((b) => b.id);
    const reservationsOfOwner = reservations().filter((r) => owned.includes(r.businessId));
    const reservationIds = reservationsOfOwner.map((r) => r.id);

    return wait({
      surum: 1,
      olusturma: new Date().toISOString(),
      owner_id: ownerId,
      isletmeler: businesses().filter((b) => b.ownerId === ownerId),
      rezervasyonlar: reservationsOfOwner,
      tahsilatlar: payments().filter((p) => reservationIds.includes(p.reservationId)),
      kasa: cash().filter((c) => owned.includes(c.businessId)),
      sms_izinleri: consents().filter((c) => owned.includes(c.businessId)),
    });
  },


  async listHalls(businessId) {
    return wait(halls().filter((h) => h.businessId === businessId)
      .sort((a, b) => a.name.localeCompare(b.name, 'tr')));
  },

  async saveHall(hall) {
    const list = halls();
    const duplicate = list.some(
      (h) => h.businessId === hall.businessId && h.id !== hall.id &&
             h.name.trim().toLocaleLowerCase('tr') === hall.name.trim().toLocaleLowerCase('tr'),
    );
    if (duplicate) throw new RepoError('Bu isimde bir salon zaten var.');

    const next: Hall = { ...hall, createdAt: hall.createdAt ?? new Date().toISOString() };
    const idx = list.findIndex((h) => h.id === next.id);
    if (idx >= 0) list[idx] = next; else list.push(next);
    write(KEYS.halls, list);
    return wait(next);
  },

  async deleteHall(id) {
    // Rezervasyonu olan salon silinmez; veritabanındaki on delete restrict karşılığı
    if (reservations().some((r) => r.hallId === id)) {
      throw new RepoError('Bu salona bağlı rezervasyonlar var; salonu silmek yerine pasife alın.');
    }
    write(KEYS.halls, halls().filter((h) => h.id !== id));
    return wait(undefined);
  },

  async listMenus(businessId) {
    return wait(menus().filter((m) => m.businessId === businessId)
      .sort((a, b) => a.name.localeCompare(b.name, 'tr')));
  },

  async saveMenu(menu) {
    const list = menus();
    const duplicate = list.some(
      (m) => m.businessId === menu.businessId && m.id !== menu.id &&
             m.name.trim().toLocaleLowerCase('tr') === menu.name.trim().toLocaleLowerCase('tr'),
    );
    if (duplicate) throw new RepoError('Bu isimde bir menü zaten var.');
    if (menu.priceKurus < 0) throw new RepoError('Menü fiyatı negatif olamaz.');

    const next: Menu = { ...menu, createdAt: menu.createdAt ?? new Date().toISOString() };
    const idx = list.findIndex((m) => m.id === next.id);
    if (idx >= 0) list[idx] = next; else list.push(next);
    write(KEYS.menus, list);
    return wait(next);
  },

  async deleteMenu(id) {
    write(KEYS.menus, menus().filter((m) => m.id !== id));
    // Menüsü silinen rezervasyonlar bağlantısız kalır (on delete set null karşılığı)
    write(KEYS.reservations, reservations().map(
      (r) => (r.menuId === id ? { ...r, menuId: undefined } : r),
    ));
    return wait(undefined);
  },

  async listSeating(reservationId) {
    return wait(seating().filter((t) => t.reservationId === reservationId)
      .sort((a, b) => a.tableNo - b.tableNo));
  },

  async saveSeating(reservationId, tables) {
    const numbers = tables.map((t) => t.tableNo);
    if (new Set(numbers).size !== numbers.length) {
      throw new RepoError('Aynı masa numarası birden çok kez kullanılamaz.');
    }
    if (tables.some((t) => t.seats < 1 || t.seats > 50)) {
      throw new RepoError('Masa başına koltuk sayısı 1 ile 50 arasında olmalıdır.');
    }
    const others = seating().filter((t) => t.reservationId !== reservationId);
    const next = tables.map((t) => ({ ...t, id: uid('seat'), reservationId }));
    write(KEYS.seating, [...others, ...next]);
    return wait(undefined);
  },

  async listTemplates(businessId) {
    const kayitli = templates().filter((t) => t.businessId === businessId);
    // İlk açılışta varsayılan taslaklar üretilir; boş bir liste kullanıcıya
    // "şablon yok" dedirtip özelliği kullanılamaz gösteriyordu.
    const liste = kayitli.length > 0 ? kayitli : varsayilanSablonlar(businessId);
    if (kayitli.length === 0) write(KEYS.templates, [...templates(), ...liste]);
    return wait([...liste].sort(
      (a, b) => SABLON_SIRASI.indexOf(a.key) - SABLON_SIRASI.indexOf(b.key)));
  },

  async saveTemplate(template) {
    if (template.body.trim().length === 0) {
      throw new RepoError('Mesaj metni boş olamaz.');
    }
    if (template.body.length > 900) {
      throw new RepoError('Mesaj metni 900 karakteri aşamaz.');
    }
    const list = templates();
    const i = list.findIndex((t) => t.id === template.id);
    if (i >= 0) list[i] = template; else list.push(template);
    write(KEYS.templates, list);
    return wait(template);
  },

  async listReminderRules(businessId) {
    const kayitli = rules().filter((r) => r.businessId === businessId);
    const liste = kayitli.length > 0 ? kayitli : varsayilanKurallar(businessId);
    if (kayitli.length === 0) write(KEYS.reminderRules, [...rules(), ...liste]);
    return wait([...liste].sort(
      (a, b) => SABLON_SIRASI.indexOf(a.key) - SABLON_SIRASI.indexOf(b.key)));
  },

  async saveReminderRule(rule) {
    if (rule.daysBefore < -30 || rule.daysBefore > 365) {
      throw new RepoError('Gün sayısı -30 ile 365 arasında olmalıdır.');
    }
    if (rule.sendHour < 0 || rule.sendHour > 23) {
      throw new RepoError('Gönderim saati 0 ile 23 arasında olmalıdır.');
    }
    const list = rules();
    const i = list.findIndex((r) => r.id === rule.id);
    if (i >= 0) list[i] = rule; else list.push(rule);
    write(KEYS.reminderRules, list);
    return wait(rule);
  },

  async listTasks(reservationId) {
    return wait(tasks().filter((t) => t.reservationId === reservationId)
      .sort((a, b) => a.atTime.localeCompare(b.atTime)));
  },

  async saveTasks(reservationId, rows) {
    if (rows.some((r) => !r.title.trim())) {
      throw new RepoError('İş emri satırının başlığı boş olamaz.');
    }
    const others = tasks().filter((t) => t.reservationId !== reservationId);
    write(KEYS.tasks, [
      ...others,
      ...rows.map((r) => ({ ...r, id: uid('task'), reservationId })),
    ]);
    return wait(undefined);
  },

  async listVendors(businessId) {
    return wait(vendors().filter((v) => v.businessId === businessId)
      .sort((a, b) => a.name.localeCompare(b.name, 'tr')));
  },

  async saveVendor(vendor) {
    const list = vendors();
    const duplicate = list.some(
      (v) => v.businessId === vendor.businessId && v.id !== vendor.id &&
             v.name.trim().toLocaleLowerCase('tr') === vendor.name.trim().toLocaleLowerCase('tr'),
    );
    if (duplicate) throw new RepoError('Bu isimde bir kayıt zaten var.');

    const next: Vendor = { ...vendor, createdAt: vendor.createdAt ?? new Date().toISOString() };
    const idx = list.findIndex((v) => v.id === next.id);
    if (idx >= 0) list[idx] = next; else list.push(next);
    write(KEYS.vendors, list);
    return wait(next);
  },

  async deleteVendor(id) {
    if (resVendors().some((rv) => rv.vendorId === id)) {
      throw new RepoError('Bu tedarikçi organizasyonlara bağlı; silmek yerine pasife alın.');
    }
    write(KEYS.vendors, vendors().filter((v) => v.id !== id));
    return wait(undefined);
  },

  async listReservationVendors(reservationId) {
    return wait(resVendors().filter((rv) => rv.reservationId === reservationId));
  },

  async saveReservationVendors(reservationId, rows) {
    const ids = rows.map((r) => r.vendorId);
    if (new Set(ids).size !== ids.length) {
      throw new RepoError('Aynı tedarikçi birden çok kez eklenemez.');
    }
    const reservation = reservations().find((r) => r.id === reservationId);
    if (!reservation) throw new RepoError('Rezervasyon bulunamadı.');
    // Tedarikçi, rezervasyonun işletmesine ait olmalı (0008 tetikleyicisi)
    for (const row of rows) {
      const vendor = vendors().find((v) => v.id === row.vendorId);
      if (!vendor || vendor.businessId !== reservation.businessId) {
        throw new RepoError('Tedarikçi bu işletmeye ait değil.');
      }
      if (row.cost < 0) throw new RepoError('Tedarikçi maliyeti negatif olamaz.');
    }

    const others = resVendors().filter((rv) => rv.reservationId !== reservationId);
    write(KEYS.resVendors, [
      ...others,
      ...rows.map((r) => ({ ...r, id: uid('rv'), reservationId })),
    ]);
    return wait(undefined);
  },


};

/** Testlerde kullanılmak üzere: oturumu doğrudan ayarlar */
export function setLocalSession(userId: string | null): void {
  if (userId) write(KEYS.session, userId);
  else remove(KEYS.session);
}

export { scopeOf };
