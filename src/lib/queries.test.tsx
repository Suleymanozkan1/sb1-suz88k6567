import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import * as sorgular from './queries';
import { repo } from './repo';
import { KEYS, clearAll, read, write } from './storage';
import { uid } from './ids';
import type { CashFlowEntry, Payment, Reservation, SmsConsent, User } from '../types';

/**
 * Veri kancaları.
 *
 * Ekranlar veriye yalnızca buradan ulaşıyor; bir kancanın yanlış işletmeyi
 * sorması ya da yazma sonrası önbelleği tazelememesi kullanıcıya eski
 * rakamı gösterir. Panelde görülen tutar ile depodakinin ayrışması tam
 * olarak böyle olur, o yüzden her kanca tek tek çalıştırılıyor.
 *
 * `useAuth` taklit ediliyor: kancaların sözleşmesi "oturumdaki kullanıcının
 * aktif işletmesi" olduğu için oturumun nasıl kurulduğu buranın konusu değil.
 */
const BIZ = 'biz_test';
const SAHIP = 'user_test';

const oturum = {
  user: null as User | null,
  ownerId: SAHIP,
};

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: oturum.user,
    ownerId: oturum.ownerId,
    loading: false,
    isDemoMode: true,
    can: () => true,
  }),
}));

function makeUser(over: Partial<User> = {}): User {
  return {
    id: SAHIP, companyName: 'Test Salonu', fullName: 'Test Yetkili',
    email: 'sahip@ornek.com', password: '', mobile: '5321112233',
    role: 'owner', permissions: [], city: 'Ankara', district: 'Çankaya',
    category: 'Düğün Salonu', capacity: 500, currency: 'TL',
    createdAt: new Date().toISOString(), activeBusinessId: BIZ, ...over,
  };
}

function makeReservation(over: Partial<Reservation> = {}): Reservation {
  const now = new Date().toISOString();
  return {
    id: uid('res'), businessId: BIZ, hallId: 'hall_test', code: 'ABC12345',
    customerName: 'Ayşe Yılmaz', customerPhone: '5321112233',
    date: '2026-09-12', slot: 'Gece', organizationType: 'Düğün',
    guestCount: 300, totalAmount: 250000, deposit: 60000, currency: 'TL',
    status: 'Kesin Rezervasyon', colorKey: 'dugun', services: [],
    createdAt: now, updatedAt: now, ...over,
  };
}

function sarmalayici() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const Sarmal = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { Sarmal, qc };
}

/** Kancayı çalıştırır ve sonucunu döndürür. */
function calistir<T>(kanca: () => T) {
  const { Sarmal, qc } = sarmalayici();
  const { result } = renderHook(kanca, { wrapper: Sarmal });
  return { result, qc };
}

/** Sorgu kancasını çalıştırıp verisini bekler. */
async function veri<T>(kanca: () => { data?: T; isSuccess: boolean; isError: boolean; error: unknown }) {
  const { result } = calistir(kanca);
  await waitFor(() => {
    if (result.current.isError) throw result.current.error;
    expect(result.current.isSuccess).toBe(true);
  });
  return result.current.data as T;
}

/** Değişiklik kancasını çalıştırıp sonucu döndürür. */
async function yaz<Girdi, Sonuc>(
  kanca: () => { mutateAsync: (girdi: Girdi) => Promise<Sonuc> },
  girdi: Girdi,
) {
  const { result, qc } = calistir(kanca);
  const sonuc = await result.current.mutateAsync(girdi);
  return { sonuc, qc };
}

/** Atama testleri için işletmeye ait bir tedarikçi açar. */
async function tedarikciEkle(id = 'v1') {
  await repo.saveVendor({
    id, businessId: BIZ, name: 'Orkestra', category: 'Orkestra / Müzik',
    phone: '5321112233', note: '', kind: 'hizmet', unitPrice: 0, boxCount: 0, unitsPerBox: 0, looseCount: 0, minCount: 0, isActive: true, createdAt: '',
  });
}

function testSalonu() {
  write(KEYS.halls, [{
    id: 'hall_test', businessId: BIZ, name: 'Test Salonu',
    capacity: 500, note: '', isActive: true, createdAt: new Date().toISOString(),
  }]);
}

