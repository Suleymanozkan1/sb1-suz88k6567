import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Repository } from './types';

/**
 * Supabase deposu.
 *
 * Bu katman ince görünür ama uygulamanın en riskli yeri: veritabanı
 * sütunları (snake_case) ile arayüz alanları (camelCase) arasındaki
 * eşleme burada yapılır. Kapora hatası tam olarak böyle bir eşleme
 * boşluğundan çıkmıştı. Bu yüzden testler gerçek bir Supabase'e değil,
 * çağrıları kaydeden bir taklit istemciye bakıyor ve iki şeyi doğruluyor:
 *
 *   1. Doğru tabloya, doğru sütun adlarıyla, doğru süzgeçle gidiliyor mu?
 *   2. Dönen satır arayüzün beklediği tipe eksiksiz çevriliyor mu?
 *
 * Ayrıca veritabanı hata kodlarının (23505 çakışma, 23503 bağlı kayıt)
 * kullanıcıya anlaşılır Türkçe metne çevrildiği doğrulanıyor.
 */

interface Yanit { data?: unknown; error?: unknown }

interface Cagri {
  tablo: string;
  islemler: { ad: string; arg: unknown[] }[];
}

/** Taklit istemcinin durumu; her testte sıfırlanır. */
const durum = {
  cagrilar: [] as Cagri[],
  rpcler: [] as { ad: string; arg: unknown }[],
  auth: [] as { ad: string; arg: unknown[] }[],
  /** Tablo adına göre sırayla tüketilen yanıtlar; biterse sonuncusu tekrarlanır */
  tabloYanitlari: {} as Record<string, Yanit[]>,
  rpcYanitlari: {} as Record<string, Yanit>,
  authYanitlari: {} as Record<string, unknown>,
  /** Oturumdaki kullanıcının kimliği; null ise oturum yok. */
  kimlik: null as string | null,
};

function tabloYaniti(tablo: string): Yanit {
  const kuyruk = durum.tabloYanitlari[tablo];
  if (!kuyruk || kuyruk.length === 0) return { data: [], error: null };
  return kuyruk.length === 1 ? kuyruk[0] : kuyruk.shift()!;
}

/** Supabase sorgu kurucusunun zincirlenebilir ve beklenebilir taklidi. */
function kurucu(tablo: string) {
  const cagri: Cagri = { tablo, islemler: [] };
  durum.cagrilar.push(cagri);

  const zincir = ['select', 'eq', 'neq', 'in', 'gte', 'lte', 'order', 'limit',
    'upsert', 'insert', 'update', 'delete', 'is', 'or'];

  const nesne: Record<string, unknown> = {
    then(coz: (y: Yanit) => unknown) {
      return Promise.resolve(tabloYaniti(tablo)).then(coz);
    },
    single() { cagri.islemler.push({ ad: 'single', arg: [] }); return nesne; },
    maybeSingle() { cagri.islemler.push({ ad: 'maybeSingle', arg: [] }); return nesne; },
  };
  for (const ad of zincir) {
    nesne[ad] = (...arg: unknown[]) => { cagri.islemler.push({ ad, arg }); return nesne; };
  }
  return nesne;
}

vi.mock('../postgrest', () => ({
  postgrestIstemci: () => ({
    from: (tablo: string) => kurucu(tablo),
    rpc: (ad: string, arg: unknown) => {
      durum.rpcler.push({ ad, arg });
      return Promise.resolve(durum.rpcYanitlari[ad] ?? { data: null, error: null });
    },
  }),
}));

/*
  Oturum katmanı taklit ediliyor. Kimlik artık jetonun gövdesinden
  okunuyor; testte gerçek bir jeton üretmek yerine `durum.kimlik`
  doğrudan veriliyor.
*/
vi.mock('../oturum', () => ({
  erisimJetonu: () => (durum.kimlik ? `b.${btoa(JSON.stringify({ sub: durum.kimlik }))}.c` : null),
  oturumVarMi: () => Boolean(durum.kimlik),
  gecerliJeton: () => Promise.resolve(durum.kimlik ? 'jeton' : null),
  oturumuKaydet: (o: unknown) => { durum.auth.push({ ad: 'oturumuKaydet', arg: [o] }); },
  oturumuTemizle: () => { durum.auth.push({ ad: 'oturumuTemizle', arg: [] }); },
  cikisYap: () => { durum.auth.push({ ad: 'cikisYap', arg: [] }); return Promise.resolve(); },
}));

let repo: Repository;

beforeEach(async () => {
  durum.cagrilar = [];
  durum.rpcler = [];
  durum.auth = [];
  durum.tabloYanitlari = {};
  durum.rpcYanitlari = {};
  durum.authYanitlari = {};
  durum.kimlik = null;

  vi.stubEnv('VITE_SUPABASE_URL', 'https://ornek.supabase.co');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-anahtari');
  vi.resetModules();
  repo = (await import('./supabase')).supabaseRepo;
});

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

/** Son çağrının belirli bir tabloya gidenini bulur. */
function cagri(tablo: string, sira = 0): Cagri {
  const hepsi = durum.cagrilar.filter((c) => c.tablo === tablo);
  return hepsi[sira];
}

function islem(c: Cagri, ad: string) {
  return c.islemler.find((i) => i.ad === ad);
}

function yanitla(tablo: string, ...yanitlar: Yanit[]) {
  durum.tabloYanitlari[tablo] = yanitlar;
}

/** Kod taşımayan genel veritabanı hatası: modül kendi metnini kullanır. */
const HATA = { message: 'connection reset by peer' };

/* --------------------------------------------------------------- oturum */

describe('oturum', () => {
  it('oturum yoksa null döner ve profil sorgulamaz', async () => {
    await expect(repo.getSession()).resolves.toBeNull();
    expect(durum.cagrilar).toHaveLength(0);
  });

  it('oturum varsa profili okur', async () => {
    durum.kimlik = 'u1';
    yanitla('profiles', { data: { id: 'u1', full_name: 'Ayşe', email: 'a@b.com', role: 'owner' } });

    const kullanici = await repo.getSession();

    expect(kullanici?.id).toBe('u1');
    expect(kullanici?.fullName).toBe('Ayşe');
    // Şifre hiçbir zaman istemciye gelmez.
    expect(kullanici?.password).toBe('');
  });

  it('eksik sütunları güvenli varsayılanlara çevirir', async () => {
    durum.kimlik = 'u1';
    yanitla('profiles', { data: { id: 'u1' } });

    const kullanici = await repo.getSession();

    expect(kullanici).toMatchObject({
      companyName: '', fullName: '', email: '', mobile: '', role: 'owner',
      city: '', district: '', category: '', capacity: 0, currency: 'TL',
      activeBusinessId: '',
    });
    expect(kullanici?.permissions.length).toBeGreaterThan(0);
  });

  it('profil okunamazsa anlaşılır hata verir', async () => {
    durum.kimlik = 'u1';
    yanitla('profiles', { error: HATA });
    await expect(repo.getSession()).rejects.toThrow('Profil bilgisi alınamadı.');
  });

  it('çıkışta sunucudaki oturum da kapatılır', async () => {
    // Yalnızca yerel kayıt silinseydi, çalınan yenileme jetonu 30 gün
    // boyunca geçerli kalırdı.
    await repo.signOut();
    expect(durum.auth.some((a) => a.ad === 'cikisYap')).toBe(true);
  });
});

