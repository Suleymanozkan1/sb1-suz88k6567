import { describe, expect, it, vi, beforeEach } from 'vitest';
import { postgrestIstemci } from './postgrest';

/**
 * PostgREST istemcisi.
 *
 * Buradaki testlerin çoğu, GERÇEK bir PostgREST sunucusuna karşı
 * çalışırken bulunan iki hatadan doğdu. İkisi de sessizdi: istek hata
 * vermiyor, sıfır satır dönüyordu. Kullanıcı tarafında bu "kayıt
 * silinmiş" gibi görünür.
 *
 *   1. Değer URL kaçırmasından geçmiyordu; boşluk ve Türkçe harf
 *      taşıyan her süzgeç boş dönüyordu.
 *   2. Tekil süzgeçte değer çift tırnağa alınıyordu; PostgREST tırnağı
 *      değerin parçası sayıyor.
 */

const TABAN = 'http://veri.yerel';

function fetchTakli(yanit: { status?: number; body?: string } = {}) {
  const cagrilar: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string | URL, init?: RequestInit) => {
    cagrilar.push({ url: String(url), init });
    return new Response(yanit.body ?? '[]', { status: yanit.status ?? 200 });
  }));
  return cagrilar;
}

const db = (jeton: string | null = 'jeton-123') => postgrestIstemci(TABAN, () => jeton);

beforeEach(() => { vi.unstubAllGlobals(); });

describe('değer kaçırma', () => {
  it('boşluklu değeri URL kaçırmasından geçirir', async () => {
    const c = fetchTakli();
    await db().from('businesses').select('name').eq('name', 'A Salonu');
    expect(c[0].url).toContain('name=eq.A%20Salonu');
  });

  it('Türkçe harfleri kaçırır', async () => {
    const c = fetchTakli();
    await db().from('businesses').select('*').eq('city', 'İstanbul');
    expect(c[0].url).not.toContain('İstanbul');
    expect(decodeURIComponent(c[0].url)).toContain('city=eq.İstanbul');
  });

  it('tekil süzgeçte değeri tırnağa ALMAZ', async () => {
    // PostgREST tırnağı değerin parçası sayıyor: eq."A Salonu" hiçbir
    // satır döndürmez ve hata da vermez.
    const c = fetchTakli();
    await db().from('businesses').select('*').eq('name', 'A Salonu');
    expect(decodeURIComponent(c[0].url)).not.toContain('eq."');
  });

  it('liste süzgecinde değerleri tırnağa ALIR', async () => {
    // Virgül burada sözdizimine ait: "Yılmaz, Ali" tırnaksız iki değer sanılır.
    const c = fetchTakli();
    await db().from('profiles').select('*').in('full_name', ['Yılmaz, Ali', 'Ayşe']);
    const cozulmus = decodeURIComponent(c[0].url);
    expect(cozulmus).toContain('in.("Yılmaz, Ali","Ayşe")');
  });

  it('is süzgecinde null anahtar sözcüğünü tırnaklamaz', async () => {
    // "null" metni olarak gönderilseydi süzgeç hiçbir satır döndürmezdi.
    const c = fetchTakli();
    await db().from('customer_leads').select('*').is('reservation_id', null);
    expect(decodeURIComponent(c[0].url)).toContain('reservation_id=is.null');
  });
});

describe('sorgu kurulumu', () => {
  it('select, order ve limit birlikte çalışır', async () => {
    const c = fetchTakli();
    await db().from('reservations').select('id,name').order('date', { ascending: false }).limit(10);
    const u = decodeURIComponent(c[0].url);
    expect(u).toContain('select=id,name');
    expect(u).toContain('order=date.desc');
    expect(u).toContain('limit=10');
  });

  it('order varsayılanı artan', async () => {
    const c = fetchTakli();
    await db().from('halls').select('*').order('name');
    expect(decodeURIComponent(c[0].url)).toContain('order=name.asc');
  });

  it('insert gövdeyi POST eder ve gösterim ister', async () => {
    const c = fetchTakli({ status: 201, body: '[{"id":"1"}]' });
    await db().from('halls').insert({ name: 'Bahçe' });
    expect(c[0].init?.method).toBe('POST');
    expect(c[0].init?.body).toBe('{"name":"Bahçe"}');
    expect((c[0].init?.headers as Record<string, string>).prefer).toContain('return=representation');
  });

  it('upsert çakışma çözümünü ister', async () => {
    const c = fetchTakli({ body: '[]' });
    await db().from('color_settings').upsert({ business_id: 'x' });
    expect((c[0].init?.headers as Record<string, string>).prefer)
      .toContain('resolution=merge-duplicates');
  });

  it('update PATCH gönderir', async () => {
    const c = fetchTakli();
    await db().from('halls').update({ capacity: 150 }).eq('id', 'h1');
    expect(c[0].init?.method).toBe('PATCH');
  });

  it('delete DELETE gönderir', async () => {
    const c = fetchTakli();
    await db().from('halls').delete().eq('id', 'h1');
    expect(c[0].init?.method).toBe('DELETE');
  });
});

