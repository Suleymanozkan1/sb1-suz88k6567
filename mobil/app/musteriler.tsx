import { Linking } from 'react-native';
import { Govde, Satir } from '../src/bilesenler/duzen';
import { BosDurum, Yazi } from '../src/bilesenler/temel';
import { tarihUzun, telefon, telefonUri, tutarKisa } from '../src/bicim';
import { aralik, renk } from '../src/tema';
import { musteriler, type Musteri } from '../src/veri';

/**
 * Müşteri defteri.
 *
 * Ayrı bir müşteri tablosu yok; defter rezervasyonlardan türetiliyor.
 * Aynı kişiyi iki yerde tutmak, birinde değişip diğerinde değişmeyen
 * telefon numaralarına yol açıyordu.
 */
export default function Musteriler() {
  return (
    <Govde<Musteri[]>
      yukle={musteriler}
      bos={<BosDurum baslik="Müşteri yok" aciklama="Henüz rezervasyon kaydı bulunmuyor." />}
    >
      {(liste) => (
        <>
          {liste.map((m) => (
            <Satir
              key={m.telefon || m.ad}
              baslik={m.ad}
              alt={telefon(m.telefon)}
              ikinciAlt={`${m.kayitSayisi} kayıt · son: ${tarihUzun(m.sonTarih)}`}
              deger={tutarKisa(m.toplam)}
              onPress={() => void Linking.openURL(telefonUri(m.telefon))}
            />
          ))}
          <Yazi tur="kucuk" renkli={renk.metinSolgun} style={{ marginTop: aralik.l }}>
            Defter rezervasyon kayıtlarından üretilir. Sağdaki tutar, o müşterinin
            bütün organizasyonlarının toplamıdır.
          </Yazi>
        </>
      )}
    </Govde>
  );
}
