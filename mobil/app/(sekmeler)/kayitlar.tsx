import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import RezervasyonSatiri from '../../src/bilesenler/RezervasyonSatiri';
import { Band, Govde, Secim } from '../../src/bilesenler/duzen';
import { BosDurum } from '../../src/bilesenler/temel';
import { bugunIso, tarihKisa } from '../../src/bicim';
import { DOKUNMA_EN_AZ, aralik, renk, yazi, yuvarlak } from '../../src/tema';
import { tumKayitlar, type Rezervasyon } from '../../src/veri';

/**
 * Rezervasyon listesi.
 *
 * Panelde bu ekran tablodur; telefonda tablo okunmuyor, satır listesi
 * kullanıldı. Arama ad, telefon ve rezervasyon kodu üzerinden yapılır —
 * salon sahibi genelde müşterinin adını değil, elindeki kodu biliyor.
 */
const SUZGECLER = ['Tümü', 'Yaklaşan', 'Geçmiş', 'Alacaklı'] as const;

export default function Kayitlar() {
  const yonlendir = useRouter();
  const [arama, setArama] = useState('');
  const [suzgec, setSuzgec] = useState<string>('Yaklaşan');

  return (
    <View style={{ flex: 1, backgroundColor: renk.zemin }}>
      <Band ustluk="Kayıtlar" baslik="Rezervasyonlar">
        <TextInput
          value={arama}
          onChangeText={setArama}
          placeholder="Ad, telefon veya kod ara"
          placeholderTextColor="#8fa4c6"
          accessibilityLabel="Rezervasyon ara"
          style={s.arama}
        />
      </Band>

      <Govde<Rezervasyon[]>
        yukle={() => tumKayitlar()}
        bos={<BosDurum baslik="Kayıt yok" aciklama="Henüz rezervasyon kaydı bulunmuyor." />}
      >
        {(kayitlar) => (
          <Liste
            kayitlar={kayitlar}
            arama={arama}
            suzgec={suzgec}
            setSuzgec={setSuzgec}
            ac={(id) => yonlendir.push(`/rezervasyon/${id}`)}
          />
        )}
      </Govde>

      <Pressable
        onPress={() => yonlendir.push('/rezervasyon/yeni')}
        accessibilityRole="button"
        accessibilityLabel="Yeni rezervasyon"
        style={({ pressed }) => [s.ekle, pressed && { backgroundColor: renk.vurguDaha }]}
      >
        <Text style={s.ekleYazi}>+</Text>
      </Pressable>
    </View>
  );
}

function Liste({
  kayitlar, arama, suzgec, setSuzgec, ac,
}: {
  kayitlar: Rezervasyon[];
  arama: string;
  suzgec: string;
  setSuzgec: (v: string) => void;
  ac: (id: string) => void;
}) {
  const bugun = bugunIso();

  const sonuc = useMemo(() => {
    // Arama Türkçe yerelde küçültülür: "İ" harfi İngilizce kurallarla
    // "i̇" oluyor ve "İpek" araması hiçbir şey bulmuyordu.
    const q = arama.trim().toLocaleLowerCase('tr-TR');
    return kayitlar.filter((r) => {
      if (q && !(
        r.musteri.toLocaleLowerCase('tr-TR').includes(q) ||
        r.telefon.includes(q) ||
        r.kod.toLocaleLowerCase('tr-TR').includes(q)
      )) return false;
      if (suzgec === 'Yaklaşan') return r.tarih >= bugun;
      if (suzgec === 'Geçmiş') return r.tarih < bugun;
      if (suzgec === 'Alacaklı') return r.toplam - r.tahsilat > 0;
      return true;
    });
  }, [kayitlar, arama, suzgec, bugun]);

  return (
    <>
      <Secim secenekler={[...SUZGECLER]} secili={suzgec} sec={setSuzgec} />
      <Text style={[yazi.minik as object, s.sayac]}>
        {sonuc.length} KAYIT
      </Text>

      {sonuc.length === 0 ? (
        <BosDurum
          baslik="Sonuç yok"
          aciklama="Arama ve süzgeç birlikte uygulanıyor; birini gevşetmeyi deneyin."
        />
      ) : (
        sonuc.map((r) => (
          <RezervasyonSatiri
            key={r.id}
            kayit={r}
            tarihGoster={tarihKisa(r.tarih)}
            onPress={() => ac(r.id)}
          />
        ))
      )}
    </>
  );
}

const s = StyleSheet.create({
  arama: {
    marginTop: aralik.l, minHeight: DOKUNMA_EN_AZ,
    borderRadius: yuvarlak.m, paddingHorizontal: aralik.m,
    backgroundColor: renk.marka, color: renk.beyaz, fontSize: 15,
  },
  sayac: { color: renk.metinSolgun, marginTop: aralik.l, marginBottom: aralik.s },
  ekle: {
    position: 'absolute', right: aralik.l, bottom: aralik.xl,
    width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: renk.vurguKoyu,
    shadowColor: '#1b2a4a', shadowOpacity: 0.25, shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 }, elevation: 4,
  },
  ekleYazi: { color: renk.beyaz, fontSize: 30, lineHeight: 34, fontWeight: '300' },
});
