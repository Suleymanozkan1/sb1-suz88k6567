import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { OturumSaglayici, useOturum } from '../src/oturum';
import { renk } from '../src/tema';

/**
 * Kök yerleşim.
 *
 * Oturum durumu okunana kadar hiçbir ekran gösterilmez; aksi hâlde giriş
 * ekranı bir an görünüp panele atlıyor, bu da oturumun geçersiz olduğu
 * izlenimi veriyordu.
 *
 * Sekme dışındaki bütün ekranlar yığın başlığını kullanıyor: geri düğmesi
 * ve başlık her ekranda elle yazıldığında aralarında ufak farklar oluşuyor
 * ve Android'in donanım geri tuşuyla tutarsızlaşıyordu.
 */
const EKRANLAR: [string, string][] = [
  ['musteriler', 'Müşteriler'],
  ['salonlar', 'Salonlar'],
  ['menuler', 'Menüler'],
  ['urun-hizmet', 'Ürün ve Hizmet'],
  ['faturalar', 'Faturalar'],
  ['raporlar', 'Raporlar'],
  ['ozel-gunler', 'Özel Günler'],
  ['odeme-bildirimleri', 'Ödeme Bildirimleri'],
  ['isletmeler', 'İşletmeler'],
  ['renk-ayarlari', 'Renk Ayarları'],
  ['whatsapp-ayarlari', 'WhatsApp Ayarları'],
  ['hatirlatmalar', 'Hatırlatmalar'],
  ['sms', 'SMS Kayıtları'],
  ['izinler', 'İYS İzinleri'],
  ['kullanicilar', 'Kullanıcılar'],
  ['denetim', 'Denetim Kaydı'],
  ['sistem', 'Sistem Durumu'],
  ['ayarlar', 'Ayarlar'],
  ['hesap', 'Hesap'],
];

function Kok() {
  const { kullanici, yukleniyor } = useOturum();

  if (yukleniyor) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: renk.zemin }}>
        <ActivityIndicator color={renk.vurguKoyu} />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: renk.zemin },
        headerTintColor: renk.lacivert,
        headerStyle: { backgroundColor: renk.kart },
        headerTitleStyle: { color: renk.lacivert, fontWeight: '700' },
      }}
    >
      <Stack.Protected guard={kullanici !== null}>
        <Stack.Screen name="(sekmeler)" />
        <Stack.Screen name="rezervasyon/[id]" options={{ headerShown: true, title: 'Rezervasyon' }} />
        <Stack.Screen name="rezervasyon/yeni" options={{ headerShown: true, title: 'Yeni Rezervasyon' }} />
        <Stack.Screen name="belge/[id]" options={{ headerShown: true, title: 'Belgeler' }} />
        <Stack.Screen name="fatura/[id]" options={{ headerShown: true, title: 'Fatura' }} />
        <Stack.Screen
          name="musteri-adaylari/index"
          options={{ headerShown: true, title: 'Müşteri Adayları' }}
        />
        <Stack.Screen
          name="musteri-adaylari/yeni"
          options={{ headerShown: true, title: 'Yeni Aday' }}
        />
        <Stack.Screen
          name="musteri-adaylari/[id]"
          options={{ headerShown: true, title: 'Aday' }}
        />
        <Stack.Screen
          name="musteri-adaylari/durumlar"
          options={{ headerShown: true, title: 'Aday Durumları' }}
        />
        {EKRANLAR.map(([ad, baslik]) => (
          <Stack.Screen key={ad} name={ad} options={{ headerShown: true, title: baslik }} />
        ))}
      </Stack.Protected>

      <Stack.Protected guard={kullanici === null}>
        <Stack.Screen name="giris" />
      </Stack.Protected>
    </Stack>
  );
}

export default function Yerlesim() {
  return (
    <SafeAreaProvider>
      <OturumSaglayici>
        <StatusBar style="light" />
        <Kok />
      </OturumSaglayici>
    </SafeAreaProvider>
  );
}
