import { Etiket, Govde, Satir } from '../src/bilesenler/duzen';
import { BolumBasligi, Yazi } from '../src/bilesenler/temel';
import { tarihUzun } from '../src/bicim';
import { aralik, renk } from '../src/tema';
import { sistemDurumu, type SistemDurumu } from '../src/veri';

/**
 * Sistem durumu.
 *
 * Üç soruyu cevaplıyor: yedek alındı mı, bekleyen mesaj var mı, İYS
 * aktarımı gecikti mi. Sorun varsa renk değil metin söylüyor, durum
 * bildirimi renge bağlanamaz.
 */
export default function Sistem() {
  return (
    <Govde<SistemDurumu> yukle={sistemDurumu}>
      {(d) => {
        const yedekIyi = /başarılı|basarili/i.test(d.yedekDurum);
        return (
          <>
            <BolumBasligi>Yedekleme</BolumBasligi>
            <Satir
              baslik="Son yedek"
              alt={d.sonYedek === '-' ? 'Henüz yedek alınmamış' : tarihUzun(d.sonYedek)}
              deger={d.yedekDurum}
              degerRengi={yedekIyi ? renk.basari : renk.tehlike}
              solRenk={yedekIyi ? renk.basari : renk.tehlike}
            />

            <BolumBasligi>SMS kuyruğu</BolumBasligi>
            <Satir
              baslik="Bekleyen mesaj"
              alt="Gönderilmeyi bekleyen kayıtlar"
              deger={String(d.kuyrukBekleyen)}
              degerRengi={d.kuyrukBekleyen > 0 ? renk.uyari : renk.basari}
            />
            <Satir
              baslik="Başarısız mesaj"
              alt="Azami deneme sonunda gönderilemeyenler"
              deger={String(d.kuyrukBasarisiz)}
              degerRengi={d.kuyrukBasarisiz > 0 ? renk.tehlike : renk.basari}
              solRenk={d.kuyrukBasarisiz > 0 ? renk.tehlike : undefined}
            />

            <BolumBasligi>İYS aktarımı</BolumBasligi>
            <Satir
              baslik="Aktarılmayı bekleyen izin"
              alt="Mevzuat üç iş günü sınırı koyuyor"
              deger={String(d.iysBekleyen)}
              degerRengi={d.iysBekleyen > 0 ? renk.uyari : renk.basari}
            />

            <Etiket
              metin={d.kuyrukBasarisiz > 0 ? 'Başarısız gönderim var, panelden inceleyin' : 'Sistem normal çalışıyor'}
              tur={d.kuyrukBasarisiz > 0 ? 'kotu' : 'iyi'}
            />

            <Yazi tur="kucuk" renkli={renk.metinSolgun} style={{ marginTop: aralik.m }}>
              Yedek her gece kendiliğinden alınır ve dışarıya kapalı bir alanda
              saklanır. Elle yedek indirme ve geri yükleme web panelindedir.
            </Yazi>
          </>
        );
      }}
    </Govde>
  );
}
