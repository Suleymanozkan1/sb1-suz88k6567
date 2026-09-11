import { supabase, yapilandirildi } from './supabase';
import { bugunIso, yerelIso } from './bicim';

/**
 * Veri erişimi.
 *
 * Okumalar doğrudan Supabase'e gider; hangi satırın görüneceğine sunucudaki
 * RLS karar verir, istemci filtresine güvenilmez. Supabase yapılandırılmamışsa
 * (mağaza incelemesi, ekran görüntüsü, tanıtım) örnek veri döner.
 *
 * Dosya alanlara göre bölünmüştür; her bölümün başında önce tipler, sonra
 * tanıtım verisi, sonra sorgular gelir. Web panelindeki her ekranın buradaki
 * bir karşılığı vardır: mobil uygulama panelin bir özeti değil, tamamıdır.
 */

/* ═══ Ortak ═══════════════════════════════════════════════════════ */

export type Seans = 'Gündüz' | 'Gece';

/** Tanıtım kipinde mi çalışıyoruz. */
export const tanitim = !yapilandirildi || !supabase;

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

/** Supabase yanıtındaki hatayı çağırana anlaşılır biçimde iletir. */
function denetle<T>(veri: T | null, hata: { message: string } | null, mesaj: string): T {
  if (hata) throw new Error(`${mesaj} (${hata.message})`);
  return (veri ?? []) as T;
}

const db = () => supabase!;

/** Etkin işletme; tanıtımda sabit. Panelde olduğu gibi tek işletme seçilidir. */
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

  const { data: oturum } = await db().auth.getUser();
  const kullanici = oturum?.user;
  if (!kullanici) throw new Error('Oturum bulunamadı.');

  const { data, error } = await db().from('profiles')
    .select('active_business_id, owner_id, id').eq('id', kullanici.id).maybeSingle();
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

const TUR_RENK: Record<string, string> = {
  'Düğün': '#47b2e4', 'Nişan': '#f39c12', 'Kına': '#e74c3c',
  'Sünnet': '#18d26e', 'Nikâh': '#3498db', 'Kokteyl': '#16a085',
};

const ORNEK: Rezervasyon[] = [
  { id: '1', kod: '2026-1', musteri: 'Zeynep & Can Arslan', telefon: '5321234567',
    tarih: gunEkle(0), seans: 'Gece', saat: '19:00-23:00', tur: 'Düğün', renk: TUR_RENK['Düğün']!, salon: 'Kristal Salon',
    davetli: 320, toplam: 21_000_000, tahsilat: 6_000_000, kapora: 4_000_000, durum: 'Kesin Rezervasyon' },
  { id: '2', kod: '2026-2', musteri: 'Deniz & Kaan Şen', telefon: '5309876543',
    tarih: gunEkle(0), seans: 'Gündüz', saat: '13:00-17:00', tur: 'Nikâh', renk: TUR_RENK['Nikâh']!, salon: 'Zümrüt Salon',
    davetli: 150, toplam: 9_500_000, tahsilat: 9_500_000, kapora: 6_333_334, durum: 'Tamamlandı' },
  { id: '3', kod: '2026-3', musteri: 'Melis Ailesi', telefon: '5551112233',
    tarih: gunEkle(2), seans: 'Gece', saat: '19:00-23:00', tur: 'Kına', renk: TUR_RENK['Kına']!, salon: 'Kristal Salon',
    davetli: 200, toplam: 12_000_000, tahsilat: 3_000_000, kapora: 2_000_000, durum: 'Kesin Rezervasyon' },
  { id: '4', kod: '2026-4', musteri: 'Ayşe & Mert Yıldız', telefon: '5323334455',
    tarih: gunEkle(5), seans: 'Gece', saat: '19:00-23:00', tur: 'Düğün', renk: TUR_RENK['Düğün']!, salon: 'Kristal Salon',
    davetli: 280, toplam: 18_000_000, tahsilat: 8_000_000, kapora: 5_333_334, durum: 'Kesin Rezervasyon' },
  { id: '5', kod: '2026-5', musteri: 'Ece & Kerem Aydın', telefon: '5445556677',
    tarih: gunEkle(9), seans: 'Gündüz', saat: '13:00-17:00', tur: 'Nişan', renk: TUR_RENK['Nişan']!, salon: 'Zümrüt Salon',
    davetli: 80, toplam: 5_500_000, tahsilat: 1_500_000, kapora: 1_000_000, durum: 'Ön Rezervasyon' },
  { id: '6', kod: '2026-6', musteri: 'Gül & Emre Doğan', telefon: '5337778899',
    tarih: gunEkle(14), seans: 'Gece', saat: '19:00-23:00', tur: 'Düğün', renk: TUR_RENK['Düğün']!, salon: 'Kristal Salon',
    davetli: 400, toplam: 26_000_000, tahsilat: 0, kapora: 0, durum: 'Ön Rezervasyon' },
  { id: '7', kod: '2026-7', musteri: 'Sude & Barış Kaya', telefon: '5362223344',
    tarih: gunEkle(21), seans: 'Gece', saat: '19:00-23:00', tur: 'Sünnet', renk: TUR_RENK['Sünnet']!, salon: 'Zümrüt Salon',
    davetli: 180, toplam: 9_000_000, tahsilat: 2_500_000, kapora: 1_666_667, durum: 'Kesin Rezervasyon' },
  { id: '8', kod: '2026-8', musteri: 'Nur & Onur Çetin', telefon: '5354445566',
    tarih: gunEkle(-12), seans: 'Gece', saat: '19:00-23:00', tur: 'Düğün', renk: TUR_RENK['Düğün']!, salon: 'Kristal Salon',
    davetli: 260, toplam: 16_500_000, tahsilat: 16_500_000, kapora: 11_000_000, durum: 'Tamamlandı' },
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
  'id, code, customer_name, customer_phone, date, start_time, end_time, slot, organization_type, guest_count, total_amount, deposit, status, halls(name)';

interface SatirDb {
  id: string; code: string; customer_name: string; customer_phone: string;
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
    toplam: r.total_amount ?? 0, kapora: r.deposit ?? 0,
    tahsilat: (r.deposit ?? 0) + tahsilat, durum: r.status,
  };
}

