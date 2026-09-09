import { CURRENCIES, MONTH_NAMES } from '../data/constants';
import type { Currency } from '../types';

export function currencySymbol(currency: Currency | string): string {
  return CURRENCIES.find((c) => c.value === currency)?.symbol ?? '₺';
}

/** 12.500,00 ₺ biçiminde para gösterimi */
export function formatMoney(amount: number, currency: Currency | string = 'TL'): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  const formatted = new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safe);
  return `${formatted} ${currencySymbol(currency)}`;
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('tr-TR').format(Number.isFinite(value) ? value : 0);
}

/** ISO yyyy-mm-dd -> 30.08.2026 */
export function formatDate(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}.${m}.${y}`;
}

/** ISO yyyy-mm-dd -> 30 Ağustos 2026 */
export function formatDateLong(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${MONTH_NAMES[m - 1]} ${y}`;
}

/** ISO zaman damgası -> 30.08.2026 14:05; boş/geçersiz değerde tire döner. */
export function formatDateTime(iso: string | undefined): string {
  if (!iso) return '—';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleString('tr-TR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function todayIso(): string {
  return toIso(new Date());
}

export function toIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function fromIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function addDays(iso: string, days: number): string {
  const date = fromIso(iso);
  date.setDate(date.getDate() + days);
  return toIso(date);
}

/** İki tarih arasındaki tam gün farkı (b - a) */
export function daysBetween(aIso: string, bIso: string): number {
  const a = fromIso(aIso).getTime();
  const b = fromIso(bIso).getTime();
  return Math.round((b - a) / 86400000);
}

/** 5321234567 -> 0532 123 45 67 */
export function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '').replace(/^90/, '').replace(/^0/, '');
  if (digits.length !== 10) return raw;
  return `0${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 8)} ${digits.slice(8, 10)}`;
}

export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toLocaleUpperCase('tr-TR') ?? '')
    .join('');
}

/** Türkçe karakterleri normalize ederek arama yapılabilir metin üretir */
export function normalizeTr(value: string): string {
  return value
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    // Şapkalı ünlüler (nikâh, imkân, mekân) sade karşılıklarına indirgenir:
    // hem URL üretiminde hem de aramada "nikah" ile "nikâh" eşleşsin diye.
    .replace(/â/g, 'a')
    .replace(/î/g, 'i')
    .replace(/û/g, 'u')
    .trim();
}

export function slugify(value: string): string {
  return normalizeTr(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Bir zemin rengi üzerinde okunabilir metin rengini seçer.
 *
 * Organizasyon türü renklerini kullanıcı kendisi belirliyor; hepsinin
 * üstüne beyaz yazmak WCAG 1.4.3'ün istediği 4,5:1 oranını tutturmuyordu
 * (ör. #18d26e üzerinde beyaz 2,00). Bu yüzden metin rengi, zeminin
 * bağıl parlaklığına göre koyu ya da açık seçilir.
 */
export function okunakliMetinRengi(zemin: string): '#111827' | '#ffffff' {
  const hex = zemin.replace('#', '');
  if (hex.length !== 6) return '#ffffff';
  const kanal = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const parlaklik = 0.2126 * kanal(0) + 0.7152 * kanal(2) + 0.0722 * kanal(4);
  const koyuIle = (parlaklik + 0.05) / (0.0111 + 0.05);
  const acikIle = 1.05 / (parlaklik + 0.05);
  return koyuIle >= acikIle ? '#111827' : '#ffffff';
}
