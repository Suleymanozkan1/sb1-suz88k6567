/**
 * Veri katmanı, sunucu kipi.
 *
 * Tanıtım testleri örnek verinin tutarlılığına bakıyor; burada gerçek
 * sorgular çalıştırılıyor. Kritik nokta, veritabanı sütunları
 * (snake_case) ile ekranın beklediği alanlar arasındaki eşleme: kapora
 * hatası tam olarak bu katmandan çıkmıştı ve mobil ekran aynı kayıt için
 * web panelinden farklı bir rakam gösteriyordu.
 *
 * Taklit istemci çağrıları kaydediyor; testler hem hangi tabloya ne
 * sorulduğunu hem de dönen satırın nasıl çevrildiğini doğruluyor.
 */
interface Cagri { tablo: string; islemler: { ad: string; arg: unknown[] }[] }

const durum = {
  cagrilar: [] as Cagri[],
  rpcler: [] as { ad: string; arg: unknown }[],
  /** Tablo adına göre dönecek satırlar */
  satirlar: {} as Record<string, unknown>,
  /** Tablo adına göre dönecek hata */
  hatalar: {} as Record<string, { message: string }>,
  rpcYanit: null as unknown,
};

function tekSatir(tablo: string) {
  const veri = durum.satirlar[tablo];
  return Promise.resolve({
    data: Array.isArray(veri) ? (veri[0] ?? null) : (veri ?? null),
    error: durum.hatalar[tablo] ?? null,
  });
}

function kurucu(tablo: string) {
  const cagri: Cagri = { tablo, islemler: [] };
  durum.cagrilar.push(cagri);

  const zincir = ['select', 'eq', 'gte', 'lte', 'in', 'order', 'limit', 'insert', 'update'];
  const nesne: Record<string, unknown> = {
    then(coz: (y: { data: unknown; error: unknown }) => unknown) {
      return Promise.resolve({
        data: durum.satirlar[tablo] ?? [],
        error: durum.hatalar[tablo] ?? null,
      }).then(coz);
    },
    // İkisi de tek satır döndürür; taklit ilk satırı verir.
    single: () => tekSatir(tablo),
    maybeSingle: () => tekSatir(tablo),
  };
  for (const ad of zincir) {
    nesne[ad] = (...arg: unknown[]) => { cagri.islemler.push({ ad, arg }); return nesne; };
  }
  return nesne;
}

const istemci = {
  from: (tablo: string) => kurucu(tablo),
  rpc: (ad: string, arg: unknown) => {
    durum.rpcler.push({ ad, arg });
    return Promise.resolve({ data: durum.rpcYanit, error: null });
  },
};

jest.mock('../src/supabase', () => ({
  get supabase() { return istemci; },
  yapilandirildi: true,
  SUPABASE_URL: 'https://ornek.supabase.co',
  SUPABASE_ANON: 'anon',
  API_KOK: 'https://sahratakip.com',
}));

import * as veri from '../src/veri';

beforeEach(() => {
  durum.cagrilar = [];
  durum.rpcler = [];
  durum.satirlar = {};
  durum.hatalar = {};
  durum.rpcYanit = null;
});

function cagri(tablo: string, sira = 0): Cagri {
  return durum.cagrilar.filter((c) => c.tablo === tablo)[sira];
}

function islem(c: Cagri, ad: string) {
  return c.islemler.find((i) => i.ad === ad);
}

const REZ_SATIRI = {
  id: 'r1', code: 'SA-2026-0001', customer_name: 'Ayşe Yılmaz',
  customer_phone: '5321112233', date: '2026-09-12', slot: 'Gece',
  organization_type: 'Düğün', guest_count: 300, total_amount: 25_000_000,
  deposit: 6_000_000, status: 'Kesin Rezervasyon', halls: { name: 'Kristal Salon' },
};

describe('sunucu kipi', () => {
  it('yapılandırma varsa tanıtım kipinde değildir', () => {
    expect(veri.tanitim).toBe(false);
  });
});

