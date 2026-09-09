import { View } from 'react-native';
import { Linking } from 'react-native';
import { Etiket, Govde } from '../src/bilesenler/duzen';
import { BosDurum, Kart, Yazi } from '../src/bilesenler/temel';
import { gorecelıGun, telefon, telefonUri } from '../src/bicim';
import { aralik, renk } from '../src/tema';
import { talepler, type Talep } from '../src/veri';

/**
 * Siteden gelen müşteri talepleri.
 *
 * Talebin içeriği değiştirilemez ve kayıt silinemez; bu yüzden mobilde de
 * yalnızca okunur. Numaraya dokunmak arama açar: gelen talebe verilecek
 * ilk yanıt genelde bir telefon.
 */
export default function Talepler() {
  return (
    <Govde<Talep[]>
      yukle={() => talepler()}
      bos={<BosDurum baslik="Talep yok" aciklama="Siteden gelen bir talep bulunmuyor." />}
    >
      {(liste) => (
        <>
          {liste.map((t) => (
            <Kart key={t.id} style={{ marginBottom: aralik.s }}>
              <View style={s.ust}>
                <View style={{ flex: 1 }}>
                  <Yazi tur="altBaslik" renkli={renk.lacivert}>{t.ad}</Yazi>
                  <Yazi tur="minik" renkli={renk.metinSolgun} style={{ marginTop: 2 }}>
                    {t.kaynak} · {gorecelıGun(t.tarih)}
                  </Yazi>
                </View>
                <Etiket
                  metin={t.durum}
                  tur={t.durum === 'Yeni' ? 'uyari' : t.durum === 'Kapatıldı' ? 'iyi' : 'notr'}
                />
              </View>

              <Yazi tur="kucuk" renkli={renk.metin} style={{ marginTop: aralik.m }}>
                {t.mesaj}
              </Yazi>

              <Yazi
                tur="kucuk"
                renkli={renk.vurguKoyu}
                style={{ marginTop: aralik.m, textDecorationLine: 'underline' }}
                accessibilityRole="link"
                onPress={() => void Linking.openURL(telefonUri(t.telefon))}
              >
                {telefon(t.telefon)}
              </Yazi>
            </Kart>
          ))}

          <Yazi tur="kucuk" renkli={renk.metinSolgun} style={{ marginTop: aralik.l }}>
            Talebin içeriği sonradan değiştirilemez ve kayıt silinemez. Durum
            değiştirme ve not yazma web panelinden yapılır.
          </Yazi>
        </>
      )}
    </Govde>
  );
}

const s = {
  ust: { flexDirection: 'row' as const, alignItems: 'flex-start' as const, gap: aralik.s },
};
