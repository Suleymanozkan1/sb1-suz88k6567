import { useState } from 'react';
import {
  KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Dugme, Yazi } from '../src/bilesenler/temel';
import { useOturum } from '../src/oturum';
import { DEMO_GIRIS } from '../src/veri';
import { aralik, renk, yazi, yuvarlak } from '../src/tema';

export default function Giris() {
  const { girisYap, tanitimModu } = useOturum();
  const kenar = useSafeAreaInsets();
  const [eposta, setEposta] = useState(tanitimModu ? DEMO_GIRIS.eposta : '');
  const [sifre, setSifre] = useState(tanitimModu ? DEMO_GIRIS.sifre : '');
  const [hata, setHata] = useState('');
  const [bekliyor, setBekliyor] = useState(false);

  /**
   * Demo hesabıyla tek dokunuşta girer.
   *
   * NEDEN ALANLARI DOLDURMAKLA YETİNMİYOR. Panelde düğme yalnızca
   * alanları dolduruyor; orada klavye ve "Giriş Yap" düğmesi aynı
   * ekranda. Telefonda alanlar dolduktan sonra klavye açılıyor,
   * düğmeyi bulmak için kaydırmak gerekiyor. Tek dokunuş, sistemi
   * denemek isteyen kişinin önündeki tek engeli kaldırıyor.
   *
   * Girdiği değerler `gonder`e değil doğrudan `girisYap`a veriliyor:
   * `setEposta` eşzamansız, hemen ardından `gonder()` çağrılsaydı
   * durum henüz güncellenmemiş olur ve boş alanla giriş denenirdi.
   */
  async function demoyaGir() {
    setHata('');
    setEposta(DEMO_GIRIS.eposta);
    setSifre(DEMO_GIRIS.sifre);
    setBekliyor(true);
    try {
      await girisYap(DEMO_GIRIS.eposta, DEMO_GIRIS.sifre);
    } catch (e) {
      setHata(e instanceof Error ? e.message : 'Demo hesabına girilemedi.');
    } finally {
      setBekliyor(false);
    }
  }

  async function gonder() {
    setHata('');
    if (!eposta.trim() || !sifre) {
      setHata('E-posta ve şifre gerekli.');
      return;
    }
    setBekliyor(true);
    try {
      await girisYap(eposta, sifre);
    } catch (e) {
      setHata(e instanceof Error ? e.message : 'Giriş yapılamadı.');
    } finally {
      setBekliyor(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: renk.lacivert }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[s.kaydir, { paddingTop: kenar.top + aralik.xxl, paddingBottom: kenar.bottom + aralik.xxl }]}
      >
        {/* Marka: logoda "Sahra" beyaz, "Takip" açık mavi, web ile aynı. */}
        <Text style={s.logo}>
          Sahra<Text style={{ color: renk.vurguAcik }}>Takip</Text>
        </Text>
        <Yazi tur="govde" renkli="#c6d2e8" style={{ marginTop: aralik.s }}>
          Salonunuzu cebinizden takip edin.
        </Yazi>

        <View style={s.kutu}>
          <Yazi tur="minik" renkli={renk.metinSolgun}>E-POSTA</Yazi>
          <TextInput
            value={eposta}
            onChangeText={setEposta}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            inputMode="email"
            placeholder="ornek@salonunuz.com"
            placeholderTextColor={renk.metinSolgun}
            style={s.giris}
            accessibilityLabel="E-posta adresi"
          />

          <Yazi tur="minik" renkli={renk.metinSolgun} style={{ marginTop: aralik.l }}>ŞİFRE</Yazi>
          <TextInput
            value={sifre}
            onChangeText={setSifre}
            secureTextEntry
            autoComplete="current-password"
            placeholder="••••••••"
            placeholderTextColor={renk.metinSolgun}
            style={s.giris}
            accessibilityLabel="Şifre"
            onSubmitEditing={() => void gonder()}
          />

          {hata ? (
            <View style={s.hata} accessibilityRole="alert">
              <Yazi tur="kucuk" renkli={renk.tehlike}>{hata}</Yazi>
            </View>
          ) : null}

          <Dugme
            metin={bekliyor ? 'Giriş yapılıyor…' : 'Giriş Yap'}
            onPress={() => void gonder()}
            disabled={bekliyor}
            tam
            style={{ marginTop: aralik.xl }}
          />

          {/*
            DEMO DÜĞMESİ HER İKİ KİPTE DE. Önce yalnızca tanıtım
            kipinde alanlar dolduruluyordu; sunucuya bağlı APK'da ekran
            boş açılıyor ve elinde bilgi olmayan kişi hiç giremiyordu.
            Web giriş ekranı da demo kartını iki kipte de gösteriyor.
          */}
          <Dugme
            metin="Demo Hesabıyla Gir"
            ikincil
            tam
            onPress={() => void demoyaGir()}
            disabled={bekliyor}
            style={{ marginTop: aralik.m }}
          />
          <Yazi tur="kucuk" renkli={renk.metinSolgun} style={{ marginTop: aralik.s, textAlign: 'center' }}>
            {DEMO_GIRIS.eposta} · {DEMO_GIRIS.sifre}
          </Yazi>

          {tanitimModu ? (
            <Yazi tur="kucuk" renkli={renk.metinSolgun} style={{ marginTop: aralik.m, textAlign: 'center' }}>
              Tanıtım modu: sunucu bağlantısı tanımlı değil, örnek veri gösterilir.
            </Yazi>
          ) : null}
        </View>

        <Yazi tur="kucuk" renkli="#8fa1c4" style={{ textAlign: 'center', marginTop: aralik.xl }}>
          Art arda hatalı denemede hesap geçici olarak kilitlenir.
        </Yazi>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  // Kart dikeyde ortalanır; üstte sabit boşluk bırakınca alt yarı boş kalıyordu.
  kaydir: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: aralik.xl },
  logo: { ...(yazi.dev as object), color: renk.beyaz, fontSize: 34 },
  kutu: {
    marginTop: aralik.xxl,
    backgroundColor: renk.kart,
    borderRadius: yuvarlak.l,
    padding: aralik.xl,
  },
  giris: {
    marginTop: aralik.xs,
    minHeight: 46,
    borderWidth: 1,
    borderColor: renk.cizgi,
    borderRadius: yuvarlak.m,
    paddingHorizontal: aralik.m,
    fontSize: 16,
    color: renk.metin,
    backgroundColor: renk.beyaz,
  },
  hata: {
    marginTop: aralik.m,
    padding: aralik.m,
    borderRadius: yuvarlak.m,
    backgroundColor: '#fdecea',
  },
});
