import { beforeEach, describe, expect, it } from 'vitest';
import { localRepo } from './local';
import { clearAll } from '../storage';
import { seedIfEmpty, DEMO_CREDENTIALS, DEFAULT_COLOR_SETTINGS } from '../seed';
import { makeReservationCode, normalizeEmail, uid } from '../ids';
import { makeBalanceLookup, remainingBalance, totalPaid } from '../money';
import type { Reservation } from '../../types';

const BIZ = 'biz_test';

function makeReservation(over: Partial<Reservation> = {}): Reservation {
  const now = new Date().toISOString();
  return {
    id: uid('res'), businessId: BIZ, code: makeReservationCode(),
    customerName: 'Test Müşteri', customerPhone: '5321112233',
    date: '2026-09-12', slot: 'Gece', organizationType: 'Düğün',
    guestCount: 300, totalAmount: 100000, deposit: 20000, currency: 'TL',
    status: 'Kesin Rezervasyon', colorKey: 'dugun', services: [],
    createdAt: now, updatedAt: now, ...over,
  };
}

beforeEach(() => clearAll());

describe('tohumlama', () => {
  it('demo hesabı ve örnek verileri oluşturur', async () => {
    seedIfEmpty();
    const user = await localRepo.signIn(DEMO_CREDENTIALS.email, DEMO_CREDENTIALS.password);
    expect(user.companyName).toBe('Grand Yıldız Düğün Sarayı');
    expect(await localRepo.listReservations('biz_demo')).not.toHaveLength(0);
  });

  it('ikinci çağrıda veriyi çoğaltmaz', async () => {
    seedIfEmpty();
    const first = (await localRepo.listReservations('biz_demo')).length;
    seedIfEmpty();
    expect((await localRepo.listReservations('biz_demo')).length).toBe(first);
  });
});

describe('oturum', () => {
  it('hatalı şifreyi reddeder', async () => {
    seedIfEmpty();
    await expect(localRepo.signIn(DEMO_CREDENTIALS.email, 'yanlis'))
      .rejects.toThrow('E-posta veya şifreniz hatalı.');
  });

  it('kayıtlı olmayan e-postayı reddeder', async () => {
    seedIfEmpty();
    await expect(localRepo.signIn('yok@ornek.com', 'sifre123'))
      .rejects.toThrow('kayıtlı üyelik bulunamadı');
  });

  it('e-posta karşılaştırması büyük/küçük harften bağımsızdır', async () => {
    seedIfEmpty();
    const user = await localRepo.signIn(DEMO_CREDENTIALS.email.toUpperCase(), DEMO_CREDENTIALS.password);
    expect(user.email).toBe(DEMO_CREDENTIALS.email);
  });

  it('çıkış sonrası oturum kalmaz', async () => {
    seedIfEmpty();
    await localRepo.signIn(DEMO_CREDENTIALS.email, DEMO_CREDENTIALS.password);
    await localRepo.signOut();
    expect(await localRepo.getSession()).toBeNull();
  });

  it('mükerrer e-posta ile kayıt açtırmaz', async () => {
    seedIfEmpty();
    await expect(localRepo.signUp({
      email: DEMO_CREDENTIALS.email, password: 'sifre123', companyName: 'X', fullName: 'Y',
      mobile: '5321112233', city: 'Ankara', district: 'Çankaya', category: 'Düğün Salonu',
      capacity: 100, currency: 'TL',
    })).rejects.toThrow('daha önce üyelik oluşturulmuş');
  });

  it('şifre değiştirmede mevcut şifreyi doğrular', async () => {
    seedIfEmpty();
    await localRepo.signIn(DEMO_CREDENTIALS.email, DEMO_CREDENTIALS.password);
    await expect(localRepo.changePassword('yanlis', 'yenisifre'))
      .rejects.toThrow('Mevcut şifreniz hatalı.');
    await localRepo.changePassword(DEMO_CREDENTIALS.password, 'yenisifre1');
    await localRepo.signOut();
    await expect(localRepo.signIn(DEMO_CREDENTIALS.email, 'yenisifre1')).resolves.toBeTruthy();
  });
});

