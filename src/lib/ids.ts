/** Kimlik ve kod üreticileri — depolamadan bağımsız saf fonksiyonlar */

export function uid(prefix = 'id'): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** DT-2026-4821 biçiminde rezervasyon kodu */
export function makeReservationCode(): string {
  const year = new Date().getFullYear();
  const n = Math.floor(1000 + Math.random() * 9000);
  return `DT-${year}-${n}`;
}

/**
 * E-posta karşılaştırması locale-bağımsız yapılır: Türkçe küçültme kuralı
 * ASCII "I" harfini "ı"ya çevirdiği için eşleşmeyi bozar.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
