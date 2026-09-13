/**
 * GİB zarfı (package) ve SOAP taşıması.
 *
 * e-Fatura, belge olarak değil ZARF olarak gidiyor: imzalı UBL belgesi
 * bir zarf XML'ine konuyor, zip'leniyor, base64'leniyor ve SOAP
 * isteğiyle gönderiliyor. Zarfın kendi kimliği (`zarfUUID`) var ve
 * durum sorguları o kimlikle yapılıyor -- faturanın ETTN'siyle değil.
 *
 * TAŞIMA KATMANI CANLI OLARAK DOĞRULANAMADI. GİB test ortamı
 * (efaturatest.gib.gov.tr) hem erişim izni hem de onaylı bir servis
 * kullanıcısı istiyor; ikisi de kodla sağlanamaz. Bu dosyanın testleri
 * ÜRETİLEN İSTEĞİ sınıyor (zarf yapısı, SOAP gövdesi, yanıt çözümleme),
 * GİB'in kabul edip etmediğini değil.
 */
import { deflateRawSync } from 'node:zlib';
import { randomUUID } from 'node:crypto';
import { zarfDurumu } from './_gib';

export class GibZarfError extends Error {}

/**
 * Zarf XML'ini kurar.
 *
 * Gönderici ve alıcı etiketleri GİB'in posta kutusu adresleri; VKN
 * doğrudan yazılmıyor, "urn:mail:" biçiminde etiket kullanılıyor.
 */
export function zarfKur(
  imzaliFatura: string,
  zarfUuid: string,
  gonderenEtiket: string,
  aliciEtiket: string,
  tarih = new Date(),
): string {
  return '<?xml version="1.0" encoding="UTF-8"?>'
    + '<ns3:Package xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"'
    + ' xmlns:ns2="http://www.w3.org/2000/09/xmldsig#"'
    + ' xmlns:ns3="http://www.efatura.gov.tr/package-namespace"'
    + ` xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" version="1.0">`
    + `<ns3:Header>`
      + `<ns3:From><ns3:Identifier>${gonderenEtiket}</ns3:Identifier></ns3:From>`
      + `<ns3:To><ns3:Identifier>${aliciEtiket}</ns3:Identifier></ns3:To>`
      + `<ns3:PackageID>${zarfUuid}</ns3:PackageID>`
      + `<ns3:PackageDate>${tarih.toISOString()}</ns3:PackageDate>`
    + `</ns3:Header>`
    + `<ns3:Elements>`
      + `<ns3:ElementType xsi:type="ns3:InvoiceType" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">`
      // Fatura belgesi, XML bildirimi olmadan gömülüyor: iç içe iki
      // bildirim belgeyi geçersiz kılar.
      + imzaliFatura.replace(/^<\?xml[^>]*\?>/, '')
      + `</ns3:ElementType>`
    + `</ns3:Elements>`
    + '</ns3:Package>';
}

/** Yeni bir zarf kimliği; büyük harfli UUID, GİB'in beklediği biçim. */
export function zarfKimligi(): string {
  return randomUUID().toUpperCase();
}

/**
 * Zarfı sıkıştırıp base64'ler.
 *
 * GİB zip bekliyor. Node'un yerleşik `zlib`i tek dosyalık bir zip'i
 * elle kurmayı gerektiriyor; burada minimal ama geçerli bir zip
 * üretiliyor (tek girdi, deflate).
 */
