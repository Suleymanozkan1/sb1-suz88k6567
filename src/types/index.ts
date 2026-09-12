/** Uygulama genelinde kullanılan tip tanımları */

export type Currency = 'TL' | 'EUR' | 'USD' | 'GBP';

export type OrganizationType =
  | 'Düğün'
  | 'Sünnet'
  | 'Nişan'
  | 'Kına'
  | 'Konferans'
  | 'Kokteyl'
  | 'Nikâh'
  | 'Doğum Günü'
  | 'Toplantı'
  | 'Diğer';

/** Gündüz / Gece seans ayrımı: orijinal sistemdeki "gündüz ve gece" takibi */
export type SessionSlot = 'Gündüz' | 'Gece';

/**
 * Müşteri işletmeye hangi kanaldan ulaştı.
 *
 * Sabit bir liste: serbest metin "Instagram", "instagram", "İnstagram" diye
 * üç ayrı kanal üretip yıl sonu raporunu anlamsız kılardı.
 */
export type LeadChannel =
  | 'Instagram' | 'Facebook' | 'WhatsApp' | 'Web Sitesi'
  | 'Google' | 'Tavsiye' | 'Telefon' | 'Diğer'
  /*
    Artık listede olmayan eski değerler. Tipten atılsalardı, o kanalla
    kaydedilmiş geçmiş rezervasyonlar okunamaz olur ve yıl sonu kanal
    raporunda sessizce kaybolurlardı. Yeni kayıtta seçilemiyorlar.
  */
  | 'Düğün.com' | 'Referans';

export type ReservationStatus = 'Ön Rezervasyon' | 'Kesin Rezervasyon' | 'Tamamlandı' | 'İptal';

/**
 * Paranın hangi kanaldan geçtiği.
 *
 * Hem rezervasyon tahsilatlarında hem gelir/gider satırlarında AYNI tip
 * kullanılıyor: kasa dağılımı ikisini toplayarak çıkıyor ve iki ayrı
 * liste, aynı paranın iki yerde farklı sınıflanmasına yol açardı.
 *
 * Veritabanındaki `payment_method` enum'uyla birebir aynı sırada.
 */
export type PaymentMethod = 'Nakit' | 'Kredi Kartı' | 'Havale/EFT' | 'Çek' | 'Senet';

/**
 * Kasa dağılımında gösterilen kanallar.
 *
 * Çek ve senet burada YOK: ikisi de henüz tahsil edilmemiş bir vaattir,
 * kasadaki parayla toplanırsa kasa olduğundan büyük görünür. Tutarları
 * varsa ayrıca "Tahsil edilmemiş" olarak gösteriliyor.
 */
export const KASA_KANALLARI: PaymentMethod[] = ['Nakit', 'Kredi Kartı', 'Havale/EFT'];

export interface Payment {
  id: string;
  reservationId: string;
  date: string; // ISO yyyy-mm-dd
  amount: number;
  method: PaymentMethod;
  note?: string;
  createdAt: string;
}

