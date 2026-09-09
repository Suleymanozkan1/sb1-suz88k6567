import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Band, Satir } from '../../src/bilesenler/duzen';
import { BolumBasligi } from '../../src/bilesenler/temel';
import { useOturum } from '../../src/oturum';
import { aralik, renk, yazi } from '../../src/tema';
import { tanitim } from '../../src/veri';

/**
 * Bütün ekranların listesi.
 *
 * Sekmeye sığmayan on beş ekran burada, panel yan menüsündeki sırayla ve
 * aynı adlarla duruyor. Aynı işi iki uygulamada iki farklı adla anlatmak,
 * telefonu masaüstünden sonra kullanan kişiyi her seferinde arattırıyordu.
 */
const BOLUMLER: { baslik: string; satirlar: [string, string, string][] }[] = [
  {
    baslik: 'Defterler',
    satirlar: [
      ['Müşteriler', 'Kayıtlardan türetilen müşteri defteri', '/musteriler'],
      ['Salonlar', 'Salon tanımları ve kapasiteleri', '/salonlar'],
      ['Menüler', 'Menü ve paket tanımları', '/menuler'],
      ['Tedarikçiler', 'Orkestra, fotoğraf, çiçek, pasta', '/tedarikciler'],
    ],
  },
  {
    baslik: 'Para',
    satirlar: [
      ['Faturalar', 'e-Arşiv ve e-Fatura kayıtları', '/faturalar'],
      ['Raporlar', 'Aylık ciro ve organizasyon dağılımı', '/raporlar'],
    ],
  },
  {
    baslik: 'İletişim',
    satirlar: [
      ['Hatırlatmalar', 'Taslak mesajlar ve otomatik gönderim', '/hatirlatmalar'],
      ['SMS kayıtları', 'Gönderilen ve engellenen mesajlar', '/sms'],
      ['İYS izinleri', 'Ticari ileti onay ve ret kayıtları', '/izinler'],
      ['Talepler', 'Siteden gelen müşteri talepleri', '/talepler'],
    ],
  },
  {
    baslik: 'Yönetim',
    satirlar: [
      ['Kullanıcılar', 'Personel hesapları ve yetkileri', '/kullanicilar'],
      ['Denetim kaydı', 'Kim neyi ne zaman değiştirdi', '/denetim'],
      ['Sistem durumu', 'Yedek, SMS kuyruğu ve İYS durumu', '/sistem'],
      ['Ayarlar', 'İşletme bilgileri ve renk ayarları', '/ayarlar'],
      ['Hesap', 'Oturum bilgileri ve çıkış', '/hesap'],
    ],
  },
];

export default function Daha() {
  const yonlendir = useRouter();
  const { kullanici } = useOturum();

  return (
    <View style={{ flex: 1, backgroundColor: renk.zemin }}>
      <Band ustluk="Tümü" baslik="Bütün ekranlar" />
      <ScrollView contentContainerStyle={{ padding: aralik.l, paddingBottom: aralik.xxl }}>
        {tanitim ? (
          <View style={s.tanitim}>
            <Text style={[yazi.kucuk as object, { color: renk.uyari }]}>
              Tanıtım modu: sunucu bağlantısı tanımlı değil, gösterilen veriler örnektir.
            </Text>
          </View>
        ) : null}

        {BOLUMLER.map((bolum) => (
          <View key={bolum.baslik}>
            <BolumBasligi>{bolum.baslik}</BolumBasligi>
            {bolum.satirlar.map(([ad, aciklama, yol]) => (
              <Satir key={yol} baslik={ad} alt={aciklama} onPress={() => yonlendir.push(yol as never)} />
            ))}
          </View>
        ))}

        <Text style={[yazi.minik as object, s.dip]}>
          {kullanici?.eposta ?? ''} · Sahra Takip 1.0.0
        </Text>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  tanitim: {
    padding: aralik.m, borderRadius: 10,
    backgroundColor: '#fdf3e3', marginBottom: aralik.s,
  },
  dip: { color: renk.metinSolgun, textAlign: 'center', marginTop: aralik.xl },
});
