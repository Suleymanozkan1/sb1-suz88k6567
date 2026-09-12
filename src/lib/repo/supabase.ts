/**
 * PostgreSQL tabanlı veri erişimi.
 *
 * Veriye kendi sunucumuzdaki PostgREST üzerinden gidiliyor. Kiracı
 * izolasyonu yine veritabanındaki RLS politikalarıyla sağlanıyor;
 * jetondaki `sub` talebi `auth.uid()` değerine dönüşüyor.
 */
import { postgrestIstemci, type PostgrestIstemci } from '../postgrest';
import {
  cikisYap as oturumuKapat, erisimJetonu, gecerliJeton,
  oturumVarMi, oturumuKaydet, oturumuTemizle, type Oturum,
} from '../oturum';
import { DEFAULT_COLOR_SETTINGS, OWNER_PERMISSIONS } from '../../data/constants';
import { RepoError, type PublicReservation, type Repository } from './types';
import { SABLON_SIRASI, type HatirlatmaKurali, type Sablon } from '../sablon';
import type {
  AuditEntry, Business, CashFlowEntry, ColorSetting, EnqueueResult,
  Hall, Menu, SeatingTable, EventTask, Vendor, ReservationVendor,
  Payment, PaymentAlert, PaymentAlertRecipient, PaymentEvent, PaymentMethod,
  Permission, Reservation, ReservationExpense, SmsConsent, SmsLogEntry, SmsQueueEntry,
  Invoice, InvoiceLine, SystemHealth, User,
  CustomerLead, LeadMessage, LeadStatusChange, LeadStatusDef, WhatsappAccount,
} from '../../types';
import { VARSAYILAN_BASLANGIC_DURUMU } from '../../types';
import { computeInvoice } from '../invoice';

/**
 * Veri yolu. Kendi sunucumuz PostgREST'i bu yol altında vekilliyor;
 * ayrı bir köken olmadığı için tarayıcıda CORS'a gerek kalmıyor ve
 * içerik güvenlik politikası `connect-src 'self'` kadar dar kalabiliyor.
 */
const VERI_YOLU = (import.meta.env.VITE_VERI_YOLU as string | undefined) ?? '/veri';

/**
 * Gerçek veritabanı modu.
 *
 * Demo modunda bu bayrak kapalı olmalı ve yerel depo kullanılmalı.
 * Ayar, derleme sırasında veriliyor: bir sunucu adresi tahmin edip
 * yanlış yere bağlanmaktansa açıkça kapalı olmak daha iyi.
 */
export const isSupabaseConfigured =
  String(import.meta.env.VITE_SUNUCU_MODU ?? '') === '1';

let client: PostgrestIstemci | null = null;
function db(): PostgrestIstemci {
  if (!client) {
    /*
      Jeton her istekte yeniden okunuyor: oturum yenilendiğinde eski
      jetonla devam edilirse istekler 401 dönerdi.
    */
    client = postgrestIstemci(VERI_YOLU, () => erisimJetonu());
  }
  return client;
}

const UUID_KALIBI =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Yeni kayıtta kimliği VERİTABANI üretsin.
 *
 * Ekranlar kimliği kendileri üretiyor (`uid('hall')` -> "hall_mtx...").
 * Demo kipinde bu sorun değil, çünkü yerel depo metin kimlik kabul
 * ediyor. Veritabanındaki sütun ise `uuid`: gönderildiğinde kayıt hiç
 * açılmıyor, PostgREST 22P02 döndürüyor ve kullanıcı ekranda yalnızca
 * bir hata görüyor.
 *
 * Güncellemede kimlik zaten veritabanından gelmiş bir uuid olduğu için
 * olduğu gibi gönderiliyor; upsert'in güncelleme yerine yeni satır
 * açmaması buna bağlı.
 */
function kimlikAlani(id: string | undefined): { id?: string } {
  return id && UUID_KALIBI.test(id) ? { id } : {};
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

/**
 * Postgres `time` sütunu "19:00:00" döndürür; ekranlarda ve <input type="time">
 * içinde saniye istenmez. Boş değerler undefined kalır.
 */
function saatiKirp(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value) return undefined;
  return value.slice(0, 5);
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
    secondPhone: (row.second_phone as string) ?? undefined,
    identityNo: (row.identity_no as string) ?? undefined,
    date: (row.date as string) ?? '',
    startTime: saatiKirp(row.start_time),
    endTime: saatiKirp(row.end_time),
    slot: (row.slot as Reservation['slot']) ?? 'Gece',
    organizationType: (row.organization_type as Reservation['organizationType']) ?? 'Düğün',
    guestCount: Number(row.guest_count ?? 0),
    totalAmount: Number(row.total_amount ?? 0),
    deposit: Number(row.deposit ?? 0),
    depositMethod: (row.deposit_method as Reservation['depositMethod']) ?? undefined,
    currency: (row.currency as Reservation['currency']) ?? 'TL',
    status: (row.status as Reservation['status']) ?? 'Kesin Rezervasyon',
    colorKey: (row.color_key as string) ?? 'diger',
    note: (row.note as string) ?? undefined,
    address: (row.address as string) ?? undefined,
    sourceChannel: (row.source_channel as Reservation['sourceChannel']) ?? undefined,
    sourceDetail: (row.source_detail as string) ?? undefined,
    services: (row.services as string[]) ?? [],
    createdAt: (row.created_at as string) ?? '',
    updatedAt: (row.updated_at as string) ?? '',
  };
}

