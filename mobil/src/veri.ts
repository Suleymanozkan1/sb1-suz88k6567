import { API_KOK, gecerliJeton, kullaniciId, yapilandirildi } from './supabase';
import { postgrestIstemci } from './postgrest';
import { bugunIso, yerelIso } from './bicim';

/**
 * Veri erişimi.
 *
 * Okumalar doğrudan veritabanına (PostgREST) gider; hangi satırın
 * görüneceğine sunucudaki RLS karar verir, istemci filtresine güvenilmez.
 * Sunucu yapılandırılmamışsa (mağaza incelemesi, ekran görüntüsü,
 * tanıtım) örnek veri döner.
 *
 * Dosya alanlara göre bölünmüştür; her bölümün başında önce tipler, sonra
 * tanıtım verisi, sonra sorgular gelir. Web panelindeki her ekranın buradaki
 * bir karşılığı vardır: mobil uygulama panelin bir özeti değil, tamamıdır.
 */

/* ═══ Ortak ═══════════════════════════════════════════════════════ */

export type Seans = 'Gündüz' | 'Gece';

/** Tanıtım kipinde mi çalışıyoruz. */
export const tanitim = !yapilandirildi;

function gunEkle(gun: number): string {
  const t = new Date();
  t.setDate(t.getDate() + gun);
  return yerelIso(t);
}

/** Sunucu yapılandırılmışsa sorguyu çalıştırır, değilse tanıtım verisini verir. */
async function sorgu<T>(ornek: T, calistir: () => Promise<T>): Promise<T> {
  if (tanitim) return ornek;
  return calistir();
}

/** Sunucu yanıtındaki hatayı çağırana anlaşılır biçimde iletir. */
function denetle<T>(veri: T | null, hata: { message: string } | null, mesaj: string): T {
  if (hata) throw new Error(`${mesaj} (${hata.message})`);
  return (veri ?? []) as T;
}

/*
  JETON İSTEMCİNİN KENDİSİNDEN TAZELENİYOR.

  Önceden burada son okunan jeton bir değişkende tutuluyordu ve onu
  dolduran tek yer `sorgu()` idi. Ama `db()` çağıranların YARIDAN
  FAZLASI `sorgu()` üzerinden geçmiyor -- `profilOku` da geçmiyordu.
  Sonuç: temiz kurulumda ilk girişte jeton boş gidiyor, PostgREST 401
  "Oturum gerekli." dönüyor, profil okunamıyor ve kullanıcı girişi
  başarılı olmasına rağmen "Hesabınıza ait profil bulunamadı." hatası
  alıyordu. Yani uygulamaya hiç girilemiyordu.

  Tazelemeyi çağırana bırakmak, tek bir unutmanın bütün oturumu
  kırdığı bir kurulumdu. `gecerliJeton` doğrudan sağlayıcı olarak
  veriliyor: istemci her istekte onu bekliyor, hiçbir çağıranın
  hatırlaması gerekmiyor. `gecerliJeton` zaten önbellekli, yalnızca
  süre dolmaya yakınken ağa çıkıyor.
*/
const db = () => postgrestIstemci(`${API_KOK}/veri`, gecerliJeton);

/**
 * Oturumdaki kullanıcının profili.
 *
 * Ad ve rol jetondan DEĞİL veritabanından okunuyor: ikisi de
 * değişebilir, jetona gömülü olsalardı kullanıcı yeniden giriş yapana
 * kadar eski hâliyle donup kalırdı.
 */
export async function profilOku(
  kimlik: string,
): Promise<{ id: string; eposta: string; ad: string; rol: string } | null> {
  const { data, error } = await db().from('profiles')
    .select('id, email, full_name, role').eq('id', kimlik).maybeSingle();
  if (error) throw new Error(`Profil okunamadı. (${error.message})`);
  if (!data) return null;
  return {
    id: String(data.id),
    eposta: String(data.email ?? ''),
    ad: String(data.full_name ?? data.email ?? ''),
    rol: String(data.role ?? '') === 'owner' ? 'Yönetici' : 'Personel',
  };
}

/** Etkin işletme; tanıtımda sabit. Panelde olduğu gibi tek işletme seçilidir. */
/**
 * Demo hesabının giriş bilgileri.
 *
 * Panelle AYNI değerler (`src/lib/seed.ts` içindeki DEMO_CREDENTIALS).
 * İki yerde ayrı yazılsaydı biri değiştiğinde öteki unutulur ve
 * mobildeki düğme sessizce çalışmayı bırakırdı.
 *
 * Bu bir sır DEĞİL: hesap zaten herkese açık tanıtım hesabı ve aynı
 * bilgiler web giriş ekranında da yazıyor. Gerçek müşteri verisi
 * içermiyor.
 */
export const DEMO_GIRIS = { eposta: 'demo@sahratakip.com', sifre: 'demo1234' };

export const ISLETME = { id: 'demo', ad: 'Grand Sahra Düğün ve Davet Salonu' };

let isletmeBellek: string | null = null;

/**
 * Oturumdaki kullanıcının etkin işletmesi.
 *
 * `business_id` yazan her tabloda zorunlu bir sütun; sabit bir değer
 * göndermek kaydın hiç açılmamasına yol açar. Profilden okunur ve bellekte
 * tutulur: her yazma öncesi ek bir gidiş dönüş yapılmaz.
 */
export async function aktifIsletmeId(): Promise<string> {
  if (tanitim) return ISLETME.id;
  if (isletmeBellek) return isletmeBellek;

  // Kimlik jetonun gövdesinden okunuyor; doğrulamayı sunucu yapıyor.
  const kimlik = kullaniciId(await gecerliJeton());
  if (!kimlik) throw new Error('Oturum bulunamadı.');

  const { data, error } = await db().from('profiles')
    .select('active_business_id, owner_id, id').eq('id', kimlik).maybeSingle();
  if (error) throw new Error(`İşletme bilgisi okunamadı. (${error.message})`);

  const profil = data as unknown as { active_business_id: string | null } | null;
  if (!profil?.active_business_id) throw new Error('Etkin işletme seçili değil.');

  isletmeBellek = profil.active_business_id;
  return isletmeBellek;
}

/** Oturum değişince önbellek düşer; başka bir hesabın işletmesine yazılmasın. */
export function isletmeBellegiTemizle(): void {
  isletmeBellek = null;
}

/* ═══ Para birimi çevrimi ═════════════════════════════════════════ */

/*
  Şema iki ayrı para birimi kullanıyor ve karışması sessiz hata üretiyor
  (bkz. 0008_odeme_plani_is_emri_tedarikci.sql: "Kuruş/TL karışımı sessiz
  tutar kaymasına yol açar"):

    • TL, `numeric(12,2)` — reservations.total_amount, reservations.deposit,
      payments.amount, cash_flow.amount, reservation_expenses.unit_price,
      payment_events.amount
    • Kuruş, `bigint` — sütun adı `_kurus` ile biter: menus.price_kurus,
      invoices.*_kurus, customer_leads.quoted_price_kurus

  Mobil uygulamanın tamamı KURUŞ taşır (`bicim.tutar` yüze bölerek yazar),
  çünkü kayan noktalı TL toplamlarında kuruş artıkları birikiyordu. Bu
  yüzden TL sütunları veri katmanının sınırında çevriliyor; `_kurus`
  sütunları olduğu gibi geçiyor.

  Bu çevrim yokken tanıtım kipi doğru görünüyordu (örnek veri zaten kuruş),
  ama gerçek sunucuya bağlanınca 150.000 ₺'lik bir düğün ekranda
  1.500,00 ₺ yazıyordu.
*/

/** Veritabanındaki TL değerini kuruşa çevirir. */
export function kurusa(tl: number | null | undefined): number {
  return Math.round((Number(tl) || 0) * 100);
}

/** Kuruşu veritabanının beklediği TL değerine çevirir. */
export function tlye(kurus: number | null | undefined): number {
  return Math.round(Number(kurus) || 0) / 100;
}

/* ═══ Rezervasyon ═════════════════════════════════════════════════ */

export interface Rezervasyon {
  id: string;
  kod: string;
  musteri: string;
  telefon: string;
  tarih: string;
  seans: Seans;
  /** "19:00-23:00"; saat girilmemişse boş metin. */
  saat: string;
  tur: string;
  renk: string;
  salon: string;
  davetli: number;
  toplam: number;
  /** Kapora dahil tahsil edilen toplam. Panel de böyle hesaplıyor. */
  tahsilat: number;
  kapora: number;
  durum: string;
  /** Damat ve gelin; sözleşmeyi imzalayandan AYRI. Girilmemişse boş. */
  damat: string;
  damatTelefon: string;
  gelin: string;
  gelinTelefon: string;
  /** Tarafların memleketi; yaşadığı ilden ayrı bilgi. */
  damatMemleket: string;
  gelinMemleket: string;
}

export interface Tahsilat {
  id: string;
  tarih: string;
  tutar: number;
  sekil: string;
  aciklama: string;
}

export interface IsSatiri {
  id: string;
  saat: string;
  is: string;
  sorumlu: string;
  tamam: boolean;
}

/*
  `src/data/constants.ts` DEFAULT_COLOR_SETTINGS ile aynı palet. Nikâh
  rengi orada erişilebilirlik için KOYULAŞTIRILMIŞTI (#3498db -> #2875b5);
  mobil eski değeri taşımaya devam ediyordu ve aynı rezervasyon iki
  uygulamada iki ayrı renkte görünüyordu.
*/
const TUR_RENK: Record<string, string> = {
  'Düğün': '#47b2e4', 'Nişan': '#f39c12', 'Kına': '#e74c3c',
  'Sünnet': '#18d26e', 'Nikâh': '#2875b5', 'Kokteyl': '#16a085',
};