describe('rezervasyon eşlemesi', () => {
  it('satırı ekranın beklediği alanlara çevirir', async () => {
    durum.satirlar.reservations = [REZ_SATIRI];

    const [r] = await veri.tumKayitlar();

    expect(r).toEqual({
      id: 'r1', kod: 'SA-2026-0001', musteri: 'Ayşe Yılmaz', telefon: '5321112233',
      tarih: '2026-09-12', seans: 'Gece', tur: 'Düğün', renk: '#47b2e4',
      salon: 'Kristal Salon', davetli: 300, toplam: 25_000_000,
      kapora: 6_000_000, tahsilat: 6_000_000, durum: 'Kesin Rezervasyon',
    });
  });

  it('tahsilat kaporayı ve ödemeleri birlikte toplar', async () => {
    // Yalnızca payments toplanırsa kalan tutar olduğundan yüksek çıkar ve
    // mobil ekran ile web paneli aynı kayıt için farklı rakam gösterir.
    durum.satirlar.reservations = [REZ_SATIRI];
    durum.satirlar.payments = [
      { reservation_id: 'r1', amount: 2_000_000 },
      { reservation_id: 'r1', amount: 1_000_000 },
    ];

    const [r] = await veri.tumKayitlar();

    expect(r.kapora).toBe(6_000_000);
    expect(r.tahsilat).toBe(9_000_000);
  });

  it('başka rezervasyonun ödemesini karıştırmaz', async () => {
    durum.satirlar.reservations = [REZ_SATIRI, { ...REZ_SATIRI, id: 'r2', deposit: 0 }];
    durum.satirlar.payments = [
      { reservation_id: 'r1', amount: 2_000_000 },
      { reservation_id: 'r2', amount: 5_000_000 },
    ];

    const [ilk, ikinci] = await veri.tumKayitlar();

    expect(ilk.tahsilat).toBe(8_000_000);
    expect(ikinci.tahsilat).toBe(5_000_000);
  });

  it('eksik alanlarda çökmez', async () => {
    durum.satirlar.reservations = [{ id: 'r1', code: 'X', customer_name: 'A', date: '2026-01-01' }];

    const [r] = await veri.tumKayitlar();

    expect(r).toMatchObject({
      telefon: '', salon: '-', davetli: 0, toplam: 0, kapora: 0, tahsilat: 0,
    });
  });

  it('bilinmeyen organizasyon türüne varsayılan renk verir', async () => {
    durum.satirlar.reservations = [{ ...REZ_SATIRI, organization_type: 'Balo' }];
    const [r] = await veri.tumKayitlar();
    expect(r.renk).toBe('#47b2e4');
  });

  it('yaklaşanlar bugünden itibaren süzülür ve artan sırada istenir', async () => {
    durum.satirlar.reservations = [REZ_SATIRI];
    await veri.yaklasanlar(25);

    const c = cagri('reservations');
    expect(islem(c, 'gte')?.arg[0]).toBe('date');
    expect(islem(c, 'order')?.arg).toEqual(['date', { ascending: true }]);
    expect(islem(c, 'limit')?.arg).toEqual([25]);
  });

  it('ayın kayıtları ay başı ve sonu arasında istenir', async () => {
    durum.satirlar.reservations = [];
    await veri.ayinKayitlari(2026, 8); // Eylül

    const c = cagri('reservations');
    expect(islem(c, 'gte')?.arg).toEqual(['date', '2026-09-01']);
    expect(islem(c, 'lte')?.arg).toEqual(['date', '2026-09-30']);
  });

  it('okuma hatasını anlaşılır metne çevirir', async () => {
    durum.hatalar.reservations = { message: 'permission denied' };
    await expect(veri.tumKayitlar()).rejects.toThrow('Rezervasyonlar okunamadı.');
  });

  it('tek kayıt bulunamazsa null döner', async () => {
    durum.satirlar.reservations = [];
    await expect(veri.rezervasyon('yok')).resolves.toBeNull();
  });
});