describe('sunucu üzerinden giriş', () => {
  function fetchYanit(secenek: { status?: number; json?: unknown; html?: boolean; atar?: boolean }) {
    vi.stubGlobal('fetch', vi.fn(async () => {
      if (secenek.atar) throw new Error('ağ yok');
      return new Response(secenek.html ? '<!doctype html>' : JSON.stringify(secenek.json ?? {}), {
        status: secenek.status ?? 200,
        headers: { 'content-type': secenek.html ? 'text/html' : 'application/json' },
      });
    }));
  }

  it('sunucudan gelen belirteçlerle oturum açar', async () => {
    fetchYanit({ json: { accessToken: 'at', refreshToken: 'rt', expiresIn: 3600 } });
    durum.kimlik = 'u1';
    yanitla('profiles', { data: { id: 'u1', email: 'a@b.com' } });

    const kullanici = await repo.signIn('a@b.com', 'sifre');

    expect(kullanici.id).toBe('u1');
    const ayar = durum.auth.find((a) => a.ad === 'oturumuKaydet');
    expect(ayar?.arg[0]).toEqual({ accessToken: 'at', refreshToken: 'rt', expiresIn: 3600 });
  });

  it('hesap kilitliyse sunucunun metnini gösterir', async () => {
    fetchYanit({ status: 423, json: { error: 'Hesabınız 5 dakika kilitlendi.', locked: true } });
    await expect(repo.signIn('a@b.com', 'x')).rejects.toThrow('Hesabınız 5 dakika kilitlendi.');
  });

  it('hız sınırı aşıldıysa bunu bildirir', async () => {
    fetchYanit({ status: 429, json: { error: 'Çok fazla istek gönderildi.' } });
    await expect(repo.signIn('a@b.com', 'x')).rejects.toThrow('Çok fazla istek gönderildi.');
  });

  it('kalan deneme hakkını hata metnine ekler', async () => {
    fetchYanit({ status: 401, json: { error: 'E-posta veya şifreniz hatalı.', remainingAttempts: 2 } });
    await expect(repo.signIn('a@b.com', 'x'))
      .rejects.toThrow('E-posta veya şifreniz hatalı. Kalan deneme hakkınız: 2.');
  });

  it('kalan hak sıfırsa metne ek yapmaz', async () => {
    fetchYanit({ status: 401, json: { error: 'E-posta veya şifreniz hatalı.', remainingAttempts: 0 } });
    await expect(repo.signIn('a@b.com', 'x')).rejects.toThrow(/hatalı\.$/);
  });

  it('uç nokta yanıt vermiyorsa GİRİŞİ REDDEDER', async () => {
    /*
      Eskiden burada doğrudan veritabanına düşülüyordu ve o yolda hesap
      kilidi ile hız sınırı hiç uygulanmıyordu. Sessizce korumasız
      çalışan bir giriş, hiç çalışmayandan kötüdür.
    */
    fetchYanit({ html: true });
    await expect(repo.signIn('a@b.com', 'sifre')).rejects.toThrow(/Giriş servisi yanıt vermiyor/);
    expect(durum.auth.some((a) => a.ad === 'oturumuKaydet')).toBe(false);
  });

  it('ağ hatasında da giriş yapılmaz', async () => {
    fetchYanit({ atar: true });
    await expect(repo.signIn('a@b.com', 'sifre')).rejects.toThrow(/Sunucuya ulaşılamadı/);
    expect(durum.auth.some((a) => a.ad === 'oturumuKaydet')).toBe(false);
  });

  it('profil bulunamazsa oturumu açık BIRAKMAZ', async () => {
    // Profili olmayan hesapla panele girmek, kullanıcıyı hiçbir şey
    // yapamadığı bir ekrana sokardı.
    fetchYanit({ json: { accessToken: 'at', refreshToken: 'rt' } });
    durum.kimlik = null;
    await expect(repo.signIn('a@b.com', 'x')).rejects.toThrow('Hesabınıza ait profil bulunamadı.');
    expect(durum.auth.some((a) => a.ad === 'oturumuTemizle')).toBe(true);
  });
});

describe('şifre işlemleri', () => {
  function sifreYanit(secenek: { status?: number; json?: unknown } = {}) {
    const cagrilar: { govde: unknown }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_u: unknown, init?: RequestInit) => {
      cagrilar.push({ govde: init?.body ? JSON.parse(String(init.body)) : undefined });
      return new Response(JSON.stringify(secenek.json ?? { ok: true }), {
        status: secenek.status ?? 200,
        headers: { 'content-type': 'application/json' },
      });
    }));
    return cagrilar;
  }

  it('şifre sıfırlama isteğini sunucuya iletir', async () => {
    const c = sifreYanit();
    await repo.requestPasswordReset('  a@b.com  ');
    expect(c[0].govde).toEqual({ islem: 'sifirla', email: 'a@b.com' });
  });

  it('şifre sıfırlama hatasını çevirir', async () => {
    sifreYanit({ status: 500, json: { error: 'Şifre sıfırlama e-postası gönderilemedi.' } });
    await expect(repo.requestPasswordReset('a@b.com'))
      .rejects.toThrow('Şifre sıfırlama e-postası gönderilemedi.');
  });

  it('şifre değiştirmeyi mevcut şifreyle birlikte sunucuya gönderir', async () => {
    // Doğrulama sunucuda yapılıyor; şifre veritabanına hiç gitmiyor.
    durum.kimlik = 'u1';
    yanitla('profiles', { data: { id: 'u1', email: 'a@b.com' } });
    const c = sifreYanit();

    await repo.changePassword('eski', 'yeni');

    expect(c[0].govde).toEqual({
      islem: 'degistir', email: 'a@b.com', mevcut: 'eski', yeni: 'yeni',
    });
  });

  it('şifre değişince yerel oturum temizlenir', async () => {
    // Sunucu o kullanıcının bütün oturumlarını kapatıyor; bu cihazdaki
    // jeton da artık geçersiz.
    durum.kimlik = 'u1';
    yanitla('profiles', { data: { id: 'u1', email: 'a@b.com' } });
    sifreYanit();

    await repo.changePassword('eski', 'yeni');
    expect(durum.auth.some((a) => a.ad === 'oturumuTemizle')).toBe(true);
  });

  it('mevcut şifre yanlışsa sunucunun metnini gösterir', async () => {
    durum.kimlik = 'u1';
    yanitla('profiles', { data: { id: 'u1', email: 'a@b.com' } });
    sifreYanit({ status: 401, json: { error: 'Mevcut şifreniz hatalı.' } });

    await expect(repo.changePassword('yanlis', 'yeni')).rejects.toThrow('Mevcut şifreniz hatalı.');
    expect(durum.auth.some((a) => a.ad === 'oturumuTemizle')).toBe(false);
  });

  it('oturum yoksa şifre değiştirilemez', async () => {
    durum.kimlik = null;
    await expect(repo.changePassword('a', 'b')).rejects.toThrow('Oturumunuz bulunamadı.');
  });
});

describe('kimlik üretimi', () => {
  /*
    Ekranlar kimliği kendileri üretiyor: uid('hall') -> "hall_mtx...".
    Demo kipinde bu sorun değil (yerel depo metin kimlik kabul ediyor)
    ama veritabanındaki sütun uuid. Gönderilirse kayıt hiç açılmıyor;
    PostgREST 22P02 döndürüyor ve kullanıcı yalnızca bir hata görüyor.

    Bu yüzden uygulama gerçek veritabanına karşı hiç çalışmamıştı:
    yeni salon, menü, tedarikçi, tahsilat, kasa hareketi ve işletme
    ekleme yollarının HEPSİ bu hatayı veriyordu.
  */
  it('uuid olmayan kimliği eklemede göndermez', async () => {
    durum.kimlik = 'u1';
    yanitla('halls', { data: { id: 'uuid-den-gelen' } });

    await repo.saveHall({
      id: 'hall_mtxyuoiswgz45x', businessId: 'biz-1', name: 'Bahçe',
      capacity: 150, note: '', isActive: true,
    });

    const govde = islem(cagri('halls'), 'upsert')?.arg[0] as Record<string, unknown>;
    expect(govde).not.toHaveProperty('id');
    expect(govde.name).toBe('Bahçe');
  });

  it('veritabanından gelen uuid kimliği güncellemede gönderir', async () => {
    // Gönderilmezse upsert güncelleme yerine yeni satır açar.
    durum.kimlik = 'u1';
    yanitla('halls', { data: { id: '13f1720e-e2d0-4552-9c49-0075c3db2de6' } });

    await repo.saveHall({
      id: '13f1720e-e2d0-4552-9c49-0075c3db2de6', businessId: 'biz-1',
      name: 'Bahçe', capacity: 150, note: '', isActive: true,
    });

    const govde = islem(cagri('halls'), 'upsert')?.arg[0] as Record<string, unknown>;
    expect(govde.id).toBe('13f1720e-e2d0-4552-9c49-0075c3db2de6');
  });

  it('aynı kural menü, tedarikçi ve kasa yollarında da geçerli', async () => {
    durum.kimlik = 'u1';
    yanitla('menus', { data: { id: 'x' } });
    yanitla('vendors', { data: { id: 'x' } });
    yanitla('cash_flow', { data: { id: 'x' } });

    await repo.saveMenu({
      id: 'menu_abc', businessId: 'biz-1', name: 'Standart',
      pricing: 'kisi_basi', priceKurus: 10000, description: '',
      isActive: true, createdAt: '',
    });
    await repo.saveVendor({
      id: 'vendor_abc', businessId: 'biz-1', name: 'Orkestra',
      category: 'Orkestra', phone: '', note: '', isActive: true, createdAt: '',
    });
    await repo.addCashFlow({
      id: 'kasa_abc', businessId: 'biz-1', kind: 'Gelir', date: '2026-01-01',
      category: 'Diğer', amount: 100, description: '', reservationId: '', createdAt: '',
    });

    for (const tablo of ['menus', 'vendors', 'cash_flow']) {
      const c = cagri(tablo);
      const govde = (islem(c, 'upsert') ?? islem(c, 'insert'))?.arg[0] as Record<string, unknown>;
      expect(govde).not.toHaveProperty('id');
    }
  });
});

