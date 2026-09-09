import { Tabs } from 'expo-router';
import { Platform, Text } from 'react-native';
import { renk } from '../../src/tema';

/**
 * Sekmeler.
 *
 * Beş sekme: iOS'ta da Android'de de sınır burası; altıncısı etiketleri
 * kısaltıp tanınmaz hâle getiriyor. Günlük kullanımda sık açılan dördü
 * sekmede, geri kalan on beş ekran "Daha" altındaki listede toplandı.
 *
 * Simge yerine tek harfli işaret kullanılıyor; her sekmenin kendi geometrik
 * işareti var ve etiket her zaman görünür.
 */
function Isaret({ sekil, aktif }: { sekil: string; aktif: boolean }) {
  return (
    <Text style={{ fontSize: 18, color: aktif ? renk.vurguKoyu : renk.metinSolgun }}>{sekil}</Text>
  );
}

export default function SekmeYerlesimi() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: renk.vurguKoyu,
        tabBarInactiveTintColor: renk.metinSolgun,
        tabBarStyle: {
          backgroundColor: renk.kart,
          borderTopColor: renk.cizgiSolgun,
          height: Platform.OS === 'ios' ? 84 : 64,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Bugün', tabBarIcon: ({ focused }) => <Isaret sekil="◉" aktif={focused} /> }}
      />
      <Tabs.Screen
        name="takvim"
        options={{ title: 'Takvim', tabBarIcon: ({ focused }) => <Isaret sekil="▦" aktif={focused} /> }}
      />
      <Tabs.Screen
        name="kayitlar"
        options={{ title: 'Kayıtlar', tabBarIcon: ({ focused }) => <Isaret sekil="≡" aktif={focused} /> }}
      />
      <Tabs.Screen
        name="kasa"
        options={{ title: 'Kasa', tabBarIcon: ({ focused }) => <Isaret sekil="₺" aktif={focused} /> }}
      />
      <Tabs.Screen
        name="daha"
        options={{ title: 'Daha', tabBarIcon: ({ focused }) => <Isaret sekil="⋯" aktif={focused} /> }}
      />
    </Tabs>
  );
}
