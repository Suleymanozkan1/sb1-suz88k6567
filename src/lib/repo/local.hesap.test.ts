import { beforeEach, describe, expect, it } from 'vitest';
import { localRepo, scopeOf, setLocalSession } from './local';
import { KEYS, clearAll, read, write } from '../storage';
import { DEMO_CREDENTIALS, seedIfEmpty } from '../seed';
import { uid } from '../ids';
import { SABLON_SIRASI } from '../sablon';
import type { Business, CashFlowEntry, Payment, Reservation, SmsQueueEntry, User } from '../../types';

/** `exportData` sözleşme gereği `unknown` döner; testte tek noktada daraltılır. */
type Yedek = Record<string, unknown>;

/**
 * Yerel deponun profil, personel, işletme, silme, sağlık, dışa aktarım ve
 * hatırlatma kuralı işlevleri.
 *
 * `local.test.ts` rezervasyon ve para tarafını kapsıyor; burada kalan
 * fonksiyonlar tek tek deneniyor. Öne çıkan iki güvence: işletme silinince
 * ona bağlı kayıtların geride kalmaması (yetim kayıt raporları bozar) ve
 * dışa aktarımın başka bir hesabın verisini içermemesi.
 */
const BIZ = 'biz_test';

function makeReservation(over: Partial<Reservation> = {}): Reservation {
  const now = new Date().toISOString();
  return {
    id: uid('res'), businessId: BIZ, hallId: 'hall_test', code: 'ABC12345',
    customerName: 'Test Müşteri', customerPhone: '5321112233',
    date: '2026-09-12', slot: 'Gece', organizationType: 'Düğün',
    guestCount: 300, totalAmount: 100000, deposit: 20000, currency: 'TL',
    status: 'Kesin Rezervasyon', colorKey: 'dugun', services: [],
    createdAt: now, updatedAt: now, ...over,
  };
}

function makeUser(over: Partial<User> = {}): User {
  return {
    id: 'user_sahip', companyName: 'Test Salonu', fullName: 'Test Yetkili',
    email: 'sahip@ornek.com', password: 'sifre1234', mobile: '5321112233',
    role: 'owner', permissions: ['rezervasyon.goruntule'], city: 'Ankara',
    district: 'Çankaya', category: 'Düğün Salonu', capacity: 500, currency: 'TL',
    createdAt: new Date().toISOString(), activeBusinessId: BIZ, ...over,
  };
}

function makeBusiness(over: Partial<Business> = {}): Business {
  return {
    id: BIZ, ownerId: 'user_sahip', name: 'Test Salonu', category: 'Düğün Salonu',
    city: 'Ankara', district: 'Çankaya', phone: '3121112233', capacity: 500,
    currency: 'TL', createdAt: new Date().toISOString(), ...over,
  };
}

function testHall(businessId = BIZ) {
  write(KEYS.halls, [
    ...read<unknown[]>(KEYS.halls, []),
    {
      id: `hall_${businessId}`, businessId, name: 'Test Salonu',
      capacity: 500, note: '', isActive: true, createdAt: new Date().toISOString(),
    },
  ]);
}

beforeEach(() => { clearAll(); testHall(); });

describe('oturum ve profil', () => {
  it('setLocalSession oturumu açar ve kapatır', async () => {
    write(KEYS.users, [makeUser()]);
    setLocalSession('user_sahip');
    expect((await localRepo.getSession())?.id).toBe('user_sahip');
    setLocalSession(null);
    expect(await localRepo.getSession()).toBeNull();
  });

  it('silinmiş kullanıcının oturumu temizlenir', async () => {
    write(KEYS.users, [makeUser()]);
    setLocalSession('user_sahip');
    write(KEYS.users, []);
    expect(await localRepo.getSession()).toBeNull();
    expect(read<string | null>(KEYS.session, null)).toBeNull();
  });

  it('şifre sıfırlama demo modunda kullanılamaz', async () => {
    await expect(localRepo.requestPasswordReset('a@b.com'))
      .rejects.toThrow('yalnızca veritabanı bağlıyken');
  });

  it('profil güncellemesi kaydı değiştirir', async () => {
    write(KEYS.users, [makeUser()]);
    setLocalSession('user_sahip');

    const guncel = await localRepo.updateProfile({ fullName: 'Yeni Ad', city: 'İzmir' });

    expect(guncel.fullName).toBe('Yeni Ad');
    expect(guncel.city).toBe('İzmir');
    expect(read<User[]>(KEYS.users, [])[0].fullName).toBe('Yeni Ad');
  });

  it('oturum yokken profil güncellenemez', async () => {
    await expect(localRepo.updateProfile({ fullName: 'X' }))
      .rejects.toThrow('Oturumunuz bulunamadı.');
  });

  it('oturum yokken şifre değiştirilemez', async () => {
    await expect(localRepo.changePassword('a', 'b')).rejects.toThrow('Oturumunuz bulunamadı.');
  });
});