describe('rezervasyonlar', () => {
  it('kaydeder ve okur', async () => {
    const saved = await localRepo.saveReservation(makeReservation());
    const list = await localRepo.listReservations(BIZ);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(saved.id);
  });

  it('güncellemede kayıt çoğaltmaz', async () => {
    const saved = await localRepo.saveReservation(makeReservation());
    await localRepo.saveReservation({ ...saved, guestCount: 450 });
    const list = await localRepo.listReservations(BIZ);
    expect(list).toHaveLength(1);
    expect(list[0].guestCount).toBe(450);
  });

  it('aynı tarih ve seansta ikinci kaydı reddeder', async () => {
    await localRepo.saveReservation(makeReservation({ date: '2026-10-10', slot: 'Gece' }));
    await expect(localRepo.saveReservation(makeReservation({ date: '2026-10-10', slot: 'Gece' })))
      .rejects.toThrow('zaten bir rezervasyon kaydı var');
  });

  it('farklı seansa izin verir', async () => {
    await localRepo.saveReservation(makeReservation({ date: '2026-10-10', slot: 'Gece' }));
    await expect(localRepo.saveReservation(makeReservation({ date: '2026-10-10', slot: 'Gündüz' })))
      .resolves.toBeTruthy();
  });

  it('iptal edilmiş kaydı çakışma saymaz', async () => {
    await localRepo.saveReservation(makeReservation({ date: '2026-10-11', slot: 'Gece', status: 'İptal' }));
    await expect(localRepo.saveReservation(makeReservation({ date: '2026-10-11', slot: 'Gece' })))
      .resolves.toBeTruthy();
  });

  it('kaparo toplam tutarı aşamaz', async () => {
    await expect(localRepo.saveReservation(makeReservation({ totalAmount: 1000, deposit: 5000 })))
      .rejects.toThrow('Kaparo, toplam tutardan büyük olamaz.');
  });

  it('silindiğinde bağlı tahsilatları da siler', async () => {
    const r = await localRepo.saveReservation(makeReservation());
    await localRepo.addPayment({
      id: uid('pay'), reservationId: r.id, date: '2026-09-01', amount: 5000,
      method: 'Nakit', createdAt: '',
    });
    expect(await localRepo.listPayments(BIZ)).toHaveLength(1);
    await localRepo.deleteReservation(r.id);
    expect(await localRepo.listReservations(BIZ)).toHaveLength(0);
    expect(await localRepo.listPayments(BIZ)).toHaveLength(0);
  });
});

describe('kod doğrulama', () => {
  it('telefon numarasını maskeler ve ödeme bilgisi sızdırmaz', async () => {
    await localRepo.saveBusiness({ id: BIZ, ownerId: 'o1', name: 'Test Salonu', category: '',
      city: 'İstanbul', district: 'Kadıköy', phone: '', capacity: 0, currency: 'TL' });
    const r = await localRepo.saveReservation(makeReservation({ code: 'DT-2026-9999', customerPhone: '5321234567' }));

    const found = await localRepo.verifyCode('dt-2026-9999');
    expect(found).not.toBeNull();
    expect(found!.customerPhone).toBe('532*****67');
    expect(found!.businessName).toBe('Test Salonu');
    expect(found).not.toHaveProperty('deposit');
    expect(r.code).toBe('DT-2026-9999');
  });

  it('bulunmayan kod için null döner', async () => {
    expect(await localRepo.verifyCode('YOK-1')).toBeNull();
  });
});

