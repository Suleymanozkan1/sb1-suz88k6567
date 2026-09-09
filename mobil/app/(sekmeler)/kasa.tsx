import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BolumBasligi, Kart, Yazi } from '../../src/bilesenler/temel';
import { tutar } from '../../src/bicim';
import { aralik, renk, yazi, yuvarlak } from '../../src/tema';
import { kasaOzeti, type KasaOzet } from '../../src/veri';

/**
 * Kasa özeti.
 *
 * Mobilde gelir–gider kaydı girmek yerine yalnızca durumu göstermek
 * seçildi: kayıt girişi masaüstünde daha güvenli ve hızlı, telefonda
 * asıl ihtiyaç "kasada ne var, ne kadar alacağım kaldı" sorusu.
 */
export default function Kasa() {
  const kenar = useSafeAreaInsets();
  const [ozet, setOzet] = useState<KasaOzet | null>(null);
  const [yenileniyor, setYenileniyor] = useState(false);
  const [hata, setHata] = useState('');

  const yukle = useCallback(async () => {
    try {
      setHata('');
      setOzet(await kasaOzeti());
    } catch (e) {
      setHata(e instanceof Error ? e.message : 'Kasa okunamadı.');
    }
  }, []);

  useEffect(() => { void yukle(); }, [yukle]);

  return (
    <View style={{ flex: 1, backgroundColor: renk.zemin }}>
      <View style={[s.band, { paddingTop: kenar.top + aralik.l }]}>
        <Text style={[yazi.minik as object, { color: renk.vurguAcik }]}>KASA</Text>
        <Yazi tur="dev" renkli={renk.beyaz} style={{ marginTop: aralik.xs }}>Gelir ve gider</Yazi>
        <View style={s.bakiyeKutu}>
          <Text style={[yazi.minik as object, { color: '#a9bcd8' }]}>KASA BAKİYESİ</Text>
          <Text style={[yazi.tutarDev as object, { color: renk.beyaz, marginTop: 2 }]}>
            {ozet ? tutar(ozet.bakiye) : '—'}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: aralik.l, paddingBottom: aralik.xxl }}
        refreshControl={
          <RefreshControl
            refreshing={yenileniyor}
            onRefresh={() => { setYenileniyor(true); void yukle().finally(() => setYenileniyor(false)); }}
            tintColor={renk.vurguKoyu}
          />
        }
      >
        {hata ? (
          <View style={s.hata}><Yazi tur="kucuk" renkli={renk.tehlike}>{hata}</Yazi></View>
        ) : null}

        {ozet === null && !hata ? (
          <ActivityIndicator color={renk.vurguKoyu} style={{ marginTop: aralik.xl }} />
        ) : null}

        {ozet ? (
          <>
            <BolumBasligi>Dönem toplamları</BolumBasligi>
            <View style={{ gap: aralik.s }}>
              <Kart style={s.satir}>
                <View style={{ flex: 1 }}>
                  <Yazi tur="altBaslik" renkli={renk.lacivert}>Toplam gelir</Yazi>
                  <Yazi tur="kucuk" renkli={renk.metinSolgun}>Tahsilat ve diğer gelirler</Yazi>
                </View>
                <Text style={[yazi.tutar as object, { color: renk.basari }]}>{tutar(ozet.gelir)}</Text>
              </Kart>

              <Kart style={s.satir}>
                <View style={{ flex: 1 }}>
                  <Yazi tur="altBaslik" renkli={renk.lacivert}>Toplam gider</Yazi>
                  <Yazi tur="kucuk" renkli={renk.metinSolgun}>Personel, tedarikçi, sabit gider</Yazi>
                </View>
                <Text style={[yazi.tutar as object, { color: renk.tehlike }]}>{tutar(ozet.gider)}</Text>
              </Kart>

              <Kart style={s.satir}>
                <View style={{ flex: 1 }}>
                  <Yazi tur="altBaslik" renkli={renk.lacivert}>Kalan alacak</Yazi>
                  <Yazi tur="kucuk" renkli={renk.metinSolgun}>Rezervasyonlardan tahsil edilmemiş</Yazi>
                </View>
                <Text style={[yazi.tutar as object, { color: renk.uyari }]}>{tutar(ozet.alacak)}</Text>
              </Kart>
            </View>

            <Text style={[yazi.kucuk as object, { color: renk.metinSolgun, marginTop: aralik.xl }]}>
              Gelir–gider kaydı ve raporların ayrıntısı web panelindedir. Mobil uygulama
              yalnızca durumu gösterir.
            </Text>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  band: {
    backgroundColor: renk.lacivert,
    paddingHorizontal: aralik.l,
    paddingBottom: aralik.l,
    borderBottomLeftRadius: yuvarlak.l * 1.5,
    borderBottomRightRadius: yuvarlak.l * 1.5,
  },
  bakiyeKutu: {
    marginTop: aralik.l,
    backgroundColor: renk.marka,
    borderRadius: yuvarlak.m,
    paddingVertical: aralik.m,
    paddingHorizontal: aralik.l,
  },
  satir: { flexDirection: 'row', alignItems: 'center', gap: aralik.m },
  hata: { padding: aralik.m, borderRadius: yuvarlak.m, backgroundColor: '#fdecea' },
});
