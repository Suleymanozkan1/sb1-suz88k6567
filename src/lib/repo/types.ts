/**
 * Veri erişim sözleşmesi.
 *
 * Uygulama katmanı yalnızca bu arayüzü tanır. İki uygulaması vardır:
 *  - `supabase`: gerçek Postgres (ortam değişkenleri tanımlıysa)
 *  - `local`   : tarayıcı belleği (demo ve testler için)
 */
import type {
  Business, CashFlowEntry, ColorSetting, ContactMessage, Payment,
  Permission, Reservation, SmsLogEntry, User,
} from '../../types';

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

  /* -- iletişim -------------------------------------------------------- */
  addMessage(message: Omit<ContactMessage, 'id' | 'createdAt'>): Promise<void>;
}

/** Kullanıcıya gösterilebilir hata; teknik ayrıntı sızdırmaz. */
export class RepoError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'RepoError';
  }
}
