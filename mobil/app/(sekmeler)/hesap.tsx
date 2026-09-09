import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { BolumBasligi, Dugme, Kart, Yazi } from '../../src/bilesenler/temel';
import { useOturum } from '../../src/oturum';
import { API_KOK, yapilandirildi } from '../../src/supabase';
import { aralik, renk, yazi, yuvarlak } from '../../src/tema';

export default function Hesap() {
  const kenar = useSafeAreaInsets();
  const { kullanici, cikisYap, tanitimModu } = useOturum();

  return (
    <View style={{ flex: 1, backgroundColor: renk.zemin }}>
      <View style={[s.band, { paddingTop: kenar.top + aralik.l }]}>
        <Text style={[yazi.minik as object, { color: renk.vurguAcik }]}>HESAP</Text>
        <Yazi tur="dev" renkli={renk.beyaz} style={{ marginTop: aralik.xs }}>
          {kullanici?.ad ?? '—'}
        </Yazi>
        <Yazi tur="kucuk" renkli="#a9bcd8" style={{ marginTop: 2 }}>
          {kullanici?.eposta ?? ''} · {kullanici?.rol ?? ''}
        </Yazi>
      </View>

      <ScrollView contentContainerStyle={{ padding: aralik.l, paddingBottom: aralik.xxl }}>
        <BolumBasligi>Bağlantı</BolumBasligi>
        <Kart>
          <View style={s.satir}>
            <Yazi tur="kucuk" renkli={renk.metinSolgun}>Sunucu</Yazi>
            <Yazi tur="kucuk" renkli={renk.metin}>{API_KOK.replace('https://', '')}</Yazi>
          </View>
          <View style={[s.satir, { marginTop: aralik.s }]}>
            <Yazi tur="kucuk" renkli={renk.metinSolgun}>Veri kaynağı</Yazi>
            <Yazi tur="kucuk" renkli={yapilandirildi ? renk.basari : renk.uyari}>
              {yapilandirildi ? 'Canlı' : 'Tanıtım verisi'}
            </Yazi>
          </View>
          <View style={[s.satir, { marginTop: aralik.s }]}>
            <Yazi tur="kucuk" renkli={renk.metinSolgun}>Sürüm</Yazi>
            <Yazi tur="kucuk" renkli={renk.metin}>{Constants.expoConfig?.version ?? '1.0.0'}</Yazi>
          </View>
        </Kart>

        <BolumBasligi>Mobilde neler var</BolumBasligi>
        <Kart>
          <Yazi tur="kucuk" renkli={renk.metin}>
            Uygulama görüntüleme ve hızlı tahsilat girişi içindir. Rezervasyon oluşturma,
            fatura kesme, kullanıcı ve yetki yönetimi web panelinde yapılır; bu işlemler
            daha fazla alan ve dikkat istiyor.
          </Yazi>
        </Kart>

        <BolumBasligi>Yasal</BolumBasligi>
        <Kart>
          <Text
            style={[yazi.kucuk as object, s.baglanti]}
            accessibilityRole="link"
            onPress={() => void Linking.openURL(`${API_KOK}/kvkk-aydinlatma-metni`)}
          >
            KVKK Aydınlatma Metni
          </Text>
          <Text
            style={[yazi.kucuk as object, s.baglanti, { marginTop: aralik.s }]}
            accessibilityRole="link"
            onPress={() => void Linking.openURL(`${API_KOK}/gizlilik-politikasi`)}
          >
            Gizlilik Politikası
          </Text>
          <Text
            style={[yazi.kucuk as object, s.baglanti, { marginTop: aralik.s }]}
            accessibilityRole="link"
            onPress={() => void Linking.openURL(`${API_KOK}/uyelik-sozlesmesi`)}
          >
            Üyelik Sözleşmesi
          </Text>
        </Kart>

        <Dugme
          metin="Çıkış Yap"
          ikincil
          tam
          onPress={() => void cikisYap()}
          style={{ marginTop: aralik.xxl }}
        />

        {tanitimModu ? (
          <Yazi tur="kucuk" renkli={renk.metinSolgun} style={{ marginTop: aralik.l, textAlign: 'center' }}>
            Sunucu bağlantısı tanımlı değil; gösterilen veriler örnektir.
          </Yazi>
        ) : null}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  band: {
    backgroundColor: renk.lacivert,
    paddingHorizontal: aralik.l,
    paddingBottom: aralik.xl,
    borderBottomLeftRadius: yuvarlak.l * 1.5,
    borderBottomRightRadius: yuvarlak.l * 1.5,
  },
  satir: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  baglanti: { color: renk.vurguKoyu, textDecorationLine: 'underline' },
});
