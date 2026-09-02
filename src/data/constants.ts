import type { ColorSetting, OrganizationType, Permission } from '../types';

/** Üye Ol formundaki 81 il + yurt dışı seçenekleri */
export const CITIES: string[] = [
  'Adana', 'Adıyaman', 'Afyonkarahisar', 'Ağrı', 'Aksaray', 'Amasya', 'Ankara', 'Antalya',
  'Ardahan', 'Artvin', 'Aydın', 'Balıkesir', 'Bartın', 'Batman', 'Bayburt', 'Bilecik',
  'Bingöl', 'Bitlis', 'Bolu', 'Burdur', 'Bursa', 'Çanakkale', 'Çankırı', 'Çorum',
  'Denizli', 'Diyarbakır', 'Düzce', 'Edirne', 'Elazığ', 'Erzincan', 'Erzurum', 'Eskişehir',
  'Gaziantep', 'Giresun', 'Gümüşhane', 'Hakkari', 'Hatay', 'Iğdır', 'Isparta', 'İstanbul',
  'İzmir', 'Kahramanmaraş', 'Karabük', 'Karaman', 'Kars', 'Kastamonu', 'Kayseri', 'Kilis',
  'Kırıkkale', 'Kırklareli', 'Kırşehir', 'Kocaeli', 'Konya', 'Kütahya', 'Malatya', 'Manisa',
  'Mardin', 'Mersin', 'Muğla', 'Muş', 'Nevşehir', 'Niğde', 'Ordu', 'Osmaniye',
  'Rize', 'Sakarya', 'Samsun', 'Şanlıurfa', 'Siirt', 'Sinop', 'Sivas', 'Şırnak',
  'Tekirdağ', 'Tokat', 'Trabzon', 'Tunceli', 'Uşak', 'Van', 'Yalova', 'Yozgat', 'Zonguldak',
  'K.K.T.C.', 'Almanya', 'Avusturya', 'Azerbaycan', 'Belçika', 'Fransa', 'Hollanda', 'İsviçre', 'Diğer Ülke',
];

/** Bazı büyük şehirler için ilçe listeleri; diğer iller serbest metin ile devam eder. */
export const DISTRICTS: Record<string, string[]> = {
  İstanbul: [
    'Adalar', 'Arnavutköy', 'Ataşehir', 'Avcılar', 'Bağcılar', 'Bahçelievler', 'Bakırköy',
    'Başakşehir', 'Bayrampaşa', 'Beşiktaş', 'Beykoz', 'Beylikdüzü', 'Beyoğlu', 'Büyükçekmece',
    'Çatalca', 'Çekmeköy', 'Esenler', 'Esenyurt', 'Eyüpsultan', 'Fatih', 'Gaziosmanpaşa',
    'Güngören', 'Kadıköy', 'Kağıthane', 'Kartal', 'Küçükçekmece', 'Maltepe', 'Pendik',
    'Sancaktepe', 'Sarıyer', 'Silivri', 'Sultanbeyli', 'Sultangazi', 'Şile', 'Şişli',
    'Tuzla', 'Ümraniye', 'Üsküdar', 'Zeytinburnu',
  ],
  Ankara: [
    'Akyurt', 'Altındağ', 'Ayaş', 'Bala', 'Beypazarı', 'Çamlıdere', 'Çankaya', 'Çubuk',
    'Elmadağ', 'Etimesgut', 'Evren', 'Gölbaşı', 'Güdül', 'Haymana', 'Kahramankazan',
    'Kalecik', 'Keçiören', 'Kızılcahamam', 'Mamak', 'Nallıhan', 'Polatlı', 'Pursaklar',
    'Sincan', 'Şereflikoçhisar', 'Yenimahalle',
  ],
  İzmir: [
    'Aliağa', 'Balçova', 'Bayındır', 'Bayraklı', 'Bergama', 'Beydağ', 'Bornova', 'Buca',
    'Çeşme', 'Çiğli', 'Dikili', 'Foça', 'Gaziemir', 'Güzelbahçe', 'Karabağlar', 'Karaburun',
    'Karşıyaka', 'Kemalpaşa', 'Kınık', 'Kiraz', 'Konak', 'Menderes', 'Menemen', 'Narlıdere',
    'Ödemiş', 'Seferihisar', 'Selçuk', 'Tire', 'Torbalı', 'Urla',
  ],
  Bursa: [
    'Büyükorhan', 'Gemlik', 'Gürsu', 'Harmancık', 'İnegöl', 'İznik', 'Karacabey', 'Keles',
    'Kestel', 'Mudanya', 'Mustafakemalpaşa', 'Nilüfer', 'Orhaneli', 'Orhangazi', 'Osmangazi',
    'Yenişehir', 'Yıldırım',
  ],
  Antalya: [
    'Akseki', 'Aksu', 'Alanya', 'Demre', 'Döşemealtı', 'Elmalı', 'Finike', 'Gazipaşa',
    'Gündoğmuş', 'İbradı', 'Kaş', 'Kemer', 'Kepez', 'Konyaaltı', 'Korkuteli', 'Kumluca',
    'Manavgat', 'Muratpaşa', 'Serik',
  ],
  Kocaeli: [
    'Başiskele', 'Çayırova', 'Darıca', 'Derince', 'Dilovası', 'Gebze', 'Gölcük', 'İzmit',
    'Kandıra', 'Karamürsel', 'Kartepe', 'Körfez',
  ],
};

