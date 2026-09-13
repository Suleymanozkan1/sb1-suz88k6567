/**
 * UBL-TR faturasına XAdES-BES imzasını GÖMER.
 *
 * İmza, belgenin `ext:UBLExtensions/ext:ExtensionContent` bloğunun içine
 * yerleşiyor (enveloped signature) ve iki referans taşıyor:
 *   1. `URI=""`            -> belgenin TAMAMI
 *   2. `URI="#...SignedProperties"` -> XAdES imzalı özellikleri
 *
 * İMZA NEDEN ELLE KURULUYOR. XAdES'in imzalı özellikleri imzanın
 * İÇİNDE (`ds:Object`) duruyor ama imza hesaplanırken referans olarak
 * BULUNABİLİR olması gerekiyor. Hazır imzalayıcılar belgeyi imzalarken
 * henüz var olmayan bu bloğu bulamıyor. Bu yüzden özetler ve imza
 * burada sırayla kuruluyor.
 *
 * KANONİKLEŞTİRME YİNE DE EL YAZISI DEĞİL: exclusive C14N'i doğru
 * uygulamak (ad alanı yayılımı, öznitelik sırası, boşluk işleme) kolayca
 * gözden kaçan bir iş ve yanlış kanonikleştirme, imzanın matematiksel
 * olarak doğru ama GİB tarafından reddedilir olması demek. O iş
 * `xml-crypto`nun kanonikleştiricisine bırakılıyor. Bu, projedeki tek
 * sunucu çalışma zamanı bağımlılığı ve bilinçli bir istisna.
 *
 * NE DOĞRULANDI: imzanın KENDİ KENDİNİ doğrulaması, yerel üretilmiş bir
 * test sertifikasıyla birim testinde sınanıyor; belge sonradan
 * değiştirilirse doğrulamanın düştüğü de sınanıyor.
 *
 * NE DOĞRULANMADI: GİB'in bu imzayı KABUL edip etmediği. Bunu ancak
 * gerçek mali mühür ve GİB test ortamı gösterir.
 */
import { createHash, createPrivateKey, createSign, createVerify } from 'node:crypto';
import { DOMParser } from '@xmldom/xmldom';
import { ExclusiveCanonicalization } from 'xml-crypto';
import { imzaliOzellikler, suresiDolmus, type MuhurMalzemesi } from './_gib_imza.js';

export class GibImzaError extends Error {}

const C14N_URI = 'http://www.w3.org/2001/10/xml-exc-c14n#';
const SHA256_URI = 'http://www.w3.org/2001/04/xmlenc#sha256';
const RSA_SHA256_URI = 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256';
const ENVELOPED_URI = 'http://www.w3.org/2000/09/xmldsig#enveloped-signature';

/** Belgeye özgü imza kimliği; aynı belgede çakışmasın diye ETTN'den. */
export function imzaKimligi(ettn: string): string {
  return `Signature-${ettn.replace(/[^0-9a-zA-Z]/g, '').slice(0, 16)}`;
}

/**
 * Bir XML parçasını exclusive C14N ile kanonikleştirir.
 *
 * Parça tek başına ayrıştırılıyor; bu yüzden kullandığı her ad alanı
 * parçanın kendi üstünde bildirilmiş olmalı. `imzaliOzellikler` tam da
 * bu yüzden `ds:` ve `xades:` bildirimlerini her düğüme tekrar yazıyor.
 */
export function kanonik(xmlParcasi: string): string {
  const belge = new DOMParser().parseFromString(xmlParcasi, 'text/xml');
  const kok = belge.documentElement;
  if (!kok) throw new GibImzaError('Kanonikleştirilecek düğüm okunamadı.');
  return String(new ExclusiveCanonicalization().process(kok, {}));
}

function ozetB64(metin: string): string {
  return createHash('sha256').update(metin, 'utf8').digest('base64');
}

/**
 * Belgenin imza için kanonik hâli.
 *
 * İmza belgeye SONRADAN ekleniyor ve doğrulayıcı "enveloped-signature"
 * dönüşümüyle onu tekrar çıkarıyor. Yani özet, imzasız belgenin
 * kanonik hâli üzerinden hesaplanmalı -- burada yapılan da bu.
 *
 * `<ext:ExtensionContent/>` boş etiketinin, imza eklendikten sonra
 * `<ext:ExtensionContent></ext:ExtensionContent>` hâline gelmesi sorun
 * değil: C14N boş etiketi zaten açık-kapalı çifte genişletiyor, iki
 * biçim aynı kanonik metni veriyor.
 */
export function belgeOzeti(ublXml: string): string {
  return ozetB64(kanonik(ublXml));
}

/**
 * Faturayı imzalar ve imzalı XML'i döndürür.
 *
 * `zaman` dışarıdan alınabiliyor: testte sabitlenmezse aynı belge her
 * çalıştırmada farklı imza üretir ve karşılaştırma yapılamaz.
 */
