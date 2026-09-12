/**
 * WhatsApp'tan gelen serbest metni rezervasyon alanlarına çözer.
 *
 * Örnek mesaj:
 *
 *   Ömer Ay
 *   p:+905332642537
 *   oay685126@gmail.com
 *   Fiyat tahminen yemekli ve yemeksiz
 *   1000
 *   Mayısın ilk haftası
 *   düğün
 *
 * Çözümleme satır SIRASINA değil İÇERİĞİNE bakıyor. Sıraya güvenmek iki
 * yerde kırılıyordu: yukarıdaki örnekte araya bir fiyat sorusu girmiş ve
 * "dördüncü satır tarih" kuralı bozulmuş; ayrıca telefonu unutup e-postayı
 * önce yazan bir müşteri bütün alanları bir kaydırıyor. İçeriğe bakınca
 * satırların sırası da sayısı da serbest kalıyor.
 *
 * Çözümleyici hiçbir alanı uydurmuyor: emin olamadığını boş bırakıp ham
 * metni not olarak taşıyor. Kaydı açan kişi eksiği görüp tamamlıyor.
 */
import type { OrganizationType } from '../types';

export interface WhatsappTalep {
  name: string;
  phone: string;
  email: string;
  guestCount: number | null;
  /** ISO (YYYY-AA-GG). Ay adı verilip gün verilmediyse boş kalır. */
  date: string;
  organizationType: OrganizationType | '';
  /**
   * Çözülemeyen ama tarih ANLATAN satır: "Mayısın ilk haftası".
   *
   * Uydurma bir güne çevrilmiyor; salonun o gün dolu sanılmasına yol
   * açardı. Kartta etkinlik tarihinin yerinde olduğu gibi görünüyor.
   */
  dateText: string;
  /**
   * Müşterinin ne sorduğu: "yemekli yemeksiz fiyat" gibi.
   *
   * Nottan ayrı duruyor, çünkü personel kartı açtığında önce müşterinin
   * TALEBİNİ görmeli; genel notun içinde kaybolduğunda aranan kişiye ne
   * için arandığı sorulmadan konuşmaya başlanıyordu.
   */
  request: string;
  /** Yukarıdakilerin hiçbirine girmeyen satırlar. */
  note: string;
}

const AYLAR: Record<string, number> = {
  ocak: 1, şubat: 2, subat: 2, mart: 3, nisan: 4, mayıs: 5, mayis: 5, haziran: 6,
  temmuz: 7, ağustos: 8, agustos: 8, eylül: 9, eylul: 9, ekim: 10, kasım: 11,
  kasim: 11, aralık: 12, aralik: 12,
};

/**
 * Tür sözlüğü: müşteri "düğün" de yazar "dugun" da, "sunnet" de.
 * Anahtarlar küçük harfe ve ASCII'ye indirgenmiş hâlleriyle aranıyor.
 */
const TURLER: [string, OrganizationType][] = [
  ['dugun', 'Düğün'], ['sunnet', 'Sünnet'], ['nisan', 'Nişan'], ['kina', 'Kına'],
  ['konferans', 'Konferans'], ['kokteyl', 'Kokteyl'], ['nikah', 'Nikâh'],
  ['dogum gunu', 'Doğum Günü'], ['toplanti', 'Toplantı'],
];

/** Türkçe harfleri ASCII karşılığına indirger; karşılaştırma için. */
function sade(metin: string): string {
  return metin
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g')
    .replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c').replace(/â/g, 'a');
}

/**
 * Telefonu 10 haneye indirger: 5332642537.
 *
 * +90, 0090 ve baştaki 0 atılıyor; uygulamanın her yerinde numara bu
 * biçimde duruyor ve iki farklı biçim aynı müşteriyi iki kayıt yapıyordu.
 */
export function telefonSadelestir(ham: string): string {
  // "0090..." da geçerli bir uluslararası yazım; önce çıkış kodu atılıyor,
  // yoksa numara 90 ile başlamıyor sanılıp elenirdi.
  const rakam = ham.replace(/\D/g, '').replace(/^00/, '');
  if (rakam.length === 12 && rakam.startsWith('90')) return rakam.slice(-10);
  if (rakam.length === 11 && rakam.startsWith('0')) return rakam.slice(1);
  if (rakam.length === 10) return rakam;
  return '';
}