const ORNEK: Rezervasyon[] = [
  { id: '1', kod: '2026-1', musteri: 'Zeynep & Can Arslan', telefon: '5321234567',
    tarih: gunEkle(0), seans: 'Gece', saat: '19:00-23:00', tur: 'Düğün', renk: TUR_RENK['Düğün']!, salon: 'Kristal Salon',
    davetli: 320, toplam: 21_000_000, tahsilat: 6_000_000, kapora: 4_000_000, durum: 'Kesin Rezervasyon',
    damat: '', damatTelefon: '', gelin: 'Zeynep Arslan', gelinTelefon: '5321234568', damatMemleket: 'Sivas', gelinMemleket: 'Konya' },
  { id: '2', kod: '2026-2', musteri: 'Deniz & Kaan Şen', telefon: '5309876543',
    tarih: gunEkle(0), seans: 'Gündüz', saat: '13:00-17:00', tur: 'Nikâh', renk: TUR_RENK['Nikâh']!, salon: 'Zümrüt Salon',
    davetli: 150, toplam: 9_500_000, tahsilat: 9_500_000, kapora: 6_333_334, durum: 'Tamamlandı',
    damat: '', damatTelefon: '', gelin: 'Deniz Şen', gelinTelefon: '5309876544', damatMemleket: 'Ankara', gelinMemleket: 'Ankara' },
  { id: '3', kod: '2026-3', musteri: 'Melis Ailesi', telefon: '5551112233',
    tarih: gunEkle(2), seans: 'Gece', saat: '19:00-23:00', tur: 'Kına', renk: TUR_RENK['Kına']!, salon: 'Kristal Salon',
    davetli: 200, toplam: 12_000_000, tahsilat: 3_000_000, kapora: 2_000_000, durum: 'Kesin Rezervasyon',
    damat: '', damatTelefon: '', gelin: '', gelinTelefon: '', damatMemleket: 'Kayseri', gelinMemleket: '' },
  { id: '4', kod: '2026-4', musteri: 'Ayşe & Mert Yıldız', telefon: '5323334455',
    tarih: gunEkle(5), seans: 'Gece', saat: '19:00-23:00', tur: 'Düğün', renk: TUR_RENK['Düğün']!, salon: 'Kristal Salon',
    davetli: 280, toplam: 18_000_000, tahsilat: 8_000_000, kapora: 5_333_334, durum: 'Kesin Rezervasyon',
    damat: '', damatTelefon: '', gelin: 'Ayşe Yıldız', gelinTelefon: '5323334456', damatMemleket: 'Trabzon', gelinMemleket: 'Rize' },
  { id: '5', kod: '2026-5', musteri: 'Ece & Kerem Aydın', telefon: '5445556677',
    tarih: gunEkle(9), seans: 'Gündüz', saat: '13:00-17:00', tur: 'Nişan', renk: TUR_RENK['Nişan']!, salon: 'Zümrüt Salon',
    davetli: 80, toplam: 5_500_000, tahsilat: 1_500_000, kapora: 1_000_000, durum: 'Ön Rezervasyon',
    damat: '', damatTelefon: '', gelin: 'Ece Aydın', gelinTelefon: '', damatMemleket: '', gelinMemleket: 'Erzurum' },
  { id: '6', kod: '2026-6', musteri: 'Gül & Emre Doğan', telefon: '5337778899',
    tarih: gunEkle(14), seans: 'Gece', saat: '19:00-23:00', tur: 'Düğün', renk: TUR_RENK['Düğün']!, salon: 'Kristal Salon',
    davetli: 400, toplam: 26_000_000, tahsilat: 0, kapora: 0, durum: 'Ön Rezervasyon',
    damat: '', damatTelefon: '', gelin: 'Gül Doğan', gelinTelefon: '5337778890', damatMemleket: 'Malatya', gelinMemleket: 'Elazığ' },
  { id: '7', kod: '2026-7', musteri: 'Sude & Barış Kaya', telefon: '5362223344',
    tarih: gunEkle(21), seans: 'Gece', saat: '19:00-23:00', tur: 'Sünnet', renk: TUR_RENK['Sünnet']!, salon: 'Zümrüt Salon',
    davetli: 180, toplam: 9_000_000, tahsilat: 2_500_000, kapora: 1_666_667, durum: 'Kesin Rezervasyon',
    damat: '', damatTelefon: '', gelin: '', gelinTelefon: '', damatMemleket: '', gelinMemleket: '' },
  { id: '8', kod: '2026-8', musteri: 'Nur & Onur Çetin', telefon: '5354445566',
    tarih: gunEkle(-12), seans: 'Gece', saat: '19:00-23:00', tur: 'Düğün', renk: TUR_RENK['Düğün']!, salon: 'Kristal Salon',
    davetli: 260, toplam: 16_500_000, tahsilat: 16_500_000, kapora: 11_000_000, durum: 'Tamamlandı',
    damat: '', damatTelefon: '', gelin: 'Nur Çetin', gelinTelefon: '5354445567', damatMemleket: 'Samsun', gelinMemleket: 'Ordu' },
];

/**
 * Tanıtım tahsilat geçmişi rezervasyon başına üretilir.
 *
 * Tek bir sabit liste kullanılırken ayrıntı ekranının üstündeki "TAHSİLAT"
 * tutarı ile alttaki geçmiş listesinin toplamı birbirini tutmuyordu. Liste
 * artık rezervasyonun kendi tahsilatından türetiliyor: kapora üçte iki,
 * kalanı ara ödeme, artık kuruş kaporaya bırakılır.
 */
function ornekTahsilatlar(r: Rezervasyon): Tahsilat[] {
  // Kapora ayrı bir alan; geçmiş listesi yalnızca ek tahsilatları içerir.
  const ek = r.tahsilat - r.kapora;
  if (ek <= 0) return [];
  return [{ id: `${r.id}-t1`, tarih: gunEkle(-9), tutar: ek, sekil: 'Nakit', aciklama: 'Ara ödeme' }];
}

const ORNEK_IS: IsSatiri[] = [
  { id: 'i1', saat: '15:00', is: 'Salon temizliği ve kontrol', sorumlu: 'Temizlik', tamam: true },
  { id: 'i2', saat: '17:00', is: 'Masa düzeni ve süsleme kurulumu', sorumlu: 'Servis', tamam: true },
  { id: 'i3', saat: '18:30', is: 'Tedarikçi girişleri', sorumlu: 'Operasyon', tamam: false },
  { id: 'i4', saat: '19:00', is: 'Salon açılış ve karşılama', sorumlu: 'Karşılama', tamam: false },
  { id: 'i5', saat: '20:00', is: 'Yemek servisi', sorumlu: 'Mutfak', tamam: false },
  { id: 'i6', saat: '22:00', is: 'Pasta ve tatlı servisi', sorumlu: 'Servis', tamam: false },
];

const REZ_ALAN =
  'id, code, customer_name, customer_phone, groom_name, groom_phone, bride_name, bride_phone, '
  + 'groom_hometown, bride_hometown, date, start_time, end_time, slot, '
  + 'organization_type, guest_count, total_amount, deposit, status, halls(name)';

interface SatirDb {
  id: string; code: string; customer_name: string; customer_phone: string;
  groom_name?: string | null; groom_phone?: string | null;
  bride_name?: string | null; bride_phone?: string | null;
  groom_hometown?: string | null; bride_hometown?: string | null;
  date: string; start_time?: string | null; end_time?: string | null;
  slot: Seans; organization_type: string; guest_count: number;
  total_amount: number; deposit: number; status: string;
  halls?: { name: string } | null;
}

/**
 * Kapora da bir tahsilattır ve panel toplamı böyle hesaplıyor
 * (deposit + payments). Yalnızca payments toplanınca kaporası alınmış
 * bir rezervasyonun kalan tutarı olduğundan yüksek çıkıyor ve mobil
 * ekran ile web paneli aynı kayıt için farklı rakam gösteriyordu.
 */
/**
 * Postgres `time` sütunu "19:00:00" döndürür; ekranda saniye istenmez.
 * Yalnızca başlangıç varsa tek saat yazılır: uydurma bir bitiş saati
 * göstermek yanlış bilgi olur.
 */
function saatAraligi(bas?: string | null, bit?: string | null): string {
  const b = (bas ?? '').slice(0, 5);
  const s = (bit ?? '').slice(0, 5);
  if (!b) return '';
  return s ? `${b}-${s}` : b;
}

function esle(r: SatirDb, tahsilat: number): Rezervasyon {
  return {
    id: r.id, kod: r.code, musteri: r.customer_name, telefon: r.customer_phone ?? '',
    tarih: r.date, seans: r.slot, saat: saatAraligi(r.start_time, r.end_time),
    tur: r.organization_type,
    renk: TUR_RENK[r.organization_type] ?? '#47b2e4',
    salon: r.halls?.name ?? '-', davetli: r.guest_count ?? 0,
    toplam: kurusa(r.total_amount), kapora: kurusa(r.deposit),
    tahsilat: kurusa(r.deposit) + tahsilat, durum: r.status,
    damat: r.groom_name ?? '', damatTelefon: r.groom_phone ?? '',
    gelin: r.bride_name ?? '', gelinTelefon: r.bride_phone ?? '',
    damatMemleket: r.groom_hometown ?? '', gelinMemleket: r.bride_hometown ?? '',
  };
}

async function tahsilatToplamlari(kimlikler: string[]): Promise<Record<string, number>> {
  if (tanitim || kimlikler.length === 0) return {};
  const { data } = await db()
    .from('payments').select('reservation_id, amount').in('reservation_id', kimlikler);
  const toplam: Record<string, number> = {};
  for (const s of data ?? []) {
    const satir = s as unknown as { reservation_id: string; amount: number };
    toplam[satir.reservation_id] = (toplam[satir.reservation_id] ?? 0) + kurusa(satir.amount);
  }
  return toplam;
}

async function rezervasyonlariGetir(
  kur: (q: ReturnType<typeof db>) => unknown,
): Promise<Rezervasyon[]> {
  const { data, error } = await (kur(db()) as Promise<{ data: unknown[] | null; error: { message: string } | null }>);
  const satirlar = denetle(data, error, 'Rezervasyonlar okunamadı.') as unknown as SatirDb[];
  const toplamlar = await tahsilatToplamlari(satirlar.map((r) => r.id));
  return satirlar.map((r) => esle(r, toplamlar[r.id] ?? 0));
}

/** Bugünden itibaren yaklaşan rezervasyonlar. */
export function yaklasanlar(limit = 40): Promise<Rezervasyon[]> {
  return sorgu(ORNEK.filter((r) => r.tarih >= bugunIso()), () => rezervasyonlariGetir((q) =>
    q.from('reservations').select(REZ_ALAN).gte('date', bugunIso())
      .order('date', { ascending: true }).limit(limit)));
}

/** Geçmiş dahil bütün kayıtlar, Kayıtlar sekmesi için. */
export function tumKayitlar(limit = 200): Promise<Rezervasyon[]> {
  return sorgu([...ORNEK].sort((a, b) => b.tarih.localeCompare(a.tarih)), () =>
    rezervasyonlariGetir((q) =>
      q.from('reservations').select(REZ_ALAN)
        .order('date', { ascending: false }).limit(limit)));
}

/** Verilen ay içindeki rezervasyonlar (takvim için). */
export function ayinKayitlari(yil: number, ay: number): Promise<Rezervasyon[]> {
  const bas = yerelIso(new Date(yil, ay, 1));
  const son = yerelIso(new Date(yil, ay + 1, 0));
  return sorgu(ORNEK.filter((r) => r.tarih >= bas && r.tarih <= son), () =>
    rezervasyonlariGetir((q) =>
      q.from('reservations').select(REZ_ALAN).gte('date', bas).lte('date', son)
        .order('date', { ascending: true })));
}

export async function rezervasyon(id: string): Promise<Rezervasyon | null> {
  if (tanitim) return ORNEK.find((r) => r.id === id) ?? null;
  const { data, error } = await db().from('reservations').select(REZ_ALAN).eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const t = await tahsilatToplamlari([id]);
  return esle(data as unknown as SatirDb, t[id] ?? 0);
}

export function tahsilatlar(rezervasyonId: string): Promise<Tahsilat[]> {
  const r = ORNEK.find((x) => x.id === rezervasyonId);
  return sorgu(r ? ornekTahsilatlar(r) : [], async () => {
    const { data, error } = await db().from('payments')
      .select('id, date, amount, method, note')
      .eq('reservation_id', rezervasyonId).order('date', { ascending: false });
    return denetle(data, error, 'Tahsilatlar okunamadı.').map((s) => {
      const p = s as unknown as { id: string; date: string; amount: number; method: string; note: string | null };
      return { id: p.id, tarih: p.date, tutar: kurusa(p.amount),
        sekil: p.method, aciklama: p.note ?? '' };
    });
  });
}

export async function tahsilatEkle(
  rezervasyonId: string, tutar: number, sekil: string, aciklama: string,
): Promise<void> {
  if (tanitim) return;
  const { error } = await db().from('payments').insert({
    reservation_id: rezervasyonId, amount: tlye(tutar), method: sekil,
    note: aciklama || null, date: bugunIso(),
  });
  if (error) throw new Error(error.message);
}

