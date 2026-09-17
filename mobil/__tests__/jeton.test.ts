/**
 * Jetonun isteğe GERÇEKTEN eklenmesi.
 *
 * NEDEN BU TEST VAR. Jeton, istemciye bir geri çağırmayla veriliyordu
 * ve o geri çağırma yalnızca `sorgu()` sarmalayıcısı çalıştığında
 * doluyordu. `profilOku` dahil 18 fonksiyon `sorgu()` üzerinden
 * geçmiyor: temiz kurulumda ilk girişte jeton BOŞ gidiyor, PostgREST
 * 401 "Oturum gerekli." dönüyor ve kullanıcı -- girişi başarılı
 * olmasına rağmen -- "Hesabınıza ait profil bulunamadı." hatasıyla
 * uygulamaya hiç giremiyordu.
 *
 * Mevcut veri testleri bunu göremezdi: onlar istemcinin tamamını
 * taklit ediyor, yani başlıklara hiç bakmıyorlar. Bu yüzden test
 * fetch seviyesinde: giden isteğin başlığına bakıyor.
 */
import { postgrestIstemci } from '../src/postgrest';

function fetchTakla() {
  const cagrilar: { adres: string; basliklar: Record<string, string> }[] = [];
  const sahte = jest.fn(async (adres: string, secenek?: { headers?: Record<string, string> }) => {
    cagrilar.push({ adres: String(adres), basliklar: secenek?.headers ?? {} });
    return {
      ok: true,
      status: 200,
      json: async () => [],
      text: async () => '[]',
      headers: { get: () => null },
    } as unknown as Response;
  });
  (globalThis as { fetch?: unknown }).fetch = sahte;
  return cagrilar;
}

describe('jeton her isteğe ekleniyor', () => {
  it('EŞZAMANSIZ sağlayıcının jetonunu bekleyip başlığa koyar', async () => {
    /*
      Asıl hata buydu: sağlayıcı eşzamanlıydı, jetonu tazelemek ise
      eşzamansız. Tazeleme çağırana bırakılmıştı ve unutuluyordu.
    */
    const cagrilar = fetchTakla();
    const istemci = postgrestIstemci('https://ornek/veri', async () => 'JETON123');

    await istemci.from('profiles').select('id').eq('id', 'u1');

    expect(cagrilar).toHaveLength(1);
    expect(cagrilar[0].basliklar.authorization).toBe('Bearer JETON123');
  });

  it('eşzamanlı sağlayıcı da çalışmaya devam eder', async () => {
    // Web kopyası eşzamanlı bir sağlayıcı veriyor; kırılmamalı.
    const cagrilar = fetchTakla();
    const istemci = postgrestIstemci('https://ornek/veri', () => 'DUZJETON');

    await istemci.from('profiles').select('id');

    expect(cagrilar[0].basliklar.authorization).toBe('Bearer DUZJETON');
  });

  it('jeton yoksa authorization başlığı hiç konmaz', async () => {
    // Boş jetonla "Bearer null" göndermek sunucuda anlamsız bir hata üretir.
    const cagrilar = fetchTakla();
    const istemci = postgrestIstemci('https://ornek/veri', async () => null);

    await istemci.from('profiles').select('id');

    expect(cagrilar[0].basliklar.authorization).toBeUndefined();
  });

  it('rpc çağrısı da jetonu bekler', async () => {
    const cagrilar = fetchTakla();
    const istemci = postgrestIstemci('https://ornek/veri', async () => 'RPCJETON');

    await istemci.rpc('bir_fonksiyon', { a: 1 });

    expect(cagrilar[0].basliklar.authorization).toBe('Bearer RPCJETON');
  });
});
