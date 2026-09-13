import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, X509Certificate } from 'node:crypto';
import { faturayiImzala, imzaGecerliMi, imzaKimligi } from './_gib_imzala';
import { pemGovdesi, verenAdiniBicimle, type MuhurMalzemesi } from './_gib_imza';
import { ublFaturaUret, type GibFatura } from './_gib_ubl';

/*
  YEREL TEST SERTİFİKASI. Gerçek mali mühür kullanılmıyor ve
  kullanılamaz; bu testler imzanın KENDİ KENDİNİ doğruladığını sınıyor:
  özet -> kanonikleştirme -> imza zinciri kendi içinde tutarlı mı?

  GİB'in bu imzayı KABUL edip etmediği burada sınanmıyor; onu ancak
  gerçek mühür ve GİB test ortamı gösterir.
*/
function testMuhuru(): MuhurMalzemesi {
  const dizin = mkdtempSync(join(tmpdir(), 'gib-imza-'));
  const anahtarYolu = join(dizin, 'k.pem');
  const sertifikaYolu = join(dizin, 'c.pem');

  execFileSync('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
    '-keyout', anahtarYolu, '-out', sertifikaYolu,
    '-days', '2', '-subj', '/C=TR/O=Test/CN=Test Muhur',
  ], { stdio: 'ignore' });

  const sertifikaPem = readFileSync(sertifikaYolu, 'utf8');
  const sertifika = new X509Certificate(sertifikaPem);

  return {
    sertifikaB64: pemGovdesi(sertifikaPem),
    anahtarPem: readFileSync(anahtarYolu, 'utf8'),
    verenAd: verenAdiniBicimle(sertifika.issuer),
    seriNo: BigInt(`0x${sertifika.serialNumber}`).toString(10),
    sertifikaOzeti: createHash('sha256').update(sertifika.raw).digest('base64'),
    bitis: new Date(sertifika.validTo),
  };
}

const ETTN = 'A1B2C3D4-E5F6-4A5B-9C8D-7E6F5A4B3C2D';

function ornekFatura(): GibFatura {
  return {
    ettn: ETTN, faturaNo: 'SAH2026000000001', tarih: '2026-09-13',
    senaryo: 'EARSIVFATURA', paraBirimi: 'TRY',
    satici: {
      vknTckn: '1234567890', unvan: 'Öz & Kardeşler A.Ş.',
      vergiDairesi: 'Selçuk', adres: 'Test Mah.', ilce: 'Selçuklu', il: 'Konya',
    },
    alici: { unvan: 'Ahmet Yılmaz', vknTckn: '12345678901', bireysel: true },
    satirlar: [{
      siraNo: 1, aciklama: 'Salon kirası', miktar: 1, birim: 'Adet',
      birimFiyatKurus: 100_000, iskontoKurus: 0, kdvOrani: 20,
      matrahKurus: 100_000, kdvKurus: 20_000,
    }],
    brutKurus: 100_000, iskontoKurus: 0, matrahKurus: 100_000,
    kdvKurus: 20_000, toplamKurus: 120_000,
  };
}

describe('imzaKimligi', () => {
  it('ETTN’den belgeye özgü kimlik üretir', () => {
    expect(imzaKimligi(ETTN)).toBe('Signature-A1B2C3D4E5F64A5B');
  });

  it('kimlikte XML’i bozacak karakter bırakmaz', () => {
    expect(imzaKimligi('a<b>"c"')).toMatch(/^Signature-[0-9a-zA-Z]*$/);
  });
});