function fromReservation(r: Reservation) {
  return {
    ...kimlikAlani(r.id), business_id: r.businessId, hall_id: r.hallId,
    // Kod boşsa veritabanı tetikleyicisi sıradaki numarayı yazar.
    menu_id: r.menuId || null, code: r.code || null,
    customer_name: r.customerName, customer_phone: r.customerPhone,
    customer_email: r.customerEmail || null, second_person_name: r.secondPersonName || null,
    second_phone: r.secondPhone || null, identity_no: r.identityNo || null,
    date: r.date, start_time: r.startTime || null, end_time: r.endTime || null,
    slot: r.slot, organization_type: r.organizationType,
    guest_count: r.guestCount, total_amount: r.totalAmount, deposit: r.deposit,
    deposit_method: r.depositMethod ?? null,
    currency: r.currency, status: r.status, color_key: r.colorKey,
    note: r.note || null, address: r.address || null, services: r.services,
    source_channel: r.sourceChannel || null, source_detail: r.sourceDetail?.trim() || null,
  };
}

function toLead(row: Row): CustomerLead {
  return {
    id: String(row.id),
    businessId: String(row.business_id),
    name: (row.name as string) ?? '',
    phone: (row.phone as string) ?? '',
    email: (row.email as string) ?? '',
    guestCount: row.guest_count === null || row.guest_count === undefined
      ? null : Number(row.guest_count),
    eventDate: (row.event_date as string) ?? '',
    eventDateText: (row.event_date_text as string) ?? '',
    organizationType: (row.organization_type as string) ?? '',
    source: (row.source as CustomerLead['source']) ?? 'Manuel',
    sourceDetail: (row.source_detail as string) ?? '',
    status: (row.status as CustomerLead['status']) ?? VARSAYILAN_BASLANGIC_DURUMU,
    assignedTo: (row.assigned_to as string) ?? undefined,
    nextFollowupAt: (row.next_followup_at as string) ?? '',
    lastContactAt: (row.last_contact_at as string) ?? '',
    reservationId: (row.reservation_id as string) ?? undefined,
    requestText: (row.request_text as string) ?? '',
    note: (row.note as string) ?? '',
    createdAt: (row.created_at as string) ?? '',
    updatedAt: (row.updated_at as string) ?? '',
  };
}

function fromLead(l: CustomerLead) {
  return {
    ...kimlikAlani(l.id), business_id: l.businessId, name: l.name, phone: l.phone, email: l.email,
    guest_count: l.guestCount, event_date: l.eventDate || null,
    event_date_text: l.eventDateText, organization_type: l.organizationType,
    source: l.source, source_detail: l.sourceDetail, status: l.status,
    assigned_to: l.assignedTo ?? null, next_followup_at: l.nextFollowupAt || null,
    last_contact_at: l.lastContactAt || null, reservation_id: l.reservationId ?? null,
    request_text: l.requestText, note: l.note,
  };
}

function toLeadStatus(row: Row): LeadStatusDef {
  return {
    id: String(row.id),
    businessId: String(row.business_id),
    code: (row.code as string) ?? '',
    label: (row.label as string) ?? '',
    sortOrder: Number(row.sort_order ?? 0),
    tone: (row.tone as LeadStatusDef['tone']) ?? 'notr',
    isInitial: Boolean(row.is_initial),
    isClosed: Boolean(row.is_closed),
    isWon: Boolean(row.is_won),
    active: row.active === undefined ? true : Boolean(row.active),
  };
}

function toLeadMessage(row: Row): LeadMessage {
  return {
    id: String(row.id),
    businessId: String(row.business_id),
    leadId: String(row.lead_id),
    direction: (row.direction as LeadMessage['direction']) ?? 'olay',
    channel: (row.channel as LeadMessage['channel']) ?? 'sistem',
    body: (row.body as string) ?? '',
    waMessageId: (row.wa_message_id as string) ?? undefined,
    autoKind: (row.auto_kind as LeadMessage['autoKind']) ?? undefined,
    actorEmail: (row.actor_email as string) ?? '',
    createdAt: (row.created_at as string) ?? '',
  };
}

