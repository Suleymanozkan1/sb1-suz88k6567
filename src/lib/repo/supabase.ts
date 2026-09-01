/** Supabase (Postgres) tabanlı veri erişimi. */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { DEFAULT_COLOR_SETTINGS, OWNER_PERMISSIONS } from '../../data/constants';
import { RepoError, type PublicReservation, type Repository } from './types';
import type {
  AuditEntry, Business, CashFlowEntry, ColorSetting, ContactMessage, Payment,
  Permission, Reservation, SmsLogEntry, User,
} from '../../types';

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(URL && KEY);

let client: SupabaseClient | null = null;
function db(): SupabaseClient {
  if (!client) {
    if (!URL || !KEY) throw new RepoError('Supabase yapılandırması eksik.');
    client = createClient(URL, KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }
  return client;
}

/* ------------------------------------------------------------- eşleme */

type Row = Record<string, unknown>;

function toUser(row: Row): User {
  return {
    id: String(row.id),
    companyName: (row.company_name as string) ?? '',
    fullName: (row.full_name as string) ?? '',
    email: (row.email as string) ?? '',
    password: '', // Şifre hiçbir zaman istemciye gelmez
    mobile: (row.mobile as string) ?? '',
    role: (row.role as User['role']) ?? 'owner',
    ownerId: (row.owner_id as string) ?? undefined,
    permissions: ((row.permissions as Permission[]) ?? OWNER_PERMISSIONS),
    city: (row.city as string) ?? '',
    district: (row.district as string) ?? '',
    category: (row.category as string) ?? '',
    capacity: Number(row.capacity ?? 0),
    currency: (row.currency as User['currency']) ?? 'TL',
    facebook: (row.facebook as string) ?? undefined,
    instagram: (row.instagram as string) ?? undefined,
    createdAt: (row.created_at as string) ?? new Date().toISOString(),
    activeBusinessId: (row.active_business_id as string) ?? '',
  };
}

function toBusiness(row: Row): Business {
  return {
    id: String(row.id),
    ownerId: String(row.owner_id),
    name: (row.name as string) ?? '',
    category: (row.category as string) ?? '',
    city: (row.city as string) ?? '',
    district: (row.district as string) ?? '',
    phone: (row.phone as string) ?? '',
    capacity: Number(row.capacity ?? 0),
    currency: (row.currency as Business['currency']) ?? 'TL',
    address: (row.address as string) ?? undefined,
    facebook: (row.facebook as string) ?? undefined,
    instagram: (row.instagram as string) ?? undefined,
    about: (row.about as string) ?? undefined,
    createdAt: (row.created_at as string) ?? '',
  };
}

function toReservation(row: Row): Reservation {
  return {
    id: String(row.id),
    businessId: String(row.business_id),
    code: (row.code as string) ?? '',
    customerName: (row.customer_name as string) ?? '',
    customerPhone: (row.customer_phone as string) ?? '',
    customerEmail: (row.customer_email as string) ?? undefined,
    secondPersonName: (row.second_person_name as string) ?? undefined,
    date: (row.date as string) ?? '',
    slot: (row.slot as Reservation['slot']) ?? 'Gece',
    organizationType: (row.organization_type as Reservation['organizationType']) ?? 'Düğün',
    guestCount: Number(row.guest_count ?? 0),
    totalAmount: Number(row.total_amount ?? 0),
    deposit: Number(row.deposit ?? 0),
    currency: (row.currency as Reservation['currency']) ?? 'TL',
    status: (row.status as Reservation['status']) ?? 'Kesin Rezervasyon',
    colorKey: (row.color_key as string) ?? 'diger',
    note: (row.note as string) ?? undefined,
    address: (row.address as string) ?? undefined,
    services: (row.services as string[]) ?? [],
    createdAt: (row.created_at as string) ?? '',
    updatedAt: (row.updated_at as string) ?? '',
  };
}

function fromReservation(r: Reservation) {
  return {
    id: r.id, business_id: r.businessId, code: r.code,
    customer_name: r.customerName, customer_phone: r.customerPhone,
    customer_email: r.customerEmail || null, second_person_name: r.secondPersonName || null,
    date: r.date, slot: r.slot, organization_type: r.organizationType,
    guest_count: r.guestCount, total_amount: r.totalAmount, deposit: r.deposit,
    currency: r.currency, status: r.status, color_key: r.colorKey,
    note: r.note || null, address: r.address || null, services: r.services,
  };
}

function toPayment(row: Row): Payment {
  return {
    id: String(row.id),
    reservationId: String(row.reservation_id),
    date: (row.date as string) ?? '',
    amount: Number(row.amount ?? 0),
    method: (row.method as Payment['method']) ?? 'Nakit',
    note: (row.note as string) ?? undefined,
    createdAt: (row.created_at as string) ?? '',
  };
}

function toCashFlow(row: Row): CashFlowEntry {
  return {
    id: String(row.id),
    businessId: String(row.business_id),
    kind: (row.kind as CashFlowEntry['kind']) ?? 'Gelir',
    date: (row.date as string) ?? '',
    category: (row.category as string) ?? '',
    amount: Number(row.amount ?? 0),
    description: (row.description as string) ?? undefined,
    reservationId: (row.reservation_id as string) ?? undefined,
    createdAt: (row.created_at as string) ?? '',
  };
}

function toSms(row: Row): SmsLogEntry {
  return {
    id: String(row.id),
    businessId: String(row.business_id),
    to: (row.to as string) ?? '',
    body: (row.body as string) ?? '',
    kind: (row.kind as SmsLogEntry['kind']) ?? 'Bilgilendirme',
    sentAt: (row.sent_at as string) ?? '',
  };
}

/** Supabase hatalarını kullanıcıya gösterilebilir mesaja çevirir. */
function fail(message: string, error: unknown): never {
  if (import.meta.env.DEV) console.error(message, error);
  const code = (error as { code?: string })?.code;
  if (code === '23505') throw new RepoError('Bu kayıt zaten mevcut.', error);
  if (code === '23514') throw new RepoError('Girilen değerler geçerli değil.', error);
  if (code === '42501') throw new RepoError('Bu işlem için yetkiniz bulunmuyor.', error);
  throw new RepoError(message, error);
}

/**
 * Korumalı giriş uç noktası.
 * Uç nokta bu dağıtımda yoksa 'endpoint_missing' döner ve çağıran
 * doğrudan Supabase'e düşer.
 */
async function signInViaServer(
  email: string, password: string,
): Promise<{ accessToken: string; refreshToken: string } | 'endpoint_missing'> {
  let response: Response;
  try {
    response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: email.trim(), password }),
    });
  } catch {
    return 'endpoint_missing';
  }

  // Uç nokta tanımlı değilse sunucu SPA kabuğunu (HTML) döndürür.
  if (!(response.headers.get('content-type') ?? '').includes('application/json')) {
    return 'endpoint_missing';
  }

  const result = (await response.json()) as {
    accessToken?: string; refreshToken?: string;
    error?: string; locked?: boolean; remainingAttempts?: number | null;
  };

  if (response.status === 423) {
    throw new RepoError(result.error ?? 'Hesabınız geçici olarak kilitlendi.');
  }
  if (response.status === 429) {
    throw new RepoError(result.error ?? 'Çok fazla deneme yapıldı. Lütfen bekleyiniz.');
  }
  if (!response.ok || !result.accessToken || !result.refreshToken) {
    const suffix =
      typeof result.remainingAttempts === 'number' && result.remainingAttempts > 0
        ? ` Kalan deneme hakkınız: ${result.remainingAttempts}.`
        : '';
    throw new RepoError((result.error ?? 'Giriş yapılamadı.') + suffix);
  }

  return { accessToken: result.accessToken, refreshToken: result.refreshToken };
}