describe('bakiye hesapları', () => {
  it('kaparo tek başına toplam tahsilattır', () => {
    const r = makeReservation({ totalAmount: 100000, deposit: 20000 });
    expect(totalPaid(r, [])).toBe(20000);
    expect(remainingBalance(r, [])).toBe(80000);
  });

  it('ek tahsilatları kaparoya ekler', () => {
    const r = makeReservation({ totalAmount: 100000, deposit: 20000 });
    const payments = [{ id: 'p1', reservationId: r.id, date: '2026-09-01', amount: 30000,
      method: 'Nakit' as const, createdAt: '' }];
    expect(totalPaid(r, payments)).toBe(50000);
    expect(remainingBalance(r, payments)).toBe(50000);
  });

  it('fazla tahsilatta bakiye negatife düşmez', () => {
    const r = makeReservation({ totalAmount: 100000, deposit: 20000 });
    const payments = [{ id: 'p1', reservationId: r.id, date: '2026-09-01', amount: 95000,
      method: 'Nakit' as const, createdAt: '' }];
    expect(remainingBalance(r, payments)).toBe(0);
  });

  it('çözücü doğru rezervasyona ait tahsilatları eşler', () => {
    const a = makeReservation({ id: 'ra', totalAmount: 100000, deposit: 0 });
    const b = makeReservation({ id: 'rb', totalAmount: 100000, deposit: 0 });
    const lookup = makeBalanceLookup([
      { id: 'p1', reservationId: 'ra', date: '2026-09-01', amount: 40000, method: 'Nakit', createdAt: '' },
      { id: 'p2', reservationId: 'rb', date: '2026-09-01', amount: 10000, method: 'Nakit', createdAt: '' },
    ]);
    expect(lookup.paid(a)).toBe(40000);
    expect(lookup.paid(b)).toBe(10000);
    expect(lookup.remaining(a)).toBe(60000);
  });
});

describe('renk ayarları', () => {
  it('kaydedilmemişse varsayılanları döner', async () => {
    expect(await localRepo.getColorSettings(BIZ)).toEqual(DEFAULT_COLOR_SETTINGS);
  });

  it('işletmeye özel renkleri saklar', async () => {
    await localRepo.saveColorSettings(BIZ, [{ key: 'dugun', label: 'Düğün', color: '#ff0000' }]);
    expect((await localRepo.getColorSettings(BIZ))[0].color).toBe('#ff0000');
    expect(await localRepo.getColorSettings('biz_other')).toEqual(DEFAULT_COLOR_SETTINGS);
  });
});

describe('SMS kayıtları', () => {
  it('en yeni mesajı başa alır', async () => {
    await localRepo.logSms({ businessId: BIZ, to: '5321112233', body: 'ilk', kind: 'Rezervasyon' });
    await localRepo.logSms({ businessId: BIZ, to: '5321112233', body: 'ikinci', kind: 'Hatırlatma' });
    const log = await localRepo.listSms(BIZ);
    expect(log).toHaveLength(2);
    expect(log[0].body).toBe('ikinci');
  });

  it('işletmeye göre filtreler', async () => {
    await localRepo.logSms({ businessId: 'biz_a', to: '5321112233', body: 'a', kind: 'Rezervasyon' });
    await localRepo.logSms({ businessId: 'biz_b', to: '5321112233', body: 'b', kind: 'Rezervasyon' });
    expect(await localRepo.listSms('biz_a')).toHaveLength(1);
  });
});

describe('kimlik yardımcıları', () => {
  it('rezervasyon kodu DT-YIL-NNNN biçimindedir', () => {
    expect(makeReservationCode()).toMatch(/^DT-\d{4}-\d{4}$/);
  });

  it('e-postayı locale-bağımsız normalleştirir', () => {
    expect(normalizeEmail('  DEMO@DUGUNTAKIP.COM ')).toBe('demo@duguntakip.com');
  });

  it('benzersiz kimlik üretir', () => {
    expect(new Set(Array.from({ length: 200 }, () => uid('x'))).size).toBe(200);
  });
});

