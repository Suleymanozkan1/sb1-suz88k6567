import { Govde, Satir } from '../src/bilesenler/duzen';
import { BosDurum, Yazi } from '../src/bilesenler/temel';
import { tarihUzun } from '../src/bicim';
import { aralik, renk } from '../src/tema';
import { denetimKaydi, type DenetimSatiri } from '../src/veri';

/**
 * Denetim kaydı.
 *
 * Yalnızca okunur — kayıtların silinememesi bu özelliğin varlık sebebi.
 * Silinebilir bir denetim kaydı, denetim kaydı değildir.
 */
export default function Denetim() {
  return (
    <Govde<DenetimSatiri[]>
      yukle={() => denetimKaydi()}
      bos={<BosDurum baslik="Kayıt yok" aciklama="Henüz denetlenecek bir işlem yapılmamış." />}
    >
      {(liste) => (
        <>
          {liste.map((d) => (
            <Satir
              key={d.id}
              baslik={`${d.islem} · ${d.tablo}`}
              alt={d.kayit}
              ikinciAlt={`${d.kullanici} · ${tarihUzun(d.tarih)}`}
              solRenk={d.islem === 'Silme' ? renk.tehlike : d.islem === 'Ekleme' ? renk.basari : renk.vurgu}
            />
          ))}
          <Yazi tur="kucuk" renkli={renk.metinSolgun} style={{ marginTop: aralik.l }}>
            Ekleme, değişiklik ve silme işlemleri kullanıcı ve zaman bilgisiyle
            kaydedilir; değişen alanın eski ve yeni değeri birlikte tutulur.
            Kayıtlar silinemez ve değiştirilemez.
          </Yazi>
        </>
      )}
    </Govde>
  );
}
