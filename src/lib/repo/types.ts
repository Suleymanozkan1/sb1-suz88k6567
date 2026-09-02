/**
 * Veri erişim sözleşmesi.
 *
 * Uygulama katmanı yalnızca bu arayüzü tanır. İki uygulaması vardır:
 *  - `supabase`: gerçek Postgres (ortam değişkenleri tanımlıysa)
 *  - `local`   : tarayıcı belleği (demo ve testler için)
 */
import type {
  AuditEntry, Business, CashFlowEntry, ColorSetting, ConsentStatus, ContactMessage,
  EnqueueResult, MessageCategory, Payment, Permission, Reservation, SmsConsent,
  Invoice, InvoiceKind, BuyerKind,
  SmsLogEntry, SmsQueueEntry, SystemHealth, User,
} from '../../types';
import type { InvoiceLineInput } from '../invoice';

export interface SignUpInput {
  email: string;
  password: string;
  companyName: string;
  fullName: string;
  mobile: string;
  city: string;
  district: string;
  category: string;
  capacity: number;
  currency: User['currency'];
  facebook?: string;
  instagram?: string;
  address?: string;
  phone?: string;
}

export interface StaffInput {
  id?: string;
  fullName: string;
  email: string;
  password?: string;
  mobile: string;
  permissions: Permission[];
}

/** Kod doğrulama sayfasının herkese açık olarak görebildiği alanlar */
export interface PublicReservation {
  code: string;
  customerName: string;
  customerPhone: string;
  date: string;
  slot: string;
  organizationType: string;
  guestCount: number;
  totalAmount: number;
  status: string;
  businessName: string;
}

export interface Repository {
  readonly kind: 'supabase' | 'local';

  /* -- oturum ------------------------------------------------------- */
  getSession(): Promise<User | null>;
  signIn(email: string, password: string): Promise<User>;
  signUp(input: SignUpInput): Promise<User>;
  signOut(): Promise<void>;
  requestPasswordReset(email: string): Promise<void>;
  changePassword(currentPassword: string, nextPassword: string): Promise<void>;
  updateProfile(patch: Partial<User>): Promise<User>;

  /* -- personel ----------------------------------------------------- */
  listStaff(ownerId: string): Promise<User[]>;
  saveStaff(ownerId: string, input: StaffInput): Promise<void>;
  deleteStaff(id: string): Promise<void>;

  /* -- işletmeler --------------------------------------------------- */
  listBusinesses(ownerId: string): Promise<Business[]>;
  saveBusiness(business: Omit<Business, 'createdAt'> & { createdAt?: string }): Promise<Business>;
  deleteBusiness(id: string): Promise<void>;

  /* -- rezervasyonlar ----------------------------------------------- */
  listReservations(businessId: string): Promise<Reservation[]>;
  getReservation(id: string): Promise<Reservation | null>;
  saveReservation(reservation: Reservation): Promise<Reservation>;
  deleteReservation(id: string): Promise<void>;
  verifyCode(code: string): Promise<PublicReservation | null>;

  /* -- tahsilatlar --------------------------------------------------- */
  listPayments(businessId: string): Promise<Payment[]>;
  addPayment(payment: Payment): Promise<void>;
  deletePayment(id: string): Promise<void>;

  /* -- kasa ---------------------------------------------------------- */
  listCashFlow(businessId: string): Promise<CashFlowEntry[]>;
  addCashFlow(entry: CashFlowEntry): Promise<void>;
  deleteCashFlow(id: string): Promise<void>;

  /* -- renk ayarları -------------------------------------------------- */
  getColorSettings(businessId: string): Promise<ColorSetting[]>;
  saveColorSettings(businessId: string, settings: ColorSetting[]): Promise<void>;

  /* -- SMS ------------------------------------------------------------ */
  listSms(businessId: string): Promise<SmsLogEntry[]>;
  logSms(entry: Omit<SmsLogEntry, 'id' | 'sentAt'>): Promise<void>;

  /**
   * Mesajı gönderim kuyruğuna alır.
   * Ticari iletide İYS onayı yoksa kuyruğa girmez ve gerekçe döner.
   */
  enqueueSms(input: {
    businessId: string;
    phone: string;
    body: string;
    kind: SmsLogEntry['kind'];
    category: MessageCategory;
    reservationId?: string;
  }): Promise<EnqueueResult>;

  listSmsQueue(businessId: string, limit: number): Promise<SmsQueueEntry[]>;

  /* -- İYS izinleri ----------------------------------------------------- */
  listConsents(businessId: string): Promise<SmsConsent[]>;
  saveConsent(input: {
    businessId: string;
    phone: string;
    status: ConsentStatus;
    source: string;
    note?: string;
  }): Promise<void>;
  deleteConsent(id: string): Promise<void>;

  /* -- iletişim -------------------------------------------------------- */
  addMessage(message: Omit<ContactMessage, 'id' | 'createdAt'>): Promise<void>;

  /* -- denetim kaydı ---------------------------------------------------- */
  listAuditLog(limit: number): Promise<AuditEntry[]>;

  /* -- faturalar --------------------------------------------------------- */
  listInvoices(businessId: string): Promise<Invoice[]>;
  getInvoice(id: string): Promise<Invoice | null>;
  createInvoice(input: {
    businessId: string;
    reservationId?: string;
    kind: InvoiceKind;
    serviceDate?: string;
    buyerKind: BuyerKind;
    buyerName: string;
    buyerTaxId?: string;
    buyerTaxOffice?: string;
    buyerAddress?: string;
    buyerEmail?: string;
    buyerPhone?: string;
    note?: string;
    lines: InvoiceLineInput[];
  }): Promise<Invoice>;
  /** Taslak faturayı entegratöre gönderir */
  sendInvoice(id: string): Promise<{ sent: boolean; reason?: string }>;
  cancelInvoice(id: string, reason: string): Promise<void>;

  /* -- izleme ve yedekleme ---------------------------------------------- */
  getSystemHealth(ownerId: string): Promise<SystemHealth | null>;
  /** Kullanıcının tüm verisini tek belge olarak döndürür (elle yedek) */
  exportData(ownerId: string): Promise<unknown>;
}

/** Kullanıcıya gösterilebilir hata; teknik ayrıntı sızdırmaz. */
export class RepoError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'RepoError';
  }
}