beforeEach(() => {
  clearAll();
  testSalonu();
  oturum.user = makeUser();
  oturum.ownerId = SAHIP;
  write(KEYS.users, [makeUser()]);
  write(KEYS.businesses, [{
    id: BIZ, ownerId: SAHIP, name: 'Test Salonu', category: 'Düğün Salonu',
    city: 'Ankara', district: 'Çankaya', phone: '3121112233',
    capacity: 500, currency: 'TL', createdAt: new Date().toISOString(),
  }]);
});

/* ------------------------------------------------------- anahtar üretimi */

describe('sorgu anahtarları', () => {
  it('işletmeye göre ayrışır', () => {
    // Aynı anahtar iki işletme için kullanılsaydı, işletme değiştirince
    // önceki salonun rezervasyonları ekranda kalırdı.
    expect(sorgular.keys.reservations('b1')).not.toEqual(sorgular.keys.reservations('b2'));
    expect(sorgular.keys.payments('b1')).toEqual(['payments', 'b1']);
  });

  it('her varlık için ayrı ön ek kullanır', () => {
    const onEkler = [
      sorgular.keys.businesses('x')[0], sorgular.keys.reservations('x')[0],
      sorgular.keys.payments('x')[0], sorgular.keys.cashFlow('x')[0],
      sorgular.keys.invoices('x')[0], sorgular.keys.halls('x')[0],
      sorgular.keys.menus('x')[0], sorgular.keys.vendors('x')[0],
    ];
    expect(new Set(onEkler).size).toBe(onEkler.length);
  });
});

describe('useActiveBusinessId', () => {
  it('oturumdaki kullanıcının aktif işletmesini verir', () => {
    const { result } = calistir(() => sorgular.useActiveBusinessId());
    expect(result.current).toBe(BIZ);
  });

  it('oturum yoksa boş döner', () => {
    oturum.user = null;
    const { result } = calistir(() => sorgular.useActiveBusinessId());
    expect(result.current).toBe('');
  });
});

/* ------------------------------------------------------------ okuma */

