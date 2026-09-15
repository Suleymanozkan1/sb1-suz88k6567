/**
 * MEB çalışma takvimi çözümleyicisi.
 *
 * MEB takvimi makine okunur bir biçimde YAYIMLAMIYOR; her yıl haziranda
 * bir haber metni çıkıyor ve tarihler cümle içinde geçiyor. Bu dosya o
 * metni çözüyor.
 *
 * İFADE HER YIL DEĞİŞİYOR. Üç yılın gerçek duyurusu karşılaştırıldığında:
 *   2026-2027: "16 Kasım 2026 Pazartesi günü başlayacak ve 20 Kasım 2026
 *               Cuma günü sona erecek"
 *   2025-2026: "10-14 Kasım arasında yapılacak"      <- yıl YOK, kısa aralık
 *   2024-2025: "11-15 Kasım 2024'te yapılacak"       <- kısa aralık, yıl var
 * Üç biçim de destekleniyor; biri desteklenmeseydi o yılın tatili
 * sessizce takvime düşmezdi.
 */

const AYLAR: Record<string, number> = {
  ocak: 1, şubat: 2, subat: 2, mart: 3, nisan: 4, mayıs: 5, mayis: 5,
  haziran: 6, temmuz: 7, ağustos: 8, agustos: 8, eylül: 9, eylul: 9,
  ekim: 10, kasım: 11, kasim: 11, aralık: 12, aralik: 12,
};

const AY_DESENI = Object.keys(AYLAR).join('|');