describe('faturayiImzala', () => {
  const malzeme = testMuhuru();
  const ubl = ublFaturaUret(ornekFatura());

  it('imzayı UBL uzantı bloğunun İÇİNE koyar', () => {
    const imzali = faturayiImzala(ubl, malzeme, ETTN);
    const uzanti = imzali.slice(
      imzali.indexOf('<ext:ExtensionContent'),
      imzali.indexOf('</ext:UBLExtensions>'),
    );
    expect(uzanti).toContain('<ds:Signature');
  });

  it('XAdES imzalı özellikleri ekler', () => {
    const imzali = faturayiImzala(ubl, malzeme, ETTN);
    expect(imzali).toContain('xades:QualifyingProperties');
    expect(imzali).toContain('xades:SigningTime');
    expect(imzali).toContain('xades:SigningCertificate');
    // Sertifika özeti ve seri numarası imzalı özelliklerde olmalı.
    expect(imzali).toContain(malzeme.sertifikaOzeti);
    expect(imzali).toContain(malzeme.seriNo);
  });

  it('sertifikayı KeyInfo içinde taşır', () => {
    const imzali = faturayiImzala(ubl, malzeme, ETTN);
    expect(imzali).toContain('<ds:X509Certificate>');
    expect(imzali).toContain(malzeme.sertifikaB64.slice(0, 40));
  });

  it('ÜRETTİĞİ İMZA DOĞRULANIYOR', () => {
    /*
      Asıl sınama bu: özet, kanonikleştirme ve imza zinciri kendi içinde
      tutarlı mı? Elle yazılmış bir C14N burada düşerdi.
    */
    const imzali = faturayiImzala(ubl, malzeme, ETTN);
    expect(imzaGecerliMi(imzali)).toBe(true);
  });

  it('belge SONRADAN değiştirilirse imza DÜŞER', () => {
    // İmzanın işe yaradığının kanıtı: tutar değişince doğrulama bozulmalı.
    const imzali = faturayiImzala(ubl, malzeme, ETTN);
    const kurcalanmis = imzali.replace('1200.00', '1.00');
    expect(kurcalanmis).not.toBe(imzali);
    expect(imzaGecerliMi(kurcalanmis)).toBe(false);
  });

  it('Türkçe karakterli belgeyi de doğru imzalar', () => {
    /*
      "Öz & Kardeşler" gibi bir unvan UTF-8 ve XML kaçışı birlikte
      çalışmazsa özet tutmaz.
    */
    const imzali = faturayiImzala(ubl, malzeme, ETTN);
    expect(imzali).toContain('Öz &amp; Kardeşler');
    expect(imzaGecerliMi(imzali)).toBe(true);
  });

  it('süresi dolmuş mühürle imzalamayı REDDEDER', () => {
    // Göndermeden durdurmak bir zarf turu kazandırıyor.
    const gelecek = new Date(malzeme.bitis.getTime() + 86_400_000);
    expect(() => faturayiImzala(ubl, malzeme, ETTN, gelecek))
      .toThrow(/süresi dolmuş/);
  });

  it('aynı zamanda aynı belgeyi aynı şekilde imzalar', () => {
    // Zaman dışarıdan verilebiliyor; verilmeseydi karşılaştırma yapılamazdı.
    const zaman = new Date('2026-09-13T12:00:00.000Z');
    const a = faturayiImzala(ubl, malzeme, ETTN, zaman);
    const b = faturayiImzala(ubl, malzeme, ETTN, zaman);
    expect(a).toBe(b);
  });
});

describe('parolalı anahtar', () => {
  it('parolalı PEM ile de imzalayabilir', () => {
    const dizin = mkdtempSync(join(tmpdir(), 'gib-parola-'));
    const anahtarYolu = join(dizin, 'k.pem');
    const sertifikaYolu = join(dizin, 'c.pem');
    execFileSync('openssl', [
      'req', '-x509', '-newkey', 'rsa:2048',
      '-keyout', anahtarYolu, '-out', sertifikaYolu,
      '-days', '2', '-subj', '/C=TR/O=Test/CN=Parolali',
      '-passout', 'pass:gizli123',
    ], { stdio: 'ignore' });

    const sertifikaPem = readFileSync(sertifikaYolu, 'utf8');
    const sertifika = new X509Certificate(sertifikaPem);
    const malzeme: MuhurMalzemesi = {
      sertifikaB64: pemGovdesi(sertifikaPem),
      anahtarPem: readFileSync(anahtarYolu, 'utf8'),
      parola: 'gizli123',
      verenAd: verenAdiniBicimle(sertifika.issuer),
      seriNo: BigInt(`0x${sertifika.serialNumber}`).toString(10),
      sertifikaOzeti: createHash('sha256').update(sertifika.raw).digest('base64'),
      bitis: new Date(sertifika.validTo),
    };

    const imzali = faturayiImzala(ublFaturaUret(ornekFatura()), malzeme, ETTN);
    expect(imzaGecerliMi(imzali)).toBe(true);
    writeFileSync(join(dizin, 'imzali.xml'), imzali);
  });
});