export function isEmri(rezervasyonId: string): Promise<IsSatiri[]> {
  return sorgu(ORNEK_IS, async () => {
    const { data, error } = await db().from('event_tasks')
      .select('id, at_time, title, responsible, done')
      .eq('reservation_id', rezervasyonId).order('at_time', { ascending: true });
    return denetle(data, error, 'İş emri okunamadı.').map((s) => {
      const i = s as unknown as { id: string; at_time: string; title: string; responsible: string | null; done: boolean };
      return { id: i.id, saat: (i.at_time ?? '').slice(0, 5), is: i.title, sorumlu: i.responsible ?? '', tamam: i.done };
    });
  });
}

export async function isDurumu(id: string, tamam: boolean): Promise<void> {
  if (tanitim) return;
  const { error } = await db().from('event_tasks').update({ done: tamam }).eq('id', id);
  if (error) throw new Error(error.message);
}

/** Müşteri bize hangi kanaldan ulaştı. Panelle aynı sabit liste. */
export type UlasimKanali = 'Instagram' | 'Düğün.com' | 'Google' | 'Referans' | 'Diğer';

export const ULASIM_KANALLARI: UlasimKanali[] = [
  'Instagram', 'Düğün.com', 'Google', 'Referans', 'Diğer',
];

/**
 * Organizasyon türüne göre tarafların adı. Panelle AYNI kural.
 *
 * Etiket sabit "Damat" olsaydı bir toplantı kaydı girerken kullanıcı
 * kendi müşterisini damat diye kaydetmek zorunda kalırdı.
 */
const CIFT_TURLERI = ['Düğün', 'Nişan', 'Kına', 'Nikâh'];

export function tarafEtiketleri(tur: string): { birinci: string; ikinci: string } {
  if (CIFT_TURLERI.includes(tur)) return { birinci: 'Damat', ikinci: 'Gelin' };
  return { birinci: 'Müşteri', ikinci: 'İkinci Kişi' };
}

export interface YeniRezervasyon {
  musteri: string; telefon: string; tarih: string; seans: string; tur: string;
  salon: string; davetli: number; toplam: number; kapora: number; durum: string;
  /** Boş bırakılabilir; kanal raporunda "Belirtilmemiş" olarak sayılır. */
  kanal?: UlasimKanali | '';
  kanalDetay?: string;
  /** İkinci taraf (düğünde gelin). Panelle aynı alanlar. */
  /**
   * ÜÇ AYRI KİŞİ. `musteri` sözleşmeyi İMZALAYAN; damat ve gelin ayrı.
   * İmzalayan çoğu zaman üçüncü bir kişi (gelinin babası, bir şirket
   * yetkilisi) ve onun adı damadın yerine yazılırsa damadın adı kayda
   * hiç girmez. Panel de aynı modeli kullanıyor.
   */
  damat?: string;
  damatTelefon?: string;
  gelin?: string;
  gelinTelefon?: string;
  /**
   * Tarafların memleketi. Yaşadığı yerden (il/ilçe) AYRI:
   * İstanbul'da oturan bir Sivaslı için ikisi farklıdır.
   */
  damatMemleket?: string;
  gelinMemleket?: string;
  /** Sözleşmenin imzalandığı gün; rezervasyon gününden farklı olabilir. */
  sozlesmeTarihi?: string;
  /** Cebe ulaşılamadığında aranan sabit hat. */
  evTelefonu?: string;
  /**
   * FİYAT GİRDİLERİ. Panelle aynı kural: kişi başı fiyat, iskonto ve
   * KDV oranı saklanır; kişibaşı toplam ve KDV tutarı HESAPLANIR,
   * saklanmaz -- yoksa fiyat düzeltildiğinde birbirini tutmayan
   * sayılar kalır ve yanlış olan faturaya giderdi.
   */
  /** Kuruş cinsinden; `tlye` ile çevrilerek kaydedilir. */
  kisiBasiFiyat?: number;
  iskonto?: number;
  iskontoYuzdeMi?: boolean;
  kdvOrani?: number;
}

/**
 * Yeni rezervasyon kaydeder ve kaydın kimliğini döndürür.
 *
 * Salon adı kimliğe çevrilir: mobil form salonu adıyla seçtiriyor, çünkü
 * telefonda kimlik gösteren bir liste kullanıcıya hiçbir şey anlatmıyor.
 * Kod üretimi ve çakışma denetimi veritabanında yapılır.
 */
export async function rezervasyonEkle(girdi: YeniRezervasyon): Promise<string | null> {
  if (tanitim) return null;

  const { data: salonSatiri } = await db().from('halls')
    .select('id, business_id').eq('name', girdi.salon).maybeSingle();

  const salon = salonSatiri as { id: string; business_id: string } | null;
  // business_id zorunlu bir sütun; salondan türetilmezse kayıt hiç açılmaz.
  if (!salon) throw new Error('Seçilen salon bulunamadı.');

  // Sözleşme numarası (code) gönderilmez: veritabanı tetikleyicisi sıradaki
  // numarayı atar, böylece panel ile mobil aynı diziyi paylaşır.
  const { data, error } = await db().from('reservations').insert({
    business_id: salon.business_id,
    hall_id: salon.id,
    customer_name: girdi.musteri,
    customer_phone: girdi.telefon,
    date: girdi.tarih,
    slot: girdi.seans,
    organization_type: girdi.tur,
    guest_count: girdi.davetli,
    total_amount: tlye(girdi.toplam),
    deposit: tlye(girdi.kapora),
    status: girdi.durum,
    source_channel: girdi.kanal || null,
    source_detail: girdi.kanalDetay?.trim() || null,
    groom_name: girdi.damat?.trim() || null,
    groom_phone: girdi.damatTelefon?.replace(/\D/g, '') || null,
    groom_hometown: girdi.damatMemleket?.trim() || null,
    bride_name: girdi.gelin?.trim() || null,
    bride_phone: girdi.gelinTelefon?.replace(/\D/g, '') || null,
    bride_hometown: girdi.gelinMemleket?.trim() || null,
    contract_date: girdi.sozlesmeTarihi || null,
    home_phone: girdi.evTelefonu?.replace(/\D/g, '') || null,
    // Mobil tutarları KURUŞ taşıyor; `tlye` veritabanının beklediği
    // TL değerine çeviriyor. Ham gönderilseydi fiyat 100 kat çıkardı.
    price_per_person: tlye(girdi.kisiBasiFiyat),
    discount: tlye(girdi.iskonto),
    discount_is_percent: girdi.iskontoYuzdeMi ?? false,
    vat_rate: girdi.kdvOrani ?? 0,
  }).select('id').single();

  if (error) throw new Error(error.message);
  return (data as unknown as { id: string }).id;
}

/* ═══ Kasa ════════════════════════════════════════════════════════ */

export interface KasaOzet { gelir: number; gider: number; bakiye: number; alacak: number }
export interface KasaSatiri {
  id: string; tarih: string; tur: 'Gelir' | 'Gider';
  baslik: string; kategori: string; tutar: number;
}

const ORNEK_KASA: KasaSatiri[] = [
  { id: 'k1', tarih: gunEkle(-1), tur: 'Gelir', baslik: 'Kapora tahsilatı', kategori: 'Rezervasyon', tutar: 4_000_000 },
  { id: 'k2', tarih: gunEkle(-2), tur: 'Gider', baslik: 'Mutfak tedariki', kategori: 'Tedarikçi', tutar: 1_850_000 },
  { id: 'k3', tarih: gunEkle(-4), tur: 'Gelir', baslik: 'Ara ödeme', kategori: 'Rezervasyon', tutar: 2_000_000 },
  { id: 'k4', tarih: gunEkle(-6), tur: 'Gider', baslik: 'Personel ödemesi', kategori: 'Personel', tutar: 3_200_000 },
  { id: 'k5', tarih: gunEkle(-9), tur: 'Gider', baslik: 'Elektrik ve su', kategori: 'Sabit gider', tutar: 640_000 },
  { id: 'k6', tarih: gunEkle(-11), tur: 'Gelir', baslik: 'Salon kiralama', kategori: 'Diğer', tutar: 1_500_000 },
];

/**
 * Kasa özeti.
 *
 * Hesap, panelin `src/lib/kasa.ts` modülüyle AYNI tanımı kullanıyor:
 *
 *   gelir = gelir/gider satırları + kapora + tahsilatlar
 *   gider = gelir/gider satırları + düğün içi giderler
 *
 * Eskiden yalnızca `cash_flow` okunuyordu; kapora ve tahsilatlar o
 * tabloya yazılmadığı için telefondaki kasa, paneldeki kasadan farklı
 * bir rakam gösteriyordu. Şartnamenin 34. maddesi bunu açıkça
 * yasaklıyor: "Aynı ödeme farklı modüllerde farklı rakam
 * göstermemeli."
 *
 * Rezervasyon geliri `cash_flow`'a YAZILMIYOR, buradan türetiliyor.
 * Yazılsaydı bir tahsilat düzeltildiğinde iki kayıt birbirinden kopar
 * ve hangisinin doğru olduğu bilinemezdi.
 */
export function kasaOzeti(): Promise<KasaOzet> {
  const alacak = ORNEK.reduce((t, r) => t + Math.max(0, r.toplam - r.tahsilat), 0);
  return sorgu({ gelir: 46_750_000, gider: 8_700_000, bakiye: 38_050_000, alacak }, async () => {
    const { data, error } = await db().from('cash_flow').select('kind, amount');
    const satirlar = denetle(data, error, 'Kasa okunamadı.');
    let gelir = 0, gider = 0;
    for (const s of satirlar) {
      const k = s as unknown as { kind: string; amount: number };
      if (k.kind === 'Gelir') gelir += kurusa(k.amount); else gider += kurusa(k.amount);
    }

    // İptal edilen organizasyon kasaya para getirmez; kaporası da sayılmaz.
    const { data: rez } = await db().from('reservations')
      .select('id, total_amount, deposit, status').neq('status', 'İptal');
    const kayitlar = (rez ?? []) as unknown as
      { id: string; total_amount: number; deposit: number }[];

    const kimlikler = kayitlar.map((r) => r.id);
    const t = await tahsilatToplamlari(kimlikler);

    for (const r of kayitlar) {
      gelir += kurusa(r.deposit);
      gelir += t[r.id] ?? 0;
    }

    /*
      Düğün içi giderler (madde 12) kasadan ÇIKAN para. `total` sütunu
      YOK; tutar birim x birim fiyat olarak hesaplanıyor -- üç sayı
      birbirini tutmadığında hangisinin doğru olduğu bilinemezdi.
    */
    const { data: giderler } = await db().from('reservation_expenses')
      .select('unit_count, unit_price');
    for (const g of (giderler ?? []) as unknown as
      { unit_count: number; unit_price: number }[]) {
      gider += (g.unit_count ?? 0) * kurusa(g.unit_price);
    }

    // Kalan alacak: kapora da ödenmiş paradır, düşülmesi gerekiyor.
    const kalan = kayitlar.reduce(
      (toplam, r) => toplam
        + Math.max(0, kurusa(r.total_amount) - kurusa(r.deposit) - (t[r.id] ?? 0)),
      0,
    );

    return { gelir, gider, bakiye: gelir - gider, alacak: kalan };
  });
}

