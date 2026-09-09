import { supabase, yapilandirildi } from './supabase';
import { bugunIso, yerelIso } from './bicim';

/**
 * Veri erişimi.
 *
 * Okumalar doğrudan Supabase'e gider; hangi satırın görüneceğine sunucudaki
 * RLS karar verir, istemci filtresine güvenilmez. Supabase yapılandırılmamışsa
 * (mağaza incelemesi, ekran görüntüsü, tanıtım) örnek veri döner.
 */

export type Seans = 'Gündüz' | 'Gece';

export interface Rezervasyon {
  id: string;
  kod: string;
  musteri: string;
  telefon: string;
  tarih: string;
  seans: Seans;
  tur: string;
  renk: string;
  salon: string;
  davetli: number;
  toplam: number;
  tahsilat: number;
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

export interface KasaOzet {
  gelir: number;
  gider: number;
  bakiye: number;
  alacak: number;
}

/* ── Tanıtım verisi ───────────────────────────────────────────────── */

const TUR_RENK: Record<string, string> = {
  'Düğün': '#47b2e4', 'Nişan': '#f39c12', 'Kına': '#e74c3c',
  'Sünnet': '#18d26e', 'Nikâh': '#3498db', 'Kokteyl': '#16a085',
};

function gunEkle(gun: number): string {
  const t = new Date();
  t.setDate(t.getDate() + gun);
  return yerelIso(t);
}

const ORNEK: Rezervasyon[] = [
  { id: '1', kod: 'SA-2026-4141', musteri: 'Zeynep & Can Arslan', telefon: '5321234567',
    tarih: gunEkle(0), seans: 'Gece', tur: 'Düğün', renk: TUR_RENK['Düğün']!, salon: 'Kristal Salon',
    davetli: 320, toplam: 21_000_000, tahsilat: 6_000_000, durum: 'Kesin Rezervasyon' },
  { id: '2', kod: 'SA-2026-7683', musteri: 'Deniz & Kaan Şen', telefon: '5309876543',
    tarih: gunEkle(0), seans: 'Gündüz', tur: 'Nikâh', renk: TUR_RENK['Nikâh']!, salon: 'Zümrüt Salon',
    davetli: 150, toplam: 9_500_000, tahsilat: 9_500_000, durum: 'Tamamlandı' },
  { id: '3', kod: 'SA-2026-9736', musteri: 'Melis Ailesi', telefon: '5551112233',
    tarih: gunEkle(2), seans: 'Gece', tur: 'Kına', renk: TUR_RENK['Kına']!, salon: 'Kristal Salon',
    davetli: 200, toplam: 12_000_000, tahsilat: 3_000_000, durum: 'Kesin Rezervasyon' },
  { id: '4', kod: 'SA-2026-7446', musteri: 'Ayşe & Mert Yıldız', telefon: '5323334455',
    tarih: gunEkle(5), seans: 'Gece', tur: 'Düğün', renk: TUR_RENK['Düğün']!, salon: 'Kristal Salon',
    davetli: 280, toplam: 18_000_000, tahsilat: 8_000_000, durum: 'Kesin Rezervasyon' },
  { id: '5', kod: 'SA-2026-2210', musteri: 'Ece & Kerem Aydın', telefon: '5445556677',
    tarih: gunEkle(9), seans: 'Gündüz', tur: 'Nişan', renk: TUR_RENK['Nişan']!, salon: 'Zümrüt Salon',
    davetli: 80, toplam: 5_500_000, tahsilat: 1_500_000, durum: 'Ön Rezervasyon' },
  { id: '6', kod: 'SA-2026-3382', musteri: 'Gül & Emre Doğan', telefon: '5337778899',
    tarih: gunEkle(14), seans: 'Gece', tur: 'Düğün', renk: TUR_RENK['Düğün']!, salon: 'Kristal Salon',
    davetli: 400, toplam: 26_000_000, tahsilat: 0, durum: 'Ön Rezervasyon' },
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
  if (r.tahsilat <= 0) return [];
  const ara = Math.floor(r.tahsilat / 3);
  const kapora = r.tahsilat - ara;
  const satirlar: Tahsilat[] = [
    { id: `${r.id}-t1`, tarih: gunEkle(-32), tutar: kapora, sekil: 'Havale', aciklama: 'Kapora' },
  ];
  if (ara > 0) {
    satirlar.push({ id: `${r.id}-t2`, tarih: gunEkle(-9), tutar: ara, sekil: 'Nakit', aciklama: 'Ara ödeme' });
  }
  return satirlar;
}

const ORNEK_IS: IsSatiri[] = [
  { id: 'i1', saat: '15:00', is: 'Salon temizliği ve kontrol', sorumlu: 'Temizlik', tamam: true },
  { id: 'i2', saat: '17:00', is: 'Masa düzeni ve süsleme kurulumu', sorumlu: 'Servis', tamam: true },
  { id: 'i3', saat: '18:30', is: 'Tedarikçi girişleri', sorumlu: 'Operasyon', tamam: false },
  { id: 'i4', saat: '19:00', is: 'Salon açılış ve karşılama', sorumlu: 'Karşılama', tamam: false },
  { id: 'i5', saat: '20:00', is: 'Yemek servisi', sorumlu: 'Mutfak', tamam: false },
  { id: 'i6', saat: '22:00', is: 'Pasta ve tatlı servisi', sorumlu: 'Servis', tamam: false },
];

/* ── Sorgular ─────────────────────────────────────────────────────── */

interface SatirDb {
  id: string; code: string; customer_name: string; customer_phone: string;
  date: string; slot: Seans; organization_type: string; guest_count: number;
  total_amount: number; status: string;
  halls?: { name: string } | null;
}

function esle(r: SatirDb, renkler: Record<string, string>, tahsilat: number): Rezervasyon {
  return {
    id: r.id, kod: r.code, musteri: r.customer_name, telefon: r.customer_phone ?? '',
    tarih: r.date, seans: r.slot, tur: r.organization_type,
    renk: renkler[r.organization_type] ?? '#47b2e4',
    salon: r.halls?.name ?? '—', davetli: r.guest_count ?? 0,
    toplam: r.total_amount ?? 0, tahsilat, durum: r.status,
  };
}

/** Bugünden itibaren yaklaşan rezervasyonlar. */
export async function yaklasanlar(limit = 40): Promise<Rezervasyon[]> {
  if (!yapilandirildi || !supabase) return ORNEK;

  const { data, error } = await supabase
    .from('reservations')
    .select('id, code, customer_name, customer_phone, date, slot, organization_type, guest_count, total_amount, status, halls(name)')
    .gte('date', bugunIso())
    .order('date', { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);

  const kimlikler = (data ?? []).map((r) => (r as unknown as SatirDb).id);
  const toplamlar = await tahsilatToplamlari(kimlikler);
  return (data ?? []).map((r) => esle(r as unknown as SatirDb, {}, toplamlar[(r as unknown as SatirDb).id] ?? 0));
}

/** Verilen ay içindeki rezervasyonlar (takvim için). */
export async function ayinKayitlari(yil: number, ay: number): Promise<Rezervasyon[]> {
  if (!yapilandirildi || !supabase) return ORNEK;

  const bas = yerelIso(new Date(yil, ay, 1));
  const son = yerelIso(new Date(yil, ay + 1, 0));
  const { data, error } = await supabase
    .from('reservations')
    .select('id, code, customer_name, customer_phone, date, slot, organization_type, guest_count, total_amount, status, halls(name)')
    .gte('date', bas).lte('date', son)
    .order('date', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => esle(r as unknown as SatirDb, {}, 0));
}

async function tahsilatToplamlari(kimlikler: string[]): Promise<Record<string, number>> {
  if (!supabase || kimlikler.length === 0) return {};
  const { data } = await supabase
    .from('payments').select('reservation_id, amount').in('reservation_id', kimlikler);
  const toplam: Record<string, number> = {};
  for (const s of data ?? []) {
    const satir = s as unknown as { reservation_id: string; amount: number };
    toplam[satir.reservation_id] = (toplam[satir.reservation_id] ?? 0) + satir.amount;
  }
  return toplam;
}

export async function rezervasyon(id: string): Promise<Rezervasyon | null> {
  if (!yapilandirildi || !supabase) return ORNEK.find((r) => r.id === id) ?? null;
  const { data, error } = await supabase
    .from('reservations')
    .select('id, code, customer_name, customer_phone, date, slot, organization_type, guest_count, total_amount, status, halls(name)')
    .eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const t = await tahsilatToplamlari([id]);
  return esle(data as unknown as SatirDb, {}, t[id] ?? 0);
}

export async function tahsilatlar(rezervasyonId: string): Promise<Tahsilat[]> {
  if (!yapilandirildi || !supabase) {
    const r = ORNEK.find((x) => x.id === rezervasyonId);
    return r ? ornekTahsilatlar(r) : [];
  }
  const { data, error } = await supabase
    .from('payments').select('id, paid_at, amount, method, note')
    .eq('reservation_id', rezervasyonId).order('paid_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((s) => {
    const p = s as unknown as { id: string; paid_at: string; amount: number; method: string; note: string | null };
    return { id: p.id, tarih: p.paid_at, tutar: p.amount, sekil: p.method, aciklama: p.note ?? '' };
  });
}

export async function tahsilatEkle(
  rezervasyonId: string, tutar: number, sekil: string, aciklama: string,
): Promise<void> {
  if (!yapilandirildi || !supabase) return;
  const { error } = await supabase.from('payments').insert({
    reservation_id: rezervasyonId, amount: tutar, method: sekil,
    note: aciklama || null, paid_at: bugunIso(),
  });
  if (error) throw new Error(error.message);
}

export async function isEmri(rezervasyonId: string): Promise<IsSatiri[]> {
  if (!yapilandirildi || !supabase) return ORNEK_IS;
  const { data, error } = await supabase
    .from('work_orders').select('id, at_time, task, owner, done')
    .eq('reservation_id', rezervasyonId).order('at_time', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((s) => {
    const i = s as unknown as { id: string; at_time: string; task: string; owner: string | null; done: boolean };
    return { id: i.id, saat: (i.at_time ?? '').slice(0, 5), is: i.task, sorumlu: i.owner ?? '', tamam: i.done };
  });
}

export async function isDurumu(id: string, tamam: boolean): Promise<void> {
  if (!yapilandirildi || !supabase) return;
  const { error } = await supabase.from('work_orders').update({ done: tamam }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function kasaOzeti(): Promise<KasaOzet> {
  if (!yapilandirildi || !supabase) {
    const alacak = ORNEK.reduce((t, r) => t + (r.toplam - r.tahsilat), 0);
    return { gelir: 46_750_000, gider: 8_700_000, bakiye: 38_050_000, alacak };
  }
  const { data, error } = await supabase.from('cash_entries').select('kind, amount');
  if (error) throw new Error(error.message);
  let gelir = 0, gider = 0;
  for (const s of data ?? []) {
    const k = s as unknown as { kind: string; amount: number };
    if (k.kind === 'Gelir') gelir += k.amount; else gider += k.amount;
  }
  const { data: rez } = await supabase.from('reservations').select('id, total_amount');
  const kimlikler = (rez ?? []).map((r) => (r as unknown as { id: string }).id);
  const t = await tahsilatToplamlari(kimlikler);
  const alacak = (rez ?? []).reduce((toplam, r) => {
    const x = r as unknown as { id: string; total_amount: number };
    return toplam + Math.max(0, x.total_amount - (t[x.id] ?? 0));
  }, 0);
  return { gelir, gider, bakiye: gelir - gider, alacak };
}
