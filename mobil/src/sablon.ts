/**
 * Hatırlatma şablonu yardımcıları.
 *
 * Web tarafındaki `src/lib/sablon.ts` ile aynı kuralları uygular; iki
 * uygulamanın aynı taslaktan farklı metin üretmesi kullanıcı için hatadır.
 */

/**
 * Yer tutucuları değiştirir.
 *
 * Tek geçişte yerleştirilir: art arda `replace` çağırmak, bir değerin
 * içinde geçen "{tarih}" gibi bir metnin ikinci turda yeniden
 * değiştirilmesine yol açıyordu. Bilinmeyen bir ad olduğu gibi bırakılır —
 * boşa çevirmek "Sayın ," diye başlayan bir mesajın müşteriye gitmesine
 * yol açıyordu.
 */
export function doldur(govde: string, degerler: Record<string, string>): string {
  return govde.replace(/\{(\w+)\}/g, (tam, ad: string) =>
    Object.prototype.hasOwnProperty.call(degerler, ad) ? degerler[ad]! : tam);
}

/**
 * SMS uzunluğu.
 *
 * Türkçe'ye özgü harfler (ş, ğ, İ, ı, ç) GSM-7 alfabesinde yoktur; bir
 * tanesi bile geçtiğinde mesaj UCS-2'ye düşer ve tek parça 160 yerine 70
 * karakter olur. Kullanıcı "kısa yazdım" sanıp iki üç katı ücret ödemesin
 * diye parça sayısı ekranda gösterilir.
 */
const GSM7 = new Set(
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?'
  + '¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà'
  + '^{}\\[~]|€',
);

export interface MesajOlcusu { karakter: number; parca: number; turkce: boolean }

export function olcSms(metin: string): MesajOlcusu {
  const turkce = [...metin].some((c) => !GSM7.has(c));
  const karakter = [...metin].length;
  if (karakter === 0) return { karakter: 0, parca: 0, turkce };
  const tek = turkce ? 70 : 160;
  const cok = turkce ? 67 : 153;
  return { karakter, parca: karakter <= tek ? 1 : Math.ceil(karakter / cok), turkce };
}