describe('personel', () => {
  beforeEach(() => { write(KEYS.users, [makeUser()]); });

  it('yeni personel oluşturur ve yöneticiye bağlar', async () => {
    await localRepo.saveStaff('user_sahip', {
      fullName: 'Personel Bir', email: 'personel@ornek.com', password: 'p1234',
      mobile: '5329998877', permissions: ['rezervasyon.goruntule'],
    });

    const liste = await localRepo.listStaff('user_sahip');
    expect(liste).toHaveLength(1);
    expect(liste[0].role).toBe('staff');
    expect(liste[0].ownerId).toBe('user_sahip');
    // İşletme bilgileri yöneticiden devralınır.
    expect(liste[0].companyName).toBe('Test Salonu');
    expect(liste[0].activeBusinessId).toBe(BIZ);
  });

  it('şifre verilmezse varsayılan atanır', async () => {
    await localRepo.saveStaff('user_sahip', {
      fullName: 'Personel', email: 'p@ornek.com', password: '',
      mobile: '5329998877', permissions: [],
    });
    expect((await localRepo.listStaff('user_sahip'))[0].password).toBe('personel1234');
  });

  it('güncellemede şifre boş bırakılırsa mevcut şifre korunur', async () => {
    await localRepo.saveStaff('user_sahip', {
      fullName: 'Personel', email: 'p@ornek.com', password: 'ozel-sifre',
      mobile: '5329998877', permissions: [],
    });
    const id = (await localRepo.listStaff('user_sahip'))[0].id;

    await localRepo.saveStaff('user_sahip', {
      id, fullName: 'Personel Güncel', email: 'p@ornek.com', password: '',
      mobile: '5329998877', permissions: ['kasa.goruntule'],
    });

    const guncel = (await localRepo.listStaff('user_sahip'))[0];
    expect(guncel.fullName).toBe('Personel Güncel');
    expect(guncel.password).toBe('ozel-sifre');
    expect(guncel.permissions).toEqual(['kasa.goruntule']);
  });

  it('güncellemede oluşturma tarihi korunur', async () => {
    await localRepo.saveStaff('user_sahip', {
      fullName: 'P', email: 'p@ornek.com', password: 'x', mobile: '5329998877', permissions: [],
    });
    const once = (await localRepo.listStaff('user_sahip'))[0];

    await localRepo.saveStaff('user_sahip', {
      id: once.id, fullName: 'P2', email: 'p@ornek.com', password: 'x',
      mobile: '5329998877', permissions: [],
    });

    expect((await localRepo.listStaff('user_sahip'))[0].createdAt).toBe(once.createdAt);
  });

  it('başka kullanıcının e-postasıyla personel açtırmaz', async () => {
    await expect(localRepo.saveStaff('user_sahip', {
      fullName: 'Kopya', email: 'SAHIP@ORNEK.COM', password: 'x',
      mobile: '5329998877', permissions: [],
    })).rejects.toThrow('başka bir kullanıcıya ait');
  });

  it('kendi kaydını güncellerken mükerrer saymaz', async () => {
    await localRepo.saveStaff('user_sahip', {
      fullName: 'P', email: 'p@ornek.com', password: 'x', mobile: '5329998877', permissions: [],
    });
    const id = (await localRepo.listStaff('user_sahip'))[0].id;

    await expect(localRepo.saveStaff('user_sahip', {
      id, fullName: 'P', email: 'p@ornek.com', password: 'x',
      mobile: '5329998877', permissions: [],
    })).resolves.toBeUndefined();
  });

  it('personel siler', async () => {
    await localRepo.saveStaff('user_sahip', {
      fullName: 'P', email: 'p@ornek.com', password: 'x', mobile: '5329998877', permissions: [],
    });
    const id = (await localRepo.listStaff('user_sahip'))[0].id;

    await localRepo.deleteStaff(id);

    expect(await localRepo.listStaff('user_sahip')).toHaveLength(0);
    // Yönetici hesabı silinmemeli.
    expect(read<User[]>(KEYS.users, [])).toHaveLength(1);
  });

  it('başka yöneticinin personelini listelemez', async () => {
    write(KEYS.users, [makeUser(), makeUser({ id: 'user_baska', email: 'b@ornek.com' })]);
    await localRepo.saveStaff('user_sahip', {
      fullName: 'P', email: 'p@ornek.com', password: 'x', mobile: '5329998877', permissions: [],
    });
    expect(await localRepo.listStaff('user_baska')).toHaveLength(0);
  });
});