describe('profil güncelleme', () => {
  beforeEach(() => {
    durum.kimlik = 'u1';
    yanitla('profiles', { data: { id: 'u1', full_name: 'Yeni' } });
  });

  it('yalnızca verilen alanları sütun adlarıyla yazar', async () => {
    await repo.updateProfile({ fullName: 'Yeni', capacity: 400 });
    expect(islem(cagri('profiles'), 'update')?.arg[0]).toEqual({ full_name: 'Yeni', capacity: 400 });
  });

  it('boş bırakılan isteğe bağlı alanı null yazar', async () => {
    await repo.updateProfile({ facebook: undefined, instagram: '' });
    expect(islem(cagri('profiles'), 'update')?.arg[0]).toEqual({ instagram: '' });
  });

  it('aktif işletme değişimini yazar', async () => {
    await repo.updateProfile({ activeBusinessId: 'biz-2' });
    expect(islem(cagri('profiles'), 'update')?.arg[0]).toEqual({ active_business_id: 'biz-2' });
  });

  it('oturum yoksa güncellemez', async () => {
    durum.kimlik = null;
    await expect(repo.updateProfile({ fullName: 'X' })).rejects.toThrow('Oturumunuz bulunamadı.');
  });

  it('yazma hatasını çevirir', async () => {
    yanitla('profiles', { error: HATA });
    await expect(repo.updateProfile({ fullName: 'X' })).rejects.toThrow('Bilgileriniz kaydedilemedi.');
  });
});

/* ------------------------------------------------------------- personel */

describe('personel', () => {
  it('yöneticiye bağlı kullanıcıları listeler', async () => {
    yanitla('profiles', { data: [{ id: 's1', full_name: 'Personel', role: 'staff', owner_id: 'u1' }] });

    const liste = await repo.listStaff('u1');

    expect(liste).toHaveLength(1);
    expect(liste[0].role).toBe('staff');
    expect(islem(cagri('profiles'), 'eq')?.arg).toEqual(['owner_id', 'u1']);
  });

  it('yeni personelin panelden açılamayacağını açıklar', async () => {
    // Supabase Auth kaydı istemciden oluşturulamaz; mesaj kullanıcıya
    // nereye gideceğini söylemeli.
    await expect(repo.saveStaff('u1', {
      fullName: 'P', email: 'p@ornek.com', password: '', mobile: '5321112233', permissions: [],
    })).rejects.toThrow(/kullanici_ac/);
  });

  it('var olan personelin yetkilerini günceller', async () => {
    await repo.saveStaff('u1', {
      id: 's1', fullName: 'P', email: 'p@ornek.com', password: '',
      mobile: '5321112233', permissions: ['kasa.goruntule'],
    });

    expect(islem(cagri('profiles'), 'update')?.arg[0]).toEqual({
      full_name: 'P', mobile: '5321112233', permissions: ['kasa.goruntule'],
    });
    expect(islem(cagri('profiles'), 'eq')?.arg).toEqual(['id', 's1']);
  });

  it('personeli siler', async () => {
    await repo.deleteStaff('s1');
    expect(islem(cagri('profiles'), 'delete')).toBeDefined();
    expect(islem(cagri('profiles'), 'eq')?.arg).toEqual(['id', 's1']);
  });

  it('silme hatasını çevirir', async () => {
    yanitla('profiles', { error: HATA });
    await expect(repo.deleteStaff('s1')).rejects.toThrow('Kullanıcı silinemedi.');
  });
});

/* ------------------------------------------------------------ işletmeler */

describe('işletmeler', () => {
  it('sahibe göre listeler', async () => {
    yanitla('businesses', { data: [{ id: 'b1', owner_id: 'u1', name: 'Salon' }] });
    const liste = await repo.listBusinesses('u1');
    expect(liste[0]).toMatchObject({ id: 'b1', ownerId: 'u1', name: 'Salon', capacity: 0, currency: 'TL' });
  });

  it('kaydederken boş metin alanlarını null yazar', async () => {
    yanitla('businesses', { data: { id: 'b1', owner_id: 'u1' } });

    await repo.saveBusiness({
      id: 'b1', ownerId: 'u1', name: 'Salon', category: 'Düğün Salonu',
      city: 'Ankara', district: 'Çankaya', phone: '3121112233', capacity: 500,
      currency: 'TL', address: '', facebook: undefined, instagram: '', about: '',
    });

    expect(islem(cagri('businesses'), 'upsert')?.arg[0]).toMatchObject({
      address: null, facebook: null, instagram: null, about: null,
    });
  });

  it('işletmeyi siler', async () => {
    await repo.deleteBusiness('b1');
    expect(islem(cagri('businesses'), 'delete')).toBeDefined();
  });

  it('listeleme hatasını çevirir', async () => {
    yanitla('businesses', { error: HATA });
    await expect(repo.listBusinesses('u1')).rejects.toThrow('İşletmeler alınamadı.');
  });
});

/* --------------------------------------------------------- rezervasyon */

describe('rezervasyonlar', () => {
  const SATIR = {
    id: 'r1', business_id: 'b1', hall_id: 'h1', code: 'ABC12345',
    customer_name: 'Ayşe Yılmaz', customer_phone: '5321112233',
    date: '2026-09-12', slot: 'Gece', organization_type: 'Düğün',
    guest_count: 300, total_amount: 250000, deposit: 60000,
    currency: 'TL', status: 'Kesin Rezervasyon', color_key: 'dugun',
    services: ['Orkestra'], created_at: '2026-01-01', updated_at: '2026-01-02',
  };

  it('satırı arayüz tipine eksiksiz çevirir', async () => {
    yanitla('reservations', { data: [SATIR] });

    const [rez] = await repo.listReservations('b1');

    expect(rez).toEqual({
      id: 'r1', businessId: 'b1', hallId: 'h1', menuId: undefined, code: 'ABC12345',
      customerName: 'Ayşe Yılmaz', customerPhone: '5321112233', customerEmail: undefined,
      secondPersonName: undefined, date: '2026-09-12', slot: 'Gece',
      organizationType: 'Düğün', guestCount: 300, totalAmount: 250000, deposit: 60000,
      currency: 'TL', status: 'Kesin Rezervasyon', colorKey: 'dugun', note: undefined,
      address: undefined, services: ['Orkestra'], createdAt: '2026-01-01', updatedAt: '2026-01-02',
    });
  });

  it('kaporayı sayı olarak taşır', async () => {
    // Kapora tahsilat hesabına giriyor; metin gelirse toplama bozulur.
    yanitla('reservations', { data: [{ ...SATIR, deposit: '60000', total_amount: '250000' }] });
    const [rez] = await repo.listReservations('b1');
    expect(rez.deposit).toBe(60000);
    expect(rez.totalAmount).toBe(250000);
  });

  it('eksik sütunlarda çökmez', async () => {
    yanitla('reservations', { data: [{ id: 'r1', business_id: 'b1' }] });
    const [rez] = await repo.listReservations('b1');
    expect(rez).toMatchObject({
      hallId: '', code: '', customerName: '', guestCount: 0, totalAmount: 0,
      deposit: 0, slot: 'Gece', status: 'Kesin Rezervasyon', colorKey: 'diger', services: [],
    });
  });

  it('tek kayıt bulunamazsa null döner', async () => {
    yanitla('reservations', { data: null });
    await expect(repo.getReservation('yok')).resolves.toBeNull();
  });

  it('kaydederken sütun adlarına çevirir', async () => {
    yanitla('reservations', { data: SATIR });

    await repo.saveReservation({
      id: 'r1', businessId: 'b1', hallId: 'h1', code: 'ABC12345',
      customerName: 'Ayşe', customerPhone: '5321112233', date: '2026-09-12',
      slot: 'Gece', organizationType: 'Düğün', guestCount: 300,
      totalAmount: 250000, deposit: 60000, currency: 'TL',
      status: 'Kesin Rezervasyon', colorKey: 'dugun', services: [],
      createdAt: '', updatedAt: '', menuId: '', customerEmail: '', note: '',
    });

    const govde = islem(cagri('reservations'), 'upsert')?.arg[0] as Record<string, unknown>;
    expect(govde).toMatchObject({
      business_id: 'b1', hall_id: 'h1', customer_name: 'Ayşe',
      total_amount: 250000, deposit: 60000, organization_type: 'Düğün',
      menu_id: null, customer_email: null, note: null,
    });
  });

  it('çakışmayı (23505) anlaşılır metne çevirir', async () => {
    yanitla('reservations', { error: { code: '23505', message: 'duplicate key' } });
    await expect(repo.saveReservation({
      id: 'r1', businessId: 'b1', hallId: 'h1', code: 'X', customerName: 'A',
      customerPhone: '5321112233', date: '2026-09-12', slot: 'Gece',
      organizationType: 'Düğün', guestCount: 1, totalAmount: 0, deposit: 0,
      currency: 'TL', status: 'Kesin Rezervasyon', colorKey: 'dugun', services: [],
      createdAt: '', updatedAt: '',
    })).rejects.toThrow('Bu salonda seçilen tarih ve seans için zaten bir rezervasyon var.');
  });

  it('rezervasyonu siler', async () => {
    await repo.deleteReservation('r1');
    expect(islem(cagri('reservations'), 'delete')).toBeDefined();
  });
});