async function tahsilatToplamlari(kimlikler: string[]): Promise<Record<string, number>> {
  if (tanitim || kimlikler.length === 0) return {};
  const { data } = await db()
    .from('payments').select('reservation_id, amount').in('reservation_id', kimlikler);
  const toplam: Record<string, number> = {};
  for (const s of data ?? []) {
    const satir = s as unknown as { reservation_id: string; amount: number };
    toplam[satir.reservation_id] = (toplam[satir.reservation_id] ?? 0) + satir.amount;
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
      return { id: p.id, tarih: p.date, tutar: p.amount, sekil: p.method, aciklama: p.note ?? '' };
    });
  });
}

export async function tahsilatEkle(
  rezervasyonId: string, tutar: number, sekil: string, aciklama: string,
): Promise<void> {
  if (tanitim) return;
  const { error } = await db().from('payments').insert({
    reservation_id: rezervasyonId, amount: tutar, method: sekil,
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

export interface YeniRezervasyon {
  musteri: string; telefon: string; tarih: string; seans: string; tur: string;
  salon: string; davetli: number; toplam: number; kapora: number; durum: string;
  /** Boş bırakılabilir; kanal raporunda "Belirtilmemiş" olarak sayılır. */
  kanal?: UlasimKanali | '';
  kanalDetay?: string;
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
    total_amount: girdi.toplam,
    deposit: girdi.kapora,
    status: girdi.durum,
    source_channel: girdi.kanal || null,
    source_detail: girdi.kanalDetay?.trim() || null,
  }).select('id').single();

  if (error) throw new Error(error.message);
  return (data as unknown as { id: string }).id;
}

/* ═══ Masa düzeni ═════════════════════════════════════════════════ */

export interface Masa { id: string; no: number; koltuk: number; not: string }

/**
 * Tanıtım masa planı davetli sayısından üretilir.
 *
 * Sabit sekiz masa kullanılırken 320 kişilik bir düğünde "240 kişilik eksik"
 * uyarısı çıkıyor ve tanıtım verisi hatalı görünüyordu. Koltuk toplamı
 * davetli sayısına eşitlenir; artan koltuk son masaya bırakılır.
 */
function ornekMasalar(davetli: number): Masa[] {
  const KOLTUK = 10;
  const adet = Math.max(1, Math.ceil(davetli / KOLTUK));
  return Array.from({ length: adet }, (_, i) => ({
    id: `m${i + 1}`,
    no: i + 1,
    koltuk: i === adet - 1 ? davetli - KOLTUK * (adet - 1) : KOLTUK,
    not: i === 0 ? 'Gelin ve damat masası' : i === 1 ? 'Aile masası' : '',
  }));
}

export function masalar(rezervasyonId: string): Promise<Masa[]> {
  const r = ORNEK.find((x) => x.id === rezervasyonId);
  return sorgu(ornekMasalar(r?.davetli ?? 0), async () => {
    const { data, error } = await db().from('seating_tables')
      .select('id, table_no, seats, label')
      .eq('reservation_id', rezervasyonId).order('table_no');
    return denetle(data, error, 'Masa düzeni okunamadı.').map((s) => {
      const m = s as unknown as { id: string; table_no: number; seats: number; label: string | null };
      return { id: m.id, no: m.table_no, koltuk: m.seats, not: m.label ?? '' };
    });
  });
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

export function kasaOzeti(): Promise<KasaOzet> {
  const alacak = ORNEK.reduce((t, r) => t + Math.max(0, r.toplam - r.tahsilat), 0);
  return sorgu({ gelir: 46_750_000, gider: 8_700_000, bakiye: 38_050_000, alacak }, async () => {
    const { data, error } = await db().from('cash_flow').select('kind, amount');
    const satirlar = denetle(data, error, 'Kasa okunamadı.');
    let gelir = 0, gider = 0;
    for (const s of satirlar) {
      const k = s as unknown as { kind: string; amount: number };
      if (k.kind === 'Gelir') gelir += k.amount; else gider += k.amount;
    }
    const { data: rez } = await db().from('reservations').select('id, total_amount');
    const kimlikler = (rez ?? []).map((r) => (r as unknown as { id: string }).id);
    const t = await tahsilatToplamlari(kimlikler);
    const kalan = (rez ?? []).reduce((toplam, r) => {
      const x = r as unknown as { id: string; total_amount: number };
      return toplam + Math.max(0, x.total_amount - (t[x.id] ?? 0));
    }, 0);
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
        kategori: k.category ?? '', tutar: k.amount,
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
    kind: tur, description: baslik, category: kategori, amount: tutar, date: bugunIso(),
  });
  if (error) throw new Error(error.message);
}

/* ═══ Çelik kasa ══════════════════════════════════════════════════ */

/**
 * Çelik kasa (fiziksel kasa).
 *
 * İşletmenin kasasındaki gerçek para, gelir/gider kayıtlarından çıkan
 * muhasebe bakiyesiyle aynı değildir: havaleyle gelen tahsilat kasaya
 * girmez, kasadan alınıp bankaya yatırılan para kasadan çıkar ama gelir
 * kaydı yerinde durur. Bu yüzden ayrı bir hareket defteridir ve iki bakiye
 * hiçbir yerde toplanmaz.
 */
export type KasaYonu = 'Giriş' | 'Çıkış';

export interface KasaHareketi {
  id: string; tarih: string; yon: KasaYonu; tutar: number;
  aciklama: string; kaynakTuru: 'cash_flow' | 'reservation'; kaynakId: string;
}

const ORNEK_CELIK: KasaHareketi[] = [
  { id: 'ck1', tarih: gunEkle(-1), yon: 'Giriş', tutar: 4_000_000,
    aciklama: 'Gelir · Rezervasyon · Kapora tahsilatı', kaynakTuru: 'cash_flow', kaynakId: 'k1' },
  { id: 'ck2', tarih: gunEkle(-2), yon: 'Çıkış', tutar: 1_850_000,
    aciklama: 'Gider · Tedarikçi · Mutfak tedariki', kaynakTuru: 'cash_flow', kaynakId: 'k2' },
  { id: 'ck3', tarih: gunEkle(-9), yon: 'Çıkış', tutar: 640_000,
    aciklama: 'Gider · Sabit gider · Elektrik ve su', kaynakTuru: 'cash_flow', kaynakId: 'k5' },
];

/** Kasadaki para: girişler eksi çıkışlar. */
export function celikKasaBakiyesi(hareketler: KasaHareketi[]): number {
  return hareketler.reduce((t, h) => t + (h.yon === 'Giriş' ? h.tutar : -h.tutar), 0);
}

/** Bir gelir/gider satırının kasaya net etkisi. */
export function kaynakNeti(hareketler: KasaHareketi[], kaynakId: string): number {
  return celikKasaBakiyesi(hareketler.filter((h) => h.kaynakId === kaynakId));
}

/**
 * Satırın kasadaki doğal yönü.
 *
 * Gelir kasaya girer, gider kasadan çıkar. Yönü kullanıcının seçimine
 * bırakmak, nakit ödenen bir maaşı kasaya para giriyormuş gibi işlemeye
 * izin verirdi.
 */
export function dogalYon(tur: 'Gelir' | 'Gider'): KasaYonu {
  return tur === 'Gider' ? 'Çıkış' : 'Giriş';
}

/**
 * Bu satır kasaya bu yönde işlenebilir mi?
 *
 * Doğal yön ancak net sıfırken; karşı yön ancak satırın kasada bir etkisi
 * varken yazılır. Böylece girip çıkan satır yeniden işlenebilir ama aynı
 * hareket arka arkaya iki kez yazılamaz. Panelde de, veritabanı
 * tetikleyicisinde de aynı kural duruyor.
 */
export function kasayaIslenebilir(
  hareketler: KasaHareketi[], kaynakId: string, yon: KasaYonu, tur: 'Gelir' | 'Gider',
): boolean {
  const net = kaynakNeti(hareketler, kaynakId);
  const dogal = dogalYon(tur);
  if (yon === dogal) return net === 0;
  return dogal === 'Giriş' ? net > 0 : net < 0;
}

export function celikKasaHareketleri(limit = 100): Promise<KasaHareketi[]> {
  return sorgu(ORNEK_CELIK, async () => {
    const { data, error } = await db().from('safe_movements')
      .select('id, date, direction, amount, description, source_kind, source_id')
      .order('date', { ascending: false }).limit(limit);
    return denetle(data, error, 'Çelik kasa hareketleri okunamadı.').map((s) => {
      const h = s as unknown as {
        id: string; date: string; direction: KasaYonu; amount: number;
        description: string | null; source_kind: 'cash_flow' | 'reservation'; source_id: string;
      };
      return {
        id: h.id, tarih: h.date, yon: h.direction, tutar: h.amount,
        aciklama: h.description ?? '', kaynakTuru: h.source_kind, kaynakId: h.source_id,
      };
    });
  });
}

/**
 * Bir gelir/gider satırını çelik kasaya işler.
 *
 * Tutar satırın kendi tutarıdır: kısmi giriş, satırın anlamını bulanıklaştırır
 * ve kasadaki parayı gelir/gider kaydından koparırdı. Kuralı sunucu da
 * uyguluyor; buradaki kontrol kullanıcıya anlaşılır bir mesaj vermek için.
 */
export async function celikKasayaIsle(
  satir: KasaSatiri, yon: KasaYonu, mevcut: KasaHareketi[],
): Promise<void> {
  if (!kasayaIslenebilir(mevcut, satir.id, yon, satir.tur)) {
    throw new Error(satir.tur === 'Gider'
      ? (yon === 'Çıkış'
        ? 'Bu gider çelik kasadan zaten düşülmüş; önce geri alın.'
        : 'Bu gider çelik kasadan düşülmemiş; geri alınacak bir şey yok.')
      : (yon === 'Giriş'
        ? 'Bu kayıt zaten çelik kasada duruyor; önce kasadan çıkarın.'
        : 'Bu kayıt çelik kasada değil; önce kasaya ekleyin.'));
  }
  if (tanitim) return;

  const { error } = await db().from('safe_movements').insert({
    business_id: await aktifIsletmeId(),
    date: satir.tarih,
    direction: yon,
    amount: satir.tutar,
    description: `${satir.tur} · ${satir.kategori || satir.baslik}`,
    source_kind: 'cash_flow',
    source_id: satir.id,
  });
  if (error) throw new Error(error.message);
}

/** Yanlış işlenen hareketi defterden siler; gelir/gider kaydına dokunmaz. */
export async function celikKasaHareketiSil(id: string): Promise<void> {
  if (tanitim) return;
  const { error } = await db().from('safe_movements').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/* ═══ Tanımlar: salon, menü, tedarikçi, müşteri ═══════════════════ */

export interface Salon { id: string; ad: string; kapasite: number; aktif: boolean; kayit: number }
export interface Menu { id: string; ad: string; fiyatTuru: 'kisi_basi' | 'sabit'; fiyat: number; aciklama: string; aktif: boolean }
export interface Tedarikci { id: string; ad: string; kategori: string; telefon: string; aktif: boolean }
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

const ORNEK_TEDARIKCI: Tedarikci[] = [
  { id: 'td1', ad: 'Ritim Orkestra', kategori: 'Orkestra', telefon: '5321110011', aktif: true },
  { id: 'td2', ad: 'Kare Fotoğraf', kategori: 'Fotoğraf', telefon: '5321110022', aktif: true },
  { id: 'td3', ad: 'Gül Çiçekçilik', kategori: 'Çiçek', telefon: '5321110033', aktif: true },
  { id: 'td4', ad: 'Tatlı Ev Pastanesi', kategori: 'Pasta', telefon: '5321110044', aktif: true },
  { id: 'td5', ad: 'Işık Ses Sistemleri', kategori: 'Ses ve ışık', telefon: '5321110055', aktif: false },
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
      .select('id, name, category, phone, is_active').order('name');
    return denetle(data, error, 'Tedarikçiler okunamadı.').map((s) => {
      const v = s as unknown as { id: string; name: string; category: string; phone: string; is_active: boolean };
      return { id: v.id, ad: v.name, kategori: v.category, telefon: v.phone, aktif: v.is_active };
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
