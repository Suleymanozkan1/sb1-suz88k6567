import { View } from 'react-native';
import { Govde, Satir } from '../src/bilesenler/duzen';
import { BolumBasligi, Kart, Yazi } from '../src/bilesenler/temel';
import { aralik, renk, yuvarlak } from '../src/tema';
import { ISLETME, salonlar, type Salon } from '../src/veri';

/** Panelin Renk Ayarları ekranıyla aynı eşleme. */
const RENKLER: [string, string][] = [
  ['Düğün', '#47b2e4'], ['Nişan', '#f39c12'], ['Kına', '#e74c3c'],
  ['Sünnet', '#18d26e'], ['Nikâh', '#3498db'], ['Kokteyl', '#16a085'],
];

/**
 * Ayarlar.
 *
 * İşletme bilgisi ve renk eşlemesi mobilde okunur, değiştirilmez.
 * Bunlar bütün kayıtları etkileyen ayarlar; tek dokunuşla değişmemeleri
 * bilinçli.
 */
export default function Ayarlar() {
  return (
    <Govde<Salon[]> yukle={salonlar}>
      {(liste) => (
        <>
          <BolumBasligi>İşletme</BolumBasligi>
          <Satir baslik={ISLETME.ad} alt={`${liste.length} salon tanımlı`} />

          <BolumBasligi>Organizasyon renkleri</BolumBasligi>
          <Kart>
            {RENKLER.map(([ad, kod], i) => (
              <View key={ad} style={[st.renkSatiri, i > 0 && { marginTop: aralik.m }]}>
                <View style={[st.kutu, { backgroundColor: kod }]} />
                <Yazi tur="kucuk" renkli={renk.metin} style={{ flex: 1 }}>{ad}</Yazi>
                <Yazi tur="minik" renkli={renk.metinSolgun}>{kod}</Yazi>
              </View>
            ))}
          </Kart>

          <Yazi tur="kucuk" renkli={renk.metinSolgun} style={{ marginTop: aralik.l }}>
            Renkler takvimde ve listelerde organizasyon türünü gösterir. Renk tek
            başına ayırt edici sayılmaz; tür her yerde metinle de yazılır.
            Değiştirme web panelindedir.
          </Yazi>
        </>
      )}
    </Govde>
  );
}

const st = {
  renkSatiri: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: aralik.m },
  kutu: { width: 22, height: 22, borderRadius: yuvarlak.s },
};