export interface Reservation {
  id: string;
  businessId: string;
  hallId: string;
  menuId?: string;
  code: string; // Kod doğrulama ekranında sorgulanan rezervasyon kodu
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  secondPersonName?: string;
  /** İkinci kişinin telefonu; sözleşmedeki "Gelin Cep" satırı. */
  secondPhone?: string;
  /**
   * Sözleşmeyi imzalayanın TC kimlik numarası (11 hane).
   * KVKK: yalnızca sözleşme düzenlemek için tutulur, kod doğrulama
   * ekranına hiçbir koşulda çıkmaz.
   */
  identityNo?: string;
  date: string; // ISO yyyy-mm-dd
  /** Başlangıç saati HH:mm; sözleşmedeki "Saat" satırı. İsteğe bağlı. */
  startTime?: string;
  /** Bitiş saati HH:mm. Gece yarısını aşan törenlerde başlangıçtan küçük olabilir. */
  endTime?: string;
  slot: SessionSlot;
  organizationType: OrganizationType;
  guestCount: number;
  totalAmount: number;
  deposit: number; // Kapora
  /** Kaporanın hangi kanaldan alındığı. Eski kayıtlarda boş. */
  depositMethod?: PaymentMethod;
  currency: Currency;
  status: ReservationStatus;
  colorKey: string; // Rezervasyon Renk Ayarları ile eşleşen anahtar
  note?: string;
  services: string[];
  address?: string;
  /** Müşteri bize hangi kanaldan ulaştı; yıl sonu kanal raporunun kaynağı. */
  sourceChannel?: LeadChannel;
  /** Referansta tavsiye edenin adı, "Diğer"de açıklama. */
  sourceDetail?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Düğün içi gider: bir organizasyonun kendi içinde harcanan para.
 *
 * Garson, DJ, vale, fotoğrafçı. Rezervasyona bağlı olduğu için "bu düğün
 * bize kaça mal oldu" sorusunun tek bir cevabı oluyor.
 *
 * Toplam ALAN DEĞİL, hesaplanıyor (unitCount * unitPrice). Ayrı bir alan
 * olsaydı üç sayı birbirini tutmadığında hangisinin doğru olduğu
 * bilinemezdi.
 */
export interface ReservationExpense {
  id: string;
  businessId: string;
  reservationId: string;
  /** Garson, DJ, Vale... Serbest metin; her salonun kalemleri farklı. */
  kind: string;
  /** Kaç adet / kaç kişi. Ondalık olabilir (yarım gün gibi). */
  unitCount: number;
  unitPrice: number;
  note: string;
  createdAt: string;
  updatedAt: string;
}

/** Bir işletmedeki fiziksel salon. Çakışma kuralı salon bazında işler. */
export interface Hall {
  id: string;
  businessId: string;
  name: string;
  capacity: number;
  note: string;
  isActive: boolean;
  createdAt: string;
}

/** Menü fiyatı kişi başı ya da sabit olabilir. */
export type MenuPricing = 'kisi_basi' | 'sabit';

export const MENU_PRICING_LABELS: Record<MenuPricing, string> = {
  kisi_basi: 'Kişi başı',
  sabit: 'Sabit tutar',
};

export interface Menu {
  id: string;
  businessId: string;
  name: string;
  pricing: MenuPricing;
  /** Kuruş cinsinden tamsayı; ondalık aritmetik kuruş kaydırır. */
  priceKurus: number;
  description: string;
  isActive: boolean;
  createdAt: string;
}

/** Rezervasyona bağlı tek bir masa. */
export interface SeatingTable {
  id: string;
  reservationId: string;
  tableNo: number;
  seats: number;
  label: string;
}

/** Etkinlik günü iş emri satırı. */
export interface EventTask {
  id: string;
  reservationId: string;
  atTime: string;
  title: string;
  responsible: string;
  done: boolean;
}

/**
 * Ürün mü hizmet mi?
 *
 * Aynı tabloda duruyorlar: garson ve su iki ayrı tabloda tanımlansaydı
 * aynı kalem iki yerden girilebilir, hangisinin doğru olduğu belirsiz
 * kalırdı. Stok yalnızca üründe anlamlı -- DJ'in kolisi olmaz.
 */
export type VendorKind = 'hizmet' | 'urun';

export interface Vendor {
  id: string;
  businessId: string;
  name: string;
  category: string;
  kind: VendorKind;
  phone: string;
  note: string;
  /** Düğün içi gider satırı buradan doldurulabilir. */
  unitPrice: number;
  /** Stok: yalnızca üründe dolu. */
  boxCount: number;
  unitsPerBox: number;
  /** Koliden bozulmuş, tek tek duran adet. */
  looseCount: number;
  /** Kritik seviye. Sıfır = takip edilmiyor. */
  minCount: number;
  isActive: boolean;
  createdAt: string;
}

/** Bir tedarikçinin belirli bir organizasyona atanması. */
export interface ReservationVendor {
  id: string;
  reservationId: string;
  vendorId: string;
  arriveAt?: string;
  cost: number;
  note: string;
}

export const VENDOR_CATEGORIES = [
  'Orkestra / Müzik', 'Fotoğraf / Video', 'Çiçek / Süsleme', 'Pasta',
  'Gelin Arabası', 'Ses ve Işık', 'İkram / Catering', 'Diğer',
] as const;

/**
 * Hizmet kalemlerinin kategorileri.
 *
 * Tedarikçi kategorileri dış firmaları anlatıyordu; salonun kendi
 * personeli (garson, vale) o listeye girmiyordu. İkisi ayrı listeler,
 * tek listede toplanınca hiçbiri işe yaramıyordu.
 */
export const HIZMET_KATEGORILERI = [
  'Personel', 'Orkestra / Müzik', 'Fotoğraf / Video', 'Çiçek / Süsleme',
  'Pasta', 'Gelin Arabası', 'Ses ve Işık', 'İkram / Catering', 'Diğer',
] as const;

/** Fiziksel ürün kategorileri. */
export const URUN_KATEGORILERI = [
  'İçecek', 'Gıda', 'Temizlik', 'Sarf Malzeme', 'Diğer',
] as const;

export type CashFlowKind = 'Gelir' | 'Gider';

export interface CashFlowEntry {
  id: string;
  businessId: string;
  kind: CashFlowKind;
  date: string;
  category: string;
  amount: number;
  /**
   * Paranın hangi kanaldan girdiği/çıktığı.
   *
   * Boş olabilir: ödeme tipi alanı sonradan eklendi ve eski satırların
   * tipi bilinmiyor. Hepsine "Nakit" varsaymak uydurma bir veri üretir,
   * kasa dağılımını yanlış gösterirdi.
   */
  method?: PaymentMethod;
  description?: string;
  reservationId?: string;
  createdAt: string;
}

/** Müşteri adayının nereden geldiği. */
export type LeadSource = 'Instagram' | 'WhatsApp' | 'Web Sitesi' | 'Telefon' | 'Manuel' | 'Diğer';

export const LEAD_SOURCES: LeadSource[] = [
  'Instagram', 'WhatsApp', 'Web Sitesi', 'Telefon', 'Manuel', 'Diğer',
];

/**
 * Müşteri adayının takip durumu: `lead_statuses.code` değeri.
 *
 * Durumlar artık sabit bir liste değil, işletmenin düzenlediği satırlar
 * (bkz. LeadStatusDef). Bu yüzden tip `string`: derleyici hangi kodların
 * geçerli olduğunu bilemez, geçerliliği veritabanındaki yabancı anahtar
 * ve ekrandaki liste sağlıyor.
 */
export type LeadStatus = string;

/**
 * Durumun ekrandaki rengi.
 *
 * Tailwind sınıfı veritabanında DURMUYOR: orada anlam duruyor, karşılığını
 * arayüz seçiyor. Sınıf adı saklansaydı tema değiştiğinde her işletmenin
 * satırlarını tek tek düzeltmek gerekirdi.
 */
export type LeadStatusTone =
  | 'bekleyen' | 'ilerleyen' | 'olumlu' | 'teklif' | 'dikkat' | 'kapali' | 'notr';

export const LEAD_STATUS_TONES: LeadStatusTone[] =
  ['bekleyen', 'ilerleyen', 'olumlu', 'teklif', 'dikkat', 'kapali', 'notr'];

/**
 * İşletmenin tanımladığı bir müşteri adayı durumu.
 *
 * `code` değişmez, aday satırları ona bakar; `label` istendiği zaman
 * yeniden adlandırılabilir. İş kuralları da ada değil bayrağa bakıyor:
 * "Rezervasyona Döndü" yazan bir karşılaştırma, sahibi durumu yeniden
 * adlandırdığı anda sessizce yanlış sayardı.
 */
export interface LeadStatusDef {
  id: string;
  businessId: string;
  code: string;
  label: string;
  sortOrder: number;
  tone: LeadStatusTone;
  /**
   * Bu duruma geçince kaç gün sonra takip hatırlatması kurulacağı.
   * 0 = kurulmaz. Teklif durumlarında varsayılan 7 (madde 18); gün
   * sayısı koda gömülmedi, salonun takip ritmi değişebilsin.
   */
  followupDays: number;
  /** Yeni aday bu durumla açılır. İşletmede tek tanedir. */
  isInitial: boolean;
  /** İş beklemiyor: takip ve gecikme listelerinden düşer. */
  isClosed: boolean;
  /** Rezervasyona döndü sayılır. İşletmede tek tanedir. */
  isWon: boolean;
  active: boolean;
}

/**
 * Varsayılan durum akışı.
 *
 * Veritabanındaki `lead_statuses_tohumla` ile AYNI listedir; demo modu
 * ve testler veritabanı olmadan da aynı akışı görsün diye burada da
 * duruyor. İkisinin ayrışmadığını bir test koruyor.
 */
export const VARSAYILAN_LEAD_DURUMLARI: Omit<LeadStatusDef, 'id' | 'businessId'>[] = [
  { code: 'yeni', label: 'Yeni', sortOrder: 10, tone: 'bekleyen', followupDays: 0, isInitial: true, isClosed: false, isWon: false, active: true },
  { code: 'aranacak', label: 'Aranacak', sortOrder: 20, tone: 'bekleyen', followupDays: 0, isInitial: false, isClosed: false, isWon: false, active: true },
  { code: 'arandi', label: 'Arandı', sortOrder: 30, tone: 'ilerleyen', followupDays: 0, isInitial: false, isClosed: false, isWon: false, active: true },
  { code: 'ulasilamadi', label: 'Ulaşılamadı', sortOrder: 40, tone: 'dikkat', followupDays: 0, isInitial: false, isClosed: false, isWon: false, active: true },
  { code: 'tekrar_aranacak', label: 'Tekrar Aranacak', sortOrder: 50, tone: 'bekleyen', followupDays: 0, isInitial: false, isClosed: false, isWon: false, active: true },
  { code: 'tekrar_arandi', label: 'Tekrar Arandı', sortOrder: 60, tone: 'ilerleyen', followupDays: 0, isInitial: false, isClosed: false, isWon: false, active: true },
  { code: 'iletisim_kuruldu', label: 'İletişim Kuruldu', sortOrder: 70, tone: 'olumlu', followupDays: 0, isInitial: false, isClosed: false, isWon: false, active: true },
  { code: 'teklif_verildi', label: 'Teklif Verildi', sortOrder: 80, tone: 'teklif', followupDays: 7, isInitial: false, isClosed: false, isWon: false, active: true },
  { code: 'rezervasyon_bekliyor', label: 'Rezervasyon Bekliyor', sortOrder: 90, tone: 'teklif', followupDays: 7, isInitial: false, isClosed: false, isWon: false, active: true },
  { code: 'rezervasyona_dondu', label: 'Rezervasyona Döndü', sortOrder: 100, tone: 'olumlu', followupDays: 0, isInitial: false, isClosed: true, isWon: true, active: true },
  { code: 'olumsuz', label: 'Olumsuz', sortOrder: 110, tone: 'kapali', followupDays: 0, isInitial: false, isClosed: true, isWon: false, active: true },
  { code: 'iptal', label: 'İptal', sortOrder: 120, tone: 'kapali', followupDays: 0, isInitial: false, isClosed: true, isWon: false, active: true },
];

/** Varsayılan akıştaki başlangıç durumu. Veritabanı yokken kullanılır. */
export const VARSAYILAN_BASLANGIC_DURUMU = 'yeni';

/**
 * Müşteri adayı.
 *
 * Rezervasyona dönüşmemiş kişi de takip edilebilsin diye ayrı bir kayıt.
 * Müşteriler ekranı rezervasyonlardan türetilen bir görünümdür ve öyle
 * kalıyor; aday oraya karışmıyor.
 */
export interface CustomerLead {
  id: string;
  businessId: string;
  name: string;
  /** On haneye indirgenmiş numara. Aynı kişinin iki kayda düşmemesi buna bağlı. */
  phone: string;
  email: string;
  guestCount: number | null;
  /** ISO tarih; çözülemediyse boş. */
  eventDate: string;
  /** "Mayısın ilk haftası" gibi çözülemeyen ifade. Uydurulmuş bir güne yeğdir. */
  eventDateText: string;
  organizationType: string;
  source: LeadSource;
  sourceDetail: string;
  status: LeadStatus;
  assignedTo?: string;
  nextFollowupAt: string;
  lastContactAt: string;
  reservationId?: string;
  /** Düşünülen salon. İlk görüşmede boş olabilir; uydurma bir salon seçmekten iyidir. */
  hallId?: string;
  /** Verilen teklif tutarı. Rakam yoksa teklif verilmemiş sayılır. */
  offerAmount?: number;
  offerValidUntil?: string;
  /** Salonun müşteri için tutulduğu son gün. Geçince başkasına satılabilir. */
  optionDate?: string;
  /** Görüşmenin YAPILDIĞI gün; kaydın açıldığı günden farklı olabilir. */
  meetingDate?: string;
  /** Müşterinin ne sorduğu: "yemekli/yemeksiz fiyat" gibi. Nottan ayrı durur. */
  requestText: string;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export type LeadMessageDirection = 'gelen' | 'giden' | 'olay';

/** İletişim geçmişindeki bir satır: mesaj ya da sistem olayı. */
export interface LeadMessage {
  id: string;
  businessId: string;
  leadId: string;
  direction: LeadMessageDirection;
  channel: 'whatsapp' | 'telefon' | 'eposta' | 'sistem';
  body: string;
  waMessageId?: string;
  /** Dolu ise mesajı program gönderdi; boş ise personel yazdı. */
  autoKind?: 'karsilama' | 'mesai_disi';
  actorEmail: string;
  createdAt: string;
}

/**
 * WhatsApp Business numarası ve o numaranın otomatik cevap ayarları.
 *
 * Numara başına tek satır; işletmenin numarayı hangi hesaba bağladığı ve
 * program adına ne söyleyeceği aynı yerde duruyor.
 */
export interface WhatsappAccount {
  /** Meta'nın verdiği Phone number ID. Birincil anahtar. */
  phoneNumberId: string;
  businessId: string;
  displayPhone: string;
  /** Yeni aday açıldığında karşılama gönderilsin mi. */
  autoReplyEnabled: boolean;
  welcomeMessage: string;
  /** Çalışma saatleri dışında bilgilendirme gönderilsin mi. */
  afterHoursEnabled: boolean;
  afterHoursMessage: string;
  /** İşletmenin yerel saati, "HH:MM". */
  workStart: string;
  workEnd: string;
  /** ISO gün numaraları: 1 pazartesi … 7 pazar. */
  workDays: number[];
  createdAt: string;
}

/** Durum değişikliği kaydı; tetikleyici yazar, istemci atlayamaz. */
export interface LeadStatusChange {
  id: string;
  leadId: string;
  fromStatus: LeadStatus | null;
  toStatus: LeadStatus;
  actorEmail: string;
  createdAt: string;
}

export interface Business {
  id: string;
  ownerId: string;
  name: string;
  category: string;
  city: string;
  district: string;
  phone: string;
  capacity: number;
  currency: Currency;
  address?: string;
  facebook?: string;
  instagram?: string;
  about?: string;
  createdAt: string;
}

export type UserRole = 'owner' | 'staff';

export interface User {
  id: string;
  companyName: string;
  fullName: string;
  email: string;
  password: string; // Demo amaçlı; gerçek dağıtımda sunucu tarafında hash'lenir
  mobile: string;
  role: UserRole;
  ownerId?: string; // Alt kullanıcı ise bağlı olduğu ana üye
  permissions: Permission[];
  city: string;
  district: string;
  category: string;
  capacity: number;
  currency: Currency;
  facebook?: string;
  instagram?: string;
  createdAt: string;
  activeBusinessId: string;
}

export type Permission =
  | 'rezervasyon.goruntule'
  | 'rezervasyon.duzenle'
  | 'rezervasyon.sil'
  | 'kasa.goruntule'
  | 'kasa.duzenle'
  | 'rapor.goruntule'
  | 'ayarlar.duzenle';

export const ALL_PERMISSIONS: { key: Permission; label: string }[] = [
  { key: 'rezervasyon.goruntule', label: 'Rezervasyonları görüntüle' },
  { key: 'rezervasyon.duzenle', label: 'Rezervasyon ekle / düzenle' },
  { key: 'rezervasyon.sil', label: 'Rezervasyon sil' },
  { key: 'kasa.goruntule', label: 'Gelir / gider görüntüle' },
  { key: 'kasa.duzenle', label: 'Gelir / gider ekle / düzenle' },
  { key: 'rapor.goruntule', label: 'Raporları görüntüle' },
  { key: 'ayarlar.duzenle', label: 'Ayarları düzenle' },
];

export interface ColorSetting {
  key: string;
  label: string;
  color: string;
}

/**
 * Mesaj sınıflandırması, İYS yükümlülüğünü belirler.
 *   islem : rezervasyon onayı, hatırlatma, doğrulama kodu, ödeme bildirimi
 *           -> İYS onayı GEREKMEZ (muaf)
 *   ticari: kampanya, indirim, tanıtım
 *           -> İYS onayı ŞARTTIR
 */
export type MessageCategory = 'islem' | 'ticari';

export type ConsentStatus = 'ONAY' | 'RET';

export interface SmsConsent {
  id: string;
  businessId: string;
  phone: string;
  status: ConsentStatus;
  source: string;
  consentDate: string;
  iysSyncedAt?: string;
  iysError?: string;
  note?: string;
}

export type QueueStatus = 'bekliyor' | 'gonderiliyor' | 'gonderildi' | 'basarisiz' | 'iptal';

export interface SmsQueueEntry {
  id: string;
  phone: string;
  body: string;
  kind: SmsLogEntry['kind'];
  category: MessageCategory;
  status: QueueStatus;
  attempts: number;
  nextAttemptAt: string;
  lastError?: string;
  createdAt: string;
  sentAt?: string;
}

export interface EnqueueResult {
  queued: boolean;
  reason?: string;
}

export interface SmsLogEntry {
  id: string;
  businessId: string;
  to: string;
  body: string;
  kind: 'Rezervasyon' | 'Doğrulama' | 'Hatırlatma' | 'Bilgilendirme';
  sentAt: string;
}

export type InvoiceKind = 'e-Arsiv' | 'e-Fatura';
export type InvoiceStatus =
  | 'taslak' | 'gonderiliyor' | 'gonderildi' | 'onaylandi' | 'reddedildi' | 'iptal';
export type BuyerKind = 'bireysel' | 'kurumsal';

export interface InvoiceLine {
  lineNo: number;
  description: string;
  quantity: number;
  unit: string;
  unitPriceKurus: number;
  discountRate: number;
  vatRate: number;
  baseKurus: number;
  vatKurus: number;
  totalKurus: number;
}

export interface Invoice {
  id: string;
  businessId: string;
  reservationId?: string;
  invoiceNumber: string;
  kind: InvoiceKind;
  status: InvoiceStatus;
  issueDate: string;
  serviceDate?: string;
  buyerKind: BuyerKind;
  buyerName: string;
  buyerTaxId?: string;
  buyerTaxOffice?: string;
  buyerAddress?: string;
  buyerEmail?: string;
  buyerPhone?: string;
  grossKurus: number;
  discountKurus: number;
  baseKurus: number;
  vatKurus: number;
  totalKurus: number;
  providerError?: string;
  sentAt?: string;
  cancelReason?: string;
  note?: string;
  createdAt: string;
  lines?: InvoiceLine[];
}

export interface SystemHealth {
  kuyrukBekleyen: number;
  kuyrukBasarisiz: number;
  kuyrukEngellenen: number;
  kuyrukEnEskiDakika: number;
  iysAktarilmamis: number;
  basarisizGiris24s: number;
  sonYedek: { zaman: string; durum: string; yasSaat: number; yasDakika: number } | null;
}

export interface AuditEntry {
  id: number;
  actorEmail: string;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  tableName: string;
  recordId?: string;
  summary?: string;
  /** Değişen alanlar: { alan: { eski, yeni } } */
  changed?: Record<string, { eski: unknown; yeni: unknown }>;
  createdAt: string;
}

export interface Testimonial {
  business: string;
  author: string;
  text: string;
}

export interface NewsItem {
  slug: string;
  title: string;
  date: string;
  excerpt: string;
  body: string[];
}

export interface DirectoryMember {
  id: string;
  /** /salon/<slug> adresinde kullanılan benzersiz anahtar */
  slug: string;
  name: string;
  category: string;
  city: string;
  district: string;
  capacity?: number;
  address?: string;
  phone?: string;
  about: string;
}

/* ------------------------------------------------- ödeme değişiklikleri */

/**
 * Tahsilatta izlenen olaylar.
 *
 * Veritabanındaki `payment_event_kind` enum'unun birebir karşılığı.
 * Satırları tetikleyici yazıyor; uygulama yalnızca okuyor.
 */
export type PaymentEventKind =
  | 'tahsilat_eklendi'
  | 'tutar_degisti'
  | 'tip_degisti'
  | 'tarih_degisti'
  | 'tahsilat_silindi'
  /** Çek/senet: para henüz kasaya girmedi. */
  | 'kasaya_girmedi';

export const ODEME_OLAY_ADI: Record<PaymentEventKind, string> = {
  tahsilat_eklendi: 'Yeni tahsilat',
  tutar_degisti: 'Tutar değişti',
  tip_degisti: 'Ödeme tipi değişti',
  tarih_degisti: 'Tarih değişti',
  tahsilat_silindi: 'Tahsilat silindi',
  kasaya_girmedi: 'Kasaya girmedi',
};

/** Ekrandaki sıra; olay listesi her açılışta aynı sırayla gelsin. */
export const ODEME_OLAYLARI: PaymentEventKind[] = [
  'tahsilat_eklendi', 'tutar_degisti', 'tip_degisti',
  'tarih_degisti', 'tahsilat_silindi', 'kasaya_girmedi',
];

export interface PaymentEvent {
  id: string;
  businessId: string;
  reservationId: string;
  /** Silinen tahsilatta da dolu kalır: kayıt sildiği satırı hatırlar. */
  paymentId?: string;
  event: PaymentEventKind;
  amount?: number;
  oldAmount?: number;
  method?: PaymentMethod;
  oldMethod?: PaymentMethod;
  /** İşlemi yapan kullanıcı. Oturum çözülemediyse boş. */
  actorEmail: string;
  createdAt: string;
}

/** Bir olayda yöneticiye gidecek mesaj. Metin hard-code değil. */
export interface PaymentAlert {
  id: string;
  businessId: string;
  event: PaymentEventKind;
  enabled: boolean;
  body: string;
}

/** Bildirimi alacak numara. Kullanıcı hesabına bağlı değil. */
export interface PaymentAlertRecipient {
  id: string;
  businessId: string;
  name: string;
  phone: string;
  enabled: boolean;
}

/** Mesaj metinlerinde kullanılabilen yer tutucular ve anlamları. */
export const ODEME_YER_TUTUCULARI: [string, string][] = [
  ['{isletme}', 'İşletme adı'],
  ['{kod}', 'Sözleşme numarası'],
  ['{tutar}', 'Tahsilat tutarı'],
  ['{eski_tutar}', 'Değişiklikten önceki tutar'],
  ['{tip}', 'Ödeme tipi'],
  ['{eski_tip}', 'Değişiklikten önceki ödeme tipi'],
  ['{kalan}', 'İşlem sonrası kalan alacak'],
  ['{kullanici}', 'İşlemi yapan kullanıcı'],
];

/**
 * Personelin yazarken kullandığı kısa hazır metin.
 *
 * Şablondan (message_templates) farkı: olaya bağlı değil, sayısı
 * sınırsız ve yer tutucu gerektirmiyor. Şablon tablosu tür başına tek
 * satır tuttuğu için "üç ayrı fiyat cümlesi" oraya sığmıyordu.
 */
export interface QuickReply {
  id: string;
  businessId: string;
  /** Listede hangi metin olduğunu anlamak için; metnin ilk kelimeleri yetmiyordu. */
  title: string;
  body: string;
  sortOrder: number;
}
