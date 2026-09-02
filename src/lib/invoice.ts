/**
 * Fatura tutar hesapları.
 *
 * Tüm aritmetik KURUŞ cinsinden tamsayı ile yapılır. Ondalıklı sayılarla
 * çalışmak (0.1 + 0.2 !== 0.3) fatura toplamlarında kuruş sapmasına yol
 * açar; vergi belgesinde bu kabul edilemez.
 *
 * Yuvarlama kuralı: her satır kendi içinde yuvarlanır, sonra toplanır.
 * Toplam üzerinden yuvarlama yapılmaz — aksi hâlde satır toplamları ile
 * fatura toplamı tutmaz.
 */

/** Türkiye'de geçerli KDV oranları (yüzde) */
export const VAT_RATES = [0, 1, 10, 20] as const;
export type VatRate = (typeof VAT_RATES)[number];

/** Fatura satırı girdisi — tutarlar TL cinsinden ondalıklı gelir */
export interface InvoiceLineInput {
  description: string;
  /** Miktar (adet, kişi, gün…) */
  quantity: number;
  unit: string;
  /** Birim fiyat (KDV hariç), TL */
  unitPrice: number;
  /** İskonto oranı, yüzde (0-100) */
  discountRate?: number;
  vatRate: VatRate;
}

/** Hesaplanmış satır — tüm tutarlar kuruş cinsinden tamsayı */
export interface InvoiceLineTotals {
  /** Miktar × birim fiyat */
  grossKurus: number;
  discountKurus: number;
  /** KDV matrahı = brüt - iskonto */
  baseKurus: number;
  vatKurus: number;
  /** Matrah + KDV */
  totalKurus: number;
}

export interface InvoiceTotals {
  lines: InvoiceLineTotals[];
  grossKurus: number;
  discountKurus: number;
  baseKurus: number;
  vatKurus: number;
  totalKurus: number;
  /** Oran bazında KDV dökümü — faturada gösterilmesi zorunludur */
  vatBreakdown: { rate: VatRate; baseKurus: number; vatKurus: number }[];
}

/** TL değerini kuruşa çevirir (yarım yukarı yuvarlama) */
export function toKurus(amount: number): number {
  if (!Number.isFinite(amount)) return 0;
  return roundHalfUp(amount * 100);
}

/** Kuruşu TL'ye çevirir */
export function fromKurus(kurus: number): number {
  return kurus / 100;
}

/**
 * Yarım yukarı yuvarlama.
 * JavaScript'in Math.round'u negatif sayılarda yarımı yukarı (sıfıra doğru)
 * yuvarlar; fatura hesabında mutlak değere göre tutarlı davranış gerekir.
 */
export function roundHalfUp(value: number): number {
  // Kayan nokta artığını temizle: 1.005 * 100 = 100.49999999999999
  const corrected = Number(value.toPrecision(12));
  return corrected < 0 ? -Math.round(-corrected) : Math.round(corrected);
}

/** Tek satırın tutarlarını hesaplar */
export function computeLine(line: InvoiceLineInput): InvoiceLineTotals {
  const quantity = Number.isFinite(line.quantity) ? line.quantity : 0;
  const unitPriceKurus = toKurus(line.unitPrice);

  // Miktar ondalıklı olabilir (ör. 2,5 gün); sonuç kuruşa yuvarlanır
  const grossKurus = roundHalfUp(unitPriceKurus * quantity);

  const rate = Math.min(100, Math.max(0, line.discountRate ?? 0));
  const discountKurus = roundHalfUp((grossKurus * rate) / 100);

  const baseKurus = grossKurus - discountKurus;
  const vatKurus = roundHalfUp((baseKurus * line.vatRate) / 100);

  return {
    grossKurus,
    discountKurus,
    baseKurus,
    vatKurus,
    totalKurus: baseKurus + vatKurus,
  };
}

/** Faturanın tüm tutarlarını ve KDV dökümünü hesaplar */
export function computeInvoice(lines: InvoiceLineInput[]): InvoiceTotals {
  const computed = lines.map(computeLine);

  const sum = (pick: (l: InvoiceLineTotals) => number) =>
    computed.reduce((acc, l) => acc + pick(l), 0);

  // KDV dökümü: aynı orandaki satırlar birleştirilir
  const byRate = new Map<VatRate, { baseKurus: number; vatKurus: number }>();
  lines.forEach((line, index) => {
    const totals = computed[index];
    const current = byRate.get(line.vatRate) ?? { baseKurus: 0, vatKurus: 0 };
    byRate.set(line.vatRate, {
      baseKurus: current.baseKurus + totals.baseKurus,
      vatKurus: current.vatKurus + totals.vatKurus,
    });
  });

  return {
    lines: computed,
    grossKurus: sum((l) => l.grossKurus),
    discountKurus: sum((l) => l.discountKurus),
    baseKurus: sum((l) => l.baseKurus),
    vatKurus: sum((l) => l.vatKurus),
    totalKurus: sum((l) => l.totalKurus),
    vatBreakdown: [...byRate.entries()]
      .map(([rate, value]) => ({ rate, ...value }))
      .sort((a, b) => a.rate - b.rate),
  };
}

/**
 * e-Arşiv fatura numarası biçimi: 3 harf + 4 haneli yıl + 9 haneli sıra.
 * Örnek: DGT2026000000001 (16 karakter)
 */
export function formatInvoiceNumber(prefix: string, year: number, sequence: number): string {
  const cleanPrefix = prefix.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3).padEnd(3, 'X');
  return `${cleanPrefix}${year}${String(sequence).padStart(9, '0')}`;
}

export function isValidInvoiceNumber(value: string): boolean {
  return /^[A-Z0-9]{3}\d{4}\d{9}$/.test(value);
}

/** T.C. kimlik numarası doğrulaması (11 hane, algoritmik) */
export function isValidTckn(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  if (!/^[1-9]\d{10}$/.test(digits)) return false;

  const d = digits.split('').map(Number);
  const oddSum = d[0] + d[2] + d[4] + d[6] + d[8];
  const evenSum = d[1] + d[3] + d[5] + d[7];

  const tenth = (oddSum * 7 - evenSum) % 10;
  if (tenth !== d[9]) return false;

  const eleventh = d.slice(0, 10).reduce((a, b) => a + b, 0) % 10;
  return eleventh === d[10];
}

/** Vergi kimlik numarası doğrulaması (10 hane, algoritmik) */
export function isValidVkn(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  if (!/^\d{10}$/.test(digits)) return false;

  const d = digits.split('').map(Number);
  let sum = 0;
  for (let i = 0; i < 9; i += 1) {
    const tmp = (d[i] + (10 - i)) % 10;
    if (tmp === 0) {
      sum += 9;
    } else {
      sum += (tmp * 2 ** (10 - i)) % 9 || 9;
    }
  }
  return (10 - (sum % 10)) % 10 === d[9];
}

/**
 * Fatura düzenleme süresi (VUK): mal/hizmet teslim tarihinden itibaren
 * 7 gün. Süre dolduysa uyarı verilir.
 */
export const INVOICE_DEADLINE_DAYS = 7;

export function invoiceDeadlineStatus(
  serviceDateIso: string, todayIso: string,
): { daysLeft: number; overdue: boolean } {
  const service = new Date(`${serviceDateIso}T00:00:00Z`).getTime();
  const today = new Date(`${todayIso}T00:00:00Z`).getTime();
  const elapsed = Math.floor((today - service) / 86_400_000);
  const daysLeft = INVOICE_DEADLINE_DAYS - elapsed;
  return { daysLeft, overdue: daysLeft < 0 };
}
