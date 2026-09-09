import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { BolumBasligi, Dugme, Kart, Yazi } from '../src/bilesenler/temel';
import { useOturum } from '../src/oturum';
import { API_KOK, yapilandirildi } from '../src/supabase';
import { aralik, renk, yazi } from '../src/tema';

export default function Hesap() {
  const { kullanici, cikisYap, tanitimModu } = useOturum();

  return (
    <View style={{ flex: 1, backgroundColor: renk.zemin }}>
      <ScrollView contentContainerStyle={{ padding: aralik.l, paddingBottom: aralik.xxl }}>
        <Kart>
          <Yazi tur="baslik" renkli={renk.lacivert}>{kullanici?.ad ?? '—'}</Yazi>
          <Yazi tur="kucuk" renkli={renk.metinSolgun} style={{ marginTop: 2 }}>
            {kullanici?.eposta ?? ''} · {kullanici?.rol ?? ''}
          </Yazi>
        </Kart>

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
  satir: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  baglanti: { color: renk.vurguKoyu, textDecorationLine: 'underline' },
});
