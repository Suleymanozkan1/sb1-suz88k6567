/** Supabase (Postgres) tabanlı veri erişimi. */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { DEFAULT_COLOR_SETTINGS, OWNER_PERMISSIONS } from '../../data/constants';
import { RepoError, type PublicReservation, type Repository } from './types';
import type {
  AuditEntry, Business, CashFlowEntry, ColorSetting, ContactMessage, EnqueueResult, MessageStatus,
  Hall, Menu, SeatingTable,
  Payment, Permission, Reservation, SmsConsent, SmsLogEntry, SmsQueueEntry,
  Invoice, InvoiceLine, SystemHealth, User,
} from '../../types';
import { computeInvoice } from '../invoice';

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
    hallId: String(row.hall_id ?? ''),
    menuId: (row.menu_id as string) ?? undefined,
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
    id: r.id, business_id: r.businessId, hall_id: r.hallId,
    menu_id: r.menuId || null, code: r.code,
    customer_name: r.customerName, customer_phone: r.customerPhone,
    customer_email: r.customerEmail || null, second_person_name: r.secondPersonName || null,
    date: r.date, slot: r.slot, organization_type: r.organizationType,
    guest_count: r.guestCount, total_amount: r.totalAmount, deposit: r.deposit,
    currency: r.currency, status: r.status, color_key: r.colorKey,
    note: r.note || null, address: r.address || null, services: r.services,
  };
}

function toInvoice(row: Row): Invoice {
  return {
    id: String(row.id),
    businessId: String(row.business_id),
    reservationId: (row.reservation_id as string) ?? undefined,
    invoiceNumber: (row.invoice_number as string) ?? '',
    kind: (row.kind as Invoice['kind']) ?? 'e-Arsiv',
    status: (row.status as Invoice['status']) ?? 'taslak',
    issueDate: (row.issue_date as string) ?? '',
    serviceDate: (row.service_date as string) ?? undefined,
    buyerKind: (row.buyer_kind as Invoice['buyerKind']) ?? 'bireysel',
    buyerName: (row.buyer_name as string) ?? '',
    buyerTaxId: (row.buyer_tax_id as string) ?? undefined,
    buyerTaxOffice: (row.buyer_tax_office as string) ?? undefined,
    buyerAddress: (row.buyer_address as string) ?? undefined,
    buyerEmail: (row.buyer_email as string) ?? undefined,
    buyerPhone: (row.buyer_phone as string) ?? undefined,
    grossKurus: Number(row.gross_kurus ?? 0),
    discountKurus: Number(row.discount_kurus ?? 0),
    baseKurus: Number(row.base_kurus ?? 0),
    vatKurus: Number(row.vat_kurus ?? 0),
    totalKurus: Number(row.total_kurus ?? 0),
    providerError: (row.provider_error as string) ?? undefined,
    sentAt: (row.sent_at as string) ?? undefined,
    cancelReason: (row.cancel_reason as string) ?? undefined,
    note: (row.note as string) ?? undefined,
    createdAt: (row.created_at as string) ?? '',
  };
}