describe('kod doğrulama', () => {
  it('kodu kırpar ve RPC ile sorgular', async () => {
    durum.rpcYanitlari.verify_reservation_code = {
      data: [{
        code: 'ABC12345', customer_name: 'Ayşe', customer_phone: '532*****33',
        date: '2026-09-12', slot: 'Gece', organization_type: 'Düğün',
        guest_count: '300', total_amount: '250000', status: 'Kesin Rezervasyon',
        business_name: 'Grand Salon',
      }],
    };

    const sonuc = await repo.verifyCode('  ABC12345  ');

    expect(durum.rpcler[0]).toEqual({ ad: 'verify_reservation_code', arg: { p_code: 'ABC12345' } });
    expect(sonuc).toEqual({
      code: 'ABC12345', customerName: 'Ayşe', customerPhone: '532*****33',
      date: '2026-09-12', slot: 'Gece', organizationType: 'Düğün',
      guestCount: 300, totalAmount: 250000, status: 'Kesin Rezervasyon',
      businessName: 'Grand Salon',
    });
  });

  it('kayıt yoksa null döner', async () => {
    durum.rpcYanitlari.verify_reservation_code = { data: [] };
    await expect(repo.verifyCode('YOK')).resolves.toBeNull();
  });

  it('RPC hatasını çevirir', async () => {
    durum.rpcYanitlari.verify_reservation_code = { error: HATA };
    await expect(repo.verifyCode('X')).rejects.toThrow('Kod sorgulanamadı.');
  });
});

/* ------------------------------------------------------------ tahsilat */

describe('tahsilat ve kasa', () => {
  it('tahsilatları işletmeye göre süzer', async () => {
    yanitla('payments', { data: [{ id: 'p1', reservation_id: 'r1', amount: '5000', method: 'Nakit' }] });

    const [odeme] = await repo.listPayments('b1');

    expect(odeme).toMatchObject({ id: 'p1', reservationId: 'r1', amount: 5000, method: 'Nakit' });
    expect(islem(cagri('payments'), 'eq')?.arg).toEqual(['reservations.business_id', 'b1']);
  });

  it('tahsilat eklerken sütun adlarına çevirir', async () => {
    await repo.addPayment({
      id: 'p1', reservationId: 'r1', date: '2026-01-01', amount: 5000,
      method: 'Havale/EFT', note: '', createdAt: '',
    });
    // Kimlik GÖNDERİLMEZ: sütun uuid, ekranın ürettiği "p1" kabul edilmez.
    expect(islem(cagri('payments'), 'insert')?.arg[0]).toEqual({
      reservation_id: 'r1', date: '2026-01-01',
      amount: 5000, method: 'Havale/EFT', note: null,
    });
  });

  it('kasa kaydını sütun adlarına çevirir', async () => {
    await repo.addCashFlow({
      id: 'c1', businessId: 'b1', kind: 'Gider', date: '2026-01-01',
      category: 'Kira', amount: 1000, description: '', reservationId: '', createdAt: '',
    });
    expect(islem(cagri('cash_flow'), 'insert')?.arg[0]).toEqual({
      business_id: 'b1', kind: 'Gider', date: '2026-01-01',
      category: 'Kira', amount: 1000, description: null, reservation_id: null,
    });
  });

  it('tahsilat ve kasa silme hatalarını ayrı metinlerle çevirir', async () => {
    yanitla('payments', { error: HATA });
    await expect(repo.deletePayment('p1')).rejects.toThrow('Tahsilat silinemedi.');
    yanitla('cash_flow', { error: HATA });
    await expect(repo.deleteCashFlow('c1')).rejects.toThrow('Kayıt silinemedi.');
  });
});

/* ------------------------------------------------------------ çelik kasa */

describe('çelik kasa', () => {
  it('hareketleri işletmeye göre ve tarihe göre ister', async () => {
    await repo.listSafeMovements('b1');
    const c = cagri('safe_movements');
    expect(islem(c, 'eq')?.arg).toEqual(['business_id', 'b1']);
    expect(islem(c, 'order')?.arg).toEqual(['date', { ascending: false }]);
  });

  it('satırı ekranın beklediği alanlara çevirir', async () => {
    yanitla('safe_movements', {
      data: [{
        id: 'k1', business_id: 'b1', date: '2026-01-01', direction: 'Çıkış',
        amount: 1500.5, description: 'Bankaya yatırıldı', source_kind: 'cash_flow',
        source_id: 'c1', created_at: '2026-01-01T08:00:00Z',
      }],
    });

    const [m] = await repo.listSafeMovements('b1');

    expect(m).toEqual({
      id: 'k1', businessId: 'b1', date: '2026-01-01', direction: 'Çıkış',
      amount: 1500.5, description: 'Bankaya yatırıldı', sourceKind: 'cash_flow',
      sourceId: 'c1', createdAt: '2026-01-01T08:00:00Z',
    });
  });

  it('eksik alanları varsayılana çeker', async () => {
    yanitla('safe_movements', { data: [{ id: 'k1', business_id: 'b1' }] });
    const [m] = await repo.listSafeMovements('b1');
    expect(m).toMatchObject({ direction: 'Giriş', amount: 0, sourceKind: 'cash_flow' });
  });

  it('hareketi sütun adlarına çevirir', async () => {
    await repo.addSafeMovement({
      id: 'k1', businessId: 'b1', date: '2026-01-01', direction: 'Giriş',
      amount: 500, description: 'Gelir · Tahsilat', sourceKind: 'reservation',
      sourceId: 'kapora:r1', createdAt: '',
    });
    expect(islem(cagri('safe_movements'), 'insert')?.arg[0]).toEqual({
      business_id: 'b1', date: '2026-01-01', direction: 'Giriş',
      amount: 500, description: 'Gelir · Tahsilat', source_kind: 'reservation',
      source_id: 'kapora:r1',
    });
  });

  it('net kuralını çiğneyen hareketi veritabanının metniyle reddeder', async () => {
    // DT001: tetikleyici. Para kasadayken tekrar "ekle" çift sayım olurdu;
    // mesaj kullanıcıya ne yapması gerektiğini söylüyor, sarmalamıyoruz.
    yanitla('safe_movements', {
      error: { code: 'DT001', message: 'Bu kayıt zaten çelik kasada duruyor; önce kasadan çıkarın.' },
    });
    await expect(repo.addSafeMovement({
      id: 'k1', businessId: 'b1', date: '2026-01-01', direction: 'Giriş',
      amount: 500, description: '', sourceKind: 'cash_flow', sourceId: 'c1', createdAt: '',
    })).rejects.toThrow('Bu kayıt zaten çelik kasada duruyor; önce kasadan çıkarın.');
  });

  it('aynı anda gelen ikinci isteği düşürür', async () => {
    // 23505: (yön, sıra) benzersizliği. Tetikleyici tek başına eşzamanlı iki
    // isteği ayıramaz; ikisi de neti sıfır görür.
    yanitla('safe_movements', { error: { code: '23505', message: 'duplicate key' } });
    await expect(repo.addSafeMovement({
      id: 'k1', businessId: 'b1', date: '2026-01-01', direction: 'Giriş',
      amount: 500, description: '', sourceKind: 'cash_flow', sourceId: 'c1', createdAt: '',
    })).rejects.toThrow('Bu kayıt çelik kasaya az önce işlendi; sayfayı yenileyip bakın.');
  });

  it('diğer yazma hatalarını kendi metniyle çevirir', async () => {
    yanitla('safe_movements', { error: HATA });
    await expect(repo.addSafeMovement({
      id: 'k1', businessId: 'b1', date: '2026-01-01', direction: 'Giriş',
      amount: 500, description: '', sourceKind: 'cash_flow', sourceId: 'c1', createdAt: '',
    })).rejects.toThrow('Çelik kasa hareketi eklenemedi.');

    await expect(repo.listSafeMovements('b1')).rejects.toThrow('Çelik kasa hareketleri alınamadı.');
    await expect(repo.deleteSafeMovement('k1')).rejects.toThrow('Çelik kasa hareketi silinemedi.');
  });

  it('hareketi kimliğine göre siler', async () => {
    await repo.deleteSafeMovement('k1');
    expect(islem(cagri('safe_movements'), 'eq')?.arg).toEqual(['id', 'k1']);
  });

  it('gelir/gider kaydı silinince ona bağlı hareket de düşer', async () => {
    // Kalsaydı kasada kaynağı görünmeyen bir tutar dururdu.
    await repo.deleteCashFlow('c1');
    const c = cagri('safe_movements');
    expect(c).toBeDefined();
    expect(c!.islemler.filter((i) => i.ad === 'eq').map((i) => i.arg)).toEqual([
      ['source_kind', 'cash_flow'],
      ['source_id', 'c1'],
    ]);
  });
});

