/** Kimlik ve kod üreticileri: depolamadan bağımsız saf fonksiyonlar */

export function uid(prefix = 'id'): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Sözleşme numarası biçimi: yıl-sıra. 2026'nın ilk sözleşmesi 2026-1,
 * ikincisi 2026-2 olur. Yılı numaranın kendisi taşıdığı için sıra her yıl
 * 1'den başlar ve 2026-1 ile 2027-1 çakışmaz.
 *
 * Tire, yıl ile sırayı gözle ayırıyor: tiresiz yazıldığında 20261 ve 202610
 * aynı uzunlukta olmadıkları hâlde birbirine benziyor, telefonda okunurken
 * karışıyordu.
 *
 * Sıra dokuz haneyi geçmez: daha uzun bir kod sayıya çevrilirken taşar ve
 * numaralandırma sessizce bozulur.
 *
 * Tire isteğe bağlı okunuyor: tiresiz yazılmış eski numaralar (20261) da bu
 * yılın dizisine ait sayılır, yoksa sıra baştan başlar ve aynı yılın iki
 * kaydı "1 numara" olur.
 */
const SIRA_KALIBI = (yil: number) => new RegExp(`^${yil}-?([0-9]{1,9})$`);

/** Bir kod bu yılın sözleşme dizisine aitse sırasını döndürür, değilse null. */
export function contractSequence(code: string, year: number): number | null {
  const eslesme = SIRA_KALIBI(year).exec(code.trim());
  return eslesme ? Number(eslesme[1]) : null;
}

/**
 * Verilen kodların ardından gelen sözleşme numarasını üretir.
 *
 * Biçime uymayan eski kodlar yok sayılır; onların varlığı yeni diziyi
 * geriye çekmemeli. Silinmiş kayıtlar yüzünden numara geri sarmasın diye
 * çağıran taraf ayrıca kendi sayacını tutabilir; bu fonksiyon yalnızca
 * "kullanılmış en büyük + 1" değerini verir.
 */
export function nextContractCode(existingCodes: readonly string[], year = new Date().getFullYear()): string {
  let enBuyuk = 0;
  for (const code of existingCodes) {
    const sira = contractSequence(code, year);
    if (sira !== null && sira > enBuyuk) enBuyuk = sira;
  }
  return `${year}-${enBuyuk + 1}`;
}

/**
 * E-posta karşılaştırması locale-bağımsız yapılır: Türkçe küçültme kuralı
 * ASCII "I" harfini "ı"ya çevirdiği için eşleşmeyi bozar.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