function hesabaCevir(row: Row): WhatsappAccount {
  return {
    phoneNumberId: String(row.phone_number_id),
    businessId: String(row.business_id),
    displayPhone: (row.display_phone as string) ?? '',
    autoReplyEnabled: Boolean(row.auto_reply_enabled),
    welcomeMessage: (row.welcome_message as string) ?? '',
    afterHoursEnabled: Boolean(row.after_hours_enabled),
    afterHoursMessage: (row.after_hours_message as string) ?? '',
    // Postgres "time" değerini "09:00:00" olarak döndürür; form saniye
    // beklemiyor, saniyesi kırpılıyor.
    workStart: saatiKirp(row.work_start) ?? '09:00',
    workEnd: saatiKirp(row.work_end) ?? '19:00',
    workDays: Array.isArray(row.work_days) ? (row.work_days as number[]) : [1, 2, 3, 4, 5, 6, 7],
    createdAt: (row.created_at as string) ?? '',
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

function toReservationExpense(row: Row): ReservationExpense {
  return {
    id: String(row.id),
    businessId: String(row.business_id),
    reservationId: String(row.reservation_id),
    kind: (row.kind as string) ?? '',
    unitCount: Number(row.unit_count ?? 0),
    unitPrice: Number(row.unit_price ?? 0),
    note: (row.note as string) ?? '',
    createdAt: (row.created_at as string) ?? '',
    updatedAt: (row.updated_at as string) ?? '',
  };
}

/*
  Olay satırı geçmişten geliyor: silinmiş bir tahsilata ait olabilir ve
  o satırın tipi/tutarı artık başka hiçbir yerde durmuyor. Alanlar bu
  yüzden boş geçilebilir sayılıyor, uydurma varsayılan konmuyor.
*/
function toPaymentEvent(row: Row): PaymentEvent {
  return {
    id: String(row.id),
    businessId: String(row.business_id),
    reservationId: String(row.reservation_id),
    paymentId: row.payment_id ? String(row.payment_id) : undefined,
    event: row.event as PaymentEvent['event'],
    amount: row.amount === null || row.amount === undefined ? undefined : Number(row.amount),
    oldAmount: row.old_amount === null || row.old_amount === undefined
      ? undefined : Number(row.old_amount),
    method: (row.method as PaymentMethod | null) ?? undefined,
    oldMethod: (row.old_method as PaymentMethod | null) ?? undefined,
    actorEmail: (row.actor_email as string) ?? '',
    createdAt: (row.created_at as string) ?? '',
  };
}

function toPaymentAlert(row: Row): PaymentAlert {
  return {
    id: String(row.id),
    businessId: String(row.business_id),
    event: row.event as PaymentAlert['event'],
    enabled: Boolean(row.enabled),
    body: (row.body as string) ?? '',
  };
}

function toPaymentAlertRecipient(row: Row): PaymentAlertRecipient {
  return {
    id: String(row.id),
    businessId: String(row.business_id),
    name: (row.name as string) ?? '',
    phone: (row.phone as string) ?? '',
    enabled: Boolean(row.enabled),
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
    method: (row.method as CashFlowEntry['method']) ?? undefined,
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

function toTemplate(row: Row): Sablon {
  return {
    id: String(row.id), businessId: String(row.business_id),
    key: row.key as Sablon['key'], title: (row.title as string) ?? '',
    body: (row.body as string) ?? '', kind: (row.kind as string) ?? 'Bilgilendirme',
    category: row.category as Sablon['category'], isActive: row.is_active !== false,
  };
}

function toRule(row: Row): HatirlatmaKurali {
  return {
    id: String(row.id), businessId: String(row.business_id),
    key: row.key as Sablon['key'], enabled: row.enabled === true,
    daysBefore: Number(row.days_before ?? 0), sendHour: Number(row.send_hour ?? 10),
  };
}

function toTask(row: Row): EventTask {
  return {
    id: String(row.id), reservationId: String(row.reservation_id),
    // Postgres time alanı 19:00:00 döner; arayüzde saat:dakika kullanılır.
    atTime: String(row.at_time ?? '').slice(0, 5),
    title: (row.title as string) ?? '', responsible: (row.responsible as string) ?? '',
    done: Boolean(row.done),
  };
}

function toVendor(row: Row): Vendor {
  return {
    id: String(row.id), businessId: String(row.business_id),
    name: (row.name as string) ?? '', category: (row.category as string) ?? '',
    kind: (row.kind as Vendor['kind']) ?? 'hizmet',
    phone: (row.phone as string) ?? '', note: (row.note as string) ?? '',
    unitPrice: Number(row.unit_price ?? 0),
    boxCount: Number(row.box_count ?? 0),
    unitsPerBox: Number(row.units_per_box ?? 0),
    looseCount: Number(row.loose_count ?? 0),
    minCount: Number(row.min_count ?? 0),
    isActive: Boolean(row.is_active ?? true), createdAt: (row.created_at as string) ?? '',
  };
}

function toReservationVendor(row: Row): ReservationVendor {
  return {
    id: String(row.id), reservationId: String(row.reservation_id),
    vendorId: String(row.vendor_id),
    arriveAt: row.arrive_at ? String(row.arrive_at).slice(0, 5) : undefined,
    cost: Number(row.cost ?? 0), note: (row.note as string) ?? '',
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
 *
 * Yedek yol YOK. Eskiden uç nokta bulunamazsa doğrudan Supabase'e
 * düşülüyordu; o yolda hesap kilidi ve hız sınırı hiç uygulanmıyordu ve
 * bu, yapılandırma bozulduğunda sessizce gerçekleşiyordu. Sessizce
 * korumasız çalışan bir giriş, hiç çalışmayandan kötüdür: açık bir hata
 * en azından fark edilir.
 */
async function signInViaServer(email: string, password: string): Promise<Oturum> {
  let response: Response;
  try {
    response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: email.trim(), password }),
    });
  } catch {
    throw new RepoError('Sunucuya ulaşılamadı. Bağlantınızı kontrol ediniz.');
  }

  // Uç nokta tanımlı değilse sunucu SPA kabuğunu (HTML) döndürür.
  if (!(response.headers.get('content-type') ?? '').includes('application/json')) {
    throw new RepoError('Giriş servisi yanıt vermiyor. Sunucu yapılandırmasını kontrol ediniz.');
  }

  const result = (await response.json()) as {
    accessToken?: string; refreshToken?: string; expiresIn?: number;
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

  return {
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    expiresIn: result.expiresIn ?? 3600,
  };
}

/**
 * Oturumdaki kullanıcının kimliği.
 *
 * Jetonun gövdesi okunuyor, İMZASI DOĞRULANMIYOR: doğrulamayı sunucu ve
 * PostgREST yapıyor. Tarayıcıda yapılan bir doğrulama zaten hiçbir şey
 * kanıtlamaz, çünkü kodu da jetonu da kullanıcı değiştirebilir. Buradaki
 * okuma sadece "hangi profili çekeceğiz" sorusunu cevaplıyor; yanlış bir
 * kimlik yazılsa bile RLS başkasının satırını döndürmez.
 */
function kullaniciId(): string | null {
  const jeton = erisimJetonu();
  if (!jeton) return null;
  const parcalar = jeton.split('.');
  if (parcalar.length !== 3) return null;
  try {
    const govde = JSON.parse(atob(parcalar[1].replace(/-/g, '+').replace(/_/g, '/'))) as
      { sub?: string };
    return govde.sub ?? null;
  } catch {
    return null;
  }
}

async function currentProfile(): Promise<User | null> {
  const id = kullaniciId();
  if (!id) return null;
  const { data, error } = await db().from('profiles').select('*').eq('id', id).maybeSingle();
  if (error) fail('Profil bilgisi alınamadı.', error);
  return data ? toUser(data as Row) : null;
}

/** Sunucudaki şifre uç noktasına istek atar. */
async function sifreIstegi(govde: Record<string, unknown>): Promise<void> {
  let yanit: Response;
  try {
    yanit = await fetch('/api/sifre', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(govde),
    });
  } catch {
    throw new RepoError('Sunucuya ulaşılamadı.');
  }
  if (!yanit.ok) {
    const sonuc = (await yanit.json().catch(() => ({}))) as { error?: string };
    throw new RepoError(sonuc.error ?? 'İşlem tamamlanamadı.');
  }
}

/* --------------------------------------------------------- repository */

export const supabaseRepo: Repository = {
  kind: 'supabase',

  async getSession() {
    if (!oturumVarMi()) return null;
    // Süresi dolmak üzereyse önce tazelenir; yoksa ilk sorgu 401 alır
    // ve kullanıcı sebepsiz yere giriş ekranına düşer.
    const jeton = await gecerliJeton();
    if (!jeton) return null;
    return currentProfile();
  },

  async signIn(email, password) {
    /*
      Giriş her zaman sunucudaki /api/login üzerinden yapılır. Doğrudan
      veritabanına giden bir yedek yol BIRAKILMADI: eskiden uç nokta
      bulunamazsa Supabase'e düşülüyordu ve o yolda hesap kilidi ile hız
      sınırı hiç uygulanmıyordu. Sessizce korumasız çalışan bir giriş,
      hiç çalışmayandan kötüdür.
    */
    const oturum = await signInViaServer(email, password);
    oturumuKaydet(oturum);

    const profile = await currentProfile();
    if (!profile) {
      // Profil yoksa oturumu açık bırakmak, kullanıcıyı hiçbir şey
      // yapamadığı bir panele sokardı.
      oturumuTemizle();
      throw new RepoError('Hesabınıza ait profil bulunamadı.');
    }
    return profile;
  },

  async signOut() {
    await oturumuKapat();
  },

  async requestPasswordReset(email) {
    await sifreIstegi({ islem: 'sifirla', email: email.trim() });
  },

  async changePassword(currentPassword, nextPassword) {
    const profile = await currentProfile();
    if (!profile) throw new RepoError('Oturumunuz bulunamadı.');

    /*
      Mevcut şifre sunucuda doğrulanıyor. Doğrulama başarılıysa o
      kullanıcının BÜTÜN oturumları kapanıyor -- bu cihaz dahil; şifre
      değiştirmek, hesabı ele geçirmiş olabilecek birini de dışarı
      atmalı.
    */
    await sifreIstegi({
      islem: 'degistir',
      email: profile.email,
      mevcut: currentPassword,
      yeni: nextPassword,
    });
    oturumuTemizle();
  },

  async updateProfile(patch) {
    const id = kullaniciId();
    if (!id) throw new RepoError('Oturumunuz bulunamadı.');

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
      .update(row).eq('id', id).select().single();
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
      /*
        Panelden hesap AÇMA yolu henüz yok: hesabı sunucu yöneticisi
        veritabanındaki `kullanici_ac` fonksiyonuyla oluşturuyor. Buradan
        yalnızca var olan bir hesabın bilgileri ve yetkileri düzenlenir.
      */
      throw new RepoError(
        'Yeni personel hesabını sunucu yöneticisi açar (kullanici_ac). ' +
        'Hesap açıldıktan sonra yetkilerini buradan düzenleyebilirsiniz.',
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
      ...kimlikAlani(business.id), owner_id: business.ownerId, name: business.name,
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
      ...kimlikAlani(payment.id), reservation_id: payment.reservationId, date: payment.date,
      amount: payment.amount, method: payment.method, note: payment.note || null,
    });
    if (error) fail('Tahsilat kaydedilemedi.', error);
  },

  async updatePayment(payment) {
    const { error } = await db().from('payments').update({
      date: payment.date, amount: payment.amount,
      method: payment.method, note: payment.note || null,
    }).eq('id', payment.id);
    if (error) fail('Tahsilat güncellenemedi.', error);
  },

  async deletePayment(id) {
    const { error } = await db().from('payments').delete().eq('id', id);
    if (error) fail('Tahsilat silinemedi.', error);
  },

  /*
    Ödeme olayları YALNIZCA OKUNUYOR. Satırları veritabanı tetikleyicisi
    yazıyor; uygulamaya bırakılsaydı panel, mobil ve ileride eklenecek her
    istemci aynı kaydı ayrı yazmak zorunda kalır, birinin unutması kaydı
    sessizce eksik bırakırdı.
  */
  async listPaymentEvents(businessId) {
    const { data, error } = await db().from('payment_events')
      .select('*').eq('business_id', businessId)
      .order('created_at', { ascending: false }).limit(500);
    if (error) fail('Ödeme geçmişi alınamadı.', error);
    return (data ?? []).map(toPaymentEvent);
  },

  async listPaymentAlerts(businessId) {
    const { data, error } = await db().from('payment_alerts')
      .select('*').eq('business_id', businessId);
    if (error) fail('Bildirim kuralları alınamadı.', error);
    return (data ?? []).map(toPaymentAlert);
  },

  async savePaymentAlert(alert) {
    const { data, error } = await db().from('payment_alerts').upsert({
      ...kimlikAlani(alert.id), business_id: alert.businessId,
      event: alert.event, enabled: alert.enabled, body: alert.body,
    }, { onConflict: 'business_id,event' }).select().single();
    if (error) fail('Bildirim kuralı kaydedilemedi.', error);
    return toPaymentAlert(data);
  },

  async listPaymentAlertRecipients(businessId) {
    const { data, error } = await db().from('payment_alert_recipients')
      .select('*').eq('business_id', businessId).order('name');
    if (error) fail('Bildirim alıcıları alınamadı.', error);
    return (data ?? []).map(toPaymentAlertRecipient);
  },

  async savePaymentAlertRecipient(alici) {
    const { data, error } = await db().from('payment_alert_recipients').upsert({
      ...kimlikAlani(alici.id), business_id: alici.businessId,
      name: alici.name, phone: alici.phone, enabled: alici.enabled,
    }).select().single();
    if (error) fail('Bildirim alıcısı kaydedilemedi.', error);
    return toPaymentAlertRecipient(data);
  },

  async deletePaymentAlertRecipient(id) {
    const { error } = await db().from('payment_alert_recipients').delete().eq('id', id);
    if (error) fail('Bildirim alıcısı silinemedi.', error);
  },

  async listCashFlow(businessId) {
    const { data, error } = await db().from('cash_flow')
      .select('*').eq('business_id', businessId).order('date', { ascending: false });
    if (error) fail('Kasa kayıtları alınamadı.', error);
    return (data ?? []).map(toCashFlow);
  },

  async listReservationExpenses(businessId) {
    const { data, error } = await db().from('reservation_expenses')
      .select('*').eq('business_id', businessId).order('created_at', { ascending: false });
    if (error) fail('Düğün içi giderler alınamadı.', error);
    return (data ?? []).map(toReservationExpense);
  },

  async saveReservationExpense(expense) {
    const { error } = await db().from('reservation_expenses').upsert({
      ...kimlikAlani(expense.id), business_id: expense.businessId,
      reservation_id: expense.reservationId, kind: expense.kind,
      unit_count: expense.unitCount, unit_price: expense.unitPrice, note: expense.note,
    });
    if (error) fail('Gider kaydedilemedi.', error);
  },

  async deleteReservationExpense(id) {
    const { error } = await db().from('reservation_expenses').delete().eq('id', id);
    if (error) fail('Gider silinemedi.', error);
  },

  async addCashFlow(entry) {
    const { error } = await db().from('cash_flow').insert({
      ...kimlikAlani(entry.id), business_id: entry.businessId, kind: entry.kind, date: entry.date,
      category: entry.category, amount: entry.amount, method: entry.method ?? null,
      description: entry.description || null,
      reservation_id: entry.reservationId || null,
    });
    if (error) fail('Kayıt eklenemedi.', error);
  },

  async deleteCashFlow(id) {
    const { error } = await db().from('cash_flow').delete().eq('id', id);
    if (error) fail('Kayıt silinemedi.', error);
  },


  async listLeads(businessId) {
    const { data, error } = await db().from('customer_leads')
      .select('*').eq('business_id', businessId).order('updated_at', { ascending: false });
    if (error) fail('Müşteri adayları alınamadı.', error);
    return (data ?? []).map(toLead);
  },

  async getLead(id) {
    const { data, error } = await db().from('customer_leads')
      .select('*').eq('id', id).maybeSingle();
    if (error) fail('Müşteri adayı alınamadı.', error);
    return data ? toLead(data) : null;
  },

  async saveLead(lead) {
    const { data, error } = await db().from('customer_leads')
      .upsert(fromLead(lead)).select().single();
    if (error) {
      // 23505: aynı numarada bir aday zaten var. Bu bir hata değil, tam da
      // engellenmek istenen durum; çağıran mevcut kaydı kullanmalı.
      if ((error as { code?: string }).code === '23505') {
        throw new RepoError('Bu telefon numarasıyla kayıtlı bir müşteri adayı zaten var.');
      }
      fail('Müşteri adayı kaydedilemedi.', error);
    }
    return toLead(data);
  },

  async deleteLead(id) {
    const { error } = await db().from('customer_leads').delete().eq('id', id);
    if (error) fail('Müşteri adayı silinemedi.', error);
  },

  async listLeadMessages(leadId) {
    const { data, error } = await db().from('customer_lead_messages')
      .select('*').eq('lead_id', leadId).order('created_at', { ascending: true });
    if (error) fail('İletişim geçmişi alınamadı.', error);
    return (data ?? []).map(toLeadMessage);
  },

  async addLeadMessage(message) {
    const { error } = await db().from('customer_lead_messages').insert({
      ...kimlikAlani(message.id), business_id: message.businessId, lead_id: message.leadId,
      direction: message.direction, channel: message.channel, body: message.body,
      wa_message_id: message.waMessageId ?? null, actor_email: message.actorEmail,
    });
    if (error) fail('İletişim kaydı yazılamadı.', error);
  },

  async listLeadStatuses(businessId) {
    const { data, error } = await db().from('lead_statuses')
      .select('*').eq('business_id', businessId).order('sort_order', { ascending: true });
    if (error) fail('Durumlar alınamadı.', error);
    return (data ?? []).map(toLeadStatus);
  },

  async saveLeadStatus(durum) {
    /*
      Başlangıç ve kazanım durumu işletmede tek olmalı; veritabanında bunu
      kısmi benzersiz indeks tutuyor. Aynı anda iki satır yazılamadığı için
      önce eskisi temizleniyor: doğrudan yazılsaydı indeks düşer ve
      kullanıcı "23505" görürdü.
    */
    if (durum.isInitial || durum.isWon) {
      const temizle: Record<string, unknown> = {};
      if (durum.isInitial) temizle.is_initial = false;
      if (durum.isWon) temizle.is_won = false;
      const { error: hata } = await db().from('lead_statuses')
        .update(temizle).eq('business_id', durum.businessId).neq('code', durum.code);
      if (hata) fail('Durum kaydedilemedi.', hata);
    }

    const { data, error } = await db().from('lead_statuses')
      .upsert({
        ...kimlikAlani(durum.id), business_id: durum.businessId, code: durum.code,
        label: durum.label, sort_order: durum.sortOrder, tone: durum.tone,
        is_initial: durum.isInitial, is_closed: durum.isClosed, is_won: durum.isWon,
        active: durum.active,
      }, { onConflict: 'business_id,code' })
      .select().single();
    if (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new RepoError('Bu kodla bir durum zaten var.');
      }
      fail('Durum kaydedilemedi.', error);
    }
    return toLeadStatus(data);
  },

  async deleteLeadStatus(id) {
    const { error } = await db().from('lead_statuses').delete().eq('id', id);
    if (error) {
      // 23503: bu durumu taşıyan aday var. DT002: başlangıç durumu.
      const kod = (error as { code?: string }).code;
      if (kod === '23503') {
        throw new RepoError(
          'Bu durumu kullanan müşteri adayları var. Silmek yerine pasife alın.');
      }
      if (kod === 'DT002') {
        throw new RepoError(
          'Başlangıç durumu silinemez. Önce başka bir durumu başlangıç yapın.');
      }
      fail('Durum silinemedi.', error);
    }
  },

  async listLeadStatusHistory(leadId) {
    const { data, error } = await db().from('customer_lead_status_history')
      .select('*').eq('lead_id', leadId).order('created_at', { ascending: false });
    if (error) fail('Durum geçmişi alınamadı.', error);
    return (data ?? []).map((row) => ({
      id: String(row.id),
      leadId: String(row.lead_id),
      fromStatus: (row.from_status as LeadStatusChange['fromStatus']) ?? null,
      toStatus: row.to_status as LeadStatusChange['toStatus'],
      actorEmail: (row.actor_email as string) ?? '',
      createdAt: (row.created_at as string) ?? '',
    }));
  },

  async getWhatsappAccount(businessId) {
    const { data, error } = await db().from('whatsapp_accounts')
      .select('*').eq('business_id', businessId).limit(1).maybeSingle();
    if (error) fail('WhatsApp hesabı alınamadı.', error);
    return data ? hesabaCevir(data) : null;
  },

  async saveWhatsappAccount(account) {
    const { data, error } = await db().from('whatsapp_accounts')
      .upsert({
        phone_number_id: account.phoneNumberId,
        business_id: account.businessId,
        display_phone: account.displayPhone,
        auto_reply_enabled: account.autoReplyEnabled,
        welcome_message: account.welcomeMessage,
        after_hours_enabled: account.afterHoursEnabled,
        after_hours_message: account.afterHoursMessage,
        work_start: account.workStart,
        work_end: account.workEnd,
        work_days: account.workDays,
      })
      .select('*').single();
    if (error) fail('WhatsApp hesabı kaydedilemedi.', error);
    return hesabaCevir(data);
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
      actorEmail: (row.actor_email as string) ?? '-',
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


  async listHalls(businessId) {
    const { data, error } = await db().from('halls')
      .select('*').eq('business_id', businessId).order('name');
    if (error) fail('Salonlar okunamadı.', error);
    return (data ?? []).map(toHall);
  },

  async saveHall(hall) {
    const { data, error } = await db().from('halls').upsert({
      ...kimlikAlani(hall.id), business_id: hall.businessId, name: hall.name,
      capacity: hall.capacity, note: hall.note, is_active: hall.isActive,
    }).select().single();
    if (error) fail('Salon kaydedilemedi.', error);
    return toHall(data);
  },

  async deleteHall(id) {
    const { error } = await db().from('halls').delete().eq('id', id);
    // 23503: salona bağlı rezervasyon var, kayıt silinmek yerine pasife alınmalı
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
      ...kimlikAlani(menu.id), business_id: menu.businessId, name: menu.name,
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

  async listTemplates(businessId) {
    const { data, error } = await db().from('message_templates')
      .select('*').eq('business_id', businessId);
    if (error) fail('Mesaj şablonları okunamadı.', error);
    const liste = (data ?? []).map(toTemplate);
    return liste.sort((a, b) => SABLON_SIRASI.indexOf(a.key) - SABLON_SIRASI.indexOf(b.key));
  },

  async saveTemplate(template) {
    // Sınıf (işlem / ticari) istemciden değiştirilemez: ticari bir metnin
    // işlem bildirimi diye gönderilmesi İYS onayı kontrolünü atlatırdı.
    const { data, error } = await db().from('message_templates').update({
      title: template.title, body: template.body, is_active: template.isActive,
    }).eq('id', template.id).select().single();
    if (error) fail('Mesaj şablonu kaydedilemedi.', error);
    return toTemplate(data as Row);
  },

  async listReminderRules(businessId) {
    const { data, error } = await db().from('reminder_rules')
      .select('*').eq('business_id', businessId);
    if (error) fail('Hatırlatma kuralları okunamadı.', error);
    const liste = (data ?? []).map(toRule);
    return liste.sort((a, b) => SABLON_SIRASI.indexOf(a.key) - SABLON_SIRASI.indexOf(b.key));
  },

  async saveReminderRule(rule) {
    const { data, error } = await db().from('reminder_rules').update({
      enabled: rule.enabled, days_before: rule.daysBefore, send_hour: rule.sendHour,
    }).eq('id', rule.id).select().single();
    if (error) fail('Hatırlatma kuralı kaydedilemedi.', error);
    return toRule(data as Row);
  },

  async listTasks(reservationId) {
    const { data, error } = await db().from('event_tasks')
      .select('*').eq('reservation_id', reservationId).order('at_time');
    if (error) fail('İş emri okunamadı.', error);
    return (data ?? []).map(toTask);
  },

  async saveTasks(reservationId, rows) {
    const { error: delError } = await db().from('event_tasks')
      .delete().eq('reservation_id', reservationId);
    if (delError) fail('İş emri güncellenemedi.', delError);
    if (rows.length === 0) return;

    const { error } = await db().from('event_tasks').insert(
      rows.map((r) => ({
        reservation_id: reservationId, at_time: r.atTime,
        title: r.title, responsible: r.responsible, done: r.done,
      })),
    );
    if (error) fail('İş emri kaydedilemedi.', error);
  },

  async listVendors(businessId) {
    const { data, error } = await db().from('vendors')
      .select('*').eq('business_id', businessId).order('name');
    if (error) fail('Tedarikçiler okunamadı.', error);
    return (data ?? []).map(toVendor);
  },

  async saveVendor(vendor) {
    const { data, error } = await db().from('vendors').upsert({
      ...kimlikAlani(vendor.id), business_id: vendor.businessId, name: vendor.name,
      category: vendor.category, kind: vendor.kind, phone: vendor.phone, note: vendor.note,
      unit_price: vendor.unitPrice,
      // Stok alanları hizmette sıfır kalıyor; veritabanı kısıtı da bunu
      // zorluyor, "3 koli DJ" gibi bir satır hiç oluşmasın.
      box_count: vendor.kind === 'urun' ? vendor.boxCount : 0,
      units_per_box: vendor.kind === 'urun' ? vendor.unitsPerBox : 0,
      loose_count: vendor.kind === 'urun' ? vendor.looseCount : 0,
      min_count: vendor.kind === 'urun' ? vendor.minCount : 0,
      is_active: vendor.isActive,
    }).select().single();
    if (error) fail('Kayıt kaydedilemedi.', error);
    return toVendor(data);
  },

  async deleteVendor(id) {
    const { error } = await db().from('vendors').delete().eq('id', id);
    if (error && (error as { code?: string }).code === '23503') {
      throw new RepoError('Bu kayıt organizasyonlara bağlı; silmek yerine pasife alın.');
    }
    if (error) fail('Kayıt silinemedi.', error);
  },

  async listReservationVendors(reservationId) {
    const { data, error } = await db().from('reservation_vendors')
      .select('*').eq('reservation_id', reservationId);
    if (error) fail('Tedarikçi atamaları okunamadı.', error);
    return (data ?? []).map(toReservationVendor);
  },

  async saveReservationVendors(reservationId, rows) {
    const { error: delError } = await db().from('reservation_vendors')
      .delete().eq('reservation_id', reservationId);
    if (delError) fail('Tedarikçi atamaları güncellenemedi.', delError);
    if (rows.length === 0) return;

    const { error } = await db().from('reservation_vendors').insert(
      rows.map((r) => ({
        reservation_id: reservationId, vendor_id: r.vendorId,
        arrive_at: r.arriveAt || null, cost: r.cost, note: r.note,
      })),
    );
    if (error) fail('Tedarikçi atamaları kaydedilemedi.', error);
  },


};
