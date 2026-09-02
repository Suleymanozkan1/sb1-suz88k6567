/**
 * Demo modu için örnek veri.
 *
 * Yalnızca tarayıcı belleği kullanıldığında (Supabase yapılandırılmamışsa)
 * devreye girer. Gerçek veritabanına hiçbir zaman yazmaz.
 */
import { KEYS, read, write } from './storage';
import { addDays, toIso, todayIso } from './format';
import { DEFAULT_COLOR_SETTINGS, ORG_TO_COLOR_KEY, OWNER_PERMISSIONS } from '../data/constants';
import type { Business, CashFlowEntry, Payment, Reservation, User } from '../types';

export { DEFAULT_COLOR_SETTINGS, OWNER_PERMISSIONS };

export const DEMO_CREDENTIALS = { email: 'demo@duguntakip.com', password: 'demo1234' };

const DEMO_CUSTOMERS: [string, string, string][] = [
  ['Ahmet & Elif Yılmaz', '5321234567', 'Düğün'],
  ['Mehmet & Zeynep Kaya', '5339876543', 'Düğün'],
  ['Burak & Selin Demir', '5445556677', 'Nişan'],
  ['Emre Çelik', '5051112233', 'Sünnet'],
  ['Hatice Arslan', '5364445566', 'Kına'],
  ['Yusuf & Merve Aydın', '5557778899', 'Düğün'],
  ['Kerem Şahin', '5382223344', 'Doğum Günü'],
  ['Ayşe Koç', '5316667788', 'Nikah'],
  ['Volkan Öztürk', '5429998877', 'Kokteyl'],
  ['Ada Yazılım A.Ş.', '5301114455', 'Konferans'],
  ['Fatma & Ali Doğan', '5347778811', 'Düğün'],
  ['Serkan Polat', '5358889900', 'Toplantı'],
  ['Gizem & Onur Taş', '5461234599', 'Düğün'],
  ['Ceren Aksoy', '5372223311', 'Nişan'],
  ['Murat Güneş', '5384445599', 'Sünnet'],
];

/**
 * İlk açılışta demo hesabı ve örnek verileri oluşturur.
 * Bayrak kaybolsa dahi mevcut kayıtların üzerine yazmaz.
 */