export function zarfiPaketle(zarfXml: string, dosyaAdi: string): Buffer {
  const icerik = Buffer.from(zarfXml, 'utf8');
  const sikistirilmis = deflateRawSync(icerik);
  const ad = Buffer.from(dosyaAdi, 'utf8');
  const crc = crc32(icerik);

  const yerelBaslik = Buffer.alloc(30);
  yerelBaslik.writeUInt32LE(0x04034b50, 0);   // imza
  yerelBaslik.writeUInt16LE(20, 4);           // gereken sürüm
  yerelBaslik.writeUInt16LE(0, 6);            // bayraklar
  yerelBaslik.writeUInt16LE(8, 8);            // deflate
  yerelBaslik.writeUInt16LE(0, 10);           // saat
  yerelBaslik.writeUInt16LE(0, 12);           // tarih
  yerelBaslik.writeUInt32LE(crc, 14);
  yerelBaslik.writeUInt32LE(sikistirilmis.length, 18);
  yerelBaslik.writeUInt32LE(icerik.length, 22);
  yerelBaslik.writeUInt16LE(ad.length, 26);
  yerelBaslik.writeUInt16LE(0, 28);

  const merkezi = Buffer.alloc(46);
  merkezi.writeUInt32LE(0x02014b50, 0);
  merkezi.writeUInt16LE(20, 4);
  merkezi.writeUInt16LE(20, 6);
  merkezi.writeUInt16LE(0, 8);
  merkezi.writeUInt16LE(8, 10);
  merkezi.writeUInt16LE(0, 12);
  merkezi.writeUInt16LE(0, 14);
  merkezi.writeUInt32LE(crc, 16);
  merkezi.writeUInt32LE(sikistirilmis.length, 20);
  merkezi.writeUInt32LE(icerik.length, 24);
  merkezi.writeUInt16LE(ad.length, 28);
  merkezi.writeUInt32LE(0, 42);               // yerel başlığın konumu

  const merkeziBoy = merkezi.length + ad.length;
  const merkeziKonum = yerelBaslik.length + ad.length + sikistirilmis.length;

  const son = Buffer.alloc(22);
  son.writeUInt32LE(0x06054b50, 0);
  son.writeUInt16LE(1, 8);                    // bu diskteki girdi sayısı
  son.writeUInt16LE(1, 10);                   // toplam girdi
  son.writeUInt32LE(merkeziBoy, 12);
  son.writeUInt32LE(merkeziKonum, 16);

  return Buffer.concat([yerelBaslik, ad, sikistirilmis, merkezi, ad, son]);
}

/** Zip'in istediği CRC-32. */
export function crc32(veri: Buffer): number {
  let c = ~0;
  for (let i = 0; i < veri.length; i += 1) {
    c ^= veri[i]!;
    for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (~c) >>> 0;
}

/**
 * SOAP gövdesini kurar.
 *
 * Kimlik doğrulama WS-Security UsernameToken ile; parola ham metin
 * gidiyor ama bağlantı TLS. Parola hiçbir yerde günlüğe yazılmıyor.
 */
export function soapZarfGonder(
  zarfB64: string,
  zarfUuid: string,
  kullanici: string,
  parola: string,
): string {
  return '<?xml version="1.0" encoding="UTF-8"?>'
    + '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"'
    + ' xmlns:ws="http://documentsubmission.ublprocessor.edoc.tubitak.gov.tr/">'
    + '<soap:Header>'
      + '<wsse:Security xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">'
        + '<wsse:UsernameToken>'
          + `<wsse:Username>${kacis(kullanici)}</wsse:Username>`
          + `<wsse:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText">${kacis(parola)}</wsse:Password>`
        + '</wsse:UsernameToken>'
      + '</wsse:Security>'
    + '</soap:Header>'
    + '<soap:Body><ws:sendDocument>'
      + `<RECEIVER_TYPE>PK</RECEIVER_TYPE>`
      + `<HASH>${zarfUuid}</HASH>`
      + `<BINARY_DATA>${zarfB64}</BINARY_DATA>`
    + '</ws:sendDocument></soap:Body>'
    + '</soap:Envelope>';
}

function kacis(deger: string): string {
  return deger.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export interface ZarfYaniti {
  basarili: boolean;
  kod: string;
  aciklama: string;
}

/**
 * GİB SOAP yanıtını çözer.
 *
 * SOAP Fault ÖNCE bakılıyor: hata gövdesinde durum kodu hiç
 * bulunmayabiliyor ve yanıt sessizce "başarılı" sayılırdı.
 */
export function zarfYanitiCoz(govde: string): ZarfYaniti {
  const hata = /<faultstring[^>]*>([\s\S]*?)<\/faultstring>/i.exec(govde);
  if (hata) {
    return { basarili: false, kod: 'SOAP', aciklama: hata[1]!.trim() || 'SOAP hatası' };
  }

  const kod = /<(?:\w+:)?(?:statusCode|STATUS_CODE|durumKodu)>([^<]*)<\/(?:\w+:)?(?:statusCode|STATUS_CODE|durumKodu)>/i
    .exec(govde);
  if (!kod) {
    return { basarili: false, kod: '', aciklama: 'Yanıtta durum kodu bulunamadı.' };
  }
  const temiz = kod[1]!.trim();
  return {
    basarili: ['1000', '1100', '1110', '1120', '1200'].includes(temiz),
    kod: temiz,
    aciklama: zarfDurumu(temiz),
  };
}
