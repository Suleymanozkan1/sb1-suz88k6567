/**
 * Veri isteğini hangi veritabanına göndereceğine karar verir.
 *
 * NEDEN İKİ VERİTABANI. Vergi Usul Kanunu, e-belgelerin ve fatura
 * kayıtlarının Türkiye sınırları içinde muhafazasını istiyor. Sistemin
 * geri kalanı (rezervasyon, müşteri, kasa) yurt dışındaki sunucuda
 * duruyor; yalnızca FATURA TABLOLARI Türkiye'deki veritabanına gidiyor.
 *
 * AYRIM BURADA, TEK YERDE. Depo katmanına ya da ekranlara dağıtılsaydı,
 * ileride eklenen bir fatura sorgusu yanlış ülkedeki veritabanına
 * düşerdi ve bu sessizce olurdu.
 *
 * TEK SUNUCUYLA DA ÇALIŞIR. `PGRST_FATURA_URL` tanımlı değilse hiçbir
 * ayrım yapılmıyor ve her şey eskisi gibi tek veritabanına gidiyor;
 * bölme yapmayan bir kurulum bu dosyadan etkilenmiyor.
 */

/**
 * Türkiye'de tutulan tablolar ve fonksiyonlar.
 *
 * `invoice_series` de listede: fatura numarası sırası faturayla aynı
 * veritabanında olmalı, yoksa numara ayırma işlemi iki veritabanına
 * yayılır ve çöken bir istek numarayı boşa harcayabilirdi.
 */
export const FATURA_KAYNAKLARI = [
  'invoices',
  'invoice_lines',
  'invoice_series',
  'rpc/next_invoice_number',
  'rpc/recalculate_invoice',
  // Yedek ve denetim ekranı faturaya bu iki kapıdan bakıyor; ikisi de
  // ana veritabanında da tanımlı (0040), böylece bölme yapılmamış
  // kurulumda aynı çağrı yine karşılık buluyor.
  'rpc/export_invoice_data',
  'rpc/fatura_denetim_kaydi',
] as const;

/**
 * Yolun hedeflediği PostgREST kaynağını çıkarır.
 *
 * `/veri/invoices?select=*` -> `invoices`
 * `/veri/rpc/next_invoice_number` -> `rpc/next_invoice_number`
 *
 * `/veri` ön eki isteğe bağlı: tarayıcıdan gelen istekler onu taşıyor,
 * sunucu içindeki service_role çağrıları (api/_db.ts) taşımıyor. İkisi
 * aynı karara varmalı, yoksa fatura uç noktası ile fatura ekranı farklı
 * veritabanlarına bakar.
 */
export function kaynakAdi(yol: string): string {
  const temiz = yol.replace(/^\/veri\/?/, '').split('?')[0] ?? '';
  const parcalar = temiz.split('/').filter(Boolean);
  if (parcalar[0] === 'rpc' && parcalar[1]) return `rpc/${parcalar[1]}`;
  return parcalar[0] ?? '';
}

/** Bu istek Türkiye'deki veritabanına mı gitmeli? */
export function faturaKaynagiMi(yol: string): boolean {
  const kaynak = kaynakAdi(yol);
  return (FATURA_KAYNAKLARI as readonly string[]).includes(kaynak);
}

/**
 * İsteğin gideceği PostgREST adresi.
 *
 * `faturaKoku` boşsa bölme yapılmamış demektir ve her şey ana
 * veritabanına gider.
 */
export function hedefKok(yol: string, anaKok: string, faturaKoku?: string): string {
  if (faturaKoku && faturaKaynagiMi(yol)) return faturaKoku;
  return anaKok;
}