/** Üye Ol formundaki işletme kategorileri */
export const CATEGORIES: string[] = [
  'Düğün Salonu',
  'Kına Salonu',
  'Kır Düğünü / Bahçe',
  'Düğün Oteli',
  'Otel',
  'Belediye Nikah Salonu',
  'Organizasyon Firması',
  'Konferans Salonu',
  'Restoran / Cafe',
  'Fotoğrafçılar',
  'Video / Drone Çekim',
  'Gelinlik / Damatlık',
  'Kuaför / Güzellik Merkezi',
  'Müzisyen / Orkestra',
  'Ses ve Işık Sistemleri',
  'Davetiye / Matbaa',
  'Nikah Şekeri',
  'Pasta / Tatlı',
  'Araç Kiralama',
  'Gelin Arabası Süsleme',
  'Çiçekçi',
  'Havai Fişek / Efekt',
  'Catering',
  'Diğer',
];

export const HEARD_FROM: string[] = [
  'Google',
  'Mobil Uygulama',
  'Instagram',
  'Facebook',
  'WhatsApp',
  'Tanıdık Tavsiyesi',
  'Tavsiye Et Kazan Linki',
  'Fuar / Etkinlik',
  'Diğer',
];

export const ORGANIZATION_TYPES: OrganizationType[] = [
  'Düğün', 'Sünnet', 'Nişan', 'Kına', 'Konferans', 'Kokteyl', 'Nikah', 'Doğum Günü', 'Toplantı', 'Diğer',
];

export const CURRENCIES: { value: string; label: string; symbol: string }[] = [
  { value: 'TL', label: 'TL', symbol: '₺' },
  { value: 'EUR', label: '€', symbol: '€' },
  { value: 'USD', label: '$', symbol: '$' },
  { value: 'GBP', label: '£', symbol: '£' },
];

/** Rezervasyon Renk Ayarları ekranının varsayılan değerleri */
export const DEFAULT_COLOR_SETTINGS: ColorSetting[] = [
  { key: 'dugun', label: 'Düğün', color: '#47b2e4' },
  { key: 'sunnet', label: 'Sünnet', color: '#18d26e' },
  { key: 'nisan', label: 'Nişan', color: '#f39c12' },
  { key: 'kina', label: 'Kına', color: '#e74c3c' },
  { key: 'konferans', label: 'Konferans', color: '#8e44ad' },
  { key: 'kokteyl', label: 'Kokteyl', color: '#16a085' },
  { key: 'nikah', label: 'Nikah', color: '#2c82c9' },
  { key: 'dogumgunu', label: 'Doğum Günü', color: '#d81b60' },
  { key: 'toplanti', label: 'Toplantı', color: '#607d8b' },
  { key: 'diger', label: 'Diğer', color: '#95a5a6' },
];

