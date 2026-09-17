import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { renk } from '../../src/tema';

/**
 * Sekmeler.
 *
 * Beş sekme: iOS'ta da Android'de de sınır burası; altıncısı etiketleri
 * kısaltıp tanınmaz hâle getiriyor. Günlük kullanımda sık açılan dördü
 * sekmede, geri kalan on beş ekran "Daha" altındaki listede toplandı.
 *
 * YALNIZCA YAZI, SİMGE YOK. Önce her sekmenin üstünde tek karakterlik
 * geometrik bir işaret vardı (◉ ▦ ≡ ₺ ⋯). Bunlar hiçbir şey anlatmıyor,
 * yalnızca etiketin yerini daraltıyordu; kullanıcı zaten yazıyı okuyor.
 * İşaretler kaldırılınca etiket büyüyebildi ve dokunma alanı genişledi.
 *
 * TELEFONUN KENDİ TUŞLARININ ÜSTÜNDE. Yükseklik sabit yazılmıştı ve
 * altta güvenli alan boşluğu bırakılmıyordu: Android'de çubuk, sistemin
 * gezinme çubuğunun (jest çizgisi ya da üç tuş) tam üstüne oturuyor,
 * hatta içine giriyordu. Dokunmak için parmağı ekranın en altına
 * götürmek gerekiyor, çoğu zaman da sistem tuşu tetikleniyordu. Alt
 * boşluk artık cihazdan okunuyor ve üstüne bir tutam pay ekleniyor.
 */

/** Sistem çubuğu olmayan cihazlarda da çubuk ekranın dibine yapışmasın. */
const EN_AZ_ALT_BOSLUK = 12;

export default function SekmeYerlesimi() {
  const kenar = useSafeAreaInsets();
  const altBosluk = Math.max(kenar.bottom, EN_AZ_ALT_BOSLUK);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: renk.vurguKoyu,
        tabBarInactiveTintColor: renk.metinSolgun,
        // Simge yok: yeri de ayrılmasın, yoksa etiket yukarı sıkışıyor.
        tabBarIcon: () => null,
        tabBarIconStyle: { display: 'none' },
        tabBarStyle: {
          backgroundColor: renk.kart,
          borderTopColor: renk.cizgiSolgun,
          height: 56 + altBosluk,
          paddingTop: 8,
          paddingBottom: altBosluk,
        },
        tabBarLabelStyle: { fontSize: 14, fontWeight: '700' },
        // Etiket tek satırda kalsın; "Kayıtlar" iki satıra bölünüyordu.
        tabBarLabelPosition: 'below-icon',
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Bugün' }} />
      <Tabs.Screen name="takvim" options={{ title: 'Takvim' }} />
      <Tabs.Screen name="kayitlar" options={{ title: 'Kayıtlar' }} />
      <Tabs.Screen name="kasa" options={{ title: 'Kasa' }} />
      <Tabs.Screen name="daha" options={{ title: 'Daha' }} />
    </Tabs>
  );
}