describe('tahsilat', () => {
  it('satırı çevirir ve yeniden eskiye ister', async () => {
    durum.satirlar.payments = [
      { id: 'p1', date: '2026-02-01', amount: 1_500_000, method: 'Havale/EFT', note: null },
    ];

    const [t] = await veri.tahsilatlar('r1');

    expect(t).toEqual({
      id: 'p1', tarih: '2026-02-01', tutar: 1_500_000, sekil: 'Havale/EFT', aciklama: '',
    });
    expect(islem(cagri('payments'), 'order')?.arg).toEqual(['date', { ascending: false }]);
  });

  it('eklerken sütun adlarına çevirir ve bugünün tarihini yazar', async () => {
    await veri.tahsilatEkle('r1', 500_000, 'Nakit', 'Ara ödeme');

    const govde = islem(cagri('payments'), 'insert')?.arg[0] as Record<string, unknown>;
    expect(govde).toMatchObject({
      reservation_id: 'r1', amount: 500_000, method: 'Nakit', note: 'Ara ödeme',
    });
    expect(govde.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('boş açıklamayı null yazar', async () => {
    await veri.tahsilatEkle('r1', 100, 'Nakit', '');
    const govde = islem(cagri('payments'), 'insert')?.arg[0] as Record<string, unknown>;
    expect(govde.note).toBeNull();
  });
});

describe('iş emri', () => {
  it('Postgres saatini kısaltır', async () => {
    durum.satirlar.event_tasks = [
      { id: 'g1', at_time: '19:00:00', title: 'Gelin girişi', responsible: null, done: false },
    ];

    const [s] = await veri.isEmri('r1');

    expect(s).toEqual({ id: 'g1', saat: '19:00', is: 'Gelin girişi', sorumlu: '', tamam: false });
  });

  it('durum değişikliğini yazar', async () => {
    await veri.isDurumu('g1', true);
    expect(islem(cagri('event_tasks'), 'update')?.arg[0]).toEqual({ done: true });
    expect(islem(cagri('event_tasks'), 'eq')?.arg).toEqual(['id', 'g1']);
  });
});

describe('rezervasyon ekleme', () => {
  it('salon adını kimliğe çevirip sütun adlarıyla yazar', async () => {
    // Mobil form salonu adıyla seçtiriyor; telefonda kimlik gösteren bir
    // liste kullanıcıya hiçbir şey anlatmıyor.
    durum.satirlar.halls = [{ id: 'h1' }];
    durum.satirlar.reservations = [{ id: 'yeni' }];

    const id = await veri.rezervasyonEkle({
      musteri: 'Ayşe', telefon: '5321112233', tarih: '2026-09-12', seans: 'Gece',
      tur: 'Düğün', salon: 'Kristal Salon', davetli: 300,
      toplam: 25_000_000, kapora: 6_000_000, durum: 'Kesin Rezervasyon',
    });

    expect(id).toBe('yeni');
    expect(islem(cagri('halls'), 'eq')?.arg).toEqual(['name', 'Kristal Salon']);

    const govde = islem(cagri('reservations'), 'insert')?.arg[0] as Record<string, unknown>;
    expect(govde).toMatchObject({
      hall_id: 'h1', customer_name: 'Ayşe', customer_phone: '5321112233',
      organization_type: 'Düğün', guest_count: 300,
      total_amount: 25_000_000, deposit: 6_000_000,
    });
  });

  it('salon bulunamazsa kimliği boş bırakır', async () => {
    durum.satirlar.halls = [];
    durum.satirlar.reservations = [{ id: 'yeni' }];

    await veri.rezervasyonEkle({
      musteri: 'Ayşe', telefon: '5321112233', tarih: '2026-09-12', seans: 'Gece',
      tur: 'Düğün', salon: 'Olmayan Salon', davetli: 100,
      toplam: 1000, kapora: 0, durum: 'Ön Rezervasyon',
    });

    const govde = islem(cagri('reservations'), 'insert')?.arg[0] as Record<string, unknown>;
    expect(govde.hall_id).toBeNull();
  });
});

describe('masa düzeni', () => {
  it('satırı çevirir ve masa numarasına göre ister', async () => {
    durum.satirlar.seating_tables = [
      { id: 'm1', table_no: 1, seats: 10, label: 'Gelin masası' },
      { id: 'm2', table_no: 2, seats: 8, label: null },
    ];

    const liste = await veri.masalar('r1');

    expect(liste).toEqual([
      { id: 'm1', no: 1, koltuk: 10, not: 'Gelin masası' },
      { id: 'm2', no: 2, koltuk: 8, not: '' },
    ]);
    expect(islem(cagri('seating_tables'), 'order')?.arg).toEqual(['table_no']);
  });
});

describe('kasa', () => {
  it('gelir ve gideri ayrı toplar, bakiyeyi farktan çıkarır', async () => {
    durum.satirlar.cash_entries = [
      { kind: 'Gelir', amount: 10_000 },
      { kind: 'Gelir', amount: 5_000 },
      { kind: 'Gider', amount: 3_000 },
    ];
    durum.satirlar.reservations = [{ id: 'r1', total_amount: 100_000 }];
    durum.satirlar.payments = [{ reservation_id: 'r1', amount: 40_000 }];

    const ozet = await veri.kasaOzeti();

    expect(ozet.gelir).toBe(15_000);
    expect(ozet.gider).toBe(3_000);
    expect(ozet.bakiye).toBe(12_000);
    expect(ozet.alacak).toBe(60_000);
  });

  it('fazla tahsil edilmiş kayıt alacağı eksiye düşürmez', async () => {
    durum.satirlar.cash_entries = [];
    durum.satirlar.reservations = [{ id: 'r1', total_amount: 10_000 }];
    durum.satirlar.payments = [{ reservation_id: 'r1', amount: 15_000 }];

    await expect(veri.kasaOzeti()).resolves.toMatchObject({ alacak: 0 });
  });

  it('hareket satırını çevirir', async () => {
    durum.satirlar.cash_entries = [
      { id: 'k1', date: '2026-01-01', kind: 'Gider', title: 'Kira', category: null, amount: 5_000 },
    ];

    const [k] = await veri.kasaHareketleri();

    expect(k).toEqual({
      id: 'k1', tarih: '2026-01-01', tur: 'Gider', baslik: 'Kira', kategori: '', tutar: 5_000,
    });
  });

  it('kasa kaydı eklerken sütun adlarına çevirir', async () => {
    await veri.kasaEkle('Gelir', 'Salon kiralama', 'Diğer', 1_500_000);
    const govde = islem(cagri('cash_entries'), 'insert')?.arg[0] as Record<string, unknown>;
    expect(govde).toMatchObject({
      kind: 'Gelir', title: 'Salon kiralama', category: 'Diğer', amount: 1_500_000,
    });
  });
});

describe('tanımlar', () => {
  it('salon satırını çevirir', async () => {
    durum.satirlar.halls = [{ id: 'h1', name: 'Kristal', capacity: 450, is_active: true }];
    await expect(veri.salonlar()).resolves.toEqual([
      { id: 'h1', ad: 'Kristal', kapasite: 450, aktif: true, kayit: 0 },
    ]);
  });

  it('menü satırını kuruş alanıyla çevirir', async () => {
    durum.satirlar.menus = [{
      id: 'm1', name: 'Klasik', pricing: 'kisi_basi',
      price_kurus: 65_000, description: null, is_active: true,
    }];
    await expect(veri.menuler()).resolves.toEqual([
      { id: 'm1', ad: 'Klasik', fiyatTuru: 'kisi_basi', fiyat: 65_000, aciklama: '', aktif: true },
    ]);
  });

  it('tedarikçi satırını çevirir', async () => {
    durum.satirlar.vendors = [{
      id: 'v1', name: 'Ritim', category: 'Orkestra', phone: '5321110011', is_active: false,
    }];
    await expect(veri.tedarikciler()).resolves.toEqual([
      { id: 'v1', ad: 'Ritim', kategori: 'Orkestra', telefon: '5321110011', aktif: false },
    ]);
  });

  it('okuma hatalarını kendi metinleriyle bildirir', async () => {
    durum.hatalar.menus = { message: 'permission denied' };
    await expect(veri.menuler()).rejects.toThrow('Menüler okunamadı.');
  });
});

describe('fatura ve izin eşlemeleri', () => {
  it('fatura satırını çevirir, numarasızı tire ile gösterir', async () => {
    durum.satirlar.invoices = [{
      id: 'f1', invoice_no: null, buyer_name: 'Ayşe', issued_at: '2026-01-01',
      base_amount: 100, vat_amount: 20, total_amount: 120, status: 'Taslak', kind: 'e-Arşiv',
    }];

    const [f] = await veri.faturalar();

    expect(f).toEqual({
      id: 'f1', no: '-', musteri: 'Ayşe', tarih: '2026-01-01',
      matrah: 100, kdv: 20, toplam: 120, durum: 'Taslak', tur: 'e-Arşiv',
    });
  });

  it('izin satırında İYS aktarım durumunu metne çevirir', async () => {
    durum.satirlar.sms_consents = [
      { phone: '5321112233', status: 'ONAY', source: 'HS_WEB', consent_date: '2026-01-01T10:00:00Z', iys_synced_at: null },
      { phone: '5339998877', status: 'RET', source: 'IYS', consent_date: '2026-01-02T10:00:00Z', iys_synced_at: '2026-01-03' },
    ];

    const [ilk, ikinci] = await veri.izinler();

    expect(ilk).toMatchObject({ durum: 'ONAY', tarih: '2026-01-01', iysAktarim: 'Bekliyor' });
    expect(ikinci).toMatchObject({ durum: 'RET', iysAktarim: 'Aktarıldı' });
  });

  it('sms kaydında gerekçe boşsa boş metin verir', async () => {
    durum.satirlar.sms_queue = [{
      id: 's1', phone: '5321112233', body: 'metin', kind: 'Hatırlatma',
      status: 'gonderildi', category: 'islem', created_at: '2026-01-01T09:00:00Z', last_error: null,
    }];

    const [s] = await veri.smsKayitlari();

    expect(s).toEqual({
      id: 's1', telefon: '5321112233', metin: 'metin', tur: 'Hatırlatma',
      durum: 'gonderildi', sinif: 'islem', tarih: '2026-01-01', gerekce: '',
    });
  });
});

describe('şablon ve mesaj', () => {
  it('şablonları kurallarıyla birleştirir', async () => {
    durum.satirlar.message_templates = [{
      id: 't1', key: 'tarih_hatirlatma', title: 'Tarih hatırlatması',
      body: 'Sayin {musteri}', category: 'islem',
    }];
    durum.satirlar.reminder_rules = [
      { key: 'tarih_hatirlatma', enabled: true, days_before: 3, send_hour: 10 },
    ];

    const [s] = await veri.sablonlar();

    expect(s).toMatchObject({
      id: 't1', anahtar: 'tarih_hatirlatma', sinif: 'islem',
      otomatik: true, gunOnce: 3, saat: 10,
    });
  });

  it('kuralı olmayan şablonda otomatik gönderim kapalıdır', async () => {
    durum.satirlar.message_templates = [{
      id: 't1', key: 'tesekkur', title: 'Teşekkür', body: 'x', category: 'ticari',
    }];
    durum.satirlar.reminder_rules = [];

    const [s] = await veri.sablonlar();

    expect(s).toMatchObject({ otomatik: false, gunOnce: 0, saat: 10 });
  });

  it('şablon kaydında yalnızca metni günceller', async () => {
    // Sınıf (işlem/ticari) istemciden değiştirilemez; değiştirilebilseydi
    // ticari bir metin işlem bildirimi diye gönderilip İYS onayı
    // kontrolünü atlatırdı.
    await veri.sablonKaydet('t1', 'yeni metin');
    expect(islem(cagri('message_templates'), 'update')?.arg[0]).toEqual({ body: 'yeni metin' });
  });

  it('mesajı kuyruğa alır ve engellendiğinde gerekçesini verir', async () => {
    durum.rpcYanit = [{ queued: false, reason: 'iys_onayi_yok' }];

    const sonuc = await veri.mesajGonder('5321112233', 'Kampanya', 'Bilgilendirme', 'ticari', 'r1');

    expect(sonuc).toEqual({ kuyruga: false, gerekce: 'iys_onayi_yok' });
    expect(durum.rpcler[0].ad).toBe('enqueue_sms');
    expect(durum.rpcler[0].arg).toMatchObject({
      p_phone: '5321112233', p_category: 'ticari', p_reservation_id: 'r1',
    });
  });

  it('rezervasyon verilmezse null geçer', async () => {
    durum.rpcYanit = [{ queued: true, reason: '' }];
    await veri.mesajGonder('5321112233', 'metin', 'Hatırlatma', 'islem');
    expect((durum.rpcler[0].arg as { p_reservation_id: unknown }).p_reservation_id).toBeNull();
  });

  it('kuyruk yanıtı boşsa kuyruğa alınmamış sayar', async () => {
    durum.rpcYanit = null;
    await expect(veri.mesajGonder('5321112233', 'metin', 'Hatırlatma', 'islem'))
      .resolves.toEqual({ kuyruga: false, gerekce: '' });
  });
});

describe('yönetim ekranları', () => {
  it('kullanıcı rolünü Türkçeleştirir', async () => {
    durum.satirlar.profiles = [
      { id: 'u1', full_name: 'Ayşe', email: 'a@b.com', role: 'owner', is_active: true },
      { id: 'u2', full_name: 'Mert', email: 'm@b.com', role: 'staff', is_active: false },
    ];

    const [ilk, ikinci] = await veri.kullanicilar();

    expect(ilk).toMatchObject({ rol: 'Yönetici', aktif: true });
    expect(ikinci).toMatchObject({ rol: 'Personel', aktif: false });
  });

  it('denetim satırını çevirir', async () => {
    durum.satirlar.audit_log = [{
      id: 'd1', created_at: '2026-01-01T10:00:00Z', actor_name: null,
      action: 'UPDATE', table_name: 'reservations', record_label: null,
    }];

    const [d] = await veri.denetimKaydi();

    expect(d).toEqual({
      id: 'd1', tarih: '2026-01-01', kullanici: '-',
      islem: 'UPDATE', tablo: 'reservations', kayit: '',
    });
  });

  it('sistem durumunu üç sorgudan derler', async () => {
    durum.satirlar.backups = [{ created_at: '2026-01-01T02:30:00Z', status: 'basarili' }];
    durum.satirlar.sms_queue = [
      { status: 'bekliyor' }, { status: 'bekliyor' }, { status: 'basarisiz' }, { status: 'gonderildi' },
    ];
    durum.satirlar.sms_consents = [{ iys_synced_at: null }, { iys_synced_at: '2026-01-01' }];

    const d = await veri.sistemDurumu();

    expect(d).toMatchObject({
      sonYedek: '2026-01-01', yedekDurum: 'basarili',
      kuyrukBekleyen: 2, kuyrukBasarisiz: 1, iysBekleyen: 1,
    });
  });

  it('hiç yedek yoksa tire gösterir', async () => {
    durum.satirlar.backups = [];
    durum.satirlar.sms_queue = [];
    durum.satirlar.sms_consents = [];
    await expect(veri.sistemDurumu()).resolves.toMatchObject({ sonYedek: '-', yedekDurum: '-' });
  });
});