/* --------------------------------------------------------- renk ayarları */

describe('renk ayarları', () => {
  it('kayıt yoksa varsayılanı döndürür', async () => {
    yanitla('color_settings', { data: null });
    const ayarlar = await repo.getColorSettings('b1');
    expect(ayarlar.length).toBeGreaterThan(0);
  });

  it('boş dizide de varsayılana düşer', async () => {
    yanitla('color_settings', { data: { settings: [] } });
    expect((await repo.getColorSettings('b1')).length).toBeGreaterThan(0);
  });

  it('kayıtlı ayarları döndürür', async () => {
    yanitla('color_settings', { data: { settings: [{ key: 'dugun', label: 'Düğün', color: '#111111' }] } });
    await expect(repo.getColorSettings('b1'))
      .resolves.toEqual([{ key: 'dugun', label: 'Düğün', color: '#111111' }]);
  });

  it('kaydederken güncelleme zamanı yazar', async () => {
    await repo.saveColorSettings('b1', [{ key: 'dugun', label: 'Düğün', color: '#111111' }]);
    const govde = islem(cagri('color_settings'), 'upsert')?.arg[0] as Record<string, unknown>;
    expect(govde.business_id).toBe('b1');
    expect(govde.updated_at).toBeTypeOf('string');
  });
});

/* -------------------------------------------------------------- sms/izin */

describe('sms kaydı ve kuyruk', () => {
  it('sms kaydını sütun adlarıyla yazar', async () => {
    await repo.logSms({ businessId: 'b1', to: '5321112233', body: 'metin', kind: 'Rezervasyon' });
    expect(islem(cagri('sms_log'), 'insert')?.arg[0]).toEqual({
      business_id: 'b1', to: '5321112233', body: 'metin', kind: 'Rezervasyon',
    });
  });

  it('kuyruğa alma sonucunu çevirir', async () => {
    durum.rpcYanitlari.enqueue_sms = { data: [{ queued: false, reason: 'iys_onayi_yok' }] };

    const sonuc = await repo.enqueueSms({
      businessId: 'b1', phone: '5321112233', body: 'metin',
      kind: 'Bilgilendirme', category: 'ticari',
    });

    expect(sonuc).toEqual({ queued: false, reason: 'iys_onayi_yok' });
    expect(durum.rpcler[0].arg).toMatchObject({
      p_business_id: 'b1', p_phone: '5321112233', p_category: 'ticari', p_reservation_id: null,
    });
  });

  it('kuyruk satırını eksiksiz çevirir', async () => {
    yanitla('sms_queue', {
      data: [{
        id: 'q1', phone: '5321112233', body: 'metin', kind: 'Hatırlatma',
        category: 'islem', status: 'basarisiz', attempts: '3',
        next_attempt_at: '2026-01-01T10:00:00Z', last_error: 'Kontör yok',
        created_at: '2026-01-01T09:00:00Z', sent_at: null,
      }],
    });

    const [satir] = await repo.listSmsQueue('b1', 50);

    expect(satir).toEqual({
      id: 'q1', phone: '5321112233', body: 'metin', kind: 'Hatırlatma',
      category: 'islem', status: 'basarisiz', attempts: 3,
      nextAttemptAt: '2026-01-01T10:00:00Z', lastError: 'Kontör yok',
      createdAt: '2026-01-01T09:00:00Z', sentAt: undefined,
    });
    expect(islem(cagri('sms_queue'), 'limit')?.arg).toEqual([50]);
  });
});

describe('izin kayıtları', () => {
  it('izin satırını çevirir', async () => {
    yanitla('sms_consents', {
      data: [{
        id: 'i1', business_id: 'b1', phone: '5321112233', status: 'RET',
        source: 'IYS', consent_date: '2026-01-01', iys_synced_at: '2026-01-02',
        iys_error: null, note: null,
      }],
    });

    const [izin] = await repo.listConsents('b1');

    expect(izin).toEqual({
      id: 'i1', businessId: 'b1', phone: '5321112233', status: 'RET',
      source: 'IYS', consentDate: '2026-01-01', iysSyncedAt: '2026-01-02',
      iysError: undefined, note: undefined,
    });
  });

  it('izin kaydedince İYS aktarım işaretini sıfırlar', async () => {
    // Durum değiştiği için kayıt yeniden aktarılmalı; işaret sıfırlanmazsa
    // ret İYS'ye hiç gitmez.
    await repo.saveConsent({ businessId: 'b1', phone: '5321112233', status: 'RET', source: 'HS_WEB' });

    const govde = islem(cagri('sms_consents'), 'upsert')?.arg[0] as Record<string, unknown>;
    expect(govde).toMatchObject({ iys_synced_at: null, iys_error: null, status: 'RET' });
    expect(islem(cagri('sms_consents'), 'upsert')?.arg[1])
      .toEqual({ onConflict: 'business_id,phone' });
  });

  it('izni siler', async () => {
    await repo.deleteConsent('i1');
    expect(islem(cagri('sms_consents'), 'delete')).toBeDefined();
  });
});

describe('denetim kaydı', () => {
  it('satırı çevirir ve sınırı uygular', async () => {
    yanitla('audit_log', {
      data: [{
        id: '7', actor_email: 'a@b.com', action: 'DELETE', table_name: 'reservations',
        record_id: 'r1', summary: 'Rezervasyon silindi',
        changed: { status: { eski: 'Kesin Rezervasyon', yeni: 'İptal' } },
        created_at: '2026-01-01',
      }],
    });

    const [kayit] = await repo.listAuditLog(200);

    expect(kayit).toMatchObject({ id: 7, action: 'DELETE', tableName: 'reservations' });
    expect(islem(cagri('audit_log'), 'limit')?.arg).toEqual([200]);
  });

  it('eksik alanları varsayılana çeker', async () => {
    yanitla('audit_log', { data: [{ id: 1 }] });
    const [kayit] = await repo.listAuditLog(10);
    expect(kayit).toMatchObject({ actorEmail: '-', action: 'UPDATE', tableName: '' });
  });
});

/* -------------------------------------------------------------- fatura */

describe('faturalar', () => {
  it('fatura satırlarını sıraya koyar', async () => {
    yanitla('invoices', {
      data: {
        id: 'inv1', business_id: 'b1', invoice_number: 'DGT2026000000001',
        kind: 'e-Arsiv', status: 'taslak', issue_date: '2026-01-01',
        buyer_kind: 'bireysel', buyer_name: 'Ayşe',
        gross_kurus: 0, discount_kurus: 0, base_kurus: 0, vat_kurus: 0, total_kurus: 0,
        invoice_lines: [
          { line_no: 2, description: 'İkinci', quantity: 1, unit: 'ADET' },
          { line_no: 1, description: 'Birinci', quantity: 1, unit: 'ADET' },
        ],
      },
    });

    const fatura = await repo.getInvoice('inv1');

    expect(fatura?.lines?.map((l) => l.lineNo)).toEqual([1, 2]);
  });

  it('fatura yoksa null döner', async () => {
    yanitla('invoices', { data: null });
    await expect(repo.getInvoice('yok')).resolves.toBeNull();
  });

  it('oluştururken tutarları hesaplar ve numarayı RPC ile alır', async () => {
    durum.rpcYanitlari.next_invoice_number = { data: 'DGT2026000000042' };
    yanitla('invoices', { data: { id: 'inv1', business_id: 'b1', invoice_number: 'DGT2026000000042' } });

    await repo.createInvoice({
      businessId: 'b1', kind: 'e-Arsiv', buyerKind: 'bireysel', buyerName: 'Ayşe',
      lines: [{ description: 'Salon', quantity: 1, unit: 'ADET', unitPrice: 25000, vatRate: 20 }],
    });

    expect(durum.rpcler[0].arg).toEqual({ p_business_id: 'b1', p_prefix: 'DGT' });
    const govde = islem(cagri('invoices'), 'insert')?.arg[0] as Record<string, number | string>;
    expect(govde.invoice_number).toBe('DGT2026000000042');
    expect(govde.base_kurus).toBe(2_500_000);
    expect(govde.vat_kurus).toBe(500_000);
    expect(govde.total_kurus).toBe(3_000_000);

    // Satırlar da kuruş cinsine çevrilerek yazılır.
    const satirlar = islem(cagri('invoice_lines'), 'insert')?.arg[0] as Record<string, unknown>[];
    expect(satirlar[0]).toMatchObject({ invoice_id: 'inv1', line_no: 1, unit_price_kurus: 2_500_000 });
  });

  it('numara alınamazsa fatura oluşturulmaz', async () => {
    durum.rpcYanitlari.next_invoice_number = { error: HATA };
    await expect(repo.createInvoice({
      businessId: 'b1', kind: 'e-Arsiv', buyerKind: 'bireysel', buyerName: 'Ayşe',
      lines: [{ description: 'Salon', quantity: 1, unit: 'ADET', unitPrice: 100, vatRate: 20 }],
    })).rejects.toThrow('Fatura numarası alınamadı.');
    expect(durum.cagrilar.filter((c) => c.tablo === 'invoices')).toHaveLength(0);
  });

  it('iptalde gerekçe ve zaman yazar', async () => {
    await repo.cancelInvoice('inv1', 'Müşteri vazgeçti');
    const govde = islem(cagri('invoices'), 'update')?.arg[0] as Record<string, unknown>;
    expect(govde).toMatchObject({ status: 'iptal', cancel_reason: 'Müşteri vazgeçti' });
    expect(govde.cancelled_at).toBeTypeOf('string');
  });

  it('gönderim servisine ulaşılamazsa gerekçesini bildirir', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ağ yok'); }));
    await expect(repo.sendInvoice('inv1'))
      .resolves.toEqual({ sent: false, reason: 'Fatura servisine ulaşılamadı.' });
  });

  it('uç nokta yoksa yapılandırılmadığını söyler', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<!doctype html>', {
      headers: { 'content-type': 'text/html' },
    })));
    const sonuc = await repo.sendInvoice('inv1');
    expect(sonuc.sent).toBe(false);
    expect(sonuc.reason).toContain('yapılandırılmamış');
  });

  it('entegratör tanımsızsa faturanın taslak kaldığını söyler', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ reason: 'einvoice_not_configured' }),
      { headers: { 'content-type': 'application/json' } },
    )));
    const sonuc = await repo.sendInvoice('inv1');
    expect(sonuc.sent).toBe(false);
    expect(sonuc.reason).toContain('taslak olarak kaydedildi');
  });

  it('başarılı gönderimi bildirir', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ sent: 1 }), { headers: { 'content-type': 'application/json' } },
    )));
    await expect(repo.sendInvoice('inv1')).resolves.toEqual({ sent: true });
  });
});