describe('okuma kancaları', () => {
  it('işletmeleri sahibe göre okur', async () => {
    await expect(veri(() => sorgular.useBusinesses())).resolves.toHaveLength(1);
  });

  it('rezervasyonları aktif işletmeden okur', async () => {
    write(KEYS.reservations, [makeReservation(), makeReservation({ businessId: 'biz_baska' })]);
    const liste = await veri(() => sorgular.useReservations());
    expect(liste).toHaveLength(1);
  });

  it('tek rezervasyonu kimliğe göre okur', async () => {
    const rez = makeReservation();
    write(KEYS.reservations, [rez]);
    const bulunan = await veri(() => sorgular.useReservation(rez.id));
    expect(bulunan?.id).toBe(rez.id);
  });

  it('kimlik verilmezse rezervasyon sorgusu çalışmaz', async () => {
    const { result } = calistir(() => sorgular.useReservation(undefined));
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('tahsilatları okur', async () => {
    const rez = makeReservation();
    write(KEYS.reservations, [rez]);
    write(KEYS.payments, [
      { id: 'p1', reservationId: rez.id, date: '2026-01-01', amount: 30000, method: 'Nakit', createdAt: '' },
    ] satisfies Payment[]);
    await expect(veri(() => sorgular.usePayments())).resolves.toHaveLength(1);
  });

  it('renk ayarlarını okur', async () => {
    const ayarlar = await veri(() => sorgular.useColorSettings());
    expect(ayarlar.length).toBeGreaterThan(0);
  });

  it('kasa kayıtlarını okur', async () => {
    write(KEYS.cashflow, [
      { id: 'c1', businessId: BIZ, kind: 'Gider', date: '2026-01-01', category: 'Kira', amount: 500, createdAt: '' },
    ] satisfies CashFlowEntry[]);
    await expect(veri(() => sorgular.useCashFlow())).resolves.toHaveLength(1);
  });

  it('sms kayıtlarını okur', async () => {
    await repo.logSms({ businessId: BIZ, to: '5321112233', body: 'metin', kind: 'Rezervasyon' });
    await expect(veri(() => sorgular.useSmsLog())).resolves.toHaveLength(1);
  });

  it('izin kayıtlarını okur', async () => {
    await repo.saveConsent({ businessId: BIZ, phone: '5321112233', status: 'ONAY', source: 'HS_WEB' });
    await expect(veri(() => sorgular.useConsents())).resolves.toHaveLength(1);
  });

  it('sms kuyruğunu okur', async () => {
    await repo.enqueueSms({
      businessId: BIZ, phone: '5321112233', body: 'metin',
      kind: 'Bilgilendirme', category: 'islem',
    });
    await expect(veri(() => sorgular.useSmsQueue(10))).resolves.toHaveLength(1);
  });

  it('salonları okur', async () => {
    await expect(veri(() => sorgular.useHalls())).resolves.toHaveLength(1);
  });

  it('menüleri okur', async () => {
    await repo.saveMenu({
      id: 'm1', businessId: BIZ, name: 'Klasik', pricing: 'kisi_basi',
      priceKurus: 75000, description: '', isActive: true, createdAt: '',
    });
    await expect(veri(() => sorgular.useMenus())).resolves.toHaveLength(1);
  });

  it('masa düzenini okur', async () => {
    const rez = makeReservation();
    write(KEYS.reservations, [rez]);
    await repo.saveSeating(rez.id, [{ tableNo: 1, seats: 10, label: 'Gelin' }]);
    await expect(veri(() => sorgular.useSeating(rez.id))).resolves.toHaveLength(1);
  });

  it('şablonları okur', async () => {
    const liste = await veri(() => sorgular.useTemplates(BIZ));
    expect(liste.length).toBeGreaterThan(0);
  });

  it('hatırlatma kurallarını okur', async () => {
    const liste = await veri(() => sorgular.useReminderRules(BIZ));
    expect(liste.length).toBeGreaterThan(0);
  });

  it('iş emrini okur', async () => {
    const rez = makeReservation();
    write(KEYS.reservations, [rez]);
    await repo.saveTasks(rez.id, [
      { atTime: '18:00', title: 'Gelin girişi', responsible: 'Ali', done: false },
    ]);
    await expect(veri(() => sorgular.useTasks(rez.id))).resolves.toHaveLength(1);
  });

  it('tedarikçileri okur', async () => {
    await repo.saveVendor({
      id: 'v1', businessId: BIZ, name: 'Orkestra', category: 'Orkestra / Müzik',
      phone: '5321112233', note: '', kind: 'hizmet', unitPrice: 0, boxCount: 0, unitsPerBox: 0, looseCount: 0, minCount: 0, isActive: true, createdAt: '',
    });
    await expect(veri(() => sorgular.useVendors())).resolves.toHaveLength(1);
  });

  it('tedarikçi atamalarını okur', async () => {
    const rez = makeReservation();
    write(KEYS.reservations, [rez]);
    await tedarikciEkle();
    await repo.saveReservationVendors(rez.id, [
      { vendorId: 'v1', cost: 5000, note: '' },
    ]);
    await expect(veri(() => sorgular.useReservationVendors(rez.id))).resolves.toHaveLength(1);
  });

  it('faturaları okur', async () => {
    await repo.createInvoice({
      businessId: BIZ, kind: 'e-Arsiv', buyerKind: 'bireysel', buyerName: 'Ayşe',
      lines: [{ description: 'Salon', quantity: 1, unit: 'ADET', unitPrice: 1000, vatRate: 20 }],
    });
    await expect(veri(() => sorgular.useInvoices())).resolves.toHaveLength(1);
  });

  it('tek faturayı okur', async () => {
    const fatura = await repo.createInvoice({
      businessId: BIZ, kind: 'e-Arsiv', buyerKind: 'bireysel', buyerName: 'Ayşe',
      lines: [{ description: 'Salon', quantity: 1, unit: 'ADET', unitPrice: 1000, vatRate: 20 }],
    });
    const bulunan = await veri(() => sorgular.useInvoice(fatura.id));
    expect(bulunan?.id).toBe(fatura.id);
  });

  it('sistem durumunu okur', async () => {
    const durum = await veri(() => sorgular.useSystemHealth());
    expect(durum).toMatchObject({ kuyrukBekleyen: 0 });
  });

  it('denetim kaydını okur', async () => {
    await expect(veri(() => sorgular.useAuditLog(50))).resolves.toEqual([]);
  });

  it('personeli okur', async () => {
    await repo.saveStaff(SAHIP, {
      fullName: 'Personel', email: 'p@ornek.com', password: 'x',
      mobile: '5329998877', permissions: [],
    });
    await expect(veri(() => sorgular.useStaff())).resolves.toHaveLength(1);
  });

  it('sahip kimliği yokken sorgular çalışmaz', async () => {
    // Kimliksiz sorgu bütün hesapların verisini çekmeye kalkardı.
    oturum.ownerId = '';
    const { result } = calistir(() => sorgular.useBusinesses());
    expect(result.current.fetchStatus).toBe('idle');
  });
});

describe('useReservationsWithBalances', () => {
  it('kapora ve tahsilatları birleştirip kalan bakiyeyi verir', async () => {
    // Ekranda görülen kalan alacak ile SMS'e giden rakamın aynı olması
    // bu hesaba bağlı; kapora unutulursa kalan yüksek çıkar.
    const rez = makeReservation({ totalAmount: 250000, deposit: 60000 });
    write(KEYS.reservations, [rez]);
    write(KEYS.payments, [
      { id: 'p1', reservationId: rez.id, date: '2026-02-01', amount: 60000, method: 'Nakit', createdAt: '' },
    ] satisfies Payment[]);

    const { result } = calistir(() => sorgular.useReservationsWithBalances());
    await waitFor(() => expect(result.current.reservations).toHaveLength(1));

    expect(result.current.balance.paid(rez)).toBe(120000);
    expect(result.current.balance.remaining(rez)).toBe(130000);
    expect(result.current.balance.paymentsOf(rez.id)).toHaveLength(1);
  });

  it('tahsilatı olmayan rezervasyonda yalnızca kaporayı sayar', async () => {
    const rez = makeReservation({ totalAmount: 100000, deposit: 25000 });
    write(KEYS.reservations, [rez]);

    const { result } = calistir(() => sorgular.useReservationsWithBalances());
    await waitFor(() => expect(result.current.reservations).toHaveLength(1));

    expect(result.current.balance.paid(rez)).toBe(25000);
    expect(result.current.balance.remaining(rez)).toBe(75000);
  });

  it('renk ayarlarını da birlikte verir ve hata biriktirmez', async () => {
    write(KEYS.reservations, [makeReservation()]);
    const { result } = calistir(() => sorgular.useReservationsWithBalances());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.colors.length).toBeGreaterThan(0);
    expect(result.current.error).toBeNull();
  });
});

/* ------------------------------------------------------------- yazma */

describe('yazma kancaları', () => {
  it('rezervasyon kaydeder', async () => {
    const rez = makeReservation();
    await yaz(() => sorgular.useSaveReservation(), rez);
    expect(read<Reservation[]>(KEYS.reservations, [])).toHaveLength(1);
  });

  it('rezervasyon siler', async () => {
    const rez = makeReservation();
    write(KEYS.reservations, [rez]);
    await yaz(() => sorgular.useDeleteReservation(), rez.id);
    expect(read<Reservation[]>(KEYS.reservations, [])).toHaveLength(0);
  });

  it('tahsilat ekler ve siler', async () => {
    const rez = makeReservation();
    write(KEYS.reservations, [rez]);
    const odeme: Payment = {
      id: 'p1', reservationId: rez.id, date: '2026-01-01',
      amount: 30000, method: 'Nakit', createdAt: '',
    };

    await yaz(() => sorgular.useAddPayment(), odeme);
    expect(read<Payment[]>(KEYS.payments, [])).toHaveLength(1);

    await yaz(() => sorgular.useDeletePayment(), 'p1');
    expect(read<Payment[]>(KEYS.payments, [])).toHaveLength(0);
  });

  it('kasa kaydı ekler ve siler', async () => {
    const kayit: CashFlowEntry = {
      id: 'c1', businessId: BIZ, kind: 'Gider', date: '2026-01-01',
      category: 'Kira', amount: 500, createdAt: '',
    };

    await yaz(() => sorgular.useAddCashFlow(), kayit);
    expect(read<CashFlowEntry[]>(KEYS.cashflow, [])).toHaveLength(1);

    await yaz(() => sorgular.useDeleteCashFlow(), 'c1');
    expect(read<CashFlowEntry[]>(KEYS.cashflow, [])).toHaveLength(0);
  });

  it('renk ayarlarını kaydeder', async () => {
    await yaz(() => sorgular.useSaveColorSettings(), [
      { key: 'dugun', label: 'Düğün', color: '#123456' },
    ]);
    await expect(repo.getColorSettings(BIZ))
      .resolves.toEqual([{ key: 'dugun', label: 'Düğün', color: '#123456' }]);
  });

  it('işletme kaydeder ve siler', async () => {
    const { sonuc } = await yaz(() => sorgular.useSaveBusiness(), {
      id: 'biz_yeni', ownerId: SAHIP, name: 'İkinci Salon', category: 'Düğün Salonu',
      city: 'İzmir', district: 'Bornova', phone: '2321112233',
      capacity: 300, currency: 'TL' as const,
    });
    expect(sonuc.id).toBe('biz_yeni');

    await yaz(() => sorgular.useDeleteBusiness(), 'biz_yeni');
    await expect(repo.listBusinesses(SAHIP)).resolves.toHaveLength(1);
  });

  it('personel kaydeder ve siler', async () => {
    await yaz(() => sorgular.useSaveStaff(), {
      fullName: 'Personel', email: 'p@ornek.com', password: 'x',
      mobile: '5329998877', permissions: [],
    });
    const [personel] = await repo.listStaff(SAHIP);
    expect(personel.fullName).toBe('Personel');

    await yaz(() => sorgular.useDeleteStaff(), personel.id);
    await expect(repo.listStaff(SAHIP)).resolves.toHaveLength(0);
  });

  it('salon kaydeder ve siler', async () => {
    const { sonuc } = await yaz(() => sorgular.useSaveHall(), {
      id: 'hall_yeni', businessId: BIZ, name: 'Bahçe',
      capacity: 250, note: '', isActive: true, createdAt: '',
    });
    expect(sonuc.name).toBe('Bahçe');

    await yaz(() => sorgular.useDeleteHall(), 'hall_yeni');
    await expect(repo.listHalls(BIZ)).resolves.toHaveLength(1);
  });

  it('menü kaydeder ve siler', async () => {
    const { sonuc } = await yaz(() => sorgular.useSaveMenu(), {
      id: 'm1', businessId: BIZ, name: 'Klasik', pricing: 'kisi_basi' as const,
      priceKurus: 75000, description: '', isActive: true, createdAt: '',
    });
    expect(sonuc.priceKurus).toBe(75000);

    await yaz(() => sorgular.useDeleteMenu(), 'm1');
    await expect(repo.listMenus(BIZ)).resolves.toHaveLength(0);
  });

  it('masa düzenini kaydeder', async () => {
    const rez = makeReservation();
    write(KEYS.reservations, [rez]);

    await yaz(() => sorgular.useSaveSeating(rez.id), [
      { tableNo: 1, seats: 10, label: 'Gelin masası' },
    ]);

    await expect(repo.listSeating(rez.id)).resolves.toHaveLength(1);
  });

  it('şablon kaydeder', async () => {
    const [ilk] = await repo.listTemplates(BIZ);
    const { sonuc } = await yaz(() => sorgular.useSaveTemplate(BIZ), {
      ...ilk, body: 'Sayin {musteri}, guncel metin.',
    });
    expect(sonuc.body).toBe('Sayin {musteri}, guncel metin.');
  });

  it('hatırlatma kuralı kaydeder', async () => {
    const [ilk] = await repo.listReminderRules(BIZ);
    const { sonuc } = await yaz(() => sorgular.useSaveReminderRule(BIZ), {
      ...ilk, daysBefore: 7, sendHour: 11,
    });
    expect(sonuc).toMatchObject({ daysBefore: 7, sendHour: 11 });
  });

  it('iş emrini kaydeder', async () => {
    const rez = makeReservation();
    write(KEYS.reservations, [rez]);

    await yaz(() => sorgular.useSaveTasks(rez.id), [
      { atTime: '18:00', title: 'Gelin girişi', responsible: 'Ali', done: false },
    ]);

    await expect(repo.listTasks(rez.id)).resolves.toHaveLength(1);
  });

  it('tedarikçi kaydeder ve siler', async () => {
    const { sonuc } = await yaz(() => sorgular.useSaveVendor(), {
      id: 'v1', businessId: BIZ, name: 'Orkestra', category: 'Orkestra / Müzik',
      phone: '5321112233', note: '', kind: 'hizmet', unitPrice: 0, boxCount: 0, unitsPerBox: 0, looseCount: 0, minCount: 0, isActive: true, createdAt: '',
    });
    expect(sonuc.name).toBe('Orkestra');

    await yaz(() => sorgular.useDeleteVendor(), 'v1');
    await expect(repo.listVendors(BIZ)).resolves.toHaveLength(0);
  });

  it('tedarikçi atamalarını kaydeder', async () => {
    const rez = makeReservation();
    write(KEYS.reservations, [rez]);
    await tedarikciEkle();

    await yaz(() => sorgular.useSaveReservationVendors(rez.id), [
      { vendorId: 'v1', cost: 5000, note: 'Kurulum' },
    ]);

    await expect(repo.listReservationVendors(rez.id)).resolves.toHaveLength(1);
  });

  it('izin kaydeder ve siler', async () => {
    await yaz(() => sorgular.useSaveConsent(), {
      phone: '5321112233', status: 'ONAY' as const, source: 'HS_WEB',
    });
    const [izin] = await repo.listConsents(BIZ);
    expect(izin.status).toBe('ONAY');

    await yaz(() => sorgular.useDeleteConsent(), izin.id);
    await expect(repo.listConsents(BIZ)).resolves.toHaveLength(0);
  });
});

/* ------------------------------------------------------------- fatura */

describe('fatura kancaları', () => {
  it('faturayı aktif işletmeye bağlı olarak oluşturur', async () => {
    const { sonuc } = await yaz(() => sorgular.useCreateInvoice(), {
      kind: 'e-Arsiv' as const, buyerKind: 'bireysel' as const, buyerName: 'Ayşe',
      lines: [{ description: 'Salon', quantity: 1, unit: 'ADET', unitPrice: 25000, vatRate: 20 }],
    });

    expect(sonuc.businessId).toBe(BIZ);
    expect(sonuc.totalKurus).toBe(3_000_000);
  });

  it('demo modunda gönderim yapılmadığını bildirir', async () => {
    const { sonuc } = await yaz(() => sorgular.useSendInvoice(), 'inv-1');
    expect(sonuc.sent).toBe(false);
  });

  it('faturayı gerekçesiyle iptal eder', async () => {
    const fatura = await repo.createInvoice({
      businessId: BIZ, kind: 'e-Arsiv', buyerKind: 'bireysel', buyerName: 'Ayşe',
      lines: [{ description: 'Salon', quantity: 1, unit: 'ADET', unitPrice: 1000, vatRate: 20 }],
    });

    await yaz(() => sorgular.useCancelInvoice(), { id: fatura.id, reason: 'Müşteri vazgeçti' });

    const guncel = await repo.getInvoice(fatura.id);
    expect(guncel).toMatchObject({ status: 'iptal', cancelReason: 'Müşteri vazgeçti' });
  });
});

describe('useExportData', () => {
  it('sahip kapsamındaki veriyi üretir', async () => {
    write(KEYS.reservations, [makeReservation()]);
    const { sonuc } = await yaz(() => sorgular.useExportData(), undefined);
    expect(sonuc).toMatchObject({ owner_id: SAHIP });
  });
});

/* ---------------------------------------------------------------- sms */

describe('useSendSms', () => {
  beforeEach(() => {
    // Sağlayıcı uç noktası testte yok; SPA kabuğu döndüğü varsayılır.
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<!doctype html>', {
      headers: { 'content-type': 'text/html' },
    })));
  });

  it('işlem bildirimini kuyruğa alır ve kaydeder', async () => {
    const { sonuc } = await yaz(() => sorgular.useSendSms(), {
      to: '5321112233', body: 'Sayin Ayse, rezervasyonunuz alinmistir.',
      kind: 'Rezervasyon' as const, category: 'islem' as const,
    });

    expect(sonuc.blocked).toBe(false);
    await expect(repo.listSms(BIZ)).resolves.toHaveLength(1);
  });

  it('İYS onayı olmayan ticari iletiyi engeller ve kayıt yazmaz', async () => {
    // Onaysız ticari ileti 6563 sayılı kanuna aykırı; kuyruk kabul
    // etmediğinde gönderim de kayıt da olmamalı.
    const { sonuc } = await yaz(() => sorgular.useSendSms(), {
      to: '5321112233', body: 'Sezon fiyatlarimiz icin bizi arayin.',
      kind: 'Bilgilendirme' as const, category: 'ticari' as const,
    });

    expect(sonuc.blocked).toBe(true);
    expect(sonuc.sent).toBe(false);
    expect(sonuc.error).toBeTruthy();
    await expect(repo.listSms(BIZ)).resolves.toHaveLength(0);
  });

  it('onay varsa ticari ileti kuyruğa girer', async () => {
    await repo.saveConsent({ businessId: BIZ, phone: '5321112233', status: 'ONAY', source: 'HS_WEB' });

    const { sonuc } = await yaz(() => sorgular.useSendSms(), {
      to: '5321112233', body: 'Sezon fiyatlarimiz icin bizi arayin.',
      kind: 'Bilgilendirme' as const, category: 'ticari' as const,
    });

    expect(sonuc.blocked).toBe(false);
  });

  it('ret verilmiş numaraya ticari ileti gitmez', async () => {
    await repo.saveConsent({ businessId: BIZ, phone: '5321112233', status: 'RET', source: 'IYS' });

    const { sonuc } = await yaz(() => sorgular.useSendSms(), {
      to: '5321112233', body: 'Kampanya metni',
      kind: 'Bilgilendirme' as const, category: 'ticari' as const,
    });

    expect(sonuc.blocked).toBe(true);
  });

  it('izin durumundan bağımsız olarak işlem bildirimi engellenmez', async () => {
    await repo.saveConsent({ businessId: BIZ, phone: '5321112233', status: 'RET', source: 'IYS' });

    const { sonuc } = await yaz(() => sorgular.useSendSms(), {
      to: '5321112233', body: 'Sayin Ayse, rezervasyonunuz alinmistir.',
      kind: 'Rezervasyon' as const, category: 'islem' as const,
    });

    expect(sonuc.blocked).toBe(false);
  });
});