export function seedIfEmpty(): void {
  if (read<boolean>(KEYS.seeded, false)) return;
  const hasData =
    read<User[]>(KEYS.users, []).length > 0 ||
    read<Business[]>(KEYS.businesses, []).length > 0 ||
    read<Reservation[]>(KEYS.reservations, []).length > 0;
  write(KEYS.seeded, true);
  if (hasData) return;

  const now = new Date().toISOString();
  const ownerId = 'user_demo';
  const businessId = 'biz_demo';

  const owner: User = {
    id: ownerId,
    companyName: 'Grand Yıldız Düğün Sarayı',
    fullName: 'Demo Kullanıcı',
    email: DEMO_CREDENTIALS.email,
    password: DEMO_CREDENTIALS.password,
    mobile: '5320001122',
    role: 'owner',
    permissions: OWNER_PERMISSIONS,
    city: 'İstanbul',
    district: 'Beylikdüzü',
    category: 'Düğün Salonu',
    capacity: 600,
    currency: 'TL',
    instagram: 'grandyildizdugun',
    createdAt: now,
    activeBusinessId: businessId,
  };

  const staff: User = {
    ...owner,
    id: 'user_staff',
    fullName: 'Ayşe Personel',
    email: 'personel@duguntakip.com',
    password: 'personel1234',
    mobile: '5320003344',
    role: 'staff',
    ownerId,
    permissions: ['rezervasyon.goruntule', 'rezervasyon.duzenle', 'rapor.goruntule'],
    instagram: undefined,
  };

  write(KEYS.users, [owner, staff]);

  write(KEYS.businesses, [
    {
      id: businessId, ownerId, name: 'Grand Yıldız Düğün Sarayı', category: 'Düğün Salonu',
      city: 'İstanbul', district: 'Beylikdüzü', phone: '5320001122', capacity: 600, currency: 'TL',
      address: 'Barış Mah. Gül Cad. No:12 Beylikdüzü / İstanbul', instagram: 'grandyildizdugun',
      about: 'Şehrin merkezinde, geniş otoparkı ve modern ses-ışık sistemleri ile hizmetinizde.',
      createdAt: now,
    },
    {
      id: 'biz_demo2', ownerId, name: 'Yıldız Kır Bahçesi', category: 'Kır Düğünü / Bahçe',
      city: 'İstanbul', district: 'Silivri', phone: '5320005566', capacity: 350, currency: 'TL',
      address: 'Selimpaşa Mah. Sahil Yolu No:44 Silivri / İstanbul',
      about: 'Havuz başı konsept düğünler ve kır düğünü organizasyonları.', createdAt: now,
    },
  ] satisfies Business[]);

  const list: Reservation[] = [];
  const paid: Payment[] = [];
  const base = new Date();
  base.setDate(1);

  DEMO_CUSTOMERS.forEach(([name, phone, org], i) => {
    const d = new Date(base);
    d.setMonth(base.getMonth() - 4 + i);
    d.setDate(5 + ((i * 7) % 22));
    const date = toIso(d);
    const total = 60000 + (i % 7) * 25000;
    const deposit = Math.round(total * (0.2 + (i % 4) * 0.1));
    const isPast = date < todayIso();
    const orgType = org as Reservation['organizationType'];

    list.push({
      id: `res_seed_${i}`,
      businessId: i % 5 === 4 ? 'biz_demo2' : businessId,
      code: `DT-${d.getFullYear()}-${1000 + i * 37}`,
      customerName: name, customerPhone: phone, customerEmail: '',
      date, slot: i % 3 === 0 ? 'Gündüz' : 'Gece',
      organizationType: orgType, guestCount: 120 + (i % 9) * 45,
      totalAmount: total, deposit, currency: 'TL',
      status: isPast ? 'Tamamlandı' : i % 6 === 5 ? 'Ön Rezervasyon' : 'Kesin Rezervasyon',
      colorKey: ORG_TO_COLOR_KEY[orgType] ?? 'diger',
      note: i % 4 === 0 ? 'Nikah masası ve sahne süslemesi dahil.' : '',
      services: ['Yemek (Açık Büfe)', 'Orkestra', 'Masa Süsleme'].slice(0, 1 + (i % 3)),
      createdAt: now, updatedAt: now,
    });

    if (isPast) {
      paid.push({
        id: `pay_seed_${i}`, reservationId: `res_seed_${i}`, date,
        amount: total - deposit, method: i % 2 === 0 ? 'Nakit' : 'Havale/EFT',
        note: 'Organizasyon günü kalan tahsilat', createdAt: now,
      });
    }
  });

  write(KEYS.reservations, list);
  write(KEYS.payments, paid);

  const flow: CashFlowEntry[] = [];
  for (let i = 0; i < 14; i += 1) {
    const d = new Date(base);
    d.setMonth(base.getMonth() - (i % 6));
    d.setDate(3 + (i % 20));
    flow.push({
      id: `cf_seed_${i}`, businessId,
      kind: i % 3 === 0 ? 'Gider' : 'Gelir',
      date: toIso(d),
      category: i % 3 === 0 ? ['Personel Maaş', 'Elektrik', 'Yemek / Catering'][i % 3] : 'Rezervasyon Tahsilatı',
      amount: i % 3 === 0 ? 12000 + i * 900 : 35000 + i * 2500,
      description: i % 3 === 0 ? 'Aylık sabit gider' : 'Organizasyon tahsilatı',
      createdAt: now,
    });
  }
  write(KEYS.cashflow, flow);

  write(KEYS.sms, [{
    id: 'sms_seed_0', businessId, to: '5321234567',
    body: 'Sayin Ahmet & Elif Yilmaz, rezervasyonunuz kayit edilmistir. Kod: DT-2026-1000',
    kind: 'Rezervasyon' as const, sentAt: addDays(todayIso(), -30) + 'T10:00:00.000Z',
  }]);
}
