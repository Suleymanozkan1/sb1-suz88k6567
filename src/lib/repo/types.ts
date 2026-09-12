/**
 * Veri erişim sözleşmesi.
 *
 * Uygulama katmanı yalnızca bu arayüzü tanır. İki uygulaması vardır:
 *  - `supabase`: gerçek Postgres (ortam değişkenleri tanımlıysa)
 *  - `local`   : tarayıcı belleği (demo ve testler için)
 */
import type { HatirlatmaKurali, Sablon } from '../sablon';
import type {
  AuditEntry, Business, CashFlowEntry, ColorSetting, ConsentStatus,   EnqueueResult, MessageCategory, Payment, PaymentAlert, PaymentAlertRecipient,
  PaymentEvent, Permission, Reservation, ReservationExpense, SmsConsent,
  Invoice, InvoiceKind, BuyerKind, Hall, Menu, SeatingTable,
  EventTask, Vendor, ReservationVendor,
  SmsLogEntry, SmsQueueEntry, SystemHealth, User,
  CustomerLead, LeadMessage, LeadStatusChange, LeadStatusDef, WhatsappAccount,
} from '../../types';
import type { InvoiceLineInput } from '../invoice';

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

  /* -- salonlar ----------------------------------------------------- */
  listHalls(businessId: string): Promise<Hall[]>;
  saveHall(hall: Omit<Hall, 'createdAt'> & { createdAt?: string }): Promise<Hall>;
  deleteHall(id: string): Promise<void>;

  /* -- menüler / paketler ------------------------------------------- */
  listMenus(businessId: string): Promise<Menu[]>;
  saveMenu(menu: Omit<Menu, 'createdAt'> & { createdAt?: string }): Promise<Menu>;
  deleteMenu(id: string): Promise<void>;

  /* -- hatırlatma şablonları ve otomatik kurallar -------------------- */
  listTemplates(businessId: string): Promise<Sablon[]>;
  saveTemplate(template: Sablon): Promise<Sablon>;
  listReminderRules(businessId: string): Promise<HatirlatmaKurali[]>;
  saveReminderRule(rule: HatirlatmaKurali): Promise<HatirlatmaKurali>;

  /* -- etkinlik iş emri --------------------------------------------- */
  listTasks(reservationId: string): Promise<EventTask[]>;
  saveTasks(reservationId: string, rows: Omit<EventTask, 'id' | 'reservationId'>[]): Promise<void>;

  /* -- tedarikçiler -------------------------------------------------- */
  listVendors(businessId: string): Promise<Vendor[]>;
  saveVendor(vendor: Omit<Vendor, 'createdAt'> & { createdAt?: string }): Promise<Vendor>;
  deleteVendor(id: string): Promise<void>;
  listReservationVendors(reservationId: string): Promise<ReservationVendor[]>;
  saveReservationVendors(
    reservationId: string,
    rows: Omit<ReservationVendor, 'id' | 'reservationId'>[],
  ): Promise<void>;

  /* -- masa oturma düzeni ------------------------------------------- */
  listSeating(reservationId: string): Promise<SeatingTable[]>;
  /** Planın tamamını değiştirir; kısmi güncelleme yerine tek işlem. */
  saveSeating(reservationId: string, tables: Omit<SeatingTable, 'id' | 'reservationId'>[]): Promise<void>;

  /* -- rezervasyonlar ----------------------------------------------- */
  listReservations(businessId: string): Promise<Reservation[]>;
  getReservation(id: string): Promise<Reservation | null>;
  /**
   * Kaydeder ve kaydedilmiş hâli döndürür.
   *
   * Sözleşme numarası boş bırakılırsa veritabanı doldurur (yıl + sıra:
   * 20261, 20262, ...). Numarayı istemcinin üretmemesi, iki kayıt aynı
   * anda açıldığında numaranın tekrar etmemesini sağlar; mevcut bir
   * kaydın numarası hiçbir güncellemede değişmez.
   */
  saveReservation(reservation: Reservation): Promise<Reservation>;
  deleteReservation(id: string): Promise<void>;
  verifyCode(code: string): Promise<PublicReservation | null>;

  /* -- tahsilatlar --------------------------------------------------- */
  listPayments(businessId: string): Promise<Payment[]>;
  addPayment(payment: Payment): Promise<void>;
  /** Tutar, tip, tarih ve açıklama düzeltilebilir; kayıt kimliği değişmez. */
  updatePayment(payment: Payment): Promise<void>;
  deletePayment(id: string): Promise<void>;

  /* -- ödeme değişiklikleri -------------------------------------------- */
  /** Geçmiş yalnızca okunur; satırları veritabanı tetikleyicisi yazar. */
  listPaymentEvents(businessId: string): Promise<PaymentEvent[]>;
  listPaymentAlerts(businessId: string): Promise<PaymentAlert[]>;
  savePaymentAlert(alert: PaymentAlert): Promise<PaymentAlert>;
  listPaymentAlertRecipients(businessId: string): Promise<PaymentAlertRecipient[]>;
  savePaymentAlertRecipient(alici: PaymentAlertRecipient): Promise<PaymentAlertRecipient>;
  deletePaymentAlertRecipient(id: string): Promise<void>;

  /* -- düğün içi giderler ---------------------------------------------- */
  listReservationExpenses(businessId: string): Promise<ReservationExpense[]>;
  saveReservationExpense(expense: ReservationExpense): Promise<void>;
  deleteReservationExpense(id: string): Promise<void>;

  /* -- kasa ---------------------------------------------------------- */
  listCashFlow(businessId: string): Promise<CashFlowEntry[]>;
  addCashFlow(entry: CashFlowEntry): Promise<void>;
  deleteCashFlow(id: string): Promise<void>;

  /* -- müşteri adayları ------------------------------------------------ */
  listLeads(businessId: string): Promise<CustomerLead[]>;
  getLead(id: string): Promise<CustomerLead | null>;
  /**
   * Adayı açar ya da aynı telefondaki mevcut adayı günceller.
   *
   * Aynı numaradan ikinci mesaj yeni bir aday AÇMAMALI: konuşmanın tamamı
   * tek kişinin altında toplanmalı. Eşleştirme telefona, yoksa e-postaya
   * bakar.
   */
  saveLead(lead: CustomerLead): Promise<CustomerLead>;
  deleteLead(id: string): Promise<void>;

  listLeadMessages(leadId: string): Promise<LeadMessage[]>;
  addLeadMessage(message: LeadMessage): Promise<void>;
  listLeadStatusHistory(leadId: string): Promise<LeadStatusChange[]>;

  /** İşletmenin düzenleyebildiği aday durumları. */
  listLeadStatuses(businessId: string): Promise<LeadStatusDef[]>;
  saveLeadStatus(durum: LeadStatusDef): Promise<LeadStatusDef>;
  deleteLeadStatus(id: string): Promise<void>;

  /* -- WhatsApp hesabı ------------------------------------------------ */
  /** İşletmenin bağlı WhatsApp numarası ve otomatik cevap ayarları; yoksa null. */
  getWhatsappAccount(businessId: string): Promise<WhatsappAccount | null>;
  saveWhatsappAccount(account: WhatsappAccount): Promise<WhatsappAccount>;

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
