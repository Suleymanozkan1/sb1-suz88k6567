/**
 * UBL-TR 1.2 fatura belgesi üretimi (GİB doğrudan entegrasyon).
 *
 * GİB'e gönderilen fatura, TÜBİTAK/GİB'in UBL-TR 1.2 kılavuzunda
 * tanımlı XML belgesidir. Bu dosya YALNIZCA XML'i kuruyor; imzalama
 * (`_gib_imza.ts`), zarflama (`_gib_zarf.ts`) ve gönderim (`_gib.ts`)
 * ayrı dosyalarda. Böylece belgenin doğruluğu mali mühür olmadan da
 * sınanabiliyor -- imzalama adımı sertifika istiyor ve testte
 * çalıştırılamıyor.
 *
 * PARA KURUŞ CİNSİNDEN TUTULUYOR, XML'e iki ondalıkla yazılıyor.
 * Ondalık aritmetikle hesaplanıp yazılsaydı 0.1 + 0.2 = 0.30000000000004
 * gibi değerler GİB şema doğrulamasından döner.
 */

/** GİB'in beklediği para biçimi: nokta ayraçlı, iki ondalık. */
export function tutar(kurus: number): string {
  const isaret = kurus < 0 ? '-' : '';
  const mutlak = Math.abs(Math.round(kurus));
  return `${isaret}${Math.floor(mutlak / 100)}.${String(mutlak % 100).padStart(2, '0')}`;
}

/** Miktar: UBL-TR üç ondalık kabul ediyor, gereksiz sıfırlar atılıyor. */
export function miktar(deger: number): string {
  const yuvarlak = Math.round(deger * 1000) / 1000;
  return String(yuvarlak);
}

/**
 * XML metin kaçışı.
 *
 * Müşteri adı serbest metin: "Öz & Kardeşler" gibi bir ad kaçışsız
 * yazıldığında belge XML olarak bozulur ve GİB zarfı reddeder.
 */