/** Satırda telefon var mı? "p:+905332642537" gibi etiketli yazımları da alır. */
function telefonBul(satir: string): string {
  const aday = satir.replace(/^[a-zçğıöşü]{0,12}\s*[:：]\s*/i, '');
  const rakam = aday.replace(/\D/g, '');
  if (rakam.length < 10 || rakam.length > 13) return '';
  return telefonSadelestir(aday);
}

const EPOSTA = /[^\s@]+@[^\s@]+\.[^\s@]{2,}/;

/**
 * Tarihi çözer.
 *
 * Üç yazım destekleniyor: 14.07.2029 / 2029-07-14 / "14 Temmuz 2029".
 * "Mayısın ilk haftası" gibi gün taşımayan ifadeler bilerek çözülmüyor:
 * uydurulan bir gün, salonun o gün dolu sanılmasına yol açar. Böyle satır
 * nota düşüyor.
 */
export function tarihCoz(satir: string, bugun = new Date()): string {
  const nokta = /(\d{1,2})[./-](\d{1,2})[./-](\d{4})/.exec(satir);
  if (nokta) return isoYap(Number(nokta[3]), Number(nokta[2]), Number(nokta[1]));

  const iso = /(\d{4})-(\d{1,2})-(\d{1,2})/.exec(satir);
  if (iso) return isoYap(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const sadeSatir = sade(satir);
  const adli = /(\d{1,2})\s+([a-z]+)(?:\s+(\d{4}))?/.exec(sadeSatir);
  if (adli) {
    const ay = AYLAR[adli[2]];
    if (ay) {
      const yil = adli[3] ? Number(adli[3]) : bugun.getFullYear();
      return isoYap(yil, ay, Number(adli[1]));
    }
  }
  return '';
}

function isoYap(yil: number, ay: number, gun: number): string {
  if (ay < 1 || ay > 12 || gun < 1 || gun > 31) return '';
  const d = new Date(Date.UTC(yil, ay - 1, gun));
  // 31 Şubat gibi taşan tarihler geçerli sayılmamalı.
  if (d.getUTCMonth() !== ay - 1 || d.getUTCDate() !== gun) return '';
  return `${yil}-${String(ay).padStart(2, '0')}-${String(gun).padStart(2, '0')}`;
}

/** Satır yalnızca bir sayı mı? Kişi sayısı böyle geliyor. */
function kisiSayisiBul(satir: string): number | null {
  const temiz = satir.replace(/\s*(kişi|kisi|davetli|adet)\s*$/i, '').trim();
  if (!/^\d{1,5}$/.test(temiz)) return null;
  const sayi = Number(temiz);
  return sayi > 0 ? sayi : null;
}

/** Satırda organizasyon türü geçiyor mu? */
function turBul(satir: string): OrganizationType | '' {
  const s = sade(satir);
  for (const [anahtar, tur] of TURLER) {
    if (new RegExp(`(^|\\W)${anahtar}(\\W|$)`).test(s)) return tur;
  }
  return '';
}

/**
 * Satır isim olabilir mi?
 *
 * Rakam, @ ve iki nokta taşımayan, en çok dört sözcüklü satır. İlk uyan
 * satır isim sayılıyor: müşteriler adını hemen hemen her zaman başa yazıyor.
 */
function isimOlabilir(satir: string): boolean {
  if (/\d|@|[:：]/.test(satir)) return false;
  const sozcukler = satir.trim().split(/\s+/);
  return sozcukler.length >= 1 && sozcukler.length <= 4 && satir.trim().length >= 3;
}

/**
 * Satır bir tarih ANLATIYOR mu?
 *
 * Kesin tarih değil, "Mayıs ilk hafta" / "yaz sonu" gibi ifadeler. Talep
 * cümlesinden ayırmak için; ikisi aynı torbaya girince kartta tarih alanı
 * boş, not alanı kalabalık görünüyordu.
 *
 * Ay adı ararken sonuna en çok dört harflik ek kabul ediliyor ("mayısta",
 * "mayısın"). Ek sınırsız bırakılsaydı "martı", "ekimden" gibi kelimelerin
 * yanında ay adıyla başlayan alakasız kelimeler de tarih sayılırdı.
 */
function tarihAnlatiyorMu(satir: string): boolean {
  const s = sade(satir);
  if (/\b(hafta|ayin|ayinin|basi|basinda|sonu|sonunda|ortasi|ortasinda)\b/.test(s)) return true;
  if (/\b(yaz|kis|ilkbahar|sonbahar|bayram|sezon)\b/.test(s)) return true;
  for (const ay of Object.keys(AYLAR)) {
    if (new RegExp(`(^|\\W)${ay}[a-z]{0,4}(\\W|$)`).test(s)) return true;
  }
  return false;
}

export function talebiCoz(ham: string, bugun = new Date()): WhatsappTalep {
  const sonuc: WhatsappTalep = {
    name: '', phone: '', email: '', guestCount: null, date: '',
    organizationType: '', dateText: '', request: '', note: '',
  };
  /*
    Artan satırlar bayrakla taşınıyor. "turDan" işareti gerekli: "nisan"
    hem bir ay adı hem de bir organizasyon türü ("Nişan"). Bayrak olmadan
    "nişan yapacağız, salon arıyoruz" satırı tarih ifadesi sanılır ve
    kartta etkinlik tarihinin yerine yazılırdı.
  */
  const artan: { metin: string; turDan: boolean }[] = [];

  for (const satirHam of ham.split(/\r?\n/)) {
    const satir = satirHam.trim();
    if (!satir) continue;

    const eposta = EPOSTA.exec(satir);
    if (!sonuc.email && eposta) { sonuc.email = eposta[0].toLowerCase(); continue; }

    if (!sonuc.phone) {
      const tel = telefonBul(satir);
      if (tel) { sonuc.phone = tel; continue; }
    }

    if (sonuc.guestCount === null) {
      const kisi = kisiSayisiBul(satir);
      if (kisi !== null) { sonuc.guestCount = kisi; continue; }
    }

    if (!sonuc.date) {
      const tarih = tarihCoz(satir, bugun);
      if (tarih) { sonuc.date = tarih; continue; }
    }

    if (!sonuc.organizationType) {
      const tur = turBul(satir);
      // Tür satırı yalnızca türden ibaretse tüketilir. "Düğün salonu
      // fiyatları nedir" gibi bir cümle hem türü verir hem de not olarak
      // kalmalıdır.
      if (tur) {
        sonuc.organizationType = tur;
        if (sade(satir).split(/\s+/).length <= 2) continue;
        // Tür buradan çıktı: aynı satır tarih ifadesi olarak sayılmasın.
        artan.push({ metin: satir, turDan: true });
        continue;
      }
    }

    if (!sonuc.name && isimOlabilir(satir)) { sonuc.name = satir; continue; }

    artan.push({ metin: satir, turDan: false });
  }

  /*
    Artan satırlar üçe ayrılıyor. Tarih anlatan satır kartın tarih
    alanına, geri kalanın İLKİ talebe, kalanı nota gidiyor: müşteri
    genellikle tek cümleyle ne istediğini yazıyor, sonrakiler ek bilgi.
  */
  const tarihMi = (a: { metin: string; turDan: boolean }) =>
    !a.turDan && tarihAnlatiyorMu(a.metin);
  const tarihSatirlari = artan.filter(tarihMi).map((a) => a.metin);
  const digerleri = artan.filter((a) => !tarihMi(a)).map((a) => a.metin);
  sonuc.dateText = sonuc.date ? '' : (tarihSatirlari[0] ?? '');
  sonuc.request = digerleri[0] ?? '';
  // Tarih satırı ayrıca nota yazılmıyor: kartta iki yerde görünürdü.
  sonuc.note = [...digerleri.slice(1), ...tarihSatirlari.slice(1)].join('\n');
  return sonuc;
}

/** Çözümlemeden kaç alan çıktı? Ekranda "5/6 alan bulundu" demek için. */
export function cozulenAlanSayisi(talep: WhatsappTalep): number {
  return [talep.name, talep.phone, talep.email, talep.date, talep.organizationType]
    .filter((d) => d !== '').length + (talep.guestCount !== null ? 1 : 0);
}