describe('işletme silme', () => {
  it('işletmeyi ve ona bağlı tüm kayıtları siler', async () => {
    // Yetim rezervasyon ya da tahsilat kalırsa raporlar ve bakiyeler bozulur.
    write(KEYS.businesses, [makeBusiness(), makeBusiness({ id: 'biz_ikinci' })]);
    testHall('biz_ikinci');

    const kalan = makeReservation({ businessId: 'biz_ikinci', hallId: 'hall_biz_ikinci' });
    const silinen = makeReservation();
    write(KEYS.reservations, [silinen, kalan]);
    write(KEYS.payments, [
      { id: 'p1', reservationId: silinen.id, date: '2026-01-01', amount: 1000, method: 'Nakit', createdAt: '' },
      { id: 'p2', reservationId: kalan.id, date: '2026-01-01', amount: 2000, method: 'Nakit', createdAt: '' },
    ] satisfies Payment[]);
    write(KEYS.cashflow, [
      { id: 'c1', businessId: BIZ, kind: 'Gider', date: '2026-01-01', category: 'Kira', amount: 500, createdAt: '' },
      { id: 'c2', businessId: 'biz_ikinci', kind: 'Gider', date: '2026-01-01', category: 'Kira', amount: 600, createdAt: '' },
    ] satisfies CashFlowEntry[]);

    await localRepo.deleteBusiness(BIZ);

    expect(await localRepo.listBusinesses('user_sahip')).toHaveLength(1);
    expect(read<Reservation[]>(KEYS.reservations, []).map((r) => r.id)).toEqual([kalan.id]);
    expect(read<Payment[]>(KEYS.payments, []).map((p) => p.id)).toEqual(['p2']);
    expect(read<CashFlowEntry[]>(KEYS.cashflow, []).map((c) => c.id)).toEqual(['c2']);
  });

  it('kaydı olmayan işletmeyi silmek hata vermez', async () => {
    await expect(localRepo.deleteBusiness('yok')).resolves.toBeUndefined();
  });
});

describe('tahsilat ve kasa silme', () => {
  it('tahsilatı siler', async () => {
    write(KEYS.payments, [
      { id: 'p1', reservationId: 'r1', date: '2026-01-01', amount: 1000, method: 'Nakit', createdAt: '' },
      { id: 'p2', reservationId: 'r1', date: '2026-01-02', amount: 2000, method: 'Nakit', createdAt: '' },
    ] satisfies Payment[]);

    await localRepo.deletePayment('p1');

    expect(read<Payment[]>(KEYS.payments, []).map((p) => p.id)).toEqual(['p2']);
  });

  it('kasa kaydını siler', async () => {
    write(KEYS.cashflow, [
      { id: 'c1', businessId: BIZ, kind: 'Gelir', date: '2026-01-01', category: 'Kira', amount: 100, createdAt: '' },
      { id: 'c2', businessId: BIZ, kind: 'Gider', date: '2026-01-01', category: 'Kira', amount: 200, createdAt: '' },
    ] satisfies CashFlowEntry[]);

    await localRepo.deleteCashFlow('c2');

    expect(read<CashFlowEntry[]>(KEYS.cashflow, []).map((c) => c.id)).toEqual(['c1']);
  });
});

