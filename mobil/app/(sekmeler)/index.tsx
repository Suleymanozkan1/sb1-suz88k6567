import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import RezervasyonSatiri from '../../src/bilesenler/RezervasyonSatiri';
import { BolumBasligi, BosDurum, Yazi } from '../../src/bilesenler/temel';
import { bugunIso, gunAdi, tarihKisa, tarihUzun, tutarKisa } from '../../src/bicim';
import { useOturum } from '../../src/oturum';
import { aralik, renk, yazi, yuvarlak } from '../../src/tema';
import { yaklasanlar, type Rezervasyon } from '../../src/veri';

/**
 * Bugün ekranı.
 *
 * Ajanda önce: mobilde ay ızgarası 375 piksele sığdığında hücreler
 * dokunulamayacak kadar küçülüyor. Bu yüzden ana ekran kronolojik liste,
 * ay görünümü ayrı sekmede.
 *
 * Üstte tek bir sayı var: bu ay tahsil edilecek kalan. Salon sahibinin
 * telefona bakma sebebi genelde bu.
 */
export default function Bugun() {
  const kenar = useSafeAreaInsets();
  const yonlendir = useRouter();
  const { kullanici } = useOturum();
  const [kayitlar, setKayitlar] = useState<Rezervasyon[] | null>(null);
  const [hata, setHata] = useState('');
  const [yenileniyor, setYenileniyor] = useState(false);

  const yukle = useCallback(async () => {
    try {
      setHata('');
      setKayitlar(await yaklasanlar());
    } catch (e) {
      setHata(e instanceof Error ? e.message : 'Kayıtlar okunamadı.');
    }
  }, []);

  useEffect(() => { void yukle(); }, [yukle]);

  const bugun = bugunIso();
  const { bugunkuler, sonrakiler, kalanToplam } = useMemo(() => {
    const hepsi = kayitlar ?? [];
    return {
      bugunkuler: hepsi.filter((r) => r.tarih === bugun),
      sonrakiler: hepsi.filter((r) => r.tarih > bugun),
      kalanToplam: hepsi.reduce((t, r) => t + Math.max(0, r.toplam - r.tahsilat), 0),
    };
  }, [kayitlar, bugun]);

  return (
    <View style={{ flex: 1, backgroundColor: renk.zemin }}>
      {/* Koyu başlık bandı: içerikten net ayrılsın, altındaki liste beyaz kalsın. */}
      <View style={[s.band, { paddingTop: kenar.top + aralik.l }]}>
        <Text style={[yazi.minik as object, { color: renk.vurguAcik }]}>
          {gunAdi(bugun).toLocaleUpperCase('tr-TR')} · {tarihUzun(bugun).toLocaleUpperCase('tr-TR')}
        </Text>
        <Yazi tur="dev" renkli={renk.beyaz} style={{ marginTop: aralik.xs }}>
          {(kullanici?.ad ?? '').split(' ')[0] || 'Merhaba'}
        </Yazi>

        <View style={s.ozet}>
          <View style={{ flex: 1 }}>
            <Text style={[yazi.minik as object, { color: '#a9bcd8' }]}>TOPLAM KALAN ALACAK</Text>
            <Text style={[yazi.tutarDev as object, { color: renk.beyaz, marginTop: 2 }]}>
              {kayitlar ? tutarKisa(kalanToplam) : '-'}
            </Text>
          </View>
          <View style={s.ayirac} />
          <View style={{ width: 96 }}>
            <Text style={[yazi.minik as object, { color: '#a9bcd8' }]}>YAKLAŞAN</Text>
            <Text style={[yazi.tutarDev as object, { color: renk.beyaz, marginTop: 2 }]}>
              {kayitlar ? String(kayitlar.length) : '-'}
            </Text>
          </View>
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
        {kayitlar === null && !hata ? (
          <ActivityIndicator color={renk.vurguKoyu} style={{ marginTop: aralik.xxl }} />
        ) : null}

        {hata ? (
          <View style={s.hata}>
            <Yazi tur="kucuk" renkli={renk.tehlike}>{hata}</Yazi>
          </View>
        ) : null}

        {kayitlar !== null ? (
          <>
            <BolumBasligi>Bugün</BolumBasligi>
            {bugunkuler.length === 0 ? (
              <BosDurum
                baslik="Bugün organizasyon yok"
                aciklama="Takvimde bugüne kayıtlı bir rezervasyon bulunmuyor."
              />
            ) : (
              bugunkuler.map((r) => (
                <RezervasyonSatiri
                  key={r.id}
                  kayit={r}
                  onPress={() => yonlendir.push(`/rezervasyon/${r.id}`)}
                />
              ))
            )}

            <BolumBasligi>Yaklaşanlar</BolumBasligi>
            {sonrakiler.length === 0 ? (
              <BosDurum baslik="Kayıt yok" aciklama="İleri tarihli rezervasyon bulunmuyor." />
            ) : (
              sonrakiler.map((r) => (
                <RezervasyonSatiri
                  key={r.id}
                  kayit={r}
                  tarihGoster={tarihKisa(r.tarih)}
                  onPress={() => yonlendir.push(`/rezervasyon/${r.id}`)}
                />
              ))
            )}
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
  ozet: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: aralik.l,
    backgroundColor: renk.marka,
    borderRadius: yuvarlak.m,
    paddingVertical: aralik.m,
    paddingHorizontal: aralik.l,
  },
  ayirac: { width: 1, height: 34, backgroundColor: '#4a679c', marginHorizontal: aralik.l },
  hata: { padding: aralik.m, borderRadius: yuvarlak.m, backgroundColor: '#fdecea', marginTop: aralik.l },
});