function toInvoiceLine(row: Row): InvoiceLine {
  return {
    lineNo: Number(row.line_no ?? 0),
    description: (row.description as string) ?? '',
    quantity: Number(row.quantity ?? 0),
    unit: (row.unit as string) ?? 'Adet',
    unitPriceKurus: Number(row.unit_price_kurus ?? 0),
    discountRate: Number(row.discount_rate ?? 0),
    vatRate: Number(row.vat_rate ?? 0),
    baseKurus: Number(row.base_kurus ?? 0),
    vatKurus: Number(row.vat_kurus ?? 0),
    totalKurus: Number(row.total_kurus ?? 0),
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

function toHall(row: Row): Hall {
  return {
    id: String(row.id),
    businessId: String(row.business_id),
    name: (row.name as string) ?? '',
    capacity: Number(row.capacity ?? 0),
    note: (row.note as string) ?? '',
    isActive: Boolean(row.is_active ?? true),
    createdAt: (row.created_at as string) ?? '',
  };
}

function toMenu(row: Row): Menu {
  return {
    id: String(row.id),
    businessId: String(row.business_id),
    name: (row.name as string) ?? '',
    pricing: (row.pricing as Menu['pricing']) ?? 'kisi_basi',
    priceKurus: Number(row.price_kurus ?? 0),
    description: (row.description as string) ?? '',
    isActive: Boolean(row.is_active ?? true),
    createdAt: (row.created_at as string) ?? '',
  };
}

function toSeating(row: Row): SeatingTable {
  return {
    id: String(row.id),
    reservationId: String(row.reservation_id),
    tableNo: Number(row.table_no ?? 0),
    seats: Number(row.seats ?? 0),
    label: (row.label as string) ?? '',
  };
}

function toMessage(row: Row): ContactMessage {
  return {
    id: String(row.id),
    name: (row.name as string) ?? '',
    email: (row.email as string) ?? '',
    phone: (row.phone as string) ?? '',
    message: (row.message as string) ?? '',
    kind: (row.kind as ContactMessage['kind']) ?? 'iletisim',
    status: (row.status as ContactMessage['status']) ?? 'yeni',
    note: (row.note as string) ?? '',
    handledAt: (row.handled_at as string) ?? undefined,
    createdAt: (row.created_at as string) ?? '',
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
        throw new RepoError('Bu salonda seçilen tarih ve seans için zaten bir rezervasyon var.');
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

  async enqueueSms(input) {
    const { data, error } = await db().rpc('enqueue_sms', {
      p_business_id: input.businessId,
      p_phone: input.phone,
      p_body: input.body,
      p_kind: input.kind,
      p_category: input.category,
      p_reservation_id: input.reservationId ?? null,
    });
    if (error) fail('Mesaj kuyruğa alınamadı.', error);
    const row = (Array.isArray(data) ? data[0] : data) as { queued?: boolean; reason?: string } | null;
    return { queued: Boolean(row?.queued), reason: row?.reason ?? undefined } satisfies EnqueueResult;
  },

  async listSmsQueue(businessId, limit) {
    const { data, error } = await db().from('sms_queue')
      .select('*').eq('business_id', businessId)
      .order('created_at', { ascending: false }).limit(limit);
    if (error) fail('Kuyruk okunamadı.', error);
    return (data ?? []).map((row: Row): SmsQueueEntry => ({
      id: String(row.id),
      phone: (row.phone as string) ?? '',
      body: (row.body as string) ?? '',
      kind: (row.kind as SmsQueueEntry['kind']) ?? 'Bilgilendirme',
      category: (row.category as SmsQueueEntry['category']) ?? 'islem',
      status: (row.status as SmsQueueEntry['status']) ?? 'bekliyor',
      attempts: Number(row.attempts ?? 0),
      nextAttemptAt: (row.next_attempt_at as string) ?? '',
      lastError: (row.last_error as string) ?? undefined,
      createdAt: (row.created_at as string) ?? '',
      sentAt: (row.sent_at as string) ?? undefined,
    }));
  },

  async listConsents(businessId) {
    const { data, error } = await db().from('sms_consents')
      .select('*').eq('business_id', businessId).order('consent_date', { ascending: false });
    if (error) fail('İzin kayıtları alınamadı.', error);
    return (data ?? []).map((row: Row): SmsConsent => ({
      id: String(row.id),
      businessId: String(row.business_id),
      phone: (row.phone as string) ?? '',
      status: (row.status as SmsConsent['status']) ?? 'ONAY',
      source: (row.source as string) ?? '',
      consentDate: (row.consent_date as string) ?? '',
      iysSyncedAt: (row.iys_synced_at as string) ?? undefined,
      iysError: (row.iys_error as string) ?? undefined,
      note: (row.note as string) ?? undefined,
    }));
  },

  async saveConsent(input) {
    const { error } = await db().from('sms_consents').upsert({
      business_id: input.businessId,
      phone: input.phone,
      status: input.status,
      source: input.source,
      note: input.note || null,
      consent_date: new Date().toISOString(),
      // Durum değiştiği için İYS'ye yeniden aktarılmalı
      iys_synced_at: null,
      iys_error: null,
    }, { onConflict: 'business_id,phone' });
    if (error) fail('İzin kaydedilemedi.', error);
  },

  async deleteConsent(id) {
    const { error } = await db().from('sms_consents').delete().eq('id', id);
    if (error) fail('İzin kaydı silinemedi.', error);
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

  async listInvoices(businessId) {
    const { data, error } = await db().from('invoices')
      .select('*').eq('business_id', businessId).order('issue_date', { ascending: false });
    if (error) fail('Faturalar alınamadı.', error);
    return (data ?? []).map(toInvoice);
  },

  async getInvoice(id) {
    const { data, error } = await db().from('invoices')
      .select('*, invoice_lines(*)').eq('id', id).maybeSingle();
    if (error) fail('Fatura alınamadı.', error);
    if (!data) return null;
    const invoice = toInvoice(data);
    const rows = (data.invoice_lines as Row[] | undefined) ?? [];
    invoice.lines = rows.map(toInvoiceLine).sort((a, b) => a.lineNo - b.lineNo);
    return invoice;
  },

  async createInvoice(input) {
    // Tutarlar tek yerde hesaplanır; veritabanı kısıtları da aynı sonucu doğrular
    const totals = computeInvoice(input.lines);

    const { data: numberData, error: numberError } = await db()
      .rpc('next_invoice_number', { p_business_id: input.businessId, p_prefix: 'DGT' });
    if (numberError) fail('Fatura numarası alınamadı.', numberError);

    const { data: created, error: insertError } = await db().from('invoices').insert({
      business_id: input.businessId,
      reservation_id: input.reservationId ?? null,
      invoice_number: numberData as string,
      kind: input.kind,
      service_date: input.serviceDate ?? null,
      buyer_kind: input.buyerKind,
      buyer_name: input.buyerName,
      buyer_tax_id: input.buyerTaxId || null,
      buyer_tax_office: input.buyerTaxOffice || null,
      buyer_address: input.buyerAddress || null,
      buyer_email: input.buyerEmail || null,
      buyer_phone: input.buyerPhone || null,
      note: input.note || null,
      gross_kurus: totals.grossKurus,
      discount_kurus: totals.discountKurus,
      base_kurus: totals.baseKurus,
      vat_kurus: totals.vatKurus,
      total_kurus: totals.totalKurus,
    }).select().single();
    if (insertError) fail('Fatura oluşturulamadı.', insertError);

    const invoiceId = String(created.id);
    const { error: lineError } = await db().from('invoice_lines').insert(
      input.lines.map((line, index) => ({
        invoice_id: invoiceId,
        line_no: index + 1,
        description: line.description,
        quantity: line.quantity,
        unit: line.unit,
        unit_price_kurus: Math.round(line.unitPrice * 100),
        discount_rate: line.discountRate ?? 0,
        vat_rate: line.vatRate,
        gross_kurus: totals.lines[index].grossKurus,
        discount_kurus: totals.lines[index].discountKurus,
        base_kurus: totals.lines[index].baseKurus,
        vat_kurus: totals.lines[index].vatKurus,
        total_kurus: totals.lines[index].totalKurus,
      })),
    );
    if (lineError) fail('Fatura satırları kaydedilemedi.', lineError);

    return toInvoice(created);
  },

  async sendInvoice(id) {
    let response: Response;
    try {
      response = await fetch('/api/invoice', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id }),
      });
    } catch {
      return { sent: false, reason: 'Fatura servisine ulaşılamadı.' };
    }
    if (!(response.headers.get('content-type') ?? '').includes('application/json')) {
      return { sent: false, reason: 'Fatura gönderim servisi bu kurulumda yapılandırılmamış.' };
    }
    const result = (await response.json()) as { sent?: number; reason?: string; error?: string };
    if (result.reason === 'einvoice_not_configured') {
      return { sent: false, reason: 'e-Fatura entegratörü tanımlı değil; fatura taslak olarak kaydedildi.' };
    }
    if (!result.sent) return { sent: false, reason: result.error ?? 'Fatura gönderilemedi.' };
    return { sent: true };
  },

  async cancelInvoice(id, reason) {
    const { error } = await db().from('invoices').update({
      status: 'iptal', cancelled_at: new Date().toISOString(), cancel_reason: reason,
    }).eq('id', id);
    if (error) fail('Fatura iptal edilemedi.', error);
  },

  async getSystemHealth(ownerId) {
    const { data, error } = await db().rpc('system_health', { p_owner_id: ownerId });
    if (error) fail('Sistem durumu alınamadı.', error);
    const row = data as Record<string, unknown> | null;
    if (!row) return null;

    const backup = row.son_yedek as Record<string, unknown> | null;
    return {
      kuyrukBekleyen: Number(row.kuyruk_bekleyen ?? 0),
      kuyrukBasarisiz: Number(row.kuyruk_basarisiz ?? 0),
      kuyrukEngellenen: Number(row.kuyruk_engellenen ?? 0),
      kuyrukEnEskiDakika: Number(row.kuyruk_en_eski_dakika ?? 0),
      iysAktarilmamis: Number(row.iys_aktarilmamis ?? 0),
      basarisizGiris24s: Number(row.basarisiz_giris_24s ?? 0),
      sonYedek: backup
        ? {
            zaman: String(backup.zaman ?? ''),
            durum: String(backup.durum ?? ''),
            yasSaat: Number(backup.yas_saat ?? 0),
            yasDakika: Number(backup.yas_dakika ?? 0),
          }
        : null,
    } satisfies SystemHealth;
  },

  async exportData(ownerId) {
    const { data, error } = await db().rpc('export_owner_data', { p_owner_id: ownerId });
    if (error) fail('Veriler dışa aktarılamadı.', error);
    return data;
  },

  async addMessage(message: Omit<ContactMessage, 'id' | 'createdAt' | 'status' | 'note' | 'handledAt'>) {
    const { error } = await db().from('contact_messages').insert({
      name: message.name, email: message.email, phone: message.phone,
      message: message.message, kind: message.kind,
    });
    if (error) fail('Mesajınız gönderilemedi.', error);
  },

  async listHalls(businessId) {
    const { data, error } = await db().from('halls')
      .select('*').eq('business_id', businessId).order('name');
    if (error) fail('Salonlar okunamadı.', error);
    return (data ?? []).map(toHall);
  },

  async saveHall(hall) {
    const { data, error } = await db().from('halls').upsert({
      id: hall.id, business_id: hall.businessId, name: hall.name,
      capacity: hall.capacity, note: hall.note, is_active: hall.isActive,
    }).select().single();
    if (error) fail('Salon kaydedilemedi.', error);
    return toHall(data);
  },

  async deleteHall(id) {
    const { error } = await db().from('halls').delete().eq('id', id);
    // 23503: salona bağlı rezervasyon var — kayıt silinmek yerine pasife alınmalı
    if (error && (error as { code?: string }).code === '23503') {
      throw new RepoError('Bu salona bağlı rezervasyonlar var; salonu silmek yerine pasife alın.');
    }
    if (error) fail('Salon silinemedi.', error);
  },

  async listMenus(businessId) {
    const { data, error } = await db().from('menus')
      .select('*').eq('business_id', businessId).order('name');
    if (error) fail('Menüler okunamadı.', error);
    return (data ?? []).map(toMenu);
  },

  async saveMenu(menu) {
    const { data, error } = await db().from('menus').upsert({
      id: menu.id, business_id: menu.businessId, name: menu.name,
      pricing: menu.pricing, price_kurus: menu.priceKurus,
      description: menu.description, is_active: menu.isActive,
    }).select().single();
    if (error) fail('Menü kaydedilemedi.', error);
    return toMenu(data);
  },

  async deleteMenu(id) {
    const { error } = await db().from('menus').delete().eq('id', id);
    if (error) fail('Menü silinemedi.', error);
  },

  async listSeating(reservationId) {
    const { data, error } = await db().from('seating_tables')
      .select('*').eq('reservation_id', reservationId).order('table_no');
    if (error) fail('Masa düzeni okunamadı.', error);
    return (data ?? []).map(toSeating);
  },

  async saveSeating(reservationId, tables) {
    // Plan bir bütün olarak değiştirilir: önce mevcut satırlar silinir.
    const { error: delError } = await db().from('seating_tables')
      .delete().eq('reservation_id', reservationId);
    if (delError) fail('Masa düzeni güncellenemedi.', delError);
    if (tables.length === 0) return;

    const { error } = await db().from('seating_tables').insert(
      tables.map((t) => ({
        reservation_id: reservationId, table_no: t.tableNo, seats: t.seats, label: t.label,
      })),
    );
    if (error) fail('Masa düzeni kaydedilemedi.', error);
  },

  async listMessages() {
    // RLS, okumayı yönetici hesabına kapatır; personelde boş liste döner.
    const { data, error } = await db()
      .from('contact_messages')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) fail('Talepler okunamadı.', error);
    return (data ?? []).map(toMessage);
  },

  async setMessageStatus(id: string, status: MessageStatus, note: string) {
    // handled_at / handled_by damgasını veritabanı tetikleyicisi yazar.
    const { error } = await db()
      .from('contact_messages')
      .update({ status, note })
      .eq('id', id);
    if (error) fail('Talep durumu güncellenemedi.', error);
  },
};