describe('denetim kaydı', () => {
  it('demo modunda boş döner', async () => {
    // Denetim kaydı veritabanı tetikleyicileriyle yazılır; tarayıcıda
    // karşılığı yoktur ve ekran bunu bildirir.
    await expect(localRepo.listAuditLog(50)).resolves.toEqual([]);
  });
});

describe('izin silme', () => {
  it('izni siler', async () => {
    await localRepo.saveConsent({ businessId: BIZ, phone: '5321112233', status: 'ONAY', source: 'HS_WEB' });
    const [kayit] = await localRepo.listConsents(BIZ);

    await localRepo.deleteConsent(kayit.id);

    expect(await localRepo.listConsents(BIZ)).toHaveLength(0);
  });
});

describe('sistem durumu', () => {
  /** Sözleşme null döndürebiliyor; demo depoda hep dolu gelir. */
  async function saglik() {
    const durum = await localRepo.getSystemHealth('user_sahip');
    if (!durum) throw new Error('Demo deposu sistem durumu döndürmedi.');
    return durum;
  }

  function kuyrukYaz(satirlar: Partial<SmsQueueEntry>[]) {
    write(KEYS.queue, satirlar.map((s, i) => ({
      id: `q${i}`, phone: '5321112233', body: 'metin', kind: 'Hatırlatma',
      category: 'islem', status: 'bekliyor', attempts: 0,
      nextAttemptAt: new Date().toISOString(), createdAt: new Date().toISOString(), ...s,
    })));
  }

  it('boş sistemde sıfır döner', async () => {
    const durum = await saglik();
    expect(durum).toMatchObject({
      kuyrukBekleyen: 0, kuyrukBasarisiz: 0, kuyrukEngellenen: 0,
      kuyrukEnEskiDakika: 0, iysAktarilmamis: 0, basarisizGiris24s: 0, sonYedek: null,
    });
  });

  it('bekleyen ve gönderilmekte olan mesajları birlikte sayar', async () => {
    kuyrukYaz([{ status: 'bekliyor' }, { status: 'gonderiliyor' }, { status: 'gonderildi' }]);
    expect((await saglik()).kuyrukBekleyen).toBe(2);
  });

  it('başarısız ve iptal edilenleri ayrı sayar', async () => {
    kuyrukYaz([{ status: 'basarisiz' }, { status: 'basarisiz' }, { status: 'iptal' }]);
    const durum = await saglik();
    expect(durum.kuyrukBasarisiz).toBe(2);
    expect(durum.kuyrukEngellenen).toBe(1);
  });

  it('en eski bekleyen mesajın yaşını dakika olarak verir', async () => {
    const doksanDakikaOnce = new Date(Date.now() - 90 * 60_000).toISOString();
    kuyrukYaz([
      { status: 'bekliyor', createdAt: doksanDakikaOnce },
      { status: 'bekliyor', createdAt: new Date().toISOString() },
    ]);
    expect((await saglik()).kuyrukEnEskiDakika).toBe(90);
  });

  it('İYS aktarılmamış izinleri sayar', async () => {
    await localRepo.saveConsent({ businessId: BIZ, phone: '5321112233', status: 'ONAY', source: 'HS_WEB' });
    expect((await saglik()).iysAktarilmamis).toBe(1);
  });
});

