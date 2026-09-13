/**
 * Demo takvimini canlı kaynaktan tazeler.
 *
 * İKİ KATMAN VAR ve ikisi farklı işi yapıyor:
 *
 *   1. `uretilmis-gunler.ts` -- pakete gömülü. Uygulama açılır açılmaz
 *      takvim dolu geliyor; ağ beklenmiyor, uçtan uca testler dış
 *      isteklere kapalı olduğu için orada da bu kullanılıyor.
 *
 *   2. `/api/demo-gunler` -- Vercel fonksiyonu. Ayda bir cron'la
 *      tazelenen canlı veri. Gömülü dosya eskidiğinde ekranı güncel
 *      tutan budur.
 *
 * Sıra önemli: önce gömülü veri yazılıyor (tohum), sonra bu fonksiyon
 * canlı veriyle üzerine yazıyor. Tersi olsaydı ağ yavaş olduğunda
 * takvim bir süre boş görünürdü.
 *
 * Başarısızlık SESSİZ. Fonksiyon yayında değilse ya da kaynak düştüyse
 * gömülü veri kalıyor; tanıtım ekranında hata mesajı çıkarmanın anlamı
 * yok.
 */
import type { SpecialDay } from '../../types';
import { KEYS, read, write } from '../storage';

interface Yanit {
  uretim?: string;
  gunler?: { day: string; label: string; kind: string; tentative?: boolean }[];
}

export const DEMO_GUN_ADRESI = '/api/demo-gunler';

/**
 * Canlı veriyi çeker ve depoya yazar.
 *
 * `zamanAsimi` veriliyor: tanıtım ekranı, cevap vermeyen bir uç nokta
 * yüzünden beklemede kalmamalı.
 */
export async function gunleriTazele(zamanAsimi = 6_000): Promise<boolean> {
  try {
    const yanit = await fetch(DEMO_GUN_ADRESI, {
      signal: AbortSignal.timeout(zamanAsimi),
    });
    if (!yanit.ok) return false;

    const govde = (await yanit.json()) as Yanit;
    const gelen = govde.gunler ?? [];
    if (gelen.length === 0) return false;

    /*
      İşletmeye özel günler korunuyor: kullanıcının demo sırasında elle
      eklediği bir gün, canlı veri geldi diye silinmemeli. Yalnızca
      sağlayıcıdan gelen kayıtlar değiştiriliyor.
    */
    const mevcut = read<SpecialDay[]>(KEYS.specialDays, []);
    const elleEklenen = mevcut.filter((g) => g.source === 'isletme');

    const yeni: SpecialDay[] = gelen.map((g, i) => ({
      id: `ozelgun_canli_${i}`,
      day: g.day,
      label: g.label,
      kind: g.kind as SpecialDay['kind'],
      source: 'saglayici',
      tentative: g.tentative,
      createdAt: new Date().toISOString(),
    }));

    write(KEYS.specialDays, [...yeni, ...elleEklenen]);
    return true;
  } catch {
    return false;
  }
}