/* -------------------------------------------------------- sistem durumu */

describe('sistem durumu ve dışa aktarım', () => {
  it('sağlık satırını çevirir', async () => {
    durum.rpcYanitlari.system_health = {
      data: {
        kuyruk_bekleyen: '4', kuyruk_basarisiz: '1', kuyruk_engellenen: '2',
        kuyruk_en_eski_dakika: '35', iys_aktarilmamis: '3', basarisiz_giris_24s: '7',
        son_yedek: { zaman: '2026-01-01T02:30:00Z', durum: 'basarili', yas_saat: '6', yas_dakika: '370' },
      },
    };

    await expect(repo.getSystemHealth('u1')).resolves.toEqual({
      kuyrukBekleyen: 4, kuyrukBasarisiz: 1, kuyrukEngellenen: 2,
      kuyrukEnEskiDakika: 35, iysAktarilmamis: 3, basarisizGiris24s: 7,
      sonYedek: { zaman: '2026-01-01T02:30:00Z', durum: 'basarili', yasSaat: 6, yasDakika: 370 },
    });
  });

  it('yedek yoksa sonYedek null olur', async () => {
    durum.rpcYanitlari.system_health = { data: { son_yedek: null } };
    const durumSonuc = await repo.getSystemHealth('u1');
    expect(durumSonuc?.sonYedek).toBeNull();
    expect(durumSonuc?.kuyrukBekleyen).toBe(0);
  });

  it('satır dönmezse null verir', async () => {
    durum.rpcYanitlari.system_health = { data: null };
    await expect(repo.getSystemHealth('u1')).resolves.toBeNull();
  });

  it('dışa aktarımı RPC ile alır', async () => {
    durum.rpcYanitlari.export_owner_data = { data: { rezervasyonlar: [] } };
    await expect(repo.exportData('u1')).resolves.toEqual({ rezervasyonlar: [] });
    expect(durum.rpcler[0]).toEqual({ ad: 'export_owner_data', arg: { p_owner_id: 'u1' } });
  });

  it('dışa aktarım hatasını çevirir', async () => {
    durum.rpcYanitlari.export_owner_data = { error: HATA };
    await expect(repo.exportData('u1')).rejects.toThrow('Veriler dışa aktarılamadı.');
  });
});

/* ---------------------------------------------------- salon, menü, masa */

describe('salonlar ve menüler', () => {
  it('salon satırını çevirir', async () => {
    yanitla('halls', { data: [{ id: 'h1', business_id: 'b1', name: 'Ana Salon', capacity: '500', is_active: true }] });
    const [salon] = await repo.listHalls('b1');
    expect(salon).toMatchObject({ id: 'h1', businessId: 'b1', name: 'Ana Salon', capacity: 500, isActive: true });
  });

  it('bağlı rezervasyonu olan salonu silmek yerine pasife almayı önerir', async () => {
    yanitla('halls', { error: { code: '23503', message: 'foreign key violation' } });
    await expect(repo.deleteHall('h1'))
      .rejects.toThrow('Bu salona bağlı rezervasyonlar var; salonu silmek yerine pasife alın.');
  });

  it('başka bir salon hatasını genel metinle bildirir', async () => {
    yanitla('halls', { error: HATA });
    await expect(repo.deleteHall('h1')).rejects.toThrow('Salon silinemedi.');
  });

  it('menüyü kuruş alanıyla kaydeder', async () => {
    yanitla('menus', { data: { id: 'm1', business_id: 'b1', price_kurus: 75000 } });

    await repo.saveMenu({
      id: 'm1', businessId: 'b1', name: 'Klasik', pricing: 'kisi_basi',
      priceKurus: 75000, description: '', isActive: true, createdAt: '',
    });

    expect(islem(cagri('menus'), 'upsert')?.arg[0]).toMatchObject({
      price_kurus: 75000, pricing: 'kisi_basi', is_active: true,
    });
  });

  it('menüyü siler', async () => {
    await repo.deleteMenu('m1');
    expect(islem(cagri('menus'), 'delete')).toBeDefined();
  });
});

describe('masa düzeni', () => {
  it('planı önce siler sonra yazar', async () => {
    await repo.saveSeating('r1', [
      { tableNo: 1, seats: 10, label: 'Gelin masası' },
    ]);

    const silme = cagri('seating_tables', 0);
    const yazma = cagri('seating_tables', 1);
    expect(islem(silme, 'delete')).toBeDefined();
    expect(islem(yazma, 'insert')?.arg[0]).toEqual([
      { reservation_id: 'r1', table_no: 1, seats: 10, label: 'Gelin masası' },
    ]);
  });

  it('boş planda yalnızca siler', async () => {
    await repo.saveSeating('r1', []);
    expect(durum.cagrilar.filter((c) => c.tablo === 'seating_tables')).toHaveLength(1);
  });

  it('silme hatasında yazmaya geçmez', async () => {
    yanitla('seating_tables', { error: HATA });
    await expect(repo.saveSeating('r1', [
      { tableNo: 1, seats: 10, label: '' },
    ])).rejects.toThrow('Masa düzeni güncellenemedi.');
    expect(durum.cagrilar.filter((c) => c.tablo === 'seating_tables')).toHaveLength(1);
  });
});

/* ------------------------------------------------ şablon ve hatırlatma */

describe('şablonlar ve hatırlatma kuralları', () => {
  it('şablonları sabit sıraya göre verir', async () => {
    yanitla('message_templates', {
      data: [
        { id: 't2', business_id: 'b1', key: 'tesekkur', title: 'Teşekkür', body: 'x', kind: 'Bilgilendirme', category: 'ticari', is_active: true },
        { id: 't1', business_id: 'b1', key: 'rezervasyon_onay', title: 'Onay', body: 'y', kind: 'Rezervasyon', category: 'islem', is_active: true },
      ],
    });

    const liste = await repo.listTemplates('b1');

    expect(liste.map((t) => t.key)).toEqual(['rezervasyon_onay', 'tesekkur']);
  });

  it('şablon kaydederken sınıfı istemciden almaz', async () => {
    // Ticari bir metin işlem bildirimi diye gönderilirse İYS onayı kontrolü
    // atlanırdı; category ve kind alanları güncellemeye girmemeli.
    yanitla('message_templates', {
      data: { id: 't1', business_id: 'b1', key: 'kampanya', category: 'ticari', kind: 'Bilgilendirme', title: 'X', body: 'y', is_active: true },
    });

    await repo.saveTemplate({
      id: 't1', businessId: 'b1', key: 'kampanya', title: 'X', body: 'y',
      kind: 'Bilgilendirme', category: 'islem', isActive: true,
    });

    const govde = islem(cagri('message_templates'), 'update')?.arg[0] as Record<string, unknown>;
    expect(Object.keys(govde).sort()).toEqual(['body', 'is_active', 'title']);
  });

  it('hatırlatma kuralını yalnızca izin verilen alanlarla günceller', async () => {
    yanitla('reminder_rules', {
      data: { id: 'k1', business_id: 'b1', key: 'tarih_hatirlatma', enabled: true, days_before: 3, send_hour: 10 },
    });

    await repo.saveReminderRule({
      id: 'k1', businessId: 'b1', key: 'tarih_hatirlatma',
      enabled: true, daysBefore: 3, sendHour: 10,
    });

    expect(islem(cagri('reminder_rules'), 'update')?.arg[0])
      .toEqual({ enabled: true, days_before: 3, send_hour: 10 });
  });

  it('kural okuma hatasını çevirir', async () => {
    yanitla('reminder_rules', { error: HATA });
    await expect(repo.listReminderRules('b1')).rejects.toThrow('Hatırlatma kuralları okunamadı.');
  });
});