describe('oturum', () => {
  it('jeton varsa Authorization başlığı ekler', async () => {
    const c = fetchTakli();
    await db('abc').from('halls').select('*');
    expect((c[0].init?.headers as Record<string, string>).authorization).toBe('Bearer abc');
  });

  it('jeton yoksa başlık göndermez', async () => {
    // Oturumsuz istek anon rolüyle karşılanır; RLS neyi göreceğine karar verir.
    const c = fetchTakli();
    await db(null).from('halls').select('*');
    expect((c[0].init?.headers as Record<string, string>).authorization).toBeUndefined();
  });

  it('jetonu her istekte yeniden okur', async () => {
    // Oturum yenilenince eski jetonla devam edilmemeli.
    let jeton = 'eski';
    const istemci = postgrestIstemci(TABAN, () => jeton);
    const c = fetchTakli();
    await istemci.from('halls').select('*');
    jeton = 'yeni';
    await istemci.from('halls').select('*');
    expect((c[1].init?.headers as Record<string, string>).authorization).toBe('Bearer yeni');
  });
});

describe('tekil sonuç', () => {
  it('single tekil biçim ister', async () => {
    const c = fetchTakli({ body: '{"id":"1"}' });
    const r = await db().from('halls').select('*').single();
    expect((c[0].init?.headers as Record<string, string>).accept)
      .toBe('application/vnd.pgrst.object+json');
    expect(r.data).toEqual({ id: '1' });
  });

  it('maybeSingle boş listede null verir, hata vermez', async () => {
    fetchTakli({ body: '[]' });
    const r = await db().from('halls').select('*').maybeSingle();
    expect(r.data).toBeNull();
    expect(r.error).toBeNull();
  });

  it('maybeSingle ilk satırı verir', async () => {
    fetchTakli({ body: '[{"id":"1"},{"id":"2"}]' });
    expect((await db().from('halls').select('*').maybeSingle()).data).toEqual({ id: '1' });
  });
});

describe('hata sözleşmesi', () => {
  it('PostgREST hatasını SQLSTATE ile taşır', async () => {
    // fail() bu koda bakıp kullanıcıya anlaşılır mesaj veriyor.
    fetchTakli({
      status: 409,
      body: JSON.stringify({ code: '23505', message: 'duplicate key', details: null }),
    });
    const r = await db().from('halls').insert({});
    expect(r.error?.code).toBe('23505');
    expect(r.data).toBeNull();
  });

  it('JSON olmayan hata gövdesinde çökmez', async () => {
    fetchTakli({ status: 500, body: 'sunucu hatasi' });
    const r = await db().from('halls').select('*');
    expect(r.error?.message).toBe('sunucu hatasi');
  });

  it('ağ hatasında anlaşılır mesaj verir', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED'); }));
    const r = await db().from('halls').select('*');
    expect(r.error?.message).toBe('Sunucuya ulaşılamadı.');
  });
});

describe('rpc', () => {
  it('fonksiyonu POST ile çağırır', async () => {
    const c = fetchTakli({ body: '[]' });
    await db().rpc('verify_reservation_code', { p_code: 'ABC' });
    expect(c[0].url).toBe(`${TABAN}/rpc/verify_reservation_code`);
    expect(c[0].init?.body).toBe('{"p_code":"ABC"}');
  });

  it('hatayı SQLSTATE ile taşır', async () => {
    fetchTakli({ status: 400, body: JSON.stringify({ code: 'DT001', message: 'dolu' }) });
    const r = await db().rpc('bir_fn');
    expect(r.error?.code).toBe('DT001');
  });
});