describe('dışa aktarım', () => {
  it('yalnızca kendi hesabının verisini içerir', async () => {
    // Yedek başka bir hesabın müşteri adını ya da telefonunu taşımamalı.
    write(KEYS.businesses, [
      makeBusiness(),
      makeBusiness({ id: 'biz_baska', ownerId: 'user_baska', name: 'Başka Salon' }),
    ]);
    testHall('biz_baska');

    const benim = makeReservation({ customerName: 'Benim Müşterim' });
    const digeri = makeReservation({
      businessId: 'biz_baska', hallId: 'hall_biz_baska',
      customerName: 'Başkasının Müşterisi', customerPhone: '5339998877',
    });
    write(KEYS.reservations, [benim, digeri]);
    write(KEYS.payments, [
      { id: 'p1', reservationId: benim.id, date: '2026-01-01', amount: 1000, method: 'Nakit', createdAt: '' },
      { id: 'p2', reservationId: digeri.id, date: '2026-01-01', amount: 2000, method: 'Nakit', createdAt: '' },
    ] satisfies Payment[]);
    write(KEYS.cashflow, [
      { id: 'c1', businessId: BIZ, kind: 'Gelir', date: '2026-01-01', category: 'Kira', amount: 10, createdAt: '' },
      { id: 'c2', businessId: 'biz_baska', kind: 'Gelir', date: '2026-01-01', category: 'Kira', amount: 20, createdAt: '' },
    ] satisfies CashFlowEntry[]);
    await localRepo.saveConsent({ businessId: BIZ, phone: '5321112233', status: 'ONAY', source: 'HS_WEB' });
    await localRepo.saveConsent({ businessId: 'biz_baska', phone: '5339998877', status: 'ONAY', source: 'HS_WEB' });

    const yedek = await localRepo.exportData('user_sahip') as Yedek;

    expect(yedek.owner_id).toBe('user_sahip');
    expect(yedek.surum).toBe(1);
    expect((yedek.isletmeler as Business[]).map((b) => b.id)).toEqual([BIZ]);
    expect((yedek.rezervasyonlar as Reservation[]).map((r) => r.id)).toEqual([benim.id]);
    expect((yedek.tahsilatlar as Payment[]).map((p) => p.id)).toEqual(['p1']);
    expect((yedek.kasa as CashFlowEntry[]).map((c) => c.id)).toEqual(['c1']);
    expect((yedek.sms_izinleri as { phone: string }[]).map((c) => c.phone)).toEqual(['5321112233']);

    const metin = JSON.stringify(yedek);
    expect(metin).not.toContain('Başkasının Müşterisi');
    expect(metin).not.toContain('5339998877');
  });

  it('hiç verisi olmayan hesapta boş bölümler döner', async () => {
    const yedek = await localRepo.exportData('user_bos') as Yedek;
    expect(yedek.isletmeler).toEqual([]);
    expect(yedek.rezervasyonlar).toEqual([]);
  });
});

describe('hatırlatma şablonları', () => {
  it('ilk açılışta varsayılan taslakları üretir ve saklar', async () => {
    const liste = await localRepo.listTemplates(BIZ);

    expect(liste.map((t) => t.key)).toEqual([...SABLON_SIRASI]);
    // İkinci çağrıda yenisi üretilmemeli.
    expect(await localRepo.listTemplates(BIZ)).toHaveLength(liste.length);
  });

  it('şablonu kaydeder ve günceller', async () => {
    const [ilk] = await localRepo.listTemplates(BIZ);
    const guncel = { ...ilk, body: 'Sayin {musteri}, yeni metin.' };

    await localRepo.saveTemplate(guncel);

    const liste = await localRepo.listTemplates(BIZ);
    expect(liste.find((t) => t.id === ilk.id)?.body).toBe('Sayin {musteri}, yeni metin.');
    expect(liste).toHaveLength(SABLON_SIRASI.length);
  });

  it('boş metni reddeder', async () => {
    const [ilk] = await localRepo.listTemplates(BIZ);
    await expect(localRepo.saveTemplate({ ...ilk, body: '   ' }))
      .rejects.toThrow('Mesaj metni boş olamaz.');
  });

  it('900 karakteri aşan metni reddeder', async () => {
    const [ilk] = await localRepo.listTemplates(BIZ);
    await expect(localRepo.saveTemplate({ ...ilk, body: 'a'.repeat(901) }))
      .rejects.toThrow('900 karakteri aşamaz');
  });

  it('başka işletmenin şablonunu göstermez', async () => {
    await localRepo.listTemplates(BIZ);
    const digeri = await localRepo.listTemplates('biz_baska');
    expect(digeri.every((t) => t.businessId === 'biz_baska')).toBe(true);
  });
});

