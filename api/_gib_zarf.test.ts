import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  crc32, soapZarfGonder, zarfKimligi, zarfKur, zarfYanitiCoz, zarfiPaketle,
} from './_gib_zarf';

const FATURA = '<?xml version="1.0" encoding="UTF-8"?><Invoice><cbc:ID>SAH1</cbc:ID></Invoice>';
const UUID = '11111111-2222-3333-4444-555555555555';

describe('zarfKimligi', () => {
  it('BÜYÜK harfli UUID üretir', () => {
    // GİB büyük harfli bekliyor.
    const id = zarfKimligi();
    expect(id).toBe(id.toUpperCase());
    expect(id).toMatch(/^[0-9A-F-]{36}$/);
  });

  it('her çağrıda farklı kimlik verir', () => {
    expect(zarfKimligi()).not.toBe(zarfKimligi());
  });
});

describe('zarfKur', () => {
  it('gönderen ve alıcı etiketlerini yazar', () => {
    const zarf = zarfKur(FATURA, UUID, 'urn:mail:defaultpk@ornek.com', 'urn:mail:alici@ornek.com');
    expect(zarf).toContain('<ns3:Identifier>urn:mail:defaultpk@ornek.com</ns3:Identifier>');
    expect(zarf).toContain('<ns3:Identifier>urn:mail:alici@ornek.com</ns3:Identifier>');
    expect(zarf).toContain(`<ns3:PackageID>${UUID}</ns3:PackageID>`);
  });

  it('gömülü faturanın XML BİLDİRİMİNİ kaldırır', () => {
    /*
      İç içe iki XML bildirimi belgeyi geçersiz kılar; zarf ayrıştırma
      aşamasında reddedilirdi.
    */
    const zarf = zarfKur(FATURA, UUID, 'a', 'b');
    expect(zarf.match(/<\?xml/g)).toHaveLength(1);
    expect(zarf).toContain('<Invoice><cbc:ID>SAH1</cbc:ID></Invoice>');
  });

  it('paket tarihini ISO biçimde yazar', () => {
    const zarf = zarfKur(FATURA, UUID, 'a', 'b', new Date('2026-09-13T10:00:00.000Z'));
    expect(zarf).toContain('<ns3:PackageDate>2026-09-13T10:00:00.000Z</ns3:PackageDate>');
  });
});

describe('crc32', () => {
  it('bilinen değeri üretir', () => {
    // "123456789" -> 0xCBF43926, CRC-32 için standart doğrulama değeri.
    expect(crc32(Buffer.from('123456789'))).toBe(0xcbf43926);
  });

  it('boş veride sıfır döner', () => {
    expect(crc32(Buffer.alloc(0))).toBe(0);
  });
});

describe('zarfiPaketle', () => {
  it('GERÇEK bir zip üretir', () => {
    /*
      Zip elle kuruluyor (Node'da yerleşik zip yazıcı yok). Yapı yanlış
      olsaydı GİB "paket bütünlüğü bozuk" (1160) döndürürdü. Burada
      sistemin kendi unzip'iyle açılabildiği sınanıyor.
    */
    const zarf = zarfKur(FATURA, UUID, 'a', 'b');
    const paket = zarfiPaketle(zarf, `${UUID}.xml`);

    const dizin = mkdtempSync(join(tmpdir(), 'gib-zip-'));
    const yol = join(dizin, 'z.zip');
    writeFileSync(yol, paket);

    // Bozuk zip'te unzip sıfırdan farklı dönerdi.
    execFileSync('unzip', ['-o', '-q', yol, '-d', dizin]);
    const cikan = readFileSync(join(dizin, `${UUID}.xml`), 'utf8');
    expect(cikan).toBe(zarf);
  });

  it('zip imzasıyla başlar', () => {
    const paket = zarfiPaketle('<a/>', 'a.xml');
    expect(paket.readUInt32LE(0)).toBe(0x04034b50);
  });
});

describe('soapZarfGonder', () => {
  it('WS-Security kullanıcı adı ve parolasını yazar', () => {
    const soap = soapZarfGonder('QUJD', UUID, 'kullanici', 'parola');
    expect(soap).toContain('<wsse:Username>kullanici</wsse:Username>');
    expect(soap).toContain('>parola</wsse:Password>');
    expect(soap).toContain(`<HASH>${UUID}</HASH>`);
    expect(soap).toContain('<BINARY_DATA>QUJD</BINARY_DATA>');
  });

  it('parolada XML özel karakterini kaçırır', () => {
    // "a&b" kaçışsız yazılsaydı SOAP gövdesi bozulurdu.
    const soap = soapZarfGonder('x', UUID, 'k', 'a&b<c');
    expect(soap).toContain('>a&amp;b&lt;c</wsse:Password>');
  });
});

describe('zarfYanitiCoz', () => {
  it('başarılı durum kodunu okur', () => {
    const y = zarfYanitiCoz('<env><statusCode>1110</statusCode></env>');
    expect(y).toEqual({ basarili: true, kod: '1110', aciklama: 'Zarf başarıyla işlendi' });
  });

  it('hatalı durum kodunu başarısız sayar', () => {
    const y = zarfYanitiCoz('<env><statusCode>1140</statusCode></env>');
    expect(y.basarili).toBe(false);
    expect(y.aciklama).toContain('şema');
  });

  it('SOAP Fault’u durum kodundan ÖNCE yakalar', () => {
    /*
      Hata gövdesinde durum kodu hiç bulunmayabiliyor; fault'a önce
      bakılmasaydı yanıt sessizce "başarılı" sayılabilirdi.
    */
    const y = zarfYanitiCoz(
      '<soap:Fault><faultstring>Kullanıcı yetkisiz</faultstring></soap:Fault>',
    );
    expect(y).toEqual({ basarili: false, kod: 'SOAP', aciklama: 'Kullanıcı yetkisiz' });
  });

  it('durum kodu yoksa başarısız sayar', () => {
    // "Yanıt geldi" ile "işlem oldu" aynı şey değil.
    const y = zarfYanitiCoz('<env><bosluk/></env>');
    expect(y.basarili).toBe(false);
    expect(y.aciklama).toContain('bulunamadı');
  });

  it('ad alanı önekli etiketi de okur', () => {
    expect(zarfYanitiCoz('<ns:statusCode>1200</ns:statusCode>').kod).toBe('1200');
  });
});