/* ------------------------------------------------- iş emri ve tedarikçi */

describe('iş emri', () => {
  it('planı önce siler sonra yazar', async () => {
    await repo.saveTasks('r1', [
      { atTime: '18:00', title: 'Gelin girişi', responsible: 'Ali', done: false },
    ]);

    expect(islem(cagri('event_tasks', 0), 'delete')).toBeDefined();
    expect(islem(cagri('event_tasks', 1), 'insert')?.arg[0]).toEqual([
      { reservation_id: 'r1', at_time: '18:00', title: 'Gelin girişi', responsible: 'Ali', done: false },
    ]);
  });

  it('boş listede yalnızca siler', async () => {
    await repo.saveTasks('r1', []);
    expect(durum.cagrilar.filter((c) => c.tablo === 'event_tasks')).toHaveLength(1);
  });

  it('iş emrini saate göre ister', async () => {
    yanitla('event_tasks', { data: [] });
    await repo.listTasks('r1');
    expect(islem(cagri('event_tasks'), 'order')?.arg).toEqual(['at_time']);
  });
});

describe('tedarikçiler', () => {
  it('tedarikçi satırını çevirir', async () => {
    yanitla('vendors', {
      data: [{ id: 'v1', business_id: 'b1', name: 'Orkestra', category: 'Orkestra / Müzik', phone: '5321112233', note: '', is_active: true }],
    });
    const [tedarikci] = await repo.listVendors('b1');
    expect(tedarikci).toMatchObject({ id: 'v1', businessId: 'b1', name: 'Orkestra', isActive: true });
  });

  it('organizasyona bağlı tedarikçi için pasife almayı önerir', async () => {
    yanitla('vendors', { error: { code: '23503', message: 'foreign key violation' } });
    await expect(repo.deleteVendor('v1'))
      .rejects.toThrow('Bu tedarikçi organizasyonlara bağlı; silmek yerine pasife alın.');
  });

  it('atamaları önce siler sonra yazar ve boş saati null yapar', async () => {
    await repo.saveReservationVendors('r1', [
      { vendorId: 'v1', arriveAt: '', cost: 5000, note: '' },
    ]);

    expect(islem(cagri('reservation_vendors', 0), 'delete')).toBeDefined();
    expect(islem(cagri('reservation_vendors', 1), 'insert')?.arg[0]).toEqual([
      { reservation_id: 'r1', vendor_id: 'v1', arrive_at: null, cost: 5000, note: '' },
    ]);
  });

  it('boş atamada yalnızca siler', async () => {
    await repo.saveReservationVendors('r1', []);
    expect(durum.cagrilar.filter((c) => c.tablo === 'reservation_vendors')).toHaveLength(1);
  });
});

/* ------------------------------------------------- hata kodu çevirileri */

describe('veritabanı hata kodları', () => {
  /**
   * PostgREST kod döndürür, kullanıcı Türkçe metin görür. Kodun kendisi
   * ekrana çıkarsa kullanıcı ne yapacağını bilemez.
   */
  const kodlar: [string, string][] = [
    ['23505', 'Bu kayıt zaten mevcut.'],
    ['23514', 'Girilen değerler geçerli değil.'],
    ['42501', 'Bu işlem için yetkiniz bulunmuyor.'],
  ];

  for (const [kod, metin] of kodlar) {
    it(`${kod} kodunu "${metin}" olarak gösterir`, async () => {
      yanitla('businesses', { error: { code: kod, message: 'ham postgres metni' } });
      await expect(repo.listBusinesses('u1')).rejects.toThrow(metin);
    });
  }

  it('bilinmeyen kodda çağıranın metnini kullanır', async () => {
    yanitla('businesses', { error: { code: 'XX000', message: 'internal error' } });
    await expect(repo.listBusinesses('u1')).rejects.toThrow('İşletmeler alınamadı.');
  });

  it('ham veritabanı metnini kullanıcıya göstermez', async () => {
    yanitla('vendors', { error: { code: '42501', message: 'permission denied for table vendors' } });
    await expect(repo.listVendors('b1')).rejects.toThrow(
      /^(?!.*permission denied).*$/,
    );
  });
});

/* ------------------------------------------------- kalan satır eşlemeleri */

describe('listeleme eşlemeleri', () => {
  it('kasa satırını çevirir', async () => {
    yanitla('cash_flow', {
      data: [{
        id: 'c1', business_id: 'b1', kind: 'Gider', date: '2026-01-01',
        category: 'Kira', amount: '15000.50', description: 'Ocak kirası',
        reservation_id: null, created_at: '2026-01-01T08:00:00Z',
      }],
    });

    const [kayit] = await repo.listCashFlow('b1');

    expect(kayit).toEqual({
      id: 'c1', businessId: 'b1', kind: 'Gider', date: '2026-01-01',
      category: 'Kira', amount: 15000.5, description: 'Ocak kirası',
      reservationId: undefined, createdAt: '2026-01-01T08:00:00Z',
    });
  });

  it('eksik kasa alanlarını varsayılana çeker', async () => {
    yanitla('cash_flow', { data: [{ id: 'c1', business_id: 'b1' }] });
    const [kayit] = await repo.listCashFlow('b1');
    expect(kayit).toMatchObject({ kind: 'Gelir', date: '', category: '', amount: 0 });
  });

  it('sms kaydını çevirir ve en yeniyi başa alır', async () => {
    yanitla('sms_log', {
      data: [{
        id: 's1', business_id: 'b1', to: '5321112233', body: 'metin',
        kind: 'Rezervasyon', sent_at: '2026-01-01T10:00:00Z',
      }],
    });

    const [kayit] = await repo.listSms('b1');

    expect(kayit).toEqual({
      id: 's1', businessId: 'b1', to: '5321112233', body: 'metin',
      kind: 'Rezervasyon', sentAt: '2026-01-01T10:00:00Z',
    });
    expect(islem(cagri('sms_log'), 'order')?.arg).toEqual(['sent_at', { ascending: false }]);
  });

  it('faturaları düzenleme tarihine göre tersten ister', async () => {
    yanitla('invoices', {
      data: [{
        id: 'inv1', business_id: 'b1', invoice_number: 'DGT2026000000001',
        kind: 'e-Arsiv', status: 'gonderildi', issue_date: '2026-03-01',
        buyer_kind: 'kurumsal', buyer_name: 'ABC Ltd.', buyer_tax_id: '1234567890',
        gross_kurus: '3000000', discount_kurus: '0', base_kurus: '2500000',
        vat_kurus: '500000', total_kurus: '3000000',
      }],
    });

    const [fatura] = await repo.listInvoices('b1');

    expect(fatura).toMatchObject({
      id: 'inv1', businessId: 'b1', invoiceNumber: 'DGT2026000000001',
      status: 'gonderildi', buyerKind: 'kurumsal', buyerTaxId: '1234567890',
      baseKurus: 2_500_000, vatKurus: 500_000, totalKurus: 3_000_000,
    });
    expect(islem(cagri('invoices'), 'order')?.arg).toEqual(['issue_date', { ascending: false }]);
  });

  it('salonu kaydederken dönen satırı çevirir', async () => {
    yanitla('halls', {
      data: { id: 'h1', business_id: 'b1', name: 'Bahçe', capacity: '250', note: 'Yaz', is_active: false },
    });

    const salon = await repo.saveHall({
      id: 'h1', businessId: 'b1', name: 'Bahçe', capacity: 250,
      note: 'Yaz', isActive: false, createdAt: '',
    });

    expect(salon).toMatchObject({ id: 'h1', name: 'Bahçe', capacity: 250, isActive: false });
    expect(islem(cagri('halls'), 'upsert')?.arg[0]).toMatchObject({ is_active: false, business_id: 'b1' });
  });

  it('menüleri ada göre ister ve satırı çevirir', async () => {
    yanitla('menus', {
      data: [{
        id: 'm1', business_id: 'b1', name: 'Klasik', pricing: 'kisi_basi',
        price_kurus: '75000', description: 'Çorba, ana yemek', is_active: true,
      }],
    });

    const [menu] = await repo.listMenus('b1');

    expect(menu).toMatchObject({
      id: 'm1', businessId: 'b1', name: 'Klasik', pricing: 'kisi_basi',
      priceKurus: 75000, isActive: true,
    });
    expect(islem(cagri('menus'), 'order')?.arg).toEqual(['name']);
  });

  it('masa satırını çevirir ve masa numarasına göre ister', async () => {
    yanitla('seating_tables', {
      data: [{ id: 't1', reservation_id: 'r1', table_no: '3', seats: '10', label: 'Gelin masası' }],
    });

    const [masa] = await repo.listSeating('r1');

    expect(masa).toEqual({ id: 't1', reservationId: 'r1', tableNo: 3, seats: 10, label: 'Gelin masası' });
    expect(islem(cagri('seating_tables'), 'order')?.arg).toEqual(['table_no']);
  });

  it('iş emri satırındaki saati kısaltır', async () => {
    // Postgres time alanı 19:00:00 döner; arayüz saat:dakika gösterir.
    yanitla('event_tasks', {
      data: [{ id: 'g1', reservation_id: 'r1', at_time: '19:00:00', title: 'Giriş', responsible: 'Ali', done: true }],
    });

    const [gorev] = await repo.listTasks('r1');

    expect(gorev).toEqual({
      id: 'g1', reservationId: 'r1', atTime: '19:00',
      title: 'Giriş', responsible: 'Ali', done: true,
    });
  });

  it('tedarikçiyi kaydederken dönen satırı çevirir', async () => {
    yanitla('vendors', {
      data: { id: 'v1', business_id: 'b1', name: 'Orkestra', category: 'Orkestra / Müzik', phone: '5321112233', note: '', is_active: true },
    });

    const tedarikci = await repo.saveVendor({
      id: 'v1', businessId: 'b1', name: 'Orkestra', category: 'Orkestra / Müzik',
      phone: '5321112233', note: '', isActive: true, createdAt: '',
    });

    expect(tedarikci).toMatchObject({ id: 'v1', name: 'Orkestra', isActive: true });
  });

  it('tedarikçi atamasındaki saati kısaltır, boşsa tanımsız bırakır', async () => {
    yanitla('reservation_vendors', {
      data: [
        { id: 'rv1', reservation_id: 'r1', vendor_id: 'v1', arrive_at: '17:30:00', cost: '5000', note: 'Kurulum' },
        { id: 'rv2', reservation_id: 'r1', vendor_id: 'v2', arrive_at: null, cost: '0', note: '' },
      ],
    });

    const [ilk, ikinci] = await repo.listReservationVendors('r1');

    expect(ilk).toEqual({
      id: 'rv1', reservationId: 'r1', vendorId: 'v1',
      arriveAt: '17:30', cost: 5000, note: 'Kurulum',
    });
    expect(ikinci.arriveAt).toBeUndefined();
    expect(ikinci.cost).toBe(0);
  });
});

