/**
 * Biçimlendirme yardımcıları.
 *
 * Web tarafındaki `src/lib/format.ts` ile aynı kuralları uygular; iki
 * uygulamanın aynı tutarı farklı göstermesi kullanıcı için hatadır.
 * Tutarlar veritabanında kuruş cinsinden tamsayı tutulur.
 */

/**
 * ICU'nun `style: 'currency'` biçimi Türkçe yerelde simgeyi başa koyuyor
 * (₺12.500,00). Türkçe yazımda simge sonda; web tarafı da simgeyi elle
 * ekliyor. İki uygulamanın aynı tutarı farklı göstermesi kullanıcı için
 * hatadır, bu yüzden burada da aynı yol izleniyor.
 */
const SAYI = new Intl.NumberFormat('tr-TR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Kuruş cinsinden tamsayıyı "12.500,00 ₺" biçimine çevirir. */
export function tutar(kurus: number): string {
  const guvenli = Number.isFinite(kurus) ? kurus : 0;
  return `${SAYI.format(guvenli / 100)} ₺`;
}

/** Kuruşu kısa gösterim için yuvarlar: 1.250.000 → "12.500 ₺" */
export function tutarKisa(kurus: number): string {
  return `${new Intl.NumberFormat('tr-TR').format(Math.round(kurus / 100))} ₺`;
}

const GUNLER = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const AYLAR = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];

/** ISO tarihten yerel bir Date üretir; saat dilimi kaymasını önler. */
export function isoTarih(iso: string): Date {
  const [y, a, g] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y!, (a ?? 1) - 1, g ?? 1);
}

export function bugunIso(): string {
  return yerelIso(new Date());
}

/** Date → "2026-09-26" (UTC'ye çevirmeden, yerel günü koruyarak). */
export function yerelIso(t: Date): string {
  const iki = (n: number) => String(n).padStart(2, '0');
  return `${t.getFullYear()}-${iki(t.getMonth() + 1)}-${iki(t.getDate())}`;
}

/**
 * "26.09.2026": hatırlatma metinlerindeki {tarih} yer tutucusu.
 *
 * Sunucudaki gece görevi de tarihi bu biçimde yazıyor. İki taraf farklı
 * biçim kullanınca kullanıcı önizlemede "9 Eylül 2026" görüyor, müşteriye
 * "09.09.2026" gidiyordu; ayrıca uzun biçim mesajı bir SMS daha uzatıyor.
 */
export function tarihSayisal(iso: string): string {
  const [y, a, g] = iso.slice(0, 10).split('-');
  return y && a && g ? `${g}.${a}.${y}` : iso;
}

/** "26 Eylül 2026" */
export function tarihUzun(iso: string): string {
  const t = isoTarih(iso);
  return `${t.getDate()} ${AYLAR[t.getMonth()]} ${t.getFullYear()}`;
}

/** "26 Eyl" */
export function tarihKisa(iso: string): string {
  const t = isoTarih(iso);
  return `${t.getDate()} ${AYLAR[t.getMonth()]!.slice(0, 3)}`;
}

export function gunAdi(iso: string): string {
  return GUNLER[isoTarih(iso).getDay()]!;
}

export function ayAdi(ay: number): string {
  return AYLAR[ay]!;
}

/** "0532 123 45 67" */
export function telefon(ham: string): string {
  const r = ham.replace(/\D/g, '').replace(/^90/, '').replace(/^0/, '');
  if (r.length !== 10) return ham;
  return `0${r.slice(0, 3)} ${r.slice(3, 6)} ${r.slice(6, 8)} ${r.slice(8)}`;
}

/** Aramak için: "+905321234567" */
export function telefonUri(ham: string): string {
  const r = ham.replace(/\D/g, '').replace(/^90/, '').replace(/^0/, '');
  return `tel:+90${r}`;
}

/**
 * Bir zemin rengi üzerinde okunabilir metin rengi.
 * Organizasyon türü renklerini kullanıcı seçtiği için hepsinin üstüne
 * beyaz yazmak kontrastı düşürüyordu (ör. yeşil zeminde 2,00).
 */
export function okunakliMetin(zemin: string): '#111827' | '#ffffff' {
  const h = zemin.replace('#', '');
  if (h.length !== 6) return '#ffffff';
  const kanal = (i: number) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const p = 0.2126 * kanal(0) + 0.7152 * kanal(2) + 0.0722 * kanal(4);
  return (p + 0.05) / 0.0611 >= 1.05 / (p + 0.05) ? '#111827' : '#ffffff';
}

/** Kalan gün sayısı; geçmiş tarihlerde negatif döner. */
export function kalanGun(iso: string): number {
  const bugun = isoTarih(bugunIso()).getTime();
  return Math.round((isoTarih(iso).getTime() - bugun) / 86_400_000);
}

/** "3 gün sonra" / "bugün" / "2 gün önce" */
export function gorecelıGun(iso: string): string {
  const g = kalanGun(iso);
  if (g === 0) return 'bugün';
  if (g === 1) return 'yarın';
  if (g === -1) return 'dün';
  return g > 0 ? `${g} gün sonra` : `${-g} gün önce`;
}