/** HTML'i düz metne indirger. */
export function metneCevir(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface EgitimYili {
  /** Eylül-Aralık aylarının yılı. */
  ilk: number;
  /** Ocak-Ağustos aylarının yılı. */
  ikinci: number;
}

/**
 * "2026-2027" ifadesinden eğitim yılını çıkarır.
 *
 * Yıl bilgisi ŞART: duyuruda tarihlerin bir kısmı yılsız yazılıyor
 * ("8 Eylül Pazartesi") ve hangi yıla ait olduğu ancak eğitim yılından
 * anlaşılıyor.
 */
export function egitimYiliCoz(metin: string): EgitimYili | null {
  const eslesme = /(20\d{2})\s*[-–—]\s*(20\d{2})/.exec(metin);
  if (!eslesme) return null;
  const ilk = Number(eslesme[1]);
  const ikinci = Number(eslesme[2]);
  if (ikinci !== ilk + 1) return null;
  return { ilk, ikinci };
}

/** Ay numarasına göre hangi takvim yılına düştüğü. */
function yilSec(ay: number, yil: EgitimYili): number {
  // Eylül-Aralık eğitim yılının ilk yılına, Ocak-Ağustos ikinciye düşer.
  return ay >= 9 ? yil.ilk : yil.ikinci;
}

function iso(yil: number, ay: number, gun: number): string {
  return `${yil}-${String(ay).padStart(2, '0')}-${String(gun).padStart(2, '0')}`;
}

/**
 * Bir cümledeki tarihleri sırayla çıkarır.
 *
 * Desteklenen biçimler:
 *   "14 Eylül 2026"          -> tek tarih
 *   "8 Eylül"                -> yıl eğitim yılından tamamlanır
 *   "10-14 Kasım 2024"       -> aralığın İKİ UCU da döner
 *   "10-14 Kasım"            -> aynısı, yıl tamamlanır
 */
export function tarihleriAyikla(cumle: string, yil: EgitimYili): string[] {
  const sonuc: string[] = [];
  /*
    Önce ARALIK KISALTMASI aranıyor ("10-14 Kasım"). Tek tarih deseni
    önce çalıştırılsaydı "10-14 Kasım"daki 14'ü yakalar, 10'u kaçırırdı.
  */
  const aralik = new RegExp(`(\\d{1,2})\\s*[-–—]\\s*(\\d{1,2})\\s+(${AY_DESENI})\\s*(20\\d{2})?`, 'gi');
  const tekil = new RegExp(`(\\d{1,2})\\s+(${AY_DESENI})\\s*(20\\d{2})?`, 'gi');

  const kullanilan: [number, number][] = [];

  let m = aralik.exec(cumle);
  while (m) {
    const ay = AYLAR[m[3]!.toLocaleLowerCase('tr')]!;
    const y = m[4] ? Number(m[4]) : yilSec(ay, yil);
    sonuc.push(iso(y, ay, Number(m[1])));
    sonuc.push(iso(y, ay, Number(m[2])));
    kullanilan.push([m.index, m.index + m[0].length]);
    m = aralik.exec(cumle);
  }

  m = tekil.exec(cumle);
  while (m) {
    // Aralık deseninin yuttuğu bölge ikinci kez okunmasın.
    const icinde = kullanilan.some(([b, s]) => m!.index >= b && m!.index < s);
    if (!icinde) {
      const ay = AYLAR[m[2]!.toLocaleLowerCase('tr')]!;
      const y = m[3] ? Number(m[3]) : yilSec(ay, yil);
      sonuc.push(iso(y, ay, Number(m[1])));
    }
    m = tekil.exec(cumle);
  }

  return sonuc.sort();
}

/** Metni cümlelere böler. */
export function cumlelereBol(metin: string): string[] {
  return metin.split(/(?<=[.!?])\s+/).map((c) => c.trim()).filter(Boolean);
}

export interface OkulGunu {
  gun: string;
  etiket: string;
}

const KUCULT = (s: string) => s.toLocaleLowerCase('tr');

/** Başlangıç ve bitiş arasındaki HER günü üretir (ikisi dahil). */
export function gunAraligi(bas: string, bit: string): string[] {
  const b = new Date(`${bas}T00:00:00Z`);
  const s = new Date(`${bit}T00:00:00Z`);
  if (Number.isNaN(b.getTime()) || Number.isNaN(s.getTime()) || s < b) return [];
  /*
    Üst sınır: bir çözümleme hatası aralığı aylara yayarsa takvimi
    yüzlerce satırla doldurmasın. En uzun tatil yarıyıl tatili, iki hafta.
  */
  const gunler: string[] = [];
  for (let g = new Date(b); g <= s && gunler.length < 40; g.setUTCDate(g.getUTCDate() + 1)) {
    gunler.push(g.toISOString().slice(0, 10));
  }
  return gunler;
}

/**
 * Duyuru metninden okul takvimi günlerini çıkarır.
 *
 * TATİL ARALIKLARI GÜN GÜN yazılıyor: takvimde bir blok olarak görünsün.
 * Yalnızca başlangıç ve bitiş yazılsaydı aradaki günlere düşen bir düğün
 * için ekranda hiçbir işaret olmazdı.
 */
export function takvimiCoz(metin: string): OkulGunu[] {
  const yil = egitimYiliCoz(metin);
  if (!yil) return [];

  const cumleler = cumlelereBol(metin);
  const sonuc: OkulGunu[] = [];
  const eklendi = new Set<string>();

  const ekle = (gun: string, etiket: string) => {
    const anahtar = `${gun}|${etiket}`;
    if (eklendi.has(anahtar)) return;
    eklendi.add(anahtar);
    sonuc.push({ gun, etiket });
  };

  const bul = (kosul: (k: string) => boolean): string | null =>
    cumleler.find((c) => kosul(KUCULT(c))) ?? null;

  // --- Birinci dönem ara tatili
  const ara1 = bul((k) => k.includes('ara tatil')
    && (k.includes('birinci dönem') || k.includes('1. dönem') || k.includes('i̇lk dönem')));
  if (ara1) {
    const t = tarihleriAyikla(ara1, yil);
    if (t.length >= 2) gunAraligi(t[0]!, t[t.length - 1]!).forEach((g) => ekle(g, '1. ara tatil'));
  }

  // --- İkinci dönem ara tatili
  const ara2 = bul((k) => k.includes('ara tatil')
    && (k.includes('i̇kinci dönem') || k.includes('ikinci dönem') || k.includes('2. dönem')));
  if (ara2) {
    const t = tarihleriAyikla(ara2, yil);
    if (t.length >= 2) gunAraligi(t[0]!, t[t.length - 1]!).forEach((g) => ekle(g, '2. ara tatil'));
  }

  // --- Yarıyıl (sömestr) tatili
  const yariyil = bul((k) => k.includes('yarıyıl tatili') || k.includes('yariyil tatili'));
  if (yariyil) {
    const t = tarihleriAyikla(yariyil, yil);
    if (t.length >= 2) gunAraligi(t[0]!, t[t.length - 1]!).forEach((g) => ekle(g, 'Yarıyıl tatili'));
  }

  /*
    --- Okulların açılışı
    "ara tatil" geçen cümle ELENİYOR: "birinci dönem ara tatili" cümlesi
    de "birinci dönem" içeriyor ve okul açılışı kasım ayına kayardı.
  */
  const acilis = bul((k) => k.includes('birinci dönem') && !k.includes('ara tatil'));
  if (acilis) {
    const t = tarihleriAyikla(acilis, yil);
    if (t.length > 0) ekle(t[0]!, 'Okullar açılıyor');
  }

  /*
    --- Yılın bitişi
    Cümle kalıbı yıldan yıla tutmuyor:
      2026-2027: ayrı cümle, "... eğitim ve öğretim yılı, 25 Haziran 2027
                 ... tamamlanacak"
      2025-2026: ikinci dönem cümlesinin sonunda, "... 26 Haziran 2026
                 Cuma günü eğitim öğretim dönemi tamamlanacak"
      2024-2025: "İkinci dönem, ... ve 20 Haziran 2025 Cuma tamamlanacak"
                 -- "eğitim öğretim" hiç geçmiyor

    Bu yüzden cümle kalıbı yerine ANLAM aranıyor: biten bir şeyden söz
    eden cümlelerin (ara tatil ve yarıyıl hariç) EN GEÇ tarihi, öğretim
    yılının son günüdür. "eğitim öğretim yılı" ifadesi arasaydık,
    2026-2027'de ara tatil cümlesindeki "eğitim ve öğretim yılıNDA"
    önce eşleşir ve okul kasımda kapanmış görünürdü.
  */
  const bitisAdaylari = cumleler.filter((c) => {
    const k = KUCULT(c);
    if (k.includes('ara tatil') || k.includes('yarıyıl')) return false;
    return k.includes('tamamlanacak') || k.includes('sona erecek');
  });
  const bitisTarihleri = bitisAdaylari.flatMap((c) => tarihleriAyikla(c, yil));
  /*
    `.at(-1)` yerine dizin: `at` ES2022 ve Vercel'in fonksiyon
    derleyicisi daha eski bir `lib` ile çalışıyor. Boş dizide ikisi de
    `undefined` veriyor, davranış aynı.
  */
  const sirali = bitisTarihleri.sort();
  const enGec = sirali[sirali.length - 1];
  /*
    Mayıs-Ağustos sınırı bir güvenlik ağı: çözümleme kayarsa ocak ayındaki
    bir tarih "okullar kapanıyor" diye yazılmasın.
  */
  if (enGec) {
    const ay = Number(enGec.slice(5, 7));
    const y = Number(enGec.slice(0, 4));
    if (y === yil.ikinci && ay >= 5 && ay <= 8) ekle(enGec, 'Okullar kapanıyor');
  }

  return sonuc.sort((a, b) => a.gun.localeCompare(b.gun));
}
