/**
 * Takvimdeki özel günler (madde 30).
 *
 * Günler iki kaynaktan geliyor: ortak resmî tatiller (işletmeye bağlı
 * olmayan satırlar) ve işletmenin kendi eklediği günler. Ayrımı burada
 * yapmak önemli: ortak bir günü silmeye çalışan kullanıcıya "yetkiniz
 * yok" hatası düşerdi, oysa o satır zaten kimsenin değil.
 */
import type { SpecialDay, SpecialDayKind } from '../types';

/** Bir günde birden çok kayıt olabilir (arife + kandil aynı güne düşebilir). */
export function gunlereGore(gunler: SpecialDay[]): Map<string, SpecialDay[]> {
  const harita = new Map<string, SpecialDay[]>();
  for (const g of gunler) {
    const liste = harita.get(g.day) ?? [];
    liste.push(g);
    harita.set(g.day, liste);
  }
  // Aynı gündeki kayıtlar her açılışta aynı sırada dursun.
  for (const liste of harita.values()) {
    liste.sort((a, b) => a.label.localeCompare(b.label, 'tr'));
  }
  return harita;
}

/** Ortak (silinemeyen) gün mü? */
export function ortakGun(gun: SpecialDay): boolean {
  return !gun.businessId;
}

/**
 * Tarihi kesinleşmemiş gün.
 *
 * Uzak yılların dini bayramları ve hesaplanan kandiller böyle. Ekranda
 * ayrıca işaretleniyor: kesinleşmemiş bir tarihe göre rezervasyon
 * kapatmak, sonradan düzeltilmesi gereken bir karar olurdu.
 */
export function kesinlesmedi(gun: SpecialDay): boolean {
  return gun.tentative === true;
}

/** Belirli bir ayın günleri; takvim yalnızca görünen ayı çiziyor. */
export function ayinGunleri(gunler: SpecialDay[], yil: number, ay: number): SpecialDay[] {
  const onek = `${yil}-${String(ay + 1).padStart(2, '0')}`;
  return gunler
    .filter((g) => g.day.startsWith(onek))
    .sort((a, b) => a.day.localeCompare(b.day));
}

/**
 * Bugünden itibaren yaklaşan özel günler.
 *
 * Geçmiş günler DIŞARIDA: "bayram ne zaman" sorusunun cevabı geçen
 * seneki bayram değil.
 */
export function yaklasanGunler(
  gunler: SpecialDay[], bugun: string, adet = 5,
): SpecialDay[] {
  return gunler
    .filter((g) => g.day >= bugun)
    .sort((a, b) => a.day.localeCompare(b.day))
    .slice(0, adet);
}

/** Türe göre süzme; takvimdeki kutucuklar için. */
export function turdekiler(gunler: SpecialDay[], kind: SpecialDayKind): SpecialDay[] {
  return gunler.filter((g) => g.kind === kind);
}

/**
 * Sabit tarihli resmî tatiller.
 *
 * Veritabanındaki `resmi_tatilleri_tohumla` ile AYNI liste. İki yerde
 * durmasının sebebi tanıtım kipinde veritabanı olmaması; listenin
 * ayrışmaması için `ozelGun.test.ts` ikisini karşılaştırıyor.
 *
 * Dini günler ve okul tarihleri burada YOK: ilki Diyanet'in yıllık
 * takvimine, ikincisi MEB'in kararına bağlı. Hesaplanmış bir hicri tarih
 * gerçeğinden bir gün sapabilir ve o günü tatil sanmak salonu yanlış
 * karara götürür. Bu satırlar panelden giriliyor.
 */
export const SABIT_RESMI_TATILLER: { ay: number; gun: number; label: string; kind: SpecialDayKind }[] = [
  { ay: 1, gun: 1, label: 'Yılbaşı', kind: 'resmi_tatil' },
  { ay: 4, gun: 23, label: 'Ulusal Egemenlik ve Çocuk Bayramı', kind: 'resmi_tatil' },
  { ay: 5, gun: 1, label: 'Emek ve Dayanışma Günü', kind: 'resmi_tatil' },
  { ay: 5, gun: 19, label: "Atatürk'ü Anma, Gençlik ve Spor Bayramı", kind: 'resmi_tatil' },
  { ay: 7, gun: 15, label: 'Demokrasi ve Millî Birlik Günü', kind: 'resmi_tatil' },
  { ay: 8, gun: 30, label: 'Zafer Bayramı', kind: 'resmi_tatil' },
  { ay: 10, gun: 28, label: 'Cumhuriyet Bayramı arifesi', kind: 'arife' },
  { ay: 10, gun: 29, label: 'Cumhuriyet Bayramı', kind: 'resmi_tatil' },
];

/** Bir yılın sabit tarihli resmî tatilleri. */
export function resmiTatiller(yil: number): Omit<SpecialDay, 'id' | 'createdAt'>[] {
  return SABIT_RESMI_TATILLER.map((t) => ({
    day: `${yil}-${String(t.ay).padStart(2, '0')}-${String(t.gun).padStart(2, '0')}`,
    label: t.label,
    kind: t.kind,
  }));
}