export function kasaHareketleri(limit = 50): Promise<KasaSatiri[]> {
  return sorgu(ORNEK_KASA, async () => {
    const { data, error } = await db().from('cash_flow')
      .select('id, date, kind, description, category, amount')
      .order('date', { ascending: false }).limit(limit);
    return denetle(data, error, 'Kasa hareketleri okunamadı.').map((s) => {
      const k = s as unknown as {
        id: string; date: string; kind: 'Gelir' | 'Gider';
        description: string | null; category: string | null; amount: number;
      };
      // Başlık boşsa kategori kullanılır: defterde adsız bir satır kalmasın.
      return {
        id: k.id, tarih: k.date, tur: k.kind,
        baslik: k.description?.trim() || k.category || '-',
        kategori: k.category ?? '', tutar: kurusa(k.amount),
      };
    });
  });
}

export async function kasaEkle(
  tur: 'Gelir' | 'Gider', baslik: string, kategori: string, tutar: number,
): Promise<void> {
  if (tanitim) return;
  // business_id zorunlu bir sütun; gönderilmezse kayıt hiç açılmaz.
  const { error } = await db().from('cash_flow').insert({
    business_id: await aktifIsletmeId(),
    kind: tur, description: baslik, category: kategori,
    amount: tlye(tutar), date: bugunIso(),
  });
  if (error) throw new Error(error.message);
}

/* ═══ Tanımlar: salon, menü, tedarikçi, müşteri ═══════════════════ */

export interface Salon { id: string; ad: string; kapasite: number; aktif: boolean; kayit: number }
export interface Menu { id: string; ad: string; fiyatTuru: 'kisi_basi' | 'sabit'; fiyat: number; aciklama: string; aktif: boolean }
/**
 * Ürün ve Hizmet kalemi (eski adıyla tedarikçi).
 *
 * İki tür aynı tabloda: `hizmet` düğün içi gidere girer, `urun` stoğu
 * takip edilir. Stok alanları yalnızca üründe dolu -- veritabanı kısıtı
 * da bunu zorluyor, "3 koli DJ" gibi bir satır oluşamıyor.
 */
export interface Tedarikci {
  id: string; ad: string; kategori: string; telefon: string; aktif: boolean;
  tur: 'hizmet' | 'urun';
  /** Kuruş. Şemada TL `numeric`; sınırda çevriliyor. */
  birimFiyat: number;
  koli: number; koliIci: number; tekAdet: number; kritikEsik: number;
}

/** Bir ürünün toplam adedi: koli x koli içi + tek adet. Saklanmaz, hesaplanır. */
export function stokToplami(t: Tedarikci): number {
  return t.koli * t.koliIci + t.tekAdet;
}
export interface Musteri { ad: string; telefon: string; kayitSayisi: number; sonTarih: string; toplam: number }

const ORNEK_SALON: Salon[] = [
  { id: 's1', ad: 'Kristal Salon', kapasite: 450, aktif: true, kayit: 5 },
  { id: 's2', ad: 'Zümrüt Salon', kapasite: 250, aktif: true, kayit: 3 },
  { id: 's3', ad: 'Bahçe', kapasite: 300, aktif: false, kayit: 0 },
];

const ORNEK_MENU: Menu[] = [
  { id: 'mn1', ad: 'Açık Büfe Düğün Menüsü', fiyatTuru: 'kisi_basi', fiyat: 65_000, aciklama: 'Çorba, ara sıcak, ana yemek, tatlı', aktif: true },
  { id: 'mn2', ad: 'Kokteyl Menüsü', fiyatTuru: 'kisi_basi', fiyat: 38_000, aciklama: 'Kanepe ve içecek', aktif: true },
  { id: 'mn3', ad: 'Nişan Paketi', fiyatTuru: 'sabit', fiyat: 5_500_000, aciklama: 'Salon, süsleme, servis dahil', aktif: true },
];

function hizmet(
  id: string, ad: string, kategori: string, telefon: string,
  birimFiyat: number, aktif = true,
): Tedarikci {
  return {
    id, ad, kategori, telefon, aktif, tur: 'hizmet', birimFiyat,
    koli: 0, koliIci: 0, tekAdet: 0, kritikEsik: 0,
  };
}

function urun(
  id: string, ad: string, kategori: string, birimFiyat: number,
  koli: number, koliIci: number, tekAdet: number, kritikEsik: number,
): Tedarikci {
  return {
    id, ad, kategori, telefon: '', aktif: true, tur: 'urun', birimFiyat,
    koli, koliIci, tekAdet, kritikEsik,
  };
}

const ORNEK_TEDARIKCI: Tedarikci[] = [
  hizmet('td1', 'Ritim Orkestra', 'Orkestra', '5321110011', 1_800_000),
  hizmet('td2', 'Kare Fotoğraf', 'Fotoğraf', '5321110022', 1_200_000),
  hizmet('td3', 'Gül Çiçekçilik', 'Çiçek', '5321110033', 450_000),
  hizmet('td4', 'Tatlı Ev Pastanesi', 'Pasta', '5321110044', 350_000),
  hizmet('td5', 'Işık Ses Sistemleri', 'Ses ve ışık', '5321110055', 900_000, false),
  // Stok kritik seviyenin altında: ekranda uyarı çıkmalı.
  urun('td6', 'Su (0,5 lt)', 'İçecek', 900, 10, 24, 6, 300),
  urun('td7', 'Kola (200 ml)', 'İçecek', 1_800, 4, 24, 0, 50),
  urun('td8', 'Peçete', 'Süsleme', 400, 6, 50, 12, 0),
];

export function salonlar(): Promise<Salon[]> {
  return sorgu(ORNEK_SALON, async () => {
    const { data, error } = await db().from('halls')
      .select('id, name, capacity, is_active').order('name');
    return denetle(data, error, 'Salonlar okunamadı.').map((s) => {
      const h = s as unknown as { id: string; name: string; capacity: number; is_active: boolean };
      return { id: h.id, ad: h.name, kapasite: h.capacity, aktif: h.is_active, kayit: 0 };
    });
  });
}

export function menuler(): Promise<Menu[]> {
  return sorgu(ORNEK_MENU, async () => {
    const { data, error } = await db().from('menus')
      .select('id, name, pricing, price_kurus, description, is_active').order('name');
    return denetle(data, error, 'Menüler okunamadı.').map((s) => {
      const m = s as unknown as {
        id: string; name: string; pricing: 'kisi_basi' | 'sabit';
        price_kurus: number; description: string | null; is_active: boolean;
      };
      return { id: m.id, ad: m.name, fiyatTuru: m.pricing, fiyat: m.price_kurus,
        aciklama: m.description ?? '', aktif: m.is_active };
    });
  });
}

export function tedarikciler(): Promise<Tedarikci[]> {
  return sorgu(ORNEK_TEDARIKCI, async () => {
    const { data, error } = await db().from('vendors')
      .select('id, name, category, phone, is_active, kind, unit_price, '
        + 'box_count, units_per_box, loose_count, min_count')
      .order('name');
    return denetle(data, error, 'Ürün ve hizmet kayıtları okunamadı.').map((s) => {
      const v = s as unknown as {
        id: string; name: string; category: string; phone: string; is_active: boolean;
        kind: 'hizmet' | 'urun'; unit_price: number; box_count: number;
        units_per_box: number; loose_count: number; min_count: number;
      };
      return {
        id: v.id, ad: v.name, kategori: v.category, telefon: v.phone,
        aktif: v.is_active, tur: v.kind ?? 'hizmet',
        birimFiyat: kurusa(v.unit_price),
        koli: Number(v.box_count ?? 0), koliIci: Number(v.units_per_box ?? 0),
        tekAdet: Number(v.loose_count ?? 0), kritikEsik: Number(v.min_count ?? 0),
      };
    });
  });
}

/** Müşteri defteri rezervasyonlardan türetilir; ayrı bir tablo yok. */
export async function musteriler(): Promise<Musteri[]> {
  const kayitlar = await tumKayitlar(500);
  const harita = new Map<string, Musteri>();
  for (const r of kayitlar) {
    const anahtar = r.telefon || r.musteri;
    const onceki = harita.get(anahtar);
    if (onceki) {
      onceki.kayitSayisi += 1;
      onceki.toplam += r.toplam;
      if (r.tarih > onceki.sonTarih) onceki.sonTarih = r.tarih;
    } else {
      harita.set(anahtar, {
        ad: r.musteri, telefon: r.telefon, kayitSayisi: 1, sonTarih: r.tarih, toplam: r.toplam,
      });
    }
  }
  return [...harita.values()].sort((a, b) => b.sonTarih.localeCompare(a.sonTarih));
}

/* ═══ Fatura ══════════════════════════════════════════════════════ */

export interface Fatura {
  id: string; no: string; musteri: string; tarih: string;
  matrah: number; kdv: number; toplam: number; durum: string; tur: string;
}

const ORNEK_FATURA: Fatura[] = [
  { id: 'f1', no: 'SHR2026000000012', musteri: 'Nur & Onur Çetin', tarih: gunEkle(-11),
    matrah: 13_750_000, kdv: 2_750_000, toplam: 16_500_000, durum: 'Gönderildi', tur: 'e-Arşiv' },
  { id: 'f2', no: 'SHR2026000000011', musteri: 'Deniz & Kaan Şen', tarih: gunEkle(-3),
    matrah: 7_916_667, kdv: 1_583_333, toplam: 9_500_000, durum: 'Gönderildi', tur: 'e-Arşiv' },
  { id: 'f3', no: '-', musteri: 'Melis Ailesi', tarih: gunEkle(-1),
    matrah: 2_500_000, kdv: 500_000, toplam: 3_000_000, durum: 'Taslak', tur: 'e-Arşiv' },
];

export function faturalar(limit = 50): Promise<Fatura[]> {
  return sorgu(ORNEK_FATURA, async () => {
    // Tutarlar şemada kuruş olarak durur; mobil de kuruş taşır, çevrim yok.
    const { data, error } = await db().from('invoices')
      .select('id, invoice_number, buyer_name, issue_date, base_kurus, vat_kurus, total_kurus, status, kind')
      .order('issue_date', { ascending: false }).limit(limit);
    return denetle(data, error, 'Faturalar okunamadı.').map((s) => {
      const f = s as unknown as {
        id: string; invoice_number: string | null; buyer_name: string; issue_date: string;
        base_kurus: number; vat_kurus: number; total_kurus: number; status: string; kind: string;
      };
      return { id: f.id, no: f.invoice_number ?? '-', musteri: f.buyer_name, tarih: f.issue_date,
        matrah: f.base_kurus, kdv: f.vat_kurus, toplam: f.total_kurus, durum: f.status, tur: f.kind };
    });
  });
}

/* ═══ Raporlar ════════════════════════════════════════════════════ */

export interface AyCiro { ay: string; tutar: number; adet: number }
export interface TurDagilim { tur: string; adet: number; renk: string }

export async function aylikCiro(): Promise<AyCiro[]> {
  const kayitlar = await tumKayitlar(500);
  const harita = new Map<string, { tutar: number; adet: number }>();
  for (const r of kayitlar) {
    const ay = r.tarih.slice(0, 7);
    const o = harita.get(ay) ?? { tutar: 0, adet: 0 };
    harita.set(ay, { tutar: o.tutar + r.toplam, adet: o.adet + 1 });
  }
  return [...harita.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([ay, v]) => ({ ay, ...v }));
}

