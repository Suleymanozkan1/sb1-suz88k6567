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
  Business, CashFlowEntry, ColorSetting, ContactMessage, Payment,
  Reservation, SmsLogEntry, User,
} from '../../types';

const wait = <T,>(value: T): Promise<T> => Promise.resolve(value);

function users(): User[] { return read<User[]>(KEYS.users, []); }
function saveUsers(list: User[]) { write(KEYS.users, list); }
function businesses(): Business[] { return read<Business[]>(KEYS.businesses, []); }
function reservations(): Reservation[] { return read<Reservation[]>(KEYS.reservations, []); }
function payments(): Payment[] { return read<Payment[]>(KEYS.payments, []); }
function cash(): CashFlowEntry[] { return read<CashFlowEntry[]>(KEYS.cashflow, []); }

function requireUser(id: string): User {
  const found = users().find((u) => u.id === id);
  if (!found) throw new RepoError('Kullanıcı bulunamadı.');
  return found;
}

/** Kullanıcının veri sahibi kapsamı: personel ise bağlı olduğu yönetici */
function scopeOf(user: User): string {
  return user.role === 'staff' ? user.ownerId ?? user.id : user.id;
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
