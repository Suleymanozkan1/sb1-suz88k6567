/**
 * Tarayıcı belleği tabanlı veri erişimi.
 *
 * Supabase yapılandırılmadığında devreye girer: demo modu ve otomatik testler
 * bu uygulamayı kullanır. Şifreler burada düz metin tutulur; bu yüzden demo
 * modu gerçek veri için kullanılmamalıdır (arayüzde uyarı gösterilir).
 */
import { KEYS, read, remove, write } from '../storage';
import { DEFAULT_COLOR_SETTINGS, OWNER_PERMISSIONS, seedIfEmpty } from '../seed';
import { normalizeEmail, uid } from '../ids';
import { RepoError, type PublicReservation, type Repository, type StaffInput } from './types';
import type {
  Business, CashFlowEntry, ColorSetting, ContactMessage, EnqueueResult, Invoice,
  Payment, Reservation, SmsConsent, SmsLogEntry, SmsQueueEntry, User,
} from '../../types';
import { computeInvoice, formatInvoiceNumber } from '../invoice';

const wait = <T,>(value: T): Promise<T> => Promise.resolve(value);

function users(): User[] { return read<User[]>(KEYS.users, []); }
function saveUsers(list: User[]) { write(KEYS.users, list); }
function businesses(): Business[] { return read<Business[]>(KEYS.businesses, []); }
function reservations(): Reservation[] { return read<Reservation[]>(KEYS.reservations, []); }
function payments(): Payment[] { return read<Payment[]>(KEYS.payments, []); }
function cash(): CashFlowEntry[] { return read<CashFlowEntry[]>(KEYS.cashflow, []); }
function consents(): SmsConsent[] { return read<SmsConsent[]>(KEYS.consents, []); }
function queue(): SmsQueueEntry[] { return read<SmsQueueEntry[]>(KEYS.queue, []); }
function invoices(): Invoice[] { return read<Invoice[]>(KEYS.invoices, []); }

/** 5321234567 biçimine indirger */
function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '').replace(/^90/, '').replace(/^0/, '');
  return /^5\d{9}$/.test(digits) ? digits : null;
}

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
    if (!found) throw new RepoError('Bu e-posta adresi ile kayıtlı üyelik bulunamadı.');
    if (found.password !== password) throw new RepoError('E-posta veya şifreniz hatalı.');
    write(KEYS.session, found.id);
    return wait(found);
  },

  async signUp(input) {
    seedIfEmpty();
    if (users().some((u) => normalizeEmail(u.email) === normalizeEmail(input.email))) {
      throw new RepoError('Bu e-posta adresi ile daha önce üyelik oluşturulmuş.');
    }
    const now = new Date().toISOString();
    const userId = uid('user');
    const businessId = uid('biz');

    const created: User = {
      id: userId,
      companyName: input.companyName,
      fullName: input.fullName,
      email: input.email.trim(),
      password: input.password,
      mobile: input.mobile,
      role: 'owner',
      permissions: OWNER_PERMISSIONS,
      city: input.city,
      district: input.district,
      category: input.category,
      capacity: input.capacity,
      currency: input.currency,
      facebook: input.facebook,
      instagram: input.instagram,
      createdAt: now,
      activeBusinessId: businessId,
    };
    saveUsers([...users(), created]);

    write(KEYS.businesses, [...businesses(), {
      id: businessId, ownerId: userId, name: input.companyName, category: input.category,
      city: input.city, district: input.district, phone: input.phone || input.mobile,
      capacity: input.capacity, currency: input.currency, address: input.address,
      facebook: input.facebook, instagram: input.instagram, createdAt: now,
    }]);

    write(KEYS.session, userId);
    return wait(created);
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
    // Veritabanındaki benzersizlik kısıtının karşılığı
    const conflict = reservations().find(
      (r) => r.businessId === reservation.businessId && r.date === reservation.date &&
             r.slot === reservation.slot && r.status !== 'İptal' && r.id !== reservation.id,
    );
    if (conflict && reservation.status !== 'İptal') {
      throw new RepoError('Bu tarih ve seans için zaten bir rezervasyon kaydı var.');
    }
    if (reservation.deposit > reservation.totalAmount) {
      throw new RepoError('Kaparo, toplam tutardan büyük olamaz.');
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

  async addPayment(payment) { write(KEYS.payments, [...payments(), payment]); },

  async deletePayment(id) { write(KEYS.payments, payments().filter((p) => p.id !== id)); },

  async listCashFlow(businessId) {
    return wait(cash()
      .filter((c) => c.businessId === businessId)
      .sort((a, b) => b.date.localeCompare(a.date)));
  },

  async addCashFlow(entry) { write(KEYS.cashflow, [...cash(), entry]); },

  async deleteCashFlow(id) { write(KEYS.cashflow, cash().filter((c) => c.id !== id)); },

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

  async addMessage(message: Omit<ContactMessage, 'id' | 'createdAt'>) {
    const all = read<ContactMessage[]>(KEYS.messages, []);
    all.push({ ...message, id: uid('msg'), createdAt: new Date().toISOString() });
    write(KEYS.messages, all);
  },
};

/** Testlerde kullanılmak üzere: oturumu doğrudan ayarlar */
export function setLocalSession(userId: string | null): void {
  if (userId) write(KEYS.session, userId);
  else remove(KEYS.session);
}

export { scopeOf };
