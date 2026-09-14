import { View } from 'react-native';
import { Etiket, Govde } from '../src/bilesenler/duzen';
import { BosDurum, Kart, Yazi } from '../src/bilesenler/temel';
import { okunakliMetin } from '../src/bicim';
import { aralik, renk } from '../src/tema';
import { renkAyarlari, type RenkAyari } from '../src/veri';

/**
 * Takvimdeki rezervasyon renkleri.
 *
 * Mobilde OKUNUR. Renk seçimi telefonda iki nedenle yapılmıyor: seçici
 * altı haneli onaltılık kod yazdırmak zorunda kalıyor (küçük klavyede
 * hataya açık) ve seçilen rengin üzerindeki yazının okunabilirliği
 * ekranda görülmüyor. Panelde erişilebilirlik kontrolü de var: Nikâh ve
 * Toplantı renkleri tam bu yüzden koyulaştırılmıştı.
 *
 * Ekranda her rengin üzerine kendi etiketi yazılıyor; personel telefonda
 * takvimde gördüğü rengin hangi tür olduğunu buradan çözüyor.
 */
export default function RenkAyarlari() {
  return (
    <Govde<RenkAyari[]>
      yukle={renkAyarlari}
      bos={<BosDurum baslik="Renk tanımı yok" aciklama="Tanımlı renk ayarı bulunmuyor." />}
    >
      {(liste) => (
        <>
          <Kart>
            {liste.map((r) => (
              <View key={r.anahtar} style={[st.satir, { backgroundColor: r.renk }]}>
                {/* Yazı rengi zemine göre seçiliyor; sabit beyaz, açık
                    renklerde okunmuyordu. */}
                <Yazi tur="altBaslik" renkli={okunakliMetin(r.renk)} style={{ flex: 1 }}>
                  {r.ad}
                </Yazi>
                <Yazi tur="minik" renkli={okunakliMetin(r.renk)}>
                  {r.renk.toLocaleUpperCase('tr-TR')}
                </Yazi>
              </View>
            ))}
          </Kart>

          <Etiket metin="Renk değiştirme web panelinde" />
          <Yazi tur="kucuk" renkli={renk.metinSolgun} style={{ marginTop: aralik.m }}>
            Renkler takvimde ve rezervasyon kartlarında kullanılır. Panelde seçilen
            rengin üzerindeki yazının okunabilirliği ayrıca denetlenir; bu yüzden
            değişiklik orada yapılır.
          </Yazi>
        </>
      )}
    </Govde>
  );
}

const st = {
  satir: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: aralik.m,
    paddingVertical: aralik.m,
    borderRadius: 8,
    marginBottom: aralik.xs,
  },
};