export function xmlKacis(deger: string): string {
  return deger
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Etiket üretir; değer boşsa etiketi hiç yazmaz. */
function etiket(ad: string, deger: string | number | undefined | null): string {
  if (deger === undefined || deger === null) return '';
  const metin = String(deger).trim();
  if (!metin) return '';
  return `<${ad}>${xmlKacis(metin)}</${ad}>`;
}

export interface GibSatici {
  /** Vergi kimlik numarası (10 hane) veya TC kimlik (11 hane). */
  vknTckn: string;
  unvan: string;
  vergiDairesi: string;
  adres: string;
  ilce: string;
  il: string;
  ulke?: string;
  telefon?: string;
  eposta?: string;
  /** Web sitesi; GİB kılavuzunda isteğe bağlı. */
  web?: string;
}

export interface GibAlici {
  /** Bireysel alıcıda TC kimlik, kurumsalda VKN. */
  vknTckn?: string;
  unvan: string;
  vergiDairesi?: string;
  adres?: string;
  ilce?: string;
  il?: string;
  ulke?: string;
  telefon?: string;
  eposta?: string;
  bireysel: boolean;
}

export interface GibSatir {
  siraNo: number;
  aciklama: string;
  miktar: number;
  birim: string;
  birimFiyatKurus: number;
  /** İskonto TUTARI (kuruş), oran değil: GİB tutarı istiyor. */
  iskontoKurus: number;
  kdvOrani: number;
  matrahKurus: number;
  kdvKurus: number;
}

export interface GibFatura {
  ettn: string;
  faturaNo: string;
  /** yyyy-mm-dd */
  tarih: string;
  /** HH:mm:ss */
  saat?: string;
  /** 'SATIS' | 'IADE' | 'TEVKIFAT' | 'ISTISNA' ... */
  faturaTipi?: string;
  /** e-Fatura senaryosu: TEMELFATURA | TICARIFATURA | EARSIVFATURA */
  senaryo: string;
  paraBirimi: string;
  satici: GibSatici;
  alici: GibAlici;
  satirlar: GibSatir[];
  brutKurus: number;
  iskontoKurus: number;
  matrahKurus: number;
  kdvKurus: number;
  toplamKurus: number;
  not?: string;
}

/**
 * Birim kodunu UBL'in beklediği UN/ECE koduna çevirir.
 *
 * GİB serbest metin kabul etmiyor; "Adet" yazılırsa şema doğrulaması
 * düşer. Tanınmayan birim C62'ye (adet) düşüyor -- faturayı reddettirmek
 * yerine en yaygın birime düşmek, kullanıcının elle düzeltebileceği bir
 * sonuç bırakıyor.
 */
export function birimKodu(birim: string): string {
  const tablo: Record<string, string> = {
    adet: 'C62', ad: 'C62', tane: 'C62',
    kg: 'KGM', kilogram: 'KGM', gram: 'GRM',
    lt: 'LTR', litre: 'LTR',
    m: 'MTR', metre: 'MTR', m2: 'MTK', m3: 'MTQ',
    saat: 'HUR', gün: 'DAY', gun: 'DAY', ay: 'MON', yıl: 'ANN', yil: 'ANN',
    kişi: 'C62', kisi: 'C62', paket: 'PK', kutu: 'BX', koli: 'BX',
  };
  return tablo[birim.trim().toLocaleLowerCase('tr')] ?? 'C62';
}

/** Taraf (satıcı/alıcı) bloğu; UBL'de ikisi de aynı yapıda. */
function tarafBlogu(
  etiketAdi: string,
  taraf: GibSatici | GibAlici,
  bireysel: boolean,
): string {
  const t = taraf as GibSatici & GibAlici;
  /*
    Bireysel alıcıda PersonName, kurumsalda PartyName yazılıyor. İkisi
    birden yazılırsa GİB "şahıs mı tüzel kişi mi" ayrımını yapamıyor ve
    belgeyi reddediyor.
  */
  const kimlik = t.vknTckn
    ? `<cac:PartyIdentification><cbc:ID schemeID="${bireysel ? 'TCKN' : 'VKN'}">${xmlKacis(t.vknTckn)}</cbc:ID></cac:PartyIdentification>`
    : '';

  const ad = bireysel
    ? `<cac:Person>${etiket('cbc:FirstName', t.unvan)}</cac:Person>`
    : `<cac:PartyName>${etiket('cbc:Name', t.unvan)}</cac:PartyName>`;

  const adres = [
    etiket('cbc:StreetName', t.adres),
    etiket('cbc:CitySubdivisionName', t.ilce),
    etiket('cbc:CityName', t.il),
    `<cac:Country>${etiket('cbc:Name', t.ulke || 'Türkiye')}</cac:Country>`,
  ].filter(Boolean).join('');

  const vergi = t.vergiDairesi
    ? `<cac:PartyTaxScheme><cac:TaxScheme>${etiket('cbc:Name', t.vergiDairesi)}</cac:TaxScheme></cac:PartyTaxScheme>`
    : '';

  const iletisim = [
    etiket('cbc:Telephone', t.telefon),
    etiket('cbc:ElectronicMail', t.eposta),
  ].filter(Boolean).join('');

  return `<${etiketAdi}><cac:Party>`
    + (t.web ? etiket('cbc:WebsiteURI', t.web) : '')
    + kimlik
    + ad
    + `<cac:PostalAddress>${adres}</cac:PostalAddress>`
    + vergi
    + (iletisim ? `<cac:Contact>${iletisim}</cac:Contact>` : '')
    + `</cac:Party></${etiketAdi}>`;
}

/** Bir fatura satırının UBL karşılığı. */
function satirBlogu(s: GibSatir, paraBirimi: string): string {
  const pb = xmlKacis(paraBirimi);
  const iskonto = s.iskontoKurus > 0
    ? `<cac:AllowanceCharge>`
      + `<cbc:ChargeIndicator>false</cbc:ChargeIndicator>`
      + `<cbc:Amount currencyID="${pb}">${tutar(s.iskontoKurus)}</cbc:Amount>`
      + `</cac:AllowanceCharge>`
    : '';

  return `<cac:InvoiceLine>`
    + `<cbc:ID>${s.siraNo}</cbc:ID>`
    + `<cbc:InvoicedQuantity unitCode="${birimKodu(s.birim)}">${miktar(s.miktar)}</cbc:InvoicedQuantity>`
    + `<cbc:LineExtensionAmount currencyID="${pb}">${tutar(s.matrahKurus)}</cbc:LineExtensionAmount>`
    + iskonto
    + `<cac:TaxTotal>`
      + `<cbc:TaxAmount currencyID="${pb}">${tutar(s.kdvKurus)}</cbc:TaxAmount>`
      + `<cac:TaxSubtotal>`
        + `<cbc:TaxableAmount currencyID="${pb}">${tutar(s.matrahKurus)}</cbc:TaxableAmount>`
        + `<cbc:TaxAmount currencyID="${pb}">${tutar(s.kdvKurus)}</cbc:TaxAmount>`
        + `<cbc:Percent>${s.kdvOrani}</cbc:Percent>`
        + `<cac:TaxCategory><cac:TaxScheme>`
          + `<cbc:Name>KDV</cbc:Name><cbc:TaxTypeCode>0015</cbc:TaxTypeCode>`
        + `</cac:TaxScheme></cac:TaxCategory>`
      + `</cac:TaxSubtotal>`
    + `</cac:TaxTotal>`
    + `<cac:Item>${etiket('cbc:Name', s.aciklama)}</cac:Item>`
    + `<cac:Price><cbc:PriceAmount currencyID="${pb}">${tutar(s.birimFiyatKurus)}</cbc:PriceAmount></cac:Price>`
    + `</cac:InvoiceLine>`;
}

/**
 * UBL-TR 1.2 fatura XML'ini üretir.
 *
 * İMZA YOK. `ext:UBLExtensions` bloğu imzalama adımında ekleniyor;
 * burada üretilen belge imzalanmaya hazır ham belgedir.
 */
export function ublFaturaUret(f: GibFatura): string {
  const pb = xmlKacis(f.paraBirimi);
  const satirlar = f.satirlar.map((s) => satirBlogu(s, f.paraBirimi)).join('');

  /*
    KDV toplamı ORANA GÖRE gruplanıyor. Her satır için ayrı bir
    TaxSubtotal yazılsaydı GİB belge toplamıyla vergi toplamını
    karşılaştırırken aynı oranı birden çok kez görür ve belgeyi
    reddederdi.
  */
  const oranlar = new Map<number, { matrah: number; kdv: number }>();
  f.satirlar.forEach((s) => {
    const mevcut = oranlar.get(s.kdvOrani) ?? { matrah: 0, kdv: 0 };
    mevcut.matrah += s.matrahKurus;
    mevcut.kdv += s.kdvKurus;
    oranlar.set(s.kdvOrani, mevcut);
  });

  const vergiAltToplamlari = [...oranlar.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([oran, v]) => `<cac:TaxSubtotal>`
      + `<cbc:TaxableAmount currencyID="${pb}">${tutar(v.matrah)}</cbc:TaxableAmount>`
      + `<cbc:TaxAmount currencyID="${pb}">${tutar(v.kdv)}</cbc:TaxAmount>`
      + `<cbc:Percent>${oran}</cbc:Percent>`
      + `<cac:TaxCategory><cac:TaxScheme>`
        + `<cbc:Name>KDV</cbc:Name><cbc:TaxTypeCode>0015</cbc:TaxTypeCode>`
      + `</cac:TaxScheme></cac:TaxCategory>`
      + `</cac:TaxSubtotal>`)
    .join('');

  const iskontoBlogu = f.iskontoKurus > 0
    ? `<cac:AllowanceCharge>`
      + `<cbc:ChargeIndicator>false</cbc:ChargeIndicator>`
      + `<cbc:Amount currencyID="${pb}">${tutar(f.iskontoKurus)}</cbc:Amount>`
      + `</cac:AllowanceCharge>`
    : '';

  return '<?xml version="1.0" encoding="UTF-8"?>'
    + '<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"'
    + ' xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"'
    + ' xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"'
    + ' xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2"'
    + ' xmlns:ds="http://www.w3.org/2000/09/xmldsig#">'
    + '<ext:UBLExtensions><ext:UBLExtension><ext:ExtensionContent/></ext:UBLExtension></ext:UBLExtensions>'
    + '<cbc:UBLVersionID>2.1</cbc:UBLVersionID>'
    + '<cbc:CustomizationID>TR1.2</cbc:CustomizationID>'
    + `<cbc:ProfileID>${xmlKacis(f.senaryo)}</cbc:ProfileID>`
    + `<cbc:ID>${xmlKacis(f.faturaNo)}</cbc:ID>`
    // ETTN küçük harfli olmak zorunda: GİB büyük harfli UUID'yi reddediyor.
    + `<cbc:UUID>${xmlKacis(f.ettn.toLowerCase())}</cbc:UUID>`
    + `<cbc:IssueDate>${xmlKacis(f.tarih)}</cbc:IssueDate>`
    + `<cbc:IssueTime>${xmlKacis(f.saat ?? '00:00:00')}</cbc:IssueTime>`
    + `<cbc:InvoiceTypeCode>${xmlKacis(f.faturaTipi ?? 'SATIS')}</cbc:InvoiceTypeCode>`
    + etiket('cbc:Note', f.not)
    + `<cbc:DocumentCurrencyCode>${pb}</cbc:DocumentCurrencyCode>`
    + `<cbc:LineCountNumeric>${f.satirlar.length}</cbc:LineCountNumeric>`
    + tarafBlogu('cac:AccountingSupplierParty', f.satici, false)
    + tarafBlogu('cac:AccountingCustomerParty', f.alici, f.alici.bireysel)
    + iskontoBlogu
    + `<cac:TaxTotal>`
      + `<cbc:TaxAmount currencyID="${pb}">${tutar(f.kdvKurus)}</cbc:TaxAmount>`
      + vergiAltToplamlari
    + `</cac:TaxTotal>`
    + `<cac:LegalMonetaryTotal>`
      + `<cbc:LineExtensionAmount currencyID="${pb}">${tutar(f.matrahKurus)}</cbc:LineExtensionAmount>`
      + `<cbc:TaxExclusiveAmount currencyID="${pb}">${tutar(f.matrahKurus)}</cbc:TaxExclusiveAmount>`
      + `<cbc:TaxInclusiveAmount currencyID="${pb}">${tutar(f.toplamKurus)}</cbc:TaxInclusiveAmount>`
      + `<cbc:AllowanceTotalAmount currencyID="${pb}">${tutar(f.iskontoKurus)}</cbc:AllowanceTotalAmount>`
      + `<cbc:PayableAmount currencyID="${pb}">${tutar(f.toplamKurus)}</cbc:PayableAmount>`
    + `</cac:LegalMonetaryTotal>`
    + satirlar
    + '</Invoice>';
}