export async function turDagilimi(): Promise<TurDagilim[]> {
  const kayitlar = await tumKayitlar(500);
  const harita = new Map<string, number>();
  for (const r of kayitlar) harita.set(r.tur, (harita.get(r.tur) ?? 0) + 1);
  return [...harita.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([tur, adet]) => ({ tur, adet, renk: TUR_RENK[tur] ?? '#47b2e4' }));
}

/* ═══ SMS, izin ve hatırlatma ═════════════════════════════════════ */

export interface SmsKaydi {
  id: string; telefon: string; metin: string; tur: string;
  durum: string; sinif: 'islem' | 'ticari'; tarih: string; gerekce: string;
}

export interface Izin {
  telefon: string; durum: 'ONAY' | 'RET'; kaynak: string;
  tarih: string; iysAktarim: string;
}

export interface Sablon {
  id: string; anahtar: string; baslik: string; metin: string;
  sinif: 'islem' | 'ticari'; otomatik: boolean; gunOnce: number; saat: number;
}

const ORNEK_SMS: SmsKaydi[] = [
  { id: 'sm1', telefon: '5321234567', metin: 'Sayın Zeynep & Can Arslan, rezervasyonunuz alınmıştır. Kod: 2026-1',
    tur: 'Rezervasyon', durum: 'Gönderildi', sinif: 'islem', tarih: gunEkle(-32), gerekce: '' },
  { id: 'sm2', telefon: '5323334455', metin: 'Sayın Ayşe & Mert Yıldız, organizasyonunuz yaklaşıyor.',
    tur: 'Hatırlatma', durum: 'Gönderildi', sinif: 'islem', tarih: gunEkle(-2), gerekce: '' },
  { id: 'sm3', telefon: '5337778899', metin: 'Sayın Gül & Emre Doğan, kalan tutar 260.000,00 TL.',
    tur: 'Hatırlatma', durum: 'Bekliyor', sinif: 'islem', tarih: gunEkle(0), gerekce: '' },
  { id: 'sm4', telefon: '5445556677', metin: 'Sezon fiyatlarımız hakkında bilgi almak için bizi arayabilirsiniz.',
    tur: 'Bilgilendirme', durum: 'İptal', sinif: 'ticari', tarih: gunEkle(-1),
    gerekce: 'Bu numara için İYS onayı bulunmuyor.' },
];

const ORNEK_IZIN: Izin[] = [
  { telefon: '5321234567', durum: 'ONAY', kaynak: 'HS_FIZIKSEL_ORTAM', tarih: gunEkle(-32), iysAktarim: 'Aktarıldı' },
  { telefon: '5323334455', durum: 'ONAY', kaynak: 'HS_WEB', tarih: gunEkle(-18), iysAktarim: 'Aktarıldı' },
  { telefon: '5309876543', durum: 'RET', kaynak: 'HS_SMS', tarih: gunEkle(-6), iysAktarim: 'Aktarıldı' },
  { telefon: '5551112233', durum: 'ONAY', kaynak: 'HS_WEB', tarih: gunEkle(0), iysAktarim: 'Bekliyor' },
];

const ORNEK_SABLON: Sablon[] = [
  { id: 'tp1', anahtar: 'rezervasyon_onay', baslik: 'Rezervasyon onayı', sinif: 'islem',
    otomatik: false, gunOnce: 0, saat: 10,
    metin: 'Sayin {musteri}, {tarih} {seans} rezervasyonunuz alinmistir. Sorgu kodu: {kod}' },
  { id: 'tp2', anahtar: 'tarih_hatirlatma', baslik: 'Tarih hatırlatması', sinif: 'islem',
    otomatik: true, gunOnce: 7, saat: 10,
    metin: 'Sayin {musteri}, {tarih} tarihli organizasyonunuz yaklasiyor. {salon}' },
  { id: 'tp3', anahtar: 'odeme_hatirlatma', baslik: 'Ödeme hatırlatması', sinif: 'islem',
    otomatik: true, gunOnce: 3, saat: 10,
    metin: 'Sayin {musteri}, {tarih} organizasyonunuz icin kalan tutar {kalan} TL' },
  { id: 'tp4', anahtar: 'tahsilat_bildirimi', baslik: 'Tahsilat bildirimi', sinif: 'islem',
    otomatik: false, gunOnce: 0, saat: 10,
    metin: 'Sayin {musteri}, {odenen} TL odemeniz alinmistir. Kalan {kalan} TL' },
  { id: 'tp5', anahtar: 'etkinlik_gunu', baslik: 'Etkinlik günü', sinif: 'islem',
    otomatik: false, gunOnce: 0, saat: 9,
    metin: 'Sayin {musteri}, bugun {seans} seansinda {salon} sizi bekliyor' },
  { id: 'tp6', anahtar: 'tesekkur', baslik: 'Teşekkür', sinif: 'ticari',
    otomatik: false, gunOnce: -1, saat: 12,
    metin: 'Sayin {musteri}, bizi tercih ettiginiz icin tesekkur ederiz' },
  { id: 'tp7', anahtar: 'kampanya', baslik: 'Kampanya duyurusu', sinif: 'ticari',
    otomatik: false, gunOnce: 0, saat: 10,
    metin: 'Sayin {musteri}, sezon fiyatlarimiz icin bizi arayabilirsiniz' },
];


export function smsKayitlari(limit = 50): Promise<SmsKaydi[]> {
  return sorgu(ORNEK_SMS, async () => {
    const { data, error } = await db().from('sms_queue')
      .select('id, phone, body, kind, status, category, created_at, last_error')
      .order('created_at', { ascending: false }).limit(limit);
    return denetle(data, error, 'SMS kayıtları okunamadı.').map((s) => {
      const m = s as unknown as {
        id: string; phone: string; body: string; kind: string; status: string;
        category: 'islem' | 'ticari'; created_at: string; last_error: string | null;
      };
      return { id: m.id, telefon: m.phone, metin: m.body, tur: m.kind, durum: m.status,
        sinif: m.category, tarih: m.created_at.slice(0, 10), gerekce: m.last_error ?? '' };
    });
  });
}

export function izinler(limit = 100): Promise<Izin[]> {
  return sorgu(ORNEK_IZIN, async () => {
    const { data, error } = await db().from('sms_consents')
      .select('phone, status, source, consent_date, iys_synced_at')
      .order('consent_date', { ascending: false }).limit(limit);
    return denetle(data, error, 'İzin kayıtları okunamadı.').map((s) => {
      const c = s as unknown as {
        phone: string; status: 'ONAY' | 'RET'; source: string;
        consent_date: string; iys_synced_at: string | null;
      };
      return { telefon: c.phone, durum: c.status, kaynak: c.source,
        tarih: c.consent_date.slice(0, 10), iysAktarim: c.iys_synced_at ? 'Aktarıldı' : 'Bekliyor' };
    });
  });
}

export function sablonlar(): Promise<Sablon[]> {
  return sorgu(ORNEK_SABLON, async () => {
    const [{ data: t, error: th }, { data: k }] = await Promise.all([
      db().from('message_templates').select('id, key, title, body, category'),
      db().from('reminder_rules').select('key, enabled, days_before, send_hour'),
    ]);
    const kural = new Map<string, { enabled: boolean; days_before: number; send_hour: number }>();
    for (const s of k ?? []) {
      const r = s as unknown as { key: string; enabled: boolean; days_before: number; send_hour: number };
      kural.set(r.key, r);
    }
    const sira = ORNEK_SABLON.map((s) => s.anahtar);
    return denetle(t, th, 'Şablonlar okunamadı.')
      .map((s) => {
        const m = s as unknown as {
          id: string; key: string; title: string; body: string; category: 'islem' | 'ticari';
        };
        const r = kural.get(m.key);
        return {
          id: m.id, anahtar: m.key, baslik: m.title, metin: m.body, sinif: m.category,
          otomatik: r?.enabled ?? false, gunOnce: r?.days_before ?? 0, saat: r?.send_hour ?? 10,
        };
      })
      .sort((a, b) => sira.indexOf(a.anahtar) - sira.indexOf(b.anahtar));
  });
}

/** Şablonun metnini kaydeder. Sınıf (işlem/ticari) istemciden değiştirilemez. */
export async function sablonKaydet(id: string, metin: string): Promise<void> {
  if (tanitim) return;
  const { error } = await db().from('message_templates').update({ body: metin }).eq('id', id);
  if (error) throw new Error(error.message);
}

/** Mesajı kuyruğa alır; İYS kuralını veritabanı uygular. */
export async function mesajGonder(
  telefon: string, metin: string, tur: string,
  sinif: 'islem' | 'ticari', rezervasyonId?: string,
): Promise<{ kuyruga: boolean; gerekce: string }> {
  if (tanitim) return { kuyruga: true, gerekce: '' };
  const { data, error } = await db().rpc('enqueue_sms', {
    p_business_id: await aktifIsletmeId(), p_phone: telefon, p_body: metin,
    p_kind: tur, p_category: sinif, p_reservation_id: rezervasyonId ?? null,
  });
  if (error) throw new Error(error.message);
  const satir = (data as unknown as { queued: boolean; reason: string }[] | null)?.[0];
  return { kuyruga: satir?.queued ?? false, gerekce: satir?.reason ?? '' };
}

/* ═══ Yönetim: kullanıcı, denetim, sistem ═════════════════════════ */

export interface Kullanici { id: string; ad: string; eposta: string; rol: string; aktif: boolean }
export interface DenetimSatiri {
  id: string; tarih: string; kullanici: string; islem: string; tablo: string; kayit: string;
}
export interface SistemDurumu {
  sonYedek: string; yedekDurum: string;
  kuyrukBekleyen: number; kuyrukBasarisiz: number;
  iysBekleyen: number; sonIysAktarim: string;
}

const ORNEK_KULLANICI: Kullanici[] = [
  { id: 'u1', ad: 'Demo Kullanıcı', eposta: 'demo@sahratakip.com', rol: 'Yönetici', aktif: true },
  { id: 'u2', ad: 'Serap Aksoy', eposta: 'serap@sahratakip.com', rol: 'Personel', aktif: true },
  { id: 'u3', ad: 'Kemal Tunç', eposta: 'kemal@sahratakip.com', rol: 'Personel', aktif: false },
];

const ORNEK_DENETIM: DenetimSatiri[] = [
  { id: 'd1', tarih: gunEkle(0), kullanici: 'Demo Kullanıcı', islem: 'Güncelleme', tablo: 'Rezervasyon', kayit: '2026-1' },
  { id: 'd2', tarih: gunEkle(0), kullanici: 'Serap Aksoy', islem: 'Ekleme', tablo: 'Tahsilat', kayit: '20.000,00 ₺' },
  { id: 'd3', tarih: gunEkle(-1), kullanici: 'Demo Kullanıcı', islem: 'Ekleme', tablo: 'Rezervasyon', kayit: '2026-7' },
  { id: 'd4', tarih: gunEkle(-2), kullanici: 'Demo Kullanıcı', islem: 'Güncelleme', tablo: 'Şablon', kayit: 'Tarih hatırlatması' },
];

const ORNEK_SISTEM: SistemDurumu = {
  sonYedek: gunEkle(0), yedekDurum: 'Başarılı',
  kuyrukBekleyen: 1, kuyrukBasarisiz: 0,
  iysBekleyen: 1, sonIysAktarim: gunEkle(0),
};