describe('İYS kuralları — kuyruğa alma', () => {
  const BIZ2 = 'biz_iys';

  it('işlem bildirimi onay olmadan da kuyruğa girer (muaf)', async () => {
    const result = await localRepo.enqueueSms({
      businessId: BIZ2, phone: '5321234567',
      body: 'Rezervasyonunuz kayit edildi.', kind: 'Rezervasyon', category: 'islem',
    });
    expect(result.queued).toBe(true);
  });

  it('ticari ileti onay olmadan kuyruğa girmez', async () => {
    const result = await localRepo.enqueueSms({
      businessId: BIZ2, phone: '5321234567',
      body: 'Kampanya!', kind: 'Bilgilendirme', category: 'ticari',
    });
    expect(result.queued).toBe(false);
    expect(result.reason).toMatch(/İYS onayı bulunmuyor/);
  });

  it('engellenen ticari ileti denetlenebilir kayıt bırakır', async () => {
    await localRepo.enqueueSms({
      businessId: BIZ2, phone: '5321234567',
      body: 'Kampanya!', kind: 'Bilgilendirme', category: 'ticari',
    });
    const queue = await localRepo.listSmsQueue(BIZ2, 50);
    const blocked = queue.find((q) => q.category === 'ticari');
    expect(blocked?.status).toBe('iptal');
    expect(blocked?.lastError).toBeTruthy();
  });

  it('onay verilince ticari ileti kuyruğa girer', async () => {
    await localRepo.saveConsent({
      businessId: BIZ2, phone: '5321234567', status: 'ONAY', source: 'HS_FIZIKSEL_ORTAM',
    });
    const result = await localRepo.enqueueSms({
      businessId: BIZ2, phone: '5321234567',
      body: 'Kampanya!', kind: 'Bilgilendirme', category: 'ticari',
    });
    expect(result.queued).toBe(true);
  });

  it('ret verilince ticari ileti tekrar engellenir', async () => {
    await localRepo.saveConsent({
      businessId: BIZ2, phone: '5321234567', status: 'RET', source: 'HS_FIZIKSEL_ORTAM',
    });
    const result = await localRepo.enqueueSms({
      businessId: BIZ2, phone: '5321234567',
      body: 'Kampanya!', kind: 'Bilgilendirme', category: 'ticari',
    });
    expect(result.queued).toBe(false);
    expect(result.reason).toMatch(/reddetmiş/);
  });

  it('ret verse bile işlem bildirimi gönderilmeye devam eder (muaf)', async () => {
    await localRepo.saveConsent({
      businessId: BIZ2, phone: '5321234567', status: 'RET', source: 'HS_FIZIKSEL_ORTAM',
    });
    const result = await localRepo.enqueueSms({
      businessId: BIZ2, phone: '5321234567',
      body: 'Rezervasyon hatirlatma', kind: 'Hatırlatma', category: 'islem',
    });
    expect(result.queued).toBe(true);
  });

  it('numarayı normalize eder (0 ve +90 önekleri)', async () => {
    await localRepo.enqueueSms({
      businessId: BIZ2, phone: '+90 532 123 45 68',
      body: 'Test', kind: 'Rezervasyon', category: 'islem',
    });
    const queue = await localRepo.listSmsQueue(BIZ2, 50);
    expect(queue[0].phone).toBe('5321234568');
  });

  it('geçersiz numarayı reddeder', async () => {
    const result = await localRepo.enqueueSms({
      businessId: BIZ2, phone: '12345', body: 'Test', kind: 'Rezervasyon', category: 'islem',
    });
    expect(result.queued).toBe(false);
    expect(result.reason).toMatch(/Geçersiz/);
  });

  it('izin kaydını günceller, çoğaltmaz', async () => {
    await localRepo.saveConsent({ businessId: BIZ2, phone: '5330001122', status: 'ONAY', source: 'HS_WEB' });
    await localRepo.saveConsent({ businessId: BIZ2, phone: '5330001122', status: 'RET', source: 'HS_WEB' });
    const list = await localRepo.listConsents(BIZ2);
    const matching = list.filter((c) => c.phone === '5330001122');
    expect(matching).toHaveLength(1);
    expect(matching[0].status).toBe('RET');
  });

  it('izinler işletmeye göre ayrışır', async () => {
    await localRepo.saveConsent({ businessId: 'biz_a', phone: '5340001122', status: 'ONAY', source: 'HS_WEB' });
    expect(await localRepo.listConsents('biz_b')).toHaveLength(0);
  });
});
