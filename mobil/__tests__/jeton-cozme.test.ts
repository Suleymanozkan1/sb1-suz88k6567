/**
 * Jeton gövdesinin Node OLMADAN çözülmesi.
 *
 * NEDEN BU TEST VAR. `kullaniciId` jetonu `Buffer.from(...)` ile
 * çözüyordu. `Buffer` bir Node.js API'si; Hermes'te -- yani gerçek
 * cihazda çalışan uygulamada -- tanımlı değil. Ona dokunmak
 * `ReferenceError` fırlatıyor, fonksiyondaki `catch` bunu yutuyor ve
 * `null` dönüyordu. Sonuç: giriş BAŞARILI oluyor, ama kimlik
 * çözülemediği için profil hiç okunmadan "Hesabınıza ait profil
 * bulunamadı." hatası veriliyor ve uygulamaya girilemiyordu.
 *
 * Bu hatayı hiçbir test göremezdi, çünkü testler de geliştirme de
 * Node'da çalışıyor ve orada `Buffer` VAR. Bu yüzden test `Buffer`'ı
 * bilerek KALDIRIYOR: cihazdaki koşulu taklit eden tek yol bu.
 */
import { kullaniciId } from '../src/supabase';

/** Test jetonu üretir; imza doğrulanmadığı için içerik yeterli. */
function jetonUret(govde: Record<string, unknown>): string {
  const b64 = (n: string) => Buffer.from(n, 'utf8').toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b64('{"alg":"HS256"}')}.${b64(JSON.stringify(govde))}.imza`;
}

describe('kullaniciId, Buffer olmadan', () => {
  const KIMLIK = '9ca6f875-fae6-4188-9c9c-d0aa904ae8ad';
  let jeton: string;
  let turkceJeton: string;
  let subsuzJeton: string;
  let saklanan: unknown;

  /*
    Jetonlar Buffer SİLİNMEDEN ÖNCE üretiliyor: üreteç Buffer
    kullanıyor (bu bir test kolaylığı), sınanan kod ise kullanmamalı.
  */
  beforeAll(() => {
    jeton = jetonUret({ sub: KIMLIK, role: 'authenticated' });
    turkceJeton = jetonUret({ sub: KIMLIK, ad: 'Şükrü Çağdaş Öztürk' });
    subsuzJeton = jetonUret({ role: 'authenticated' });
  });

  beforeEach(() => {
    saklanan = (globalThis as Record<string, unknown>).Buffer;
    // Hermes'in durumu.
    delete (globalThis as Record<string, unknown>).Buffer;
  });

  afterEach(() => {
    (globalThis as Record<string, unknown>).Buffer = saklanan;
  });

  it('Buffer YOKKEN de kimliği çözer', () => {
    expect(typeof (globalThis as Record<string, unknown>).Buffer).toBe('undefined');
    expect(kullaniciId(jeton)).toBe(KIMLIK);
  });

  it('gövdedeki Türkçe harfleri bozmadan çözer', () => {
    // Jetonda ad/e-posta geçebiliyor; UTF-8 elle çözüldüğü için sınanıyor.
    expect(kullaniciId(turkceJeton)).toBe(KIMLIK);
  });

  it('bozuk jetonda null döner, çökmez', () => {
    expect(kullaniciId('abc')).toBeNull();
    expect(kullaniciId(null)).toBeNull();
    expect(kullaniciId('a.b.c')).toBeNull();
  });

  it('sub alanı yoksa null döner', () => {
    expect(kullaniciId(subsuzJeton)).toBeNull();
  });

  it('gövdeye çöp eklenmiş jetonu ONARMAZ, null döner', () => {
    /*
      Alfabe dışı karakterler eskiden siliniyordu: sonuna "!" konmuş bir
      jeton hiçbir şey olmamış gibi aynı kimliği döndürüyordu. Bozuk
      girdi onarılacak değil reddedilecek bir şey.
    */
    const [ust, govde, imza] = jeton.split('.');
    expect(kullaniciId(`${ust}.${govde}!.${imza}`)).toBeNull();
    expect(kullaniciId(`${ust}.${govde} .${imza}`)).toBeNull();
    // 4'e bölümünden kalanı 1 olan uzunluk base64'te imkânsız.
    expect(kullaniciId(`${ust}.${govde}A.${imza}`)).toBeNull();
    // Sağlam jeton hâlâ çözülüyor.
    expect(kullaniciId(jeton)).toBe(KIMLIK);
  });

  it('bozuk UTF-8 dizisini geçerli harfe ÇEVİRMEZ', () => {
    /*
      Çözücü devam baytlarını denetlemiyor, eksikleri sıfır sayıyordu:
      E2 28 A1 gibi bozuk bir dizi hata vermek yerine düzgün görünen bir
      harfe dönüşüyor, gövde `JSON.parse`'ı geçiyor ve bozuk jeton için
      kimlik dönülüyordu.
    */
    const b64url = (baytlar: number[]) => {
      const B = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
      let c = '';
      for (let i = 0; i < baytlar.length; i += 3) {
        const p = (baytlar[i] << 16) | ((baytlar[i + 1] ?? 0) << 8) | (baytlar[i + 2] ?? 0);
        c += B[(p >> 18) & 63] + B[(p >> 12) & 63];
        if (baytlar[i + 1] !== undefined) c += B[(p >> 6) & 63];
        if (baytlar[i + 2] !== undefined) c += B[p & 63];
      }
      return c;
    };
    const govdeli = (baytlar: number[]) => `eyJhbGciOiJIUzI1NiJ9.${b64url(baytlar)}.imza`;
    const metin = (m: string) => [...m].map((k) => k.charCodeAt(0));

    // {"sub":"x"} + bozuk dizi; eskiden çözülüp kimlik dönüyordu.
    const saglam = metin('{"sub":"x');
    expect(kullaniciId(govdeli([...saglam, 0xe2, 0x28, 0xa1, ...metin('"}')]))).toBeNull();
    // Yarım kalmış dizi.
    expect(kullaniciId(govdeli([...saglam, 0xe2, 0x82]))).toBeNull();
    // Gereğinden uzun kodlama: "/" karakterinin iki baytlısı.
    expect(kullaniciId(govdeli([...saglam, 0xc0, 0xaf, ...metin('"}')]))).toBeNull();
    // Vekil kod noktası U+D800.
    expect(kullaniciId(govdeli([...saglam, 0xed, 0xa0, 0x80, ...metin('"}')]))).toBeNull();

    // Aynı üreteçle yazılan SAĞLAM gövde çözülüyor: test kendini de sınıyor.
    expect(kullaniciId(govdeli(metin('{"sub":"x"}')))).toBe('x');
  });
});