describe('müşteri adayları', () => {
  it('satırı ekranın beklediği alanlara çevirir', async () => {
    yanitla('customer_leads', { data: [{
      id: 'l1', business_id: 'b1', name: 'Ömer Ay', phone: '5332642537',
      email: null, guest_count: 1000, event_date: null,
      event_date_text: 'Mayıs ilk hafta', organization_type: 'Düğün',
      source: 'WhatsApp', source_detail: null, status: 'Aranmadı',
      assigned_to: null, next_followup_at: null, last_contact_at: null,
      reservation_id: null, note: null,
      created_at: '2026-09-11T15:00:00Z', updated_at: '2026-09-11T15:00:00Z',
    }] });

    const [l] = await repo.listLeads('b1');

    expect(l).toMatchObject({
      id: 'l1', name: 'Ömer Ay', phone: '5332642537', guestCount: 1000,
      eventDateText: 'Mayıs ilk hafta', source: 'WhatsApp', status: 'Aranmadı',
    });
    // Boş alanlar undefined değil boş metin: ekran her zaman bir şey basıyor.
    expect(l.email).toBe('');
    expect(l.assignedTo).toBeUndefined();
  });

  it('eksik kişi sayısını null bırakır, sıfır yapmaz', async () => {
    // Sıfır yapılsaydı "0 kişi" diye bir aday görünürdü.
    yanitla('customer_leads', { data: [{ id: 'l1', business_id: 'b1', guest_count: null }] });
    const [l] = await repo.listLeads('b1');
    expect(l.guestCount).toBeNull();
  });

  it('yalnızca kendi işletmesinin adaylarını ister', async () => {
    await repo.listLeads('b1');
    expect(islem(cagri('customer_leads'), 'eq')?.arg).toEqual(['business_id', 'b1']);
  });

  it('kaydederken sütun adlarına çevirir', async () => {
    yanitla('customer_leads', { data: { id: 'l1', business_id: 'b1' } });
    await repo.saveLead({
      id: 'l1', businessId: 'b1', name: 'Ömer Ay', phone: '5332642537', email: '',
      guestCount: 1000, eventDate: '', eventDateText: 'Mayıs ilk hafta',
      organizationType: 'Düğün', source: 'WhatsApp', sourceDetail: '',
      status: 'yeni', nextFollowupAt: '', lastContactAt: '',
      requestText: 'Yemekli fiyat', note: '',
      createdAt: '', updatedAt: '',
    });
    const govde = islem(cagri('customer_leads'), 'upsert')?.arg[0] as Record<string, unknown>;
    expect(govde).toMatchObject({
      business_id: 'b1', name: 'Ömer Ay', phone: '5332642537',
      event_date_text: 'Mayıs ilk hafta', source: 'WhatsApp', status: 'yeni',
      request_text: 'Yemekli fiyat',
    });
    // Boş tarih null gider; '' bir tarih değil.
    expect(govde.event_date).toBeNull();
    expect(govde.next_followup_at).toBeNull();
  });

  it('aynı telefondaki ikinci adayı anlaşılır metinle reddeder', async () => {
    // 23505: benzersiz indeks. Bu bir hata değil, tam da engellenmek istenen
    // durum; çağıran mevcut kaydı kullanmalı.
    yanitla('customer_leads', { error: { code: '23505', message: 'duplicate key' } });
    await expect(repo.saveLead({
      id: 'l1', businessId: 'b1', name: '', phone: '5332642537', email: '',
      guestCount: null, eventDate: '', eventDateText: '', organizationType: '',
      source: 'WhatsApp', sourceDetail: '', status: 'yeni',
      nextFollowupAt: '', lastContactAt: '', requestText: '', note: '',
      createdAt: '', updatedAt: '',
    })).rejects.toThrow(/zaten var/);
  });

  it('iletişim geçmişini eskiden yeniye ister', async () => {
    await repo.listLeadMessages('l1');
    expect(islem(cagri('customer_lead_messages'), 'order')?.arg)
      .toEqual(['created_at', { ascending: true }]);
  });

  it('durum geçmişini yeniden eskiye ister', async () => {
    await repo.listLeadStatusHistory('l1');
    expect(islem(cagri('customer_lead_status_history'), 'order')?.arg)
      .toEqual(['created_at', { ascending: false }]);
  });

  it('hataları kendi metniyle çevirir', async () => {
    yanitla('customer_leads', { error: HATA });
    yanitla('customer_lead_messages', { error: HATA });
    await expect(repo.listLeads('b1')).rejects.toThrow('Müşteri adayları alınamadı.');
    await expect(repo.deleteLead('l1')).rejects.toThrow('Müşteri adayı silinemedi.');
    await expect(repo.listLeadMessages('l1')).rejects.toThrow('İletişim geçmişi alınamadı.');
  });
});

describe('rezervasyon ulaşım kanalı', () => {
  it('kanalı ve açıklamayı sütunlara çevirir', async () => {
    yanitla('reservations', { data: [{
      id: 'r1', business_id: 'b1', source_channel: 'Referans', source_detail: 'Ayşe Yılmaz',
    }] });
    const [r] = await repo.listReservations('b1');
    expect(r.sourceChannel).toBe('Referans');
    expect(r.sourceDetail).toBe('Ayşe Yılmaz');
  });

  it('kanal seçilmemişse null yazar', async () => {
    yanitla('reservations', { data: [{ id: 'r1', business_id: 'b1' }] });
    await repo.saveReservation({
      id: 'r1', businessId: 'b1', hallId: 'h1', code: '2026-1',
      customerName: 'Ayşe', customerPhone: '5321112233', date: '2026-09-12',
      slot: 'Gece', organizationType: 'Düğün', guestCount: 300,
      totalAmount: 250000, deposit: 60000, currency: 'TL',
      status: 'Kesin Rezervasyon', colorKey: 'dugun', services: [],
      createdAt: '', updatedAt: '', sourceChannel: undefined, sourceDetail: '  ',
    });
    const govde = islem(cagri('reservations'), 'upsert')?.arg[0] as Record<string, unknown>;
    expect(govde.source_channel).toBeNull();
    // Yalnızca boşluktan ibaret açıklama da boş sayılır.
    expect(govde.source_detail).toBeNull();
  });
});
