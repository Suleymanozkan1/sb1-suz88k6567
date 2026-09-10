import { View } from 'react-native';
import { Etiket, Govde, Satir } from '../src/bilesenler/duzen';
import { BolumBasligi, BosDurum, Kart, Yazi } from '../src/bilesenler/temel';
import { aralik, renk } from '../src/tema';
import { kullanicilar, type Kullanici } from '../src/veri';

/** Panelde yedi ayrı yetki tanımlı; tablo bunlardan bir dağılım örneğidir. */
const YETKILER: [string, boolean, boolean][] = [
  ['Rezervasyon görüntüleme', true, true],
  ['Rezervasyon ekleme / düzenleme', true, true],
  ['Rezervasyon silme', true, false],
  ['Gelir-gider (kasa)', true, false],
  ['Raporlar ve ciro', true, false],
  ['Kullanıcı ve yetki yönetimi', true, false],
];

/**
 * Kullanıcılar ve yetkiler.
 *
 * Hesap açma ve yetki değiştirme mobilde yok: yetki değişikliği geri
 * alınması zor bir işlem ve yanlış dokunuşla bir personelin kasaya
 * erişmesine yol açabilir. Mobilde kimin neye erişebildiği okunur.
 */
export default function Kullanicilar() {
  return (
    <Govde<Kullanici[]>
      yukle={kullanicilar}
      bos={<BosDurum baslik="Kullanıcı yok" aciklama="Tanımlı personel hesabı bulunmuyor." />}
    >
      {(liste) => (
        <>
          {liste.map((k) => (
            <Satir
              key={k.id}
              baslik={k.ad}
              alt={k.eposta}
              ikinciAlt={k.aktif ? k.rol : `${k.rol} · pasif`}
              solRenk={k.aktif ? renk.basari : renk.cizgi}
            />
          ))}

          <BolumBasligi>Yetki dağılımı</BolumBasligi>
          <Kart>
            <View style={st.baslikSatiri}>
              <Yazi tur="minik" renkli={renk.metinSolgun} style={{ flex: 1 }}>YETKİ</Yazi>
              <Yazi tur="minik" renkli={renk.metinSolgun} style={st.sutun}>YÖN.</Yazi>
              <Yazi tur="minik" renkli={renk.metinSolgun} style={st.sutun}>PER.</Yazi>
            </View>
            {YETKILER.map(([ad, yonetici, personel]) => (
              <View key={ad} style={st.satir}>
                <Yazi tur="kucuk" renkli={renk.metin} style={{ flex: 1 }}>{ad}</Yazi>
                <Yazi tur="kucuk" renkli={yonetici ? renk.basari : renk.metinSolgun} style={st.sutun}>
                  {yonetici ? '✓' : '-'}
                </Yazi>
                <Yazi tur="kucuk" renkli={personel ? renk.basari : renk.metinSolgun} style={st.sutun}>
                  {personel ? '✓' : '-'}
                </Yazi>
              </View>
            ))}
          </Kart>

          <Etiket metin="Yetki değişikliği web panelinden yapılır" />
          <Yazi tur="kucuk" renkli={renk.metinSolgun} style={{ marginTop: aralik.m }}>
            Personel hesapları ayrı şifreyle açılır; şifreler yöneticiye görünmez.
            Ekleme, değişiklik ve silme işlemleri denetim kaydına yazılır.
          </Yazi>
        </>
      )}
    </Govde>
  );
}


const st = {
  baslikSatiri: {
    flexDirection: 'row' as const,
    borderBottomWidth: 1,
    borderBottomColor: renk.cizgiSolgun,
    paddingBottom: aralik.s,
  },
  satir: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: aralik.s,
  },
  sutun: { width: 44, textAlign: 'center' as const },
};