export const ORG_TO_COLOR_KEY: Record<OrganizationType, string> = {
  'Düğün': 'dugun',
  'Sünnet': 'sunnet',
  'Nişan': 'nisan',
  'Kına': 'kina',
  'Konferans': 'konferans',
  'Kokteyl': 'kokteyl',
  'Nikah': 'nikah',
  'Doğum Günü': 'dogumgunu',
  'Toplantı': 'toplanti',
  'Diğer': 'diger',
};

export const SERVICE_OPTIONS: string[] = [
  'Yemek (Açık Büfe)', 'Yemek (Masaya Servis)', 'Kokteyl İkramı', 'Pasta', 'Meşrubat Limitsiz',
  'Orkestra', 'DJ', 'Ses ve Işık', 'Sahne Efekti', 'Havai Fişek', 'Fotoğraf Çekimi',
  'Video Çekimi', 'Drone Çekimi', 'Gelin Arabası', 'Nikah Masası', 'Masa Süsleme',
  'Çiçek Süsleme', 'Vale', 'Otopark', 'Nikah Şekeri', 'Davetiye',
];

export const INCOME_CATEGORIES: string[] = [
  'Rezervasyon Kaparo', 'Rezervasyon Tahsilatı', 'Ek Hizmet Satışı', 'Salon Kiralama',
  'Ekipman Kiralama', 'İkram / Büfe', 'Diğer Gelir',
];

export const EXPENSE_CATEGORIES: string[] = [
  'Personel Maaş', 'Yemek / Catering', 'Elektrik', 'Su', 'Doğalgaz', 'Kira', 'Vergi / SGK',
  'Bakım Onarım', 'Temizlik', 'Reklam / Pazarlama', 'Ekipman Alımı', 'Diğer Gider',
];

export const PAYMENT_METHODS = ['Nakit', 'Kredi Kartı', 'Havale/EFT', 'Çek', 'Senet'] as const;

export const OWNER_PERMISSIONS: Permission[] = [
  'rezervasyon.goruntule', 'rezervasyon.duzenle', 'rezervasyon.sil',
  'kasa.goruntule', 'kasa.duzenle', 'rapor.goruntule', 'ayarlar.duzenle',
];

export const MONTH_NAMES = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];

export const DAY_NAMES_SHORT = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

/** Ücretsiz deneme süresi (gün) — "7 gün ücretsiz deneyin" */
export const TRIAL_DAYS = 7;

/** Tavsiye Et Kazan: her ücretli üye için kazanılan ek süre (gün) */
export const REFERRAL_BONUS_DAYS = 30;

/** İYS onay kaynağı kodları */
export const CONSENT_SOURCES: { value: string; label: string }[] = [
  { value: 'HS_FIZIKSEL_ORTAM', label: 'Fiziksel ortam (sözleşme, form)' },
  { value: 'HS_ISLAK_IMZA', label: 'Islak imzalı onay' },
  { value: 'HS_WEB', label: 'Web sitesi' },
  { value: 'HS_MOBIL', label: 'Mobil uygulama' },
  { value: 'HS_CAGRI_MERKEZI', label: 'Çağrı merkezi' },
  { value: 'HS_SMS', label: 'SMS ile onay' },
  { value: 'HS_EPOSTA', label: 'E-posta ile onay' },
];

/**
 * Sistemin gönderdiği hazır mesajların İYS sınıflandırması.
 * Rezervasyon onayı, hatırlatma ve doğrulama kodu işlem bildirimidir (muaf).
 */
export const MESSAGE_CATEGORY_BY_KIND: Record<string, 'islem' | 'ticari'> = {
  'Rezervasyon': 'islem',
  'Hatırlatma': 'islem',
  'Doğrulama': 'islem',
  'Bilgilendirme': 'ticari',
};