export function faturayiImzala(
  ublXml: string,
  malzeme: MuhurMalzemesi,
  ettn: string,
  zaman = new Date(),
): string {
  if (suresiDolmus(malzeme, zaman)) {
    /*
      Süresi dolmuş mühürle imzalanan fatura GİB'den geri döner.
      Göndermeden önce durdurmak bir zarf turu kazandırıyor.
    */
    throw new GibImzaError(
      `Mali mühür sertifikasının süresi dolmuş (${malzeme.bitis.toISOString().slice(0, 10)}).`,
    );
  }
  if (!ublXml.includes('<ext:ExtensionContent/>')) {
    throw new GibImzaError('Belgede imza için ayrılmış uzantı bloğu bulunamadı.');
  }

  const imzaId = imzaKimligi(ettn);
  const ozellikler = imzaliOzellikler(imzaId, malzeme, zaman);

  // 1) İki referansın özeti
  const belgeOzet = belgeOzeti(ublXml);
  const ozellikOzet = ozetB64(kanonik(ozellikler));

  // 2) SignedInfo: imzalanacak asıl metin
  const signedInfo = `<ds:SignedInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#">`
    + `<ds:CanonicalizationMethod Algorithm="${C14N_URI}"/>`
    + `<ds:SignatureMethod Algorithm="${RSA_SHA256_URI}"/>`
    + `<ds:Reference URI="">`
      + `<ds:Transforms>`
        + `<ds:Transform Algorithm="${ENVELOPED_URI}"/>`
        + `<ds:Transform Algorithm="${C14N_URI}"/>`
      + `</ds:Transforms>`
      + `<ds:DigestMethod Algorithm="${SHA256_URI}"/>`
      + `<ds:DigestValue>${belgeOzet}</ds:DigestValue>`
    + `</ds:Reference>`
    + `<ds:Reference Type="http://uri.etsi.org/01903#SignedProperties" URI="#${imzaId}-SignedProperties">`
      + `<ds:Transforms><ds:Transform Algorithm="${C14N_URI}"/></ds:Transforms>`
      + `<ds:DigestMethod Algorithm="${SHA256_URI}"/>`
      + `<ds:DigestValue>${ozellikOzet}</ds:DigestValue>`
    + `</ds:Reference>`
    + `</ds:SignedInfo>`;

  // 3) İmza: SignedInfo'nun KANONİK hâli imzalanıyor, ham metni değil.
  const imzaci = createSign('RSA-SHA256');
  imzaci.update(kanonik(signedInfo), 'utf8');
  imzaci.end();
  const imzaDegeri = imzaci.sign(
    malzeme.parola
      ? createPrivateKey({ key: malzeme.anahtarPem, passphrase: malzeme.parola })
      : malzeme.anahtarPem,
    'base64',
  );

  // 4) İmza bloğunu kur
  const imza = `<ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#" Id="${imzaId}">`
    + signedInfo.replace(' xmlns:ds="http://www.w3.org/2000/09/xmldsig#"', '')
    + `<ds:SignatureValue>${imzaDegeri}</ds:SignatureValue>`
    + `<ds:KeyInfo><ds:X509Data>`
      + `<ds:X509Certificate>${malzeme.sertifikaB64}</ds:X509Certificate>`
    + `</ds:X509Data></ds:KeyInfo>`
    + `<ds:Object>`
      + `<xades:QualifyingProperties xmlns:xades="http://uri.etsi.org/01903/v1.3.2#" Target="#${imzaId}">`
      + ozellikler
      + `</xades:QualifyingProperties>`
    + `</ds:Object>`
    + `</ds:Signature>`;

  // 5) UBL'in ayırdığı boş uzantı bloğunun içine yerleştir
  return ublXml.replace(
    '<ext:ExtensionContent/>',
    `<ext:ExtensionContent>${imza}</ext:ExtensionContent>`,
  );
}

/**
 * İmzalı belgeyi doğrular.
 *
 * Üretim akışında kullanılmıyor; imzalama zincirinin kendi içinde
 * tutarlı olduğunu sınamak için var ve testin omurgası.
 */
export function imzaGecerliMi(imzaliXml: string): boolean {
  const imzaBlogu = /<ds:Signature\b[\s\S]*?<\/ds:Signature>/.exec(imzaliXml);
  if (!imzaBlogu) return false;

  const signedInfoEslesme = /<ds:SignedInfo\b[\s\S]*?<\/ds:SignedInfo>/.exec(imzaBlogu[0]);
  const imzaDegeri = /<ds:SignatureValue>([^<]*)<\/ds:SignatureValue>/.exec(imzaBlogu[0]);
  const sertifika = /<ds:X509Certificate>([^<]*)<\/ds:X509Certificate>/.exec(imzaBlogu[0]);
  if (!signedInfoEslesme || !imzaDegeri || !sertifika) return false;

  // Belgeden imza çıkarılıp özet yeniden hesaplanıyor (enveloped dönüşümü).
  const imzasiz = imzaliXml.replace(
    `<ext:ExtensionContent>${imzaBlogu[0]}</ext:ExtensionContent>`,
    '<ext:ExtensionContent/>',
  );
  const beklenen = /<ds:Reference URI=""[\s\S]*?<ds:DigestValue>([^<]*)<\/ds:DigestValue>/
    .exec(signedInfoEslesme[0]);
  if (!beklenen || beklenen[1] !== belgeOzeti(imzasiz)) return false;

  const signedInfo = signedInfoEslesme[0].replace(
    '<ds:SignedInfo>',
    '<ds:SignedInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#">',
  );
  const v = createVerify('RSA-SHA256');
  v.update(kanonik(signedInfo), 'utf8');
  v.end();
  return v.verify(
    `-----BEGIN CERTIFICATE-----\n${sertifika[1]}\n-----END CERTIFICATE-----`,
    imzaDegeri[1]!,
    'base64',
  );
}
