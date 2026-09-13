/**
 * Tahsilat değişikliklerinden çıkan olaylar.
 *
 * Asıl kayıt veritabanı tetikleyicisinde yazılıyor (`payment_olay_yaz`);
 * burası aynı kuralın ikinci bir kopyası DEĞİL, iki farklı iş için
 * ortak tek kaynak:
 *
 *   1. Tanıtım/yerel kipte sunucu yok; olay kaydını bu modül üretiyor.
 *   2. Ekran, kaydetmeden ÖNCE "bu değişiklik ne üretecek" sorusunu
 *      soruyor (madde 9'daki uyarı buna bakıyor).
 *
 * Kural ikisinde de aynı olmak zorunda: kullanıcı ekranda gördüğü
 * uyarının karşılığının kayda da düştüğünden emin olmalı. Testler iki
 * tarafı da aynı örneklerle sınıyor.
 */
import type { Payment, PaymentEventKind, PaymentMethod } from '../types';
import { KASA_KANALLARI } from '../types';

/**
 * Para kasaya girdi mi?
 *
 * Çek ve senet GİRMEZ: ikisi de henüz tahsil edilmemiş bir vaattir.
 * Kasadaki parayla toplanırsa kasa olduğundan büyük görünür ve gerçekte
 * olmayan bir paraya göre karar alınır.
 */
export function kasayaGirdiMi(method: PaymentMethod): boolean {
  return KASA_KANALLARI.includes(method);
}

/**
 * Bir tahsilat değişikliğinin ürettiği olaylar.
 *
 * `oncesi` yoksa ekleme, `sonrasi` yoksa silme, ikisi de varsa
 * güncellemedir. Bir güncelleme BİRDEN ÇOK olay üretebilir: tutar ve tip
 * aynı anda değiştiyse ikisi de yazılır. Tek bir "güncellendi" olayı,
 * "neyin değiştiği" sorusunu cevapsız bırakırdı.
 */
export function odemeOlaylari(
  oncesi: Payment | null,
  sonrasi: Payment | null,
): PaymentEventKind[] {
  if (!oncesi && sonrasi) {
    const olaylar: PaymentEventKind[] = ['tahsilat_eklendi'];
    if (!kasayaGirdiMi(sonrasi.method)) olaylar.push('kasaya_girmedi');
    return olaylar;
  }

  if (oncesi && !sonrasi) return ['tahsilat_silindi'];
  if (!oncesi || !sonrasi) return [];

  const olaylar: PaymentEventKind[] = [];
  if (oncesi.amount !== sonrasi.amount) olaylar.push('tutar_degisti');
  if (oncesi.method !== sonrasi.method) {
    olaylar.push('tip_degisti');
    if (!kasayaGirdiMi(sonrasi.method)) olaylar.push('kasaya_girmedi');
  }
  if (oncesi.date !== sonrasi.date) olaylar.push('tarih_degisti');
  return olaylar;
}

/**
 * Şablondaki yer tutucuları doldurur.
 *
 * Veritabanındaki `render_template` ile aynı kural: yalnızca {süslü
 * parantez} içindeki bilinen adlar değişir, bilinmeyen ad OLDUĞU GİBİ
 * kalır. Boşa çevirmek, gönderenin hatayı fark etmesini engellerdi.
 */
export function odemeMetni(body: string, degerler: Record<string, string>): string {
  let cikti = body;
  for (const [ad, deger] of Object.entries(degerler)) {
    cikti = cikti.split(`{${ad}}`).join(deger);
  }
  return cikti;
}
