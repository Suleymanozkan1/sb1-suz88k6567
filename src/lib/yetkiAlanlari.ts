import type { Permission } from '../types';

/**
 * Panel yolu -> o yolu açan yetki.
 *
 * Menü de, rota koruması da BU tablodan besleniyor. İkisi ayrı ayrı
 * yazılsaydı biri güncellenip diğeri unutulduğunda ekran menüden kalkar
 * ama adres satırından açılmaya devam ederdi.
 *
 * Listede olmayan yol herkese açıktır (Özet gibi). Yollar ön ek olarak
 * eşleşiyor: `/panel/rezervasyonlar/:id/duzenle` da
 * `/panel/rezervasyonlar` kaydına düşer.
 */
export const YOL_YETKILERI: { yol: string; yetki: Permission }[] = [
  { yol: '/panel/takvim', yetki: 'rezervasyon.goruntule' },
  { yol: '/panel/rezervasyonlar', yetki: 'rezervasyon.goruntule' },
  { yol: '/panel/ozel-gunler', yetki: 'tanim.goruntule' },
  { yol: '/panel/musteriler', yetki: 'musteri.goruntule' },
  { yol: '/panel/musteri-adaylari', yetki: 'aday.goruntule' },
  { yol: '/panel/whatsapp-ayarlari', yetki: 'aday.duzenle' },
  { yol: '/panel/kasa', yetki: 'kasa.goruntule' },
  { yol: '/panel/odeme-bildirimleri', yetki: 'kasa.goruntule' },
  { yol: '/panel/faturalar', yetki: 'fatura.goruntule' },
  { yol: '/panel/raporlar', yetki: 'rapor.goruntule' },
  { yol: '/panel/salonlar', yetki: 'tanim.goruntule' },
  { yol: '/panel/menuler', yetki: 'tanim.goruntule' },
  { yol: '/panel/renk-ayarlari', yetki: 'tanim.goruntule' },
  { yol: '/panel/urun-hizmet', yetki: 'stok.goruntule' },
  { yol: '/panel/hatirlatmalar', yetki: 'mesaj.goruntule' },
  { yol: '/panel/sms', yetki: 'mesaj.goruntule' },
  { yol: '/panel/izinler', yetki: 'mesaj.goruntule' },
  { yol: '/panel/kullanicilar', yetki: 'kullanici.goruntule' },
  { yol: '/panel/isletmeler', yetki: 'ayarlar.duzenle' },
  { yol: '/panel/ayarlar', yetki: 'ayarlar.duzenle' },
  { yol: '/panel/denetim', yetki: 'denetim.goruntule' },
  { yol: '/panel/sistem', yetki: 'sistem.yonet' },
];

/**
 * Verilen yolu açmak için gereken yetki; yol serbestse undefined.
 *
 * En UZUN eşleşme kazanıyor: `/panel/rezervasyonlar` ile
 * `/panel/rezervasyonlar/:id/sozlesme` ayrı yetkilere bağlanabilsin.
 */
export function yolunYetkisi(yol: string): Permission | undefined {
  let bulunan: { yol: string; yetki: Permission } | undefined;
  YOL_YETKILERI.forEach((k) => {
    const eslesti = yol === k.yol || yol.startsWith(`${k.yol}/`);
    if (eslesti && (!bulunan || k.yol.length > bulunan.yol.length)) bulunan = k;
  });
  return bulunan?.yetki;
}
