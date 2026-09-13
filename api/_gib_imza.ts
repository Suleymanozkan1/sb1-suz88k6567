/**
 * Mali mühür ile XAdES-BES imzalama (GİB doğrudan entegrasyon).
 *
 * UBL-TR faturası, mali mühür sertifikasıyla imzalanmadan GİB tarafından
 * kabul edilmiyor. İmza belgenin `ext:UBLExtensions` bloğuna gömülüyor
 * (enveloped signature).
 *
 * SERTİFİKA VE ANAHTAR YALNIZCA SUNUCUDA. Dosya yolları ortam
 * değişkeninden okunuyor; içerik hiçbir zaman veritabanına, günlüğe ya
 * da istemciye gitmiyor. Anahtar parolası da ortamdan geliyor.
 *
 * KANONİKLEŞTİRME (c14n) EL YAZISI DEĞİL. Exclusive C14N'i doğru
 * uygulamak (ad alanı yayılımı, öznitelik sırası, boşluk işleme) kolayca
 * gözden kaçan bir iş ve yanlış kanonikleştirme, GİB'in imzayı
 * reddetmesi demek. Bu yüzden `xml-crypto` kullanılıyor.
 *
 * TEST EDİLEMEYEN KISIM: imzanın GİB tarafından kabul edilip edilmediği
 * ancak gerçek mali mühür ve GİB test ortamıyla görülebilir. Bu dosyanın
 * birim testleri imzanın YAPISINI sınıyor, geçerliliğini değil.
 */
import { readFile } from 'node:fs/promises';
import { createHash, createSign, X509Certificate } from 'node:crypto';

export interface MuhurAyari {
  /** PEM ya da DER sertifika dosyası yolu. */
  sertifikaYolu: string;
  /** PEM özel anahtar dosyası yolu. */
  anahtarYolu: string;
  /** Anahtar parolası; parolasızsa boş. */
  parola?: string;
}

export function muhurAyari(): MuhurAyari | null {
  const sertifikaYolu = process.env.GIB_MUHUR_SERTIFIKA;
  const anahtarYolu = process.env.GIB_MUHUR_ANAHTAR;
  if (!sertifikaYolu || !anahtarYolu) return null;
  return { sertifikaYolu, anahtarYolu, parola: process.env.GIB_MUHUR_PAROLA };
}

export interface MuhurMalzemesi {
  /** Sertifikanın base64 gövdesi (PEM başlıkları olmadan). */
  sertifikaB64: string;
  /** İmzalamada kullanılacak PEM özel anahtar. */
  anahtarPem: string;
  parola?: string;
  /** Sertifikanın vereni ve seri numarası; XAdES bunları istiyor. */
  verenAd: string;
  seriNo: string;
  /** Sertifikanın DER özeti (SHA-256, base64). */
  sertifikaOzeti: string;
  /** Geçerlilik bitişi; süresi dolmuş mühürle imzalamak boşuna. */
  bitis: Date;
}

/** PEM gövdesini başlık satırları olmadan verir. */
export function pemGovdesi(pem: string): string {
  return pem
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '');
}

/**
 * Sertifikanın "issuer" alanını XAdES'in beklediği tek satıra çevirir.
 *
 * Node satır satır veriyor ("CN=...\nO=..."); XAdES virgülle ayrılmış
 * ters sıralı bir dizi bekliyor. Ters çevrilmezse bazı doğrulayıcılar
 * sertifikayı bulamıyor.
 */
export function verenAdiniBicimle(issuer: string): string {
  return issuer.split('\n').map((s) => s.trim()).filter(Boolean).reverse().join(',');
}

/** Mali mühür dosyalarını okur ve imzalamaya hazır hâle getirir. */
export async function muhuruYukle(ayar: MuhurAyari): Promise<MuhurMalzemesi> {
  const [sertifikaHam, anahtarHam] = await Promise.all([
    readFile(ayar.sertifikaYolu),
    readFile(ayar.anahtarYolu, 'utf8'),
  ]);

  const sertifika = new X509Certificate(sertifikaHam);
  const der = sertifika.raw;

  return {
    sertifikaB64: pemGovdesi(sertifika.toString()),
    anahtarPem: anahtarHam,
    parola: ayar.parola,
    verenAd: verenAdiniBicimle(sertifika.issuer),
    // Seri numarası onaltılık geliyor; XAdES ondalık istiyor.
    seriNo: BigInt(`0x${sertifika.serialNumber}`).toString(10),
    sertifikaOzeti: createHash('sha256').update(der).digest('base64'),
    bitis: new Date(sertifika.validTo),
  };
}

/** SHA-256 özet, base64. */
export function ozet(veri: string | Buffer): string {
  return createHash('sha256').update(veri).digest('base64');
}

/** RSA-SHA256 imza, base64. */
export function imzala(veri: string, anahtarPem: string, parola?: string): string {
  const imzaci = createSign('RSA-SHA256');
  imzaci.update(veri);
  imzaci.end();
  return imzaci.sign(
    parola ? { key: anahtarPem, passphrase: parola } : anahtarPem,
    'base64',
  );
}

/**
 * XAdES imzalı özellikler bloğunu kurar.
 *
 * Bu blok da imzalanıyor (Reference URI="#...SignedProperties"); bu
 * yüzden metni imza hesaplanmadan ÖNCE kesinleşmiş olmalı. Sonradan tek
 * bir boşluk eklense imza tutmaz.
 */
export function imzaliOzellikler(
  imzaId: string,
  malzeme: MuhurMalzemesi,
  zaman: Date,
): string {
  return `<xades:SignedProperties xmlns:xades="http://uri.etsi.org/01903/v1.3.2#" Id="${imzaId}-SignedProperties">`
    + `<xades:SignedSignatureProperties>`
      + `<xades:SigningTime>${zaman.toISOString()}</xades:SigningTime>`
      + `<xades:SigningCertificate><xades:Cert>`
        + `<xades:CertDigest>`
          + `<ds:DigestMethod xmlns:ds="http://www.w3.org/2000/09/xmldsig#" Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>`
          + `<ds:DigestValue xmlns:ds="http://www.w3.org/2000/09/xmldsig#">${malzeme.sertifikaOzeti}</ds:DigestValue>`
        + `</xades:CertDigest>`
        + `<xades:IssuerSerial>`
          + `<ds:X509IssuerName xmlns:ds="http://www.w3.org/2000/09/xmldsig#">${malzeme.verenAd}</ds:X509IssuerName>`
          + `<ds:X509SerialNumber xmlns:ds="http://www.w3.org/2000/09/xmldsig#">${malzeme.seriNo}</ds:X509SerialNumber>`
        + `</xades:IssuerSerial>`
      + `</xades:Cert></xades:SigningCertificate>`
    + `</xades:SignedSignatureProperties>`
    + `</xades:SignedProperties>`;
}

/**
 * Mührün süresi dolmuş mu?
 *
 * Süresi dolmuş mühürle imzalanan fatura GİB'den geri döner; kontrolü
 * göndermeden önce yapmak, bir zarf turu kazandırıyor.
 */
export function suresiDolmus(malzeme: MuhurMalzemesi, simdi = new Date()): boolean {
  return malzeme.bitis.getTime() <= simdi.getTime();
}
