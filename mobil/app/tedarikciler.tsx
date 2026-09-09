import { Linking } from 'react-native';
import { Etiket, Govde, Satir } from '../src/bilesenler/duzen';
import { BolumBasligi, BosDurum, Yazi } from '../src/bilesenler/temel';
import { telefon, telefonUri } from '../src/bicim';
import { aralik, renk } from '../src/tema';
import { tedarikciler, type Tedarikci } from '../src/veri';

/**
 * Tedarikçi defteri.
 *
 * Satıra dokunmak doğrudan aramayı açıyor: telefonu eline alan kişinin
 * tedarikçi listesine bakma sebebi genelde birini aramak.
 */
export default function Tedarikciler() {
  return (
    <Govde<Tedarikci[]>
      yukle={tedarikciler}
      bos={<BosDurum baslik="Tedarikçi yok" aciklama="Henüz tedarikçi kaydı bulunmuyor." />}
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
                alt={`${x.kategori} · ${telefon(x.telefon)}`}
                onPress={() => void Linking.openURL(telefonUri(x.telefon))}
              />
            ))}

            {pasif.length > 0 ? (
              <>
                <BolumBasligi>Pasif</BolumBasligi>
                {pasif.map((x) => (
                  <Satir key={x.id} baslik={x.ad} alt={`${x.kategori} · ${telefon(x.telefon)}`} />
                ))}
              </>
            ) : null}

            <Etiket metin="Satıra dokunmak arama açar" />
            <Yazi tur="kucuk" renkli={renk.metinSolgun} style={{ marginTop: aralik.m }}>
              Bir organizasyona atanmış tedarikçi silinemez, pasife alınır; geçmiş
              kayıtların tedarikçi bilgisi böylece kaybolmaz.
            </Yazi>
          </>
        );
      }}
    </Govde>
  );
}
