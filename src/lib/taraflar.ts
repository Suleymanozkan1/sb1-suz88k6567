/**
 * Rezervasyon taraflarının etiketleri.
 *
 * NEDEN SABİT "DAMAT / GELİN" DEĞİL. Sistem yalnızca düğün tutmuyor:
 * sünnet, konferans, doğum günü, toplantı da aynı kayıtla açılıyor. Form
 * her zaman "Damat Adı Soyadı" deseydi, bir şirket toplantısını giren
 * kişi kendi müşterisini damat diye kaydetmek zorunda kalırdı.
 *
 * NEDEN YENİ ALAN AÇILMADI. Kayıtta zaten iki taraf var:
 * `customerName` (sözleşmeyi imzalayan) ve `secondPersonName`
 * (sözleşmedeki "Gelin ve Damat" satırının ikinci yarısı). Ayrıca
 * `groomName`/`brideName` açılsaydı aynı kişi iki alanda dururdu ve
 * hangisinin doğru olduğu -- özellikle biri güncellenip öteki
 * unutulduğunda -- bilinemezdi. Değişen şey verinin kendisi değil,
 * kullanıcıya nasıl sorulduğu.
 */
import type { OrganizationType } from '../types';

export interface TarafEtiketleri {
  /** Sözleşmeyi imzalayan taraf. */
  birinci: string;
  /** İkinci taraf. */
  ikinci: string;
}

/**
 * Çiftin iki tarafı olarak yürüyen organizasyonlar.
 *
 * Nikâh ve kına da burada: ikisinde de damat ve gelin var. Sünnet
 * dışarıda -- orada ikinci kişi anne/baba ya da akraba olabiliyor,
 * "gelin" demek yanlış olurdu.
 */
const CIFT_TURLERI: readonly OrganizationType[] = ['Düğün', 'Nişan', 'Kına', 'Nikâh'];

export function ciftOrganizasyonuMu(tur: OrganizationType): boolean {
  return CIFT_TURLERI.includes(tur);
}

/** Organizasyon türüne göre tarafların ekranda görünen adı. */
export function tarafEtiketleri(tur: OrganizationType): TarafEtiketleri {
  if (ciftOrganizasyonuMu(tur)) return { birinci: 'Damat', ikinci: 'Gelin' };
  return { birinci: 'Müşteri', ikinci: 'İkinci Kişi' };
}

/**
 * Memleket satırı: "Damat memleketi: Sivas · Gelin memleketi: Konya".
 *
 * Boş olanlar hiç yazılmıyor. "Gelin memleketi: -" gibi bir satır,
 * bilginin sorulup boş bırakıldığı izlenimi verirdi; oysa eski
 * kayıtlarda bu alan hiç sorulmamıştı.
 */
export function memleketOzeti(
  tur: OrganizationType,
  birinciMemleket?: string,
  ikinciMemleket?: string,
): string {
  const etiket = tarafEtiketleri(tur);
  const parcalar: string[] = [];
  const birinci = birinciMemleket?.trim();
  const ikinci = ikinciMemleket?.trim();
  if (birinci) parcalar.push(`${etiket.birinci} memleketi: ${birinci}`);
  if (ikinci) parcalar.push(`${etiket.ikinci} memleketi: ${ikinci}`);
  return parcalar.join(' · ');
}