async function currentProfile(): Promise<User | null> {
  const { data: auth } = await db().auth.getUser();
  if (!auth.user) return null;
  const { data, error } = await db().from('profiles').select('*').eq('id', auth.user.id).maybeSingle();
  if (error) fail('Profil bilgisi alınamadı.', error);
  return data ? toUser(data) : null;
}

/* --------------------------------------------------------- repository */

export const supabaseRepo: Repository = {
  kind: 'supabase',

  async getSession() {
    const { data } = await db().auth.getSession();
    if (!data.session) return null;
    return currentProfile();
  },

  async signIn(email, password) {
    // Giriş sunucu tarafındaki /api/login üzerinden yapılır; hesap kilidi ve
    // hız sınırı yalnızca orada uygulanabilir. Uç nokta bulunmayan bir
    // dağıtımda doğrudan Supabase'e düşülür (kilit korumasız çalışır).
    const viaServer = await signInViaServer(email, password);
    if (viaServer !== 'endpoint_missing') {
      const { error } = await db().auth.setSession({
        access_token: viaServer.accessToken,
        refresh_token: viaServer.refreshToken,
      });
      if (error) throw new RepoError('Oturum başlatılamadı.', error);
    } else {
      const { error } = await db().auth.signInWithPassword({ email: email.trim(), password });
      if (error) {
        if (error.message.includes('Invalid login')) {
          throw new RepoError('E-posta veya şifreniz hatalı.');
        }
        if (error.message.includes('Email not confirmed')) {
          throw new RepoError('E-posta adresinizi doğrulamanız gerekiyor.');
        }
        throw new RepoError('Giriş yapılamadı. Lütfen tekrar deneyiniz.', error);
      }
    }

    const profile = await currentProfile();
    if (!profile) throw new RepoError('Hesabınıza ait profil bulunamadı.');
    return profile;
  },

  async signUp(input) {
    const { error } = await db().auth.signUp({
      email: input.email.trim(),
      password: input.password,
      options: {
        data: {
          company_name: input.companyName, full_name: input.fullName, mobile: input.mobile,
          city: input.city, district: input.district, category: input.category,
          capacity: input.capacity, currency: input.currency,
        },
      },
    });
    if (error) {
      if (error.message.includes('already registered')) {
        throw new RepoError('Bu e-posta adresi ile daha önce üyelik oluşturulmuş.');
      }
      throw new RepoError('Üyelik oluşturulamadı.', error);
    }

    const profile = await currentProfile();
    if (!profile) {
      throw new RepoError('Üyeliğiniz oluşturuldu. E-posta doğrulaması gerekiyorsa gelen kutunuzu kontrol edin.');
    }

    // İlk işletmeyi oluştur ve aktif işletme olarak ata
    const business = await this.saveBusiness({
      id: crypto.randomUUID(),
      ownerId: profile.id,
      name: input.companyName,
      category: input.category,
      city: input.city,
      district: input.district,
      phone: input.phone || input.mobile,
      capacity: input.capacity,
      currency: input.currency,
      address: input.address,
      facebook: input.facebook,
      instagram: input.instagram,
    });
    return this.updateProfile({ activeBusinessId: business.id });
  },

  async signOut() {
    await db().auth.signOut();
  },

  async requestPasswordReset(email) {
    const { error } = await db().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/sifre-yenile`,
    });
    if (error) fail('Şifre sıfırlama e-postası gönderilemedi.', error);
  },

  async changePassword(currentPassword, nextPassword) {
    const profile = await currentProfile();
    if (!profile) throw new RepoError('Oturumunuz bulunamadı.');
    // Mevcut şifreyi doğrula
    const { error: checkError } = await db().auth.signInWithPassword({
      email: profile.email, password: currentPassword,
    });
    if (checkError) throw new RepoError('Mevcut şifreniz hatalı.');

    const { error } = await db().auth.updateUser({ password: nextPassword });
    if (error) fail('Şifreniz güncellenemedi.', error);
  },

  async updateProfile(patch) {
    const { data: auth } = await db().auth.getUser();
    if (!auth.user) throw new RepoError('Oturumunuz bulunamadı.');

    const row: Row = {};
    if (patch.companyName !== undefined) row.company_name = patch.companyName;
    if (patch.fullName !== undefined) row.full_name = patch.fullName;
    if (patch.mobile !== undefined) row.mobile = patch.mobile;
    if (patch.city !== undefined) row.city = patch.city;
    if (patch.district !== undefined) row.district = patch.district;
    if (patch.category !== undefined) row.category = patch.category;
    if (patch.capacity !== undefined) row.capacity = patch.capacity;
    if (patch.currency !== undefined) row.currency = patch.currency;
    if (patch.facebook !== undefined) row.facebook = patch.facebook ?? null;
    if (patch.instagram !== undefined) row.instagram = patch.instagram ?? null;
    if (patch.activeBusinessId !== undefined) row.active_business_id = patch.activeBusinessId;

    const { data, error } = await db().from('profiles')
      .update(row).eq('id', auth.user.id).select().single();
    if (error) fail('Bilgileriniz kaydedilemedi.', error);
    return toUser(data);
  },

  async listStaff(ownerId) {
    const { data, error } = await db().from('profiles')
      .select('*').eq('owner_id', ownerId).order('created_at');
    if (error) fail('Kullanıcılar alınamadı.', error);
    return (data ?? []).map(toUser);
  },

  async saveStaff(_ownerId, input) {
    if (!input.id) {
      throw new RepoError(
        'Yeni personel hesabı Supabase yönetim panelinden (Authentication → Users) oluşturulmalıdır. ' +
        'Kullanıcı oluşturulduktan sonra yetkilerini buradan düzenleyebilirsiniz.',
      );
    }
    const { error } = await db().from('profiles')
      .update({ full_name: input.fullName, mobile: input.mobile, permissions: input.permissions })
      .eq('id', input.id);
    if (error) fail('Kullanıcı kaydedilemedi.', error);
  },

  async deleteStaff(id) {
    const { error } = await db().from('profiles').delete().eq('id', id);
    if (error) fail('Kullanıcı silinemedi.', error);
  },

  async listBusinesses(ownerId) {
    const { data, error } = await db().from('businesses')
      .select('*').eq('owner_id', ownerId).order('created_at');
    if (error) fail('İşletmeler alınamadı.', error);
    return (data ?? []).map(toBusiness);
  },

  async saveBusiness(business) {
    const { data, error } = await db().from('businesses').upsert({
      id: business.id, owner_id: business.ownerId, name: business.name,
      category: business.category, city: business.city, district: business.district,
      phone: business.phone, capacity: business.capacity, currency: business.currency,
      address: business.address || null, facebook: business.facebook || null,
      instagram: business.instagram || null, about: business.about || null,
    }).select().single();
    if (error) fail('İşletme kaydedilemedi.', error);
    return toBusiness(data);
  },

  async deleteBusiness(id) {
    const { error } = await db().from('businesses').delete().eq('id', id);
    if (error) fail('İşletme silinemedi.', error);
  },

  async listReservations(businessId) {
    const { data, error } = await db().from('reservations')
      .select('*').eq('business_id', businessId).order('date', { ascending: false });
    if (error) fail('Rezervasyonlar alınamadı.', error);
    return (data ?? []).map(toReservation);
  },

  async getReservation(id) {
    const { data, error } = await db().from('reservations').select('*').eq('id', id).maybeSingle();
    if (error) fail('Rezervasyon alınamadı.', error);
    return data ? toReservation(data) : null;
  },

  async saveReservation(reservation) {
    const { data, error } = await db().from('reservations')
      .upsert(fromReservation(reservation)).select().single();
    if (error) {
      const code = (error as { code?: string }).code;
      if (code === '23505') {
        throw new RepoError('Bu tarih ve seans için zaten bir rezervasyon kaydı var.');
      }
      fail('Rezervasyon kaydedilemedi.', error);
    }
    return toReservation(data);
  },

  async deleteReservation(id) {
    const { error } = await db().from('reservations').delete().eq('id', id);
    if (error) fail('Rezervasyon silinemedi.', error);
  },

  async verifyCode(code) {
    const { data, error } = await db().rpc('verify_reservation_code', { p_code: code.trim() });
    if (error) fail('Kod sorgulanamadı.', error);
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return null;
    return {
      code: row.code, customerName: row.customer_name, customerPhone: row.customer_phone,
      date: row.date, slot: row.slot, organizationType: row.organization_type,
      guestCount: Number(row.guest_count), totalAmount: Number(row.total_amount),
      status: row.status, businessName: row.business_name,
    } satisfies PublicReservation;
  },

  async listPayments(businessId) {
    const { data, error } = await db().from('payments')
      .select('*, reservations!inner(business_id)')
      .eq('reservations.business_id', businessId);
    if (error) fail('Tahsilatlar alınamadı.', error);
    return (data ?? []).map(toPayment);
  },

  async addPayment(payment) {
    const { error } = await db().from('payments').insert({
      id: payment.id, reservation_id: payment.reservationId, date: payment.date,
      amount: payment.amount, method: payment.method, note: payment.note || null,
    });
    if (error) fail('Tahsilat kaydedilemedi.', error);
  },

  async deletePayment(id) {
    const { error } = await db().from('payments').delete().eq('id', id);
    if (error) fail('Tahsilat silinemedi.', error);
  },

  async listCashFlow(businessId) {
    const { data, error } = await db().from('cash_flow')
      .select('*').eq('business_id', businessId).order('date', { ascending: false });
    if (error) fail('Kasa kayıtları alınamadı.', error);
    return (data ?? []).map(toCashFlow);
  },

  async addCashFlow(entry) {
    const { error } = await db().from('cash_flow').insert({
      id: entry.id, business_id: entry.businessId, kind: entry.kind, date: entry.date,
      category: entry.category, amount: entry.amount, description: entry.description || null,
      reservation_id: entry.reservationId || null,
    });
    if (error) fail('Kayıt eklenemedi.', error);
  },

  async deleteCashFlow(id) {
    const { error } = await db().from('cash_flow').delete().eq('id', id);
    if (error) fail('Kayıt silinemedi.', error);
  },

  async getColorSettings(businessId) {
    const { data, error } = await db().from('color_settings')
      .select('settings').eq('business_id', businessId).maybeSingle();
    if (error) fail('Renk ayarları alınamadı.', error);
    const settings = data?.settings as ColorSetting[] | undefined;
    return settings && settings.length > 0 ? settings : DEFAULT_COLOR_SETTINGS;
  },

  async saveColorSettings(businessId, settings) {
    const { error } = await db().from('color_settings')
      .upsert({ business_id: businessId, settings, updated_at: new Date().toISOString() });
    if (error) fail('Renk ayarları kaydedilemedi.', error);
  },

  async listSms(businessId) {
    const { data, error } = await db().from('sms_log')
      .select('*').eq('business_id', businessId).order('sent_at', { ascending: false });
    if (error) fail('SMS kayıtları alınamadı.', error);
    return (data ?? []).map(toSms);
  },

  async logSms(entry) {
    const { error } = await db().from('sms_log').insert({
      business_id: entry.businessId, to: entry.to, body: entry.body, kind: entry.kind,
    });
    if (error) fail('SMS kaydı yazılamadı.', error);
  },

  async listAuditLog(limit) {
    const { data, error } = await db().from('audit_log')
      .select('*').order('created_at', { ascending: false }).limit(limit);
    if (error) fail('Denetim kayıtları alınamadı.', error);
    return (data ?? []).map((row: Row): AuditEntry => ({
      id: Number(row.id),
      actorEmail: (row.actor_email as string) ?? '—',
      action: (row.action as AuditEntry['action']) ?? 'UPDATE',
      tableName: (row.table_name as string) ?? '',
      recordId: (row.record_id as string) ?? undefined,
      summary: (row.summary as string) ?? undefined,
      changed: (row.changed as AuditEntry['changed']) ?? undefined,
      createdAt: (row.created_at as string) ?? '',
    }));
  },

  async addMessage(message: Omit<ContactMessage, 'id' | 'createdAt'>) {
    const { error } = await db().from('contact_messages').insert({
      name: message.name, email: message.email, phone: message.phone,
      message: message.message, kind: message.kind,
    });
    if (error) fail('Mesajınız gönderilemedi.', error);
  },
};