export function kullanicilar(): Promise<Kullanici[]> {
  return sorgu(ORNEK_KULLANICI, async () => {
    // Şemada kullanıcıyı askıya alan bir sütun yok: hesap ya vardır ya
    // silinmiştir. Listede görünen her hesap kullanılabilir durumdadır.
    const { data, error } = await db().from('profiles')
      .select('id, full_name, email, role').order('full_name');
    return denetle(data, error, 'Kullanıcılar okunamadı.').map((s) => {
      const u = s as unknown as { id: string; full_name: string; email: string; role: string };
      return { id: u.id, ad: u.full_name, eposta: u.email,
        rol: u.role === 'owner' ? 'Yönetici' : 'Personel', aktif: true };
    });
  });
}

export function denetimKaydi(limit = 50): Promise<DenetimSatiri[]> {
  return sorgu(ORNEK_DENETIM, async () => {
    // Denetim kaydı kimliği e-posta ile tutar; ad ayrıca saklanmaz.
    const { data, error } = await db().from('audit_log')
      .select('id, created_at, actor_email, action, table_name, summary')
      .order('created_at', { ascending: false }).limit(limit);
    return denetle(data, error, 'Denetim kaydı okunamadı.').map((s) => {
      const a = s as unknown as {
        id: string; created_at: string; actor_email: string | null;
        action: string; table_name: string; summary: string | null;
      };
      return { id: a.id, tarih: a.created_at.slice(0, 10), kullanici: a.actor_email ?? '-',
        islem: a.action, tablo: a.table_name, kayit: a.summary ?? '' };
    });
  });
}

/** Yedek durumunu ekranda okunur hâle getirir; şemada kısa kodlar tutulur. */
function yedekEtiketi(durum: string | undefined): string {
  if (durum === 'basarili') return 'Başarılı';
  if (durum === 'basarisiz') return 'Başarısız';
  if (durum === 'calisiyor') return 'Sürüyor';
  return '-';
}

export function sistemDurumu(): Promise<SistemDurumu> {
  return sorgu(ORNEK_SISTEM, async () => {
    const [{ data: yedek }, { data: kuyruk }, { data: izin }] = await Promise.all([
      db().from('backup_runs').select('started_at, status')
        .order('started_at', { ascending: false }).limit(1),
      db().from('sms_queue').select('status'),
      db().from('sms_consents').select('iys_synced_at'),
    ]);
    const y = (yedek ?? [])[0] as unknown as { started_at: string; status: string } | undefined;
    const k = (kuyruk ?? []) as unknown as { status: string }[];
    const i = (izin ?? []) as unknown as { iys_synced_at: string | null }[];
    return {
      sonYedek: y?.started_at?.slice(0, 10) ?? '-',
      yedekDurum: yedekEtiketi(y?.status),
      kuyrukBekleyen: k.filter((x) => x.status === 'bekliyor').length,
      kuyrukBasarisiz: k.filter((x) => x.status === 'basarisiz').length,
      iysBekleyen: i.filter((x) => x.iys_synced_at === null).length,
      sonIysAktarim: '-',
    };
  });
}

/* ═══ Özel günler ═════════════════════════════════════════════════ */

export interface OzelGun {
  id: string; gun: string; ad: string; tur: string; kaynak: string; kesinlesmedi: boolean;
}

const ORNEK_OZEL_GUN: OzelGun[] = [
  { id: 'og1', gun: '2026-10-29', ad: 'Cumhuriyet Bayramı', tur: 'resmi_tatil',
    kaynak: 'tohum', kesinlesmedi: false },
  { id: 'og2', gun: '2027-03-19', ad: 'Ramazan Bayramı Arifesi', tur: 'arife',
    kaynak: 'saglayici', kesinlesmedi: true },
  { id: 'og3', gun: '2027-06-15', ad: 'Okulların kapanışı', tur: 'okul',
    kaynak: 'saglayici', kesinlesmedi: true },
];

/**
 * Takvimdeki özel günler.
 *
 * Salonun kendi günleri ile sağlayıcıdan gelenler AYNI listede: takvimde
 * ikisi de aynı işi görüyor, ayrı çekilseydi ekran iki isteği beklerdi.
 * Ayrımı `kaynak` taşıyor.
 */
export function ozelGunler(limit = 200): Promise<OzelGun[]> {
  return sorgu(ORNEK_OZEL_GUN, async () => {
    const { data, error } = await db().from('special_days')
      .select('id, day, label, kind, source, tentative')
      .order('day', { ascending: true }).limit(limit);
    return denetle(data, error, 'Özel günler okunamadı.').map((s) => {
      const g = s as unknown as {
        id: string; day: string; label: string; kind: string;
        source: string | null; tentative: boolean | null;
      };
      return { id: g.id, gun: g.day, ad: g.label, tur: g.kind,
        kaynak: g.source ?? 'isletme', kesinlesmedi: Boolean(g.tentative) };
    });
  });
}

/* ═══ Müşteri adayları ════════════════════════════════════════════ */

export interface Aday {
  id: string; ad: string; telefon: string; durum: string; kaynak: string;
  /** Gün taşımayan ifadeler ("mayısın ilk haftası") `tarihMetni` alanında. */
  etkinlikTarihi: string; tarihMetni: string;
  kisi: number | null;
  /** Kuruş. Şemada TL `numeric` olarak duruyor, sınırda çevriliyor. */
  teklif: number | null;
  sonIletisim: string; takip: string; opsiyon: string;
  talep: string; not: string;
}

const ORNEK_ADAY: Aday[] = [
  { id: 'a1', ad: 'Sena & Barış', telefon: '5321110045', durum: 'teklif_verildi',
    kaynak: 'Instagram', etkinlikTarihi: gunEkle(180), tarihMetni: '',
    kisi: 300, teklif: 28_000_000, sonIletisim: gunEkle(-2), takip: gunEkle(5),
    opsiyon: gunEkle(9), talep: '300 kişilik düğün için fiyat',
    not: 'Cumartesi gecesi istiyor.' },
  { id: 'a2', ad: 'Elif Hanım', telefon: '5321110046', durum: 'aranacak',
    kaynak: 'WhatsApp', etkinlikTarihi: '', tarihMetni: 'Mayısın ilk haftası',
    kisi: 180, teklif: null, sonIletisim: gunEkle(-1), takip: gunEkle(-1),
    opsiyon: '', talep: 'Nişan için salon müsait mi', not: '' },
  { id: 'a3', ad: 'Yıldız Ailesi', telefon: '5321110047', durum: 'rezervasyona_dondu',
    kaynak: 'Tavsiye', etkinlikTarihi: gunEkle(95), tarihMetni: '',
    kisi: 420, teklif: 41_000_000, sonIletisim: gunEkle(-9), takip: '',
    opsiyon: '', talep: '', not: 'Sözleşme imzalandı.' },
];

/**
 * Müşteri adayları (görüşme defteri).
 *
 * Panelde en kalabalık ekranlardan biri; telefonda tamamını çekmek hem
 * yavaş hem gereksiz. Varsayılan sınır iki yüz: saha kullanıcısı son
 * görüşmelere bakıyor, arşive masaüstünden giriliyor.
 */
interface AdaySatiri {
  id: string; name: string; phone: string; status: string; source: string;
  event_date: string | null; event_date_text: string | null;
  guest_count: number | null; offer_amount: number | null;
  last_contact_at: string | null; next_followup_at: string | null;
  option_date: string | null; request_text: string | null; note: string | null;
}

/** Ham satırı ekranın beklediği alanlara çevirir. Liste ve kart aynı eşlemeyi kullanır. */
function adayEsle(s: unknown): Aday {
  const a = s as AdaySatiri;
  return {
    id: a.id, ad: a.name, telefon: a.phone, durum: a.status, kaynak: a.source,
    etkinlikTarihi: a.event_date ?? '', tarihMetni: a.event_date_text ?? '',
    kisi: a.guest_count,
    teklif: a.offer_amount === null || a.offer_amount === undefined
      ? null : kurusa(a.offer_amount),
    sonIletisim: a.last_contact_at ?? '', takip: a.next_followup_at ?? '',
    opsiyon: a.option_date ?? '', talep: a.request_text ?? '', not: a.note ?? '',
  };
}

const ADAY_ALAN = 'id, name, phone, status, source, event_date, event_date_text, '
  + 'guest_count, offer_amount, last_contact_at, next_followup_at, '
  + 'option_date, request_text, note';

export function adaylar(limit = 200): Promise<Aday[]> {
  return sorgu(ORNEK_ADAY, async () => {
    const { data, error } = await db().from('customer_leads')
      .select(ADAY_ALAN)
      .order('updated_at', { ascending: false }).limit(limit);
    return denetle(data, error, 'Müşteri adayları okunamadı.').map(adayEsle);
  });
}

/** Tek aday; kart ekranı için. */
export async function aday(id: string): Promise<Aday | null> {
  if (tanitim) return ORNEK_ADAY.find((a) => a.id === id) ?? null;
  const { data, error } = await db().from('customer_leads')
    .select(ADAY_ALAN).eq('id', id).maybeSingle();
  if (error) throw new Error(`Aday okunamadı. (${error.message})`);
  return data ? adayEsle(data) : null;
}

/**
 * Adayın durumunu değiştirir.
 *
 * Telefonda en çok yapılan işlem: personel müşteriyi arıyor ve sonucu
 * işaretliyor. `last_contact_at` da aynı anda yazılıyor -- ayrı bırakılsa
 * "bugün arananlar" süzgeci aramayı hiç görmezdi.
 */