/* -------------------------------------------------------- tazeleme */

describe('önbellek tazeleme', () => {
  it('yazmadan sonra rezervasyon sorgusu geçersiz kılınır', async () => {
    // Tazeleme olmazsa ekranda eski liste ve eski bakiye kalırdı.
    const { Sarmal, qc } = sarmalayici();
    const gecersizKil = vi.spyOn(qc, 'invalidateQueries');

    const { result } = renderHook(() => sorgular.useSaveReservation(), { wrapper: Sarmal });
    await result.current.mutateAsync(makeReservation());

    const anahtarlar = gecersizKil.mock.calls.map(
      (c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey),
    );
    expect(anahtarlar).toContain(JSON.stringify(sorgular.keys.reservations(BIZ)));
    expect(anahtarlar).toContain(JSON.stringify(sorgular.keys.payments(BIZ)));
    expect(anahtarlar).toContain(JSON.stringify(['reservation']));
  });

  it('izin yazımından sonra izin ve kuyruk sorguları tazelenir', async () => {
    const { Sarmal, qc } = sarmalayici();
    const gecersizKil = vi.spyOn(qc, 'invalidateQueries');

    const { result } = renderHook(() => sorgular.useSaveConsent(), { wrapper: Sarmal });
    await result.current.mutateAsync({ phone: '5321112233', status: 'ONAY', source: 'HS_WEB' });

    const anahtarlar = gecersizKil.mock.calls.map(
      (c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey),
    );
    expect(anahtarlar).toContain(JSON.stringify(sorgular.keys.consents(BIZ)));
    expect(anahtarlar).toContain(JSON.stringify(sorgular.keys.smsQueue(BIZ)));
  });
});

/* ------------------------------------------------------------- tipler */

describe('tip uyumu', () => {
  it('izin kaydı beklenen alanları taşır', async () => {
    await repo.saveConsent({ businessId: BIZ, phone: '5321112233', status: 'ONAY', source: 'HS_WEB' });
    const liste = await veri(() => sorgular.useConsents());
    const izin: SmsConsent = liste[0];
    expect(izin.businessId).toBe(BIZ);
  });
});
