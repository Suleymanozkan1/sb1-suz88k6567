import { View } from 'react-native';
import { Govde, Etiket, Satir } from '../src/bilesenler/duzen';
import { BolumBasligi, BosDurum, Yazi } from '../src/bilesenler/temel';
import { aralik, renk } from '../src/tema';
import { salonlar, type Salon } from '../src/veri';

/**
 * Salon tanımları.
 *
 * Pasif salonlar ayrı bölümde: aynı listede gri bir etiketle gösterildiğinde
 * kullanıcı hangi salona rezervasyon açabileceğini tek bakışta göremiyordu.
 */
export default function Salonlar() {
  return (
    <Govde<Salon[]>
      yukle={salonlar}
      bos={<BosDurum baslik="Salon yok" aciklama="Henüz salon tanımlanmamış." />}
    >
      {(liste) => {
        const aktif = liste.filter((x) => x.aktif);
        const pasif = liste.filter((x) => !x.aktif);
        return (
          <>
            {aktif.map((x) => (
              <Satir
                key={x.id}
                baslik={x.ad}
                alt={`${x.kapasite} kişi kapasite`}
                deger={`${x.kapasite}`}
              />
            ))}

            {pasif.length > 0 ? (
              <>
                <BolumBasligi>Pasif</BolumBasligi>
                {pasif.map((x) => (
                  <View key={x.id}>
                    <Satir baslik={x.ad} alt={`${x.kapasite} kişi kapasite`} />
                    <View style={{ marginTop: -aralik.xs, marginBottom: aralik.s }}>
                      <Etiket metin="Yeni rezervasyona kapalı" tur="uyari" />
                    </View>
                  </View>
                ))}
              </>
            ) : null}

            <Yazi tur="kucuk" renkli={renk.metinSolgun} style={{ marginTop: aralik.xl }}>
              Aynı salona aynı gün ve seansta ikinci rezervasyon açılamaz; farklı
              salonlara açılabilir. Kural veritabanında tanımlıdır.
            </Yazi>
          </>
        );
      }}
    </Govde>
  );
}