export async function adayDurumYaz(id: string, durum: string): Promise<void> {
  if (tanitim) return;
  const { error } = await db().from('customer_leads')
    .update({ status: durum, last_contact_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error(error.message);
}

export interface YeniAday {
  ad: string; telefon: string; durum: string; kaynak: string;
  tarih: string; tarihMetni: string; kisi: number | null; talep: string;
}

/**
 * Yeni aday açar.
 *
 * Telefon ON HANEYE indirgenerek yazılıyor: şema yorumu aynı kişinin
 * "+90...", "0..." ve "..." yazımlarının tek kayda düşmesini buna
 * bağlıyor.
 *
 * Gün taşımayan tarih ifadesi ("mayısın ilk haftası") `event_date_text`
 * alanına gidiyor, uydurma bir güne çevrilmiyor: yanlış bir gün salonun
 * o tarihte dolu sanılmasına yol açardı.
 */
export async function adayEkle(girdi: YeniAday): Promise<string | null> {
  if (tanitim) return null;
  const { data, error } = await db().from('customer_leads').insert({
    business_id: await aktifIsletmeId(),
    name: girdi.ad,
    phone: girdi.telefon.replace(/\D/g, '').slice(-10),
    status: girdi.durum,
    source: girdi.kaynak,
    event_date: girdi.tarih || null,
    event_date_text: girdi.tarihMetni,
    guest_count: girdi.kisi,
    request_text: girdi.talep,
  }).select('id').single();
  if (error) throw new Error(error.message);
  return (data as unknown as { id: string }).id;
}

export interface AdayDurumu {
  kod: string; ad: string; ton: string; etkin: boolean;
  kapali: boolean; baslangic: boolean; kazanim: boolean; takipGunu: number;
}

const ORNEK_ADAY_DURUMU: AdayDurumu[] = [
  { kod: 'yeni', ad: 'Yeni', ton: 'bekleyen', etkin: true,
    kapali: false, baslangic: true, kazanim: false, takipGunu: 0 },
  { kod: 'aranacak', ad: 'Aranacak', ton: 'bekleyen', etkin: true,
    kapali: false, baslangic: false, kazanim: false, takipGunu: 2 },
  { kod: 'teklif_verildi', ad: 'Teklif Verildi', ton: 'teklif', etkin: true,
    kapali: false, baslangic: false, kazanim: false, takipGunu: 7 },
  { kod: 'rezervasyona_dondu', ad: 'Rezervasyona Döndü', ton: 'olumlu', etkin: true,
    kapali: true, baslangic: false, kazanim: true, takipGunu: 0 },
  { kod: 'olumsuz', ad: 'Olumsuz', ton: 'kapali', etkin: true,
    kapali: true, baslangic: false, kazanim: false, takipGunu: 0 },
];

/**
 * İşletmenin tanımladığı aday durumları.
 *
 * Kod yerine ad göstermek için gerekli: aday kaydında `teklif_verildi`
 * duruyor, ekranda "Teklif Verildi" yazmalı. Liste işletmeye göre
 * değiştiği için sabit bir eşleme tablosu tutulamıyor.
 */
export function adayDurumlari(): Promise<AdayDurumu[]> {
  return sorgu(ORNEK_ADAY_DURUMU, async () => {
    const { data, error } = await db().from('lead_statuses')
      .select('code, label, tone, active, is_closed, is_initial, is_won, followup_days')
      .order('sort_order', { ascending: true });
    return denetle(data, error, 'Aday durumları okunamadı.').map((s) => {
      const d = s as unknown as {
        code: string; label: string; tone: string; active: boolean;
        is_closed: boolean; is_initial: boolean; is_won: boolean; followup_days: number;
      };
      return {
        kod: d.code, ad: d.label, ton: d.tone, etkin: d.active, kapali: d.is_closed,
        baslangic: d.is_initial, kazanim: d.is_won, takipGunu: d.followup_days ?? 0,
      };
    });
  });
}

/* ═══ Ödeme bildirimleri ══════════════════════════════════════════ */

export interface OdemeOlayi {
  id: string; olay: string; tutar: number | null; eskiTutar: number | null;
  kisi: string; an: string;
}

const ORNEK_ODEME_OLAYI: OdemeOlayi[] = [
  { id: 'o1', olay: 'tutar_degisti', tutar: 3_000_000, eskiTutar: 2_500_000,
    kisi: 'mudur@sahra.com', an: `${gunEkle(-1)}T14:20:00.000Z` },
  { id: 'o2', olay: 'tahsilat_eklendi', tutar: 5_000_000, eskiTutar: null,
    kisi: 'kasa@sahra.com', an: `${gunEkle(-2)}T10:05:00.000Z` },
];

/**
 * Para ile ilgili son değişiklikler.
 *
 * Panelde "Ödeme Bildirimleri" ekranının karşılığı. Yöneticinin telefonda
 * sorduğu tek soru şu: bugün rakamlara kim dokundu.
 */
export function odemeOlaylari(limit = 100): Promise<OdemeOlayi[]> {
  return sorgu(ORNEK_ODEME_OLAYI, async () => {
    const { data, error } = await db().from('payment_events')
      .select('id, event, amount, old_amount, actor_email, created_at')
      .order('created_at', { ascending: false }).limit(limit);
    return denetle(data, error, 'Ödeme bildirimleri okunamadı.').map((s) => {
      const o = s as unknown as {
        id: string; event: string; amount: number | null;
        old_amount: number | null; actor_email: string | null; created_at: string;
      };
      return {
        id: o.id, olay: o.event,
        tutar: o.amount === null ? null : kurusa(o.amount),
        eskiTutar: o.old_amount === null ? null : kurusa(o.old_amount),
        kisi: o.actor_email ?? '-', an: o.created_at,
      };
    });
  });
}

/* ═══ İşletmeler ══════════════════════════════════════════════════ */

export interface Isletme {
  id: string; ad: string; kategori: string; kapasite: number;
  il: string; ilce: string; telefon: string;
}

const ORNEK_ISLETME: Isletme[] = [
  { id: 'demo', ad: 'Grand Sahra Düğün ve Davet Salonu', kategori: 'Düğün Salonu',
    kapasite: 500, il: 'Konya', ilce: 'Selçuklu', telefon: '3323334455' },
  { id: 'biz_demo2', ad: 'Yıldız Kır Bahçesi', kategori: 'Kır Düğünü / Bahçe',
    kapasite: 300, il: 'Konya', ilce: 'Meram', telefon: '3323334466' },
];

/**
 * Kullanıcının işletmeleri.
 *
 * Telefonda DÜZENLEME YOK, yalnızca liste ve etkin işletme seçimi:
 * işletme tanımı yılda bir değişen bir ayar ve küçük ekranda yanlış
 * dokunuşla bozulması en pahalı kayıt. Düzenleme panelde kalıyor.
 */
export function isletmeler(): Promise<Isletme[]> {
  return sorgu(ORNEK_ISLETME, async () => {
    const { data, error } = await db().from('businesses')
      .select('id, name, category, capacity, city, district, phone')
      .order('name', { ascending: true });
    return denetle(data, error, 'İşletmeler okunamadı.').map((s) => {
      const i = s as unknown as {
        id: string; name: string; category: string | null; capacity: number;
        city: string | null; district: string | null; phone: string | null;
      };
      return { id: i.id, ad: i.name, kategori: i.category ?? '-', kapasite: i.capacity,
        il: i.city ?? '-', ilce: i.district ?? '-', telefon: i.phone ?? '' };
    });
  });
}

/**
 * Etkin işletmeyi değiştirir.
 *
 * Birden çok salonu olan kullanıcı için telefonda en çok gereken işlem
 * bu: hangi salonun kayıtlarına baktığını değiştirmek. Düzenlemenin
 * aksine geri alınabilir ve hiçbir kaydı bozmuyor.
 *
 * Bellek de düşürülüyor; yoksa sonraki yazma işlemi ESKİ işletmeye
 * gider ve kayıt yanlış salonda açılır.
 */
export async function aktifIsletmeSec(id: string): Promise<void> {
  if (tanitim) return;
  const kimlik = kullaniciId(await gecerliJeton());
  if (!kimlik) throw new Error('Oturum bulunamadı.');
  const { error } = await db().from('profiles')
    .update({ active_business_id: id }).eq('id', kimlik);
  if (error) throw new Error(error.message);
  isletmeBellek = id;
}

/** Etkin işletmenin kimliği; seçili olanı işaretlemek için. */
export async function etkinIsletme(): Promise<string> {
  if (tanitim) return ISLETME.id;
  try {
    return await aktifIsletmeId();
  } catch {
    // Etkin işletme seçili değilse liste yine de gösterilmeli; kullanıcı
    // tam olarak buradan seçim yapacak.
    return '';
  }
}

/* ═══ Ödeme bildirim kuralları ve alıcıları ═══════════════════════ */

export interface OdemeKurali {
  id: string; olay: string; acik: boolean; metin: string;
}

export interface OdemeAlicisi {
  id: string; ad: string; telefon: string; acik: boolean; kanal: string;
}

/** Panel ile aynı sıra; liste her açılışta aynı düzende gelsin. */
export const ODEME_OLAYLARI = [
  'tahsilat_eklendi', 'tutar_degisti', 'tip_degisti',
  'tarih_degisti', 'tahsilat_silindi', 'kasaya_girmedi',
] as const;

/** `src/types/index.ts` içindeki ODEME_OLAY_ADI ile aynı metinler. */
export const ODEME_OLAY_ADI: Record<string, string> = {
  tahsilat_eklendi: 'Yeni tahsilat',
  tutar_degisti: 'Tutar değişti',
  tip_degisti: 'Ödeme tipi değişti',
  tarih_degisti: 'Tarih değişti',
  tahsilat_silindi: 'Tahsilat silindi',
  kasaya_girmedi: 'Kasaya girmedi',
};

const ORNEK_ODEME_KURALI: OdemeKurali[] = [
  { id: 'ok1', olay: 'tahsilat_eklendi', acik: true,
    metin: '{isletme}: {kod} için {tutar} tahsilat girildi. Kalan {kalan}.' },
  { id: 'ok2', olay: 'tutar_degisti', acik: true,
    metin: '{isletme}: {kod} tahsilatı {eski_tutar} yerine {tutar} oldu. İşlem: {kullanici}.' },
  { id: 'ok3', olay: 'tip_degisti', acik: false,
    metin: '{isletme}: {kod} ödeme tipi {eski_tip} yerine {tip} oldu.' },
  { id: 'ok4', olay: 'tarih_degisti', acik: false,
    metin: '{isletme}: {kod} tahsilat tarihi değişti.' },
  { id: 'ok5', olay: 'tahsilat_silindi', acik: true,
    metin: '{isletme}: {kod} için {tutar} tutarındaki tahsilat silindi. İşlem: {kullanici}.' },
  { id: 'ok6', olay: 'kasaya_girmedi', acik: true,
    metin: '{isletme}: {kod} için {tutar} çek/senet alındı, kasaya HENÜZ girmedi.' },
];

const ORNEK_ODEME_ALICISI: OdemeAlicisi[] = [
  { id: 'oa1', ad: 'Salon sahibi', telefon: '5321110001', acik: true, kanal: 'whatsapp' },
  { id: 'oa2', ad: 'Muhasebe', telefon: '5321110002', acik: true, kanal: 'sms' },
];

/**
 * Hangi ödeme olayında yöneticiye mesaj gideceği.
 *
 * Metin koda gömülü değil; salondan salona değişiyor ve panelden
 * düzenleniyor. Mobilde açma/kapama var, metin düzenleme yok: 400
 * karakterlik bir şablonu telefon klavyesinde düzeltmek, yer tutucuyu
 * ({tutar} gibi) bozma riskini gereksiz yere taşıyor.
 */
export function odemeKurallari(): Promise<OdemeKurali[]> {
  return sorgu(ORNEK_ODEME_KURALI, async () => {
    const { data, error } = await db().from('payment_alerts')
      .select('id, event, enabled, body');
    const liste = denetle(data, error, 'Bildirim kuralları okunamadı.').map((s) => {
      const k = s as unknown as { id: string; event: string; enabled: boolean; body: string };
      return { id: k.id, olay: k.event, acik: k.enabled, metin: k.body };
    });
    // Sıra veritabanından gelmiyor; panelle aynı düzeni burada kuruyoruz.
    const sira = new Map(ODEME_OLAYLARI.map((o, i) => [o as string, i]));
    return liste.sort((a, b) => (sira.get(a.olay) ?? 99) - (sira.get(b.olay) ?? 99));
  });
}

/** Tek bir kuralı açar ya da kapatır. Metne dokunulmaz. */
export async function odemeKuralDurumu(id: string, acik: boolean): Promise<void> {
  if (tanitim) return;
  const { error } = await db().from('payment_alerts').update({ enabled: acik }).eq('id', id);
  if (error) throw new Error(error.message);
}

/**
 * Bildirimi alacak kişiler.
 *
 * Mobilde yalnızca okunur: numara eklemek ya da silmek, yanlış girildiğinde
 * mesajın başkasına gitmesi demek. Bu ekran "bildirim kime gidiyor"
 * sorusunu cevaplamak için var.
 */
export function odemeAlicilari(): Promise<OdemeAlicisi[]> {
  return sorgu(ORNEK_ODEME_ALICISI, async () => {
    const { data, error } = await db().from('payment_alert_recipients')
      .select('id, name, phone, enabled, channel').order('name');
    return denetle(data, error, 'Bildirim alıcıları okunamadı.').map((s) => {
      const a = s as unknown as {
        id: string; name: string; phone: string; enabled: boolean; channel: string | null;
      };
      return { id: a.id, ad: a.name, telefon: a.phone, acik: a.enabled, kanal: a.channel ?? 'sms' };
    });
  });
}

/* ═══ Fatura ayrıntısı ════════════════════════════════════════════ */

export interface FaturaSatiri {
  id: string; sira: number; aciklama: string; miktar: number; birim: string;
  birimFiyat: number; kdvOrani: number; matrah: number; kdv: number; toplam: number;
}

export interface FaturaDetay extends Fatura {
  alici: string; vergiNo: string; vergiDairesi: string;
  adres: string; eposta: string; aliciTelefon: string;
  iskonto: number; brut: number; paraBirimi: string;
  saglayiciHatasi: string; iptalGerekcesi: string; not: string;
  satirlar: FaturaSatiri[];
}

const ORNEK_FATURA_SATIRI: FaturaSatiri[] = [
  { id: 'fs1', sira: 1, aciklama: 'Düğün organizasyonu - salon ve menü', miktar: 300,
    birim: 'Kişi', birimFiyat: 45_000, kdvOrani: 20,
    matrah: 13_500_000, kdv: 2_700_000, toplam: 16_200_000 },
  { id: 'fs2', sira: 2, aciklama: 'Süsleme ve çiçek', miktar: 1,
    birim: 'Adet', birimFiyat: 250_000, kdvOrani: 20,
    matrah: 250_000, kdv: 50_000, toplam: 300_000 },
];

/**
 * Tek faturanın tamamı: alıcı bilgisi ve kalemler.
 *
 * Liste satırındaki toplam "hangi kalemden geldi" sorusunu cevaplamıyor;
 * müşteri aradığında personelin bakacağı yer burası.
 *
 * Bu ekran RESMÎ BELGE DEĞİL, sistemdeki kaydın kendisi. Entegratöre
 * gönderilen belge ayrı; ikisi karışmasın diye durum her zaman görünür.
 *
 * Tutarlar şemada zaten kuruş (`_kurus` ekli sütunlar); çevrim yok.
 */
export async function faturaDetay(id: string): Promise<FaturaDetay | null> {
  if (tanitim) {
    const temel = ORNEK_FATURA.find((f) => f.id === id);
    if (!temel) return null;
    return {
      ...temel, alici: temel.musteri, vergiNo: '', vergiDairesi: '',
      adres: 'Selçuklu / Konya', eposta: '', aliciTelefon: '5321110011',
      iskonto: 0, brut: temel.matrah, paraBirimi: 'TRY',
      saglayiciHatasi: '', iptalGerekcesi: '', not: '',
      satirlar: ORNEK_FATURA_SATIRI,
    };
  }

  const { data, error } = await db().from('invoices')
    .select('id, invoice_number, buyer_name, issue_date, base_kurus, vat_kurus, '
      + 'total_kurus, gross_kurus, discount_kurus, status, kind, buyer_tax_id, '
      + 'buyer_tax_office, buyer_address, buyer_email, buyer_phone, currency, '
      + 'provider_error, cancel_reason, note')
    .eq('id', id).maybeSingle();
  if (error) throw new Error(`Fatura okunamadı. (${error.message})`);
  if (!data) return null;

  const f = data as unknown as {
    id: string; invoice_number: string | null; buyer_name: string; issue_date: string;
    base_kurus: number; vat_kurus: number; total_kurus: number;
    gross_kurus: number; discount_kurus: number; status: string; kind: string;
    buyer_tax_id: string | null; buyer_tax_office: string | null;
    buyer_address: string | null; buyer_email: string | null; buyer_phone: string | null;
    currency: string | null; provider_error: string | null;
    cancel_reason: string | null; note: string | null;
  };

  const { data: satirVeri, error: satirHata } = await db().from('invoice_lines')
    .select('id, line_no, description, quantity, unit, unit_price_kurus, '
      + 'vat_rate, base_kurus, vat_kurus, total_kurus')
    .eq('invoice_id', id).order('line_no', { ascending: true });

  const satirlar = denetle(satirVeri, satirHata, 'Fatura kalemleri okunamadı.').map((s) => {
    const l = s as unknown as {
      id: string; line_no: number; description: string; quantity: number;
      unit: string; unit_price_kurus: number; vat_rate: number;
      base_kurus: number; vat_kurus: number; total_kurus: number;
    };
    return {
      id: l.id, sira: l.line_no, aciklama: l.description, miktar: Number(l.quantity),
      birim: l.unit, birimFiyat: l.unit_price_kurus, kdvOrani: l.vat_rate,
      matrah: l.base_kurus, kdv: l.vat_kurus, toplam: l.total_kurus,
    };
  });

  return {
    id: f.id, no: f.invoice_number ?? '-', musteri: f.buyer_name, tarih: f.issue_date,
    matrah: f.base_kurus, kdv: f.vat_kurus, toplam: f.total_kurus,
    durum: f.status, tur: f.kind,
    alici: f.buyer_name, vergiNo: f.buyer_tax_id ?? '',
    vergiDairesi: f.buyer_tax_office ?? '', adres: f.buyer_address ?? '',
    eposta: f.buyer_email ?? '', aliciTelefon: f.buyer_phone ?? '',
    iskonto: f.discount_kurus, brut: f.gross_kurus, paraBirimi: f.currency ?? 'TRY',
    saglayiciHatasi: f.provider_error ?? '', iptalGerekcesi: f.cancel_reason ?? '',
    not: f.note ?? '', satirlar,
  };
}

/* ═══ Renk ayarları ═══════════════════════════════════════════════ */

export interface RenkAyari { anahtar: string; ad: string; renk: string }

/** `src/data/constants.ts` DEFAULT_COLOR_SETTINGS ile birebir aynı liste. */
const ORNEK_RENK: RenkAyari[] = [
  { anahtar: 'dugun', ad: 'Düğün', renk: '#47b2e4' },
  { anahtar: 'sunnet', ad: 'Sünnet', renk: '#18d26e' },
  { anahtar: 'nisan', ad: 'Nişan', renk: '#f39c12' },
  { anahtar: 'kina', ad: 'Kına', renk: '#e74c3c' },
  { anahtar: 'konferans', ad: 'Konferans', renk: '#8e44ad' },
  { anahtar: 'kokteyl', ad: 'Kokteyl', renk: '#16a085' },
  { anahtar: 'nikah', ad: 'Nikâh', renk: '#2875b5' },
  { anahtar: 'dogumgunu', ad: 'Doğum Günü', renk: '#d81b60' },
  { anahtar: 'toplanti', ad: 'Toplantı', renk: '#56717d' },
  { anahtar: 'diger', ad: 'Diğer', renk: '#95a5a6' },
];

/**
 * Takvimdeki rezervasyon renkleri.
 *
 * Tek bir `jsonb` sütunda duruyor: renk listesi işletmeye özel ve
 * organizasyon türleri değiştikçe uzayıp kısalıyor; her tür için ayrı
 * satır açmak tabloyu tür tanımlarının kopyası hâline getirirdi.
 */
export function renkAyarlari(): Promise<RenkAyari[]> {
  return sorgu(ORNEK_RENK, async () => {
    const { data, error } = await db().from('color_settings')
      .select('settings').maybeSingle();
    if (error) throw new Error(`Renk ayarları okunamadı. (${error.message})`);

    const ham = (data as unknown as { settings: unknown } | null)?.settings;
    if (!Array.isArray(ham)) return ORNEK_RENK;

    return ham.map((s) => {
      const r = s as { key?: string; label?: string; color?: string };
      return {
        anahtar: r.key ?? '', ad: r.label ?? r.key ?? '',
        renk: r.color ?? '#47b2e4',
      };
    }).filter((r) => r.anahtar !== '');
  });
}

/* ═══ WhatsApp hesabı ve otomatik cevap ══════════════════════════ */

export interface WhatsappHesabi {
  numaraKimligi: string; gorunenNumara: string;
  otomatikAcik: boolean; karsilamaMesaji: string;
  mesaiDisiAcik: boolean; mesaiDisiMesaji: string;
  mesaiBaslangic: string; mesaiBitis: string; mesaiGunleri: number[];
}

const ORNEK_WHATSAPP: WhatsappHesabi = {
  numaraKimligi: '000000000000000',
  gorunenNumara: '+90 332 333 44 55',
  otomatikAcik: true,
  karsilamaMesaji: 'Mesajınız bize ulaştı. En kısa sürede size döneceğiz.',
  mesaiDisiAcik: true,
  mesaiDisiMesaji:
    'Mesajınız bize ulaştı. Şu an çalışma saatlerimiz dışındayız, '
    + 'ilk iş günü size döneceğiz.',
  mesaiBaslangic: '09:00',
  mesaiBitis: '19:00',
  mesaiGunleri: [1, 2, 3, 4, 5, 6, 7],
};

/**
 * WhatsApp numarası eşlemesi ve otomatik cevap ayarları.
 *
 * Hesap tanımlı değilse `null` döner: bu bir hata değil, henüz
 * kurulmamış demek. Ekran bunu ayrı anlatıyor.
 *
 * Saatler işletmenin YEREL saati (Türkiye, UTC+3). Sunucu UTC
 * çalıştığı için çevrim kodda yapılıyor; ham değer olduğu gibi
 * gösteriliyor.
 */
export async function whatsappHesabi(): Promise<WhatsappHesabi | null> {
  if (tanitim) return ORNEK_WHATSAPP;

  const { data, error } = await db().from('whatsapp_accounts')
    .select('phone_number_id, display_phone, auto_reply_enabled, welcome_message, '
      + 'after_hours_enabled, after_hours_message, work_start, work_end, work_days')
    .maybeSingle();
  if (error) throw new Error(`WhatsApp ayarları okunamadı. (${error.message})`);
  if (!data) return null;

  const h = data as unknown as {
    phone_number_id: string; display_phone: string | null;
    auto_reply_enabled: boolean; welcome_message: string;
    after_hours_enabled: boolean; after_hours_message: string;
    work_start: string; work_end: string; work_days: number[] | null;
  };

  return {
    numaraKimligi: h.phone_number_id, gorunenNumara: h.display_phone ?? '',
    otomatikAcik: h.auto_reply_enabled, karsilamaMesaji: h.welcome_message,
    mesaiDisiAcik: h.after_hours_enabled, mesaiDisiMesaji: h.after_hours_message,
    // Postgres `time` "09:00:00" döndürür; ekranda saniye istenmiyor.
    mesaiBaslangic: (h.work_start ?? '').slice(0, 5),
    mesaiBitis: (h.work_end ?? '').slice(0, 5),
    mesaiGunleri: h.work_days ?? [],
  };
}

/**
 * Otomatik cevabı açar ya da kapatır.
 *
 * Tek boolean, geri alınabilir ve telefonda gerçekten gereken işlem:
 * salon kapalıyken gelen mesajlara otomatik cevap gitmesin istendiğinde
 * panele gidilmesi bekleniyordu.
 */
export async function whatsappOtomatikDurumu(
  numaraKimligi: string, acik: boolean,
): Promise<void> {
  if (tanitim) return;
  const { error } = await db().from('whatsapp_accounts')
    .update({ auto_reply_enabled: acik }).eq('phone_number_id', numaraKimligi);
  if (error) throw new Error(error.message);
}