describe('hatırlatma kuralları', () => {
  it('ilk açılışta varsayılan kuralları üretir ve saklar', async () => {
    const liste = await localRepo.listReminderRules(BIZ);

    expect(liste.length).toBeGreaterThan(0);
    expect(liste.every((r) => r.businessId === BIZ)).toBe(true);
    expect(await localRepo.listReminderRules(BIZ)).toHaveLength(liste.length);
  });

  it('kuralları şablon sırasına göre verir', async () => {
    const liste = await localRepo.listReminderRules(BIZ);
    const sira = liste.map((r) => SABLON_SIRASI.indexOf(r.key));
    expect([...sira].sort((a, b) => a - b)).toEqual(sira);
  });

  it('kuralı kaydeder', async () => {
    const [ilk] = await localRepo.listReminderRules(BIZ);

    await localRepo.saveReminderRule({ ...ilk, daysBefore: 5, sendHour: 9, enabled: false });

    const guncel = (await localRepo.listReminderRules(BIZ)).find((r) => r.id === ilk.id)!;
    expect(guncel.daysBefore).toBe(5);
    expect(guncel.sendHour).toBe(9);
    expect(guncel.enabled).toBe(false);
  });

  it('gün sayısı aralık dışındaysa reddeder', async () => {
    const [ilk] = await localRepo.listReminderRules(BIZ);
    await expect(localRepo.saveReminderRule({ ...ilk, daysBefore: 400 }))
      .rejects.toThrow('-30 ile 365 arasında');
    await expect(localRepo.saveReminderRule({ ...ilk, daysBefore: -31 }))
      .rejects.toThrow('-30 ile 365 arasında');
  });

  it('gönderim saati aralık dışındaysa reddeder', async () => {
    const [ilk] = await localRepo.listReminderRules(BIZ);
    await expect(localRepo.saveReminderRule({ ...ilk, sendHour: 24 }))
      .rejects.toThrow('0 ile 23 arasında');
    await expect(localRepo.saveReminderRule({ ...ilk, sendHour: -1 }))
      .rejects.toThrow('0 ile 23 arasında');
  });

  it('sınır değerleri kabul eder', async () => {
    const [ilk] = await localRepo.listReminderRules(BIZ);
    await expect(localRepo.saveReminderRule({ ...ilk, daysBefore: -30, sendHour: 0 }))
      .resolves.toBeTruthy();
    await expect(localRepo.saveReminderRule({ ...ilk, daysBefore: 365, sendHour: 23 }))
      .resolves.toBeTruthy();
  });
});

describe('fatura iptali ve demo gönderimi', () => {
  it('demo modunda fatura gönderilmediğini bildirir', async () => {
    const sonuc = await localRepo.sendInvoice('inv-1');
    expect(sonuc.sent).toBe(false);
    expect(sonuc.reason).toContain('Demo modunda');
  });
});

describe('demo verisiyle bütünlük', () => {
  it('tohumlanmış hesabın dışa aktarımı kendi kayıtlarını taşır', async () => {
    seedIfEmpty();
    const kullanici = await localRepo.signIn(DEMO_CREDENTIALS.email, DEMO_CREDENTIALS.password);

    const yedek = await localRepo.exportData(kullanici.id) as Yedek;

    expect((yedek.isletmeler as Business[]).length).toBeGreaterThan(0);
    expect((yedek.rezervasyonlar as Reservation[]).length).toBeGreaterThan(0);
  });
});

describe('veri sahibi kapsamı', () => {
  /**
   * Personelin verisi yoktur; bağlı olduğu yöneticinin verisini görür.
   * Kapsam yanlış hesaplanırsa personel ya hiçbir şey göremez ya da
   * başka bir hesabın kayıtlarına ulaşır.
   */
  it('yönetici kendi kimliğini kapsar', () => {
    expect(scopeOf(makeUser({ id: 'u1', role: 'owner' }))).toBe('u1');
  });

  it('personel bağlı olduğu yöneticiyi kapsar', () => {
    expect(scopeOf(makeUser({ id: 's1', role: 'staff', ownerId: 'u1' }))).toBe('u1');
  });

  it('yöneticisi belirtilmemiş personel kendi kimliğine düşer', () => {
    // Veri sızıntısı yerine hiç veri görmemek doğru davranış.
    expect(scopeOf(makeUser({ id: 's1', role: 'staff', ownerId: undefined }))).toBe('s1');
  });
});
