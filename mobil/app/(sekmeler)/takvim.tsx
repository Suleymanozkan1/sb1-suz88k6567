import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import RezervasyonSatiri from '../../src/bilesenler/RezervasyonSatiri';
import { BosDurum, Yazi } from '../../src/bilesenler/temel';
import { ayAdi, bugunIso, gunAdi, tarihUzun, yerelIso } from '../../src/bicim';
import { aralik, renk, yazi, yuvarlak } from '../../src/tema';
import { ayinKayitlari, type Rezervasyon } from '../../src/veri';

const GUN_KISA = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

/**
 * Takvim: üstte kompakt ay ızgarası, altında seçili günün listesi.
 *
 * Izgara doldurulmuş bir gün için nokta gösterir, etkinliğin kendisini
 * değil, 375 piksellik ekranda hücre 44 piksel civarında kalıyor ve içine
 * metin sığmıyor. Ayrıntı alttaki listede.
 */
export default function Takvim() {
  const kenar = useSafeAreaInsets();
  const yonlendir = useRouter();
  const [imlec, setImlec] = useState(() => { const t = new Date(); return { yil: t.getFullYear(), ay: t.getMonth() }; });
  const [secili, setSecili] = useState(bugunIso());
  const [kayitlar, setKayitlar] = useState<Rezervasyon[] | null>(null);

  const yukle = useCallback(async () => {
    setKayitlar(null);
    setKayitlar(await ayinKayitlari(imlec.yil, imlec.ay));
  }, [imlec]);

  useEffect(() => { void yukle(); }, [yukle]);

  const gunler = useMemo(() => {
    const ilk = new Date(imlec.yil, imlec.ay, 1);
    // Pazartesi ile başlayan hafta: getDay() pazarı 0 sayar.
    const bosluk = (ilk.getDay() + 6) % 7;
    const adet = new Date(imlec.yil, imlec.ay + 1, 0).getDate();
    const dizi: (string | null)[] = Array.from({ length: bosluk }, () => null);
    for (let g = 1; g <= adet; g += 1) dizi.push(yerelIso(new Date(imlec.yil, imlec.ay, g)));
    return dizi;
  }, [imlec]);

  const gunRenkleri = useMemo(() => {
    const harita: Record<string, string[]> = {};
    for (const r of kayitlar ?? []) (harita[r.tarih] ??= []).push(r.renk);
    return harita;
  }, [kayitlar]);

  const seciliKayitlar = (kayitlar ?? []).filter((r) => r.tarih === secili);
  const bugun = bugunIso();

  function ayDegistir(yon: number) {
    setImlec((o) => {
      const t = new Date(o.yil, o.ay + yon, 1);
      return { yil: t.getFullYear(), ay: t.getMonth() };
    });
  }

  return (
    <View style={{ flex: 1, backgroundColor: renk.zemin }}>
      <View style={[s.band, { paddingTop: kenar.top + aralik.l }]}>
        <View style={s.ayBasligi}>
          <Pressable
            onPress={() => ayDegistir(-1)}
            accessibilityLabel="Önceki ay"
            accessibilityRole="button"
            style={s.okDugme}
          >
            <Text style={s.ok}>‹</Text>
          </Pressable>
          <Yazi tur="baslik" renkli={renk.beyaz}>{ayAdi(imlec.ay)} {imlec.yil}</Yazi>
          <Pressable
            onPress={() => ayDegistir(1)}
            accessibilityLabel="Sonraki ay"
            accessibilityRole="button"
            style={s.okDugme}
          >
            <Text style={s.ok}>›</Text>
          </Pressable>
        </View>

        <View style={s.haftaBasligi}>
          {GUN_KISA.map((g) => (
            <Text key={g} style={[yazi.minik as object, s.haftaGun]}>{g}</Text>
          ))}
        </View>

        <View style={s.izgara}>
          {gunler.map((iso, i) => {
            if (!iso) return <View key={`bos-${i}`} style={s.hucre} />;
            const gun = Number(iso.slice(8));
            const isaretler = gunRenkleri[iso] ?? [];
            const seciliMi = iso === secili;
            const bugunMu = iso === bugun;
            return (
              <Pressable
                key={iso}
                onPress={() => setSecili(iso)}
                accessibilityRole="button"
                accessibilityLabel={`${gun} ${ayAdi(imlec.ay)}${isaretler.length ? `, ${isaretler.length} kayıt` : ''}`}
                accessibilityState={{ selected: seciliMi }}
                style={[s.hucre, seciliMi && s.hucreSecili]}
              >
                <Text style={[
                  yazi.kucuk as object,
                  { color: seciliMi ? renk.lacivert : renk.beyaz, fontWeight: bugunMu ? '700' : '400' },
                ]}>
                  {gun}
                </Text>
                <View style={s.noktalar}>
                  {isaretler.slice(0, 3).map((c, j) => (
                    <View key={j} style={[s.nokta, { backgroundColor: c }]} />
                  ))}
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: aralik.l, paddingBottom: aralik.xxl }}>
        <Text style={[yazi.minik as object, { color: renk.metinSolgun, marginBottom: aralik.s }]}>
          {gunAdi(secili).toLocaleUpperCase('tr-TR')} · {tarihUzun(secili).toLocaleUpperCase('tr-TR')}
        </Text>

        {kayitlar === null ? (
          <ActivityIndicator color={renk.vurguKoyu} style={{ marginTop: aralik.xl }} />
        ) : seciliKayitlar.length === 0 ? (
          <BosDurum baslik="Bu günde kayıt yok" aciklama="Seçili tarihte rezervasyon bulunmuyor." />
        ) : (
          seciliKayitlar.map((r) => (
            <RezervasyonSatiri key={r.id} kayit={r} onPress={() => yonlendir.push(`/rezervasyon/${r.id}`)} />
          ))
        )}
      </ScrollView>
    </View>
  );
}

const HUCRE = `${100 / 7}%`;

const s = StyleSheet.create({
  band: {
    backgroundColor: renk.lacivert,
    paddingHorizontal: aralik.m,
    paddingBottom: aralik.m,
    borderBottomLeftRadius: yuvarlak.l * 1.5,
    borderBottomRightRadius: yuvarlak.l * 1.5,
  },
  ayBasligi: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  okDugme: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  ok: { fontSize: 26, color: renk.vurguAcik, lineHeight: 28 },
  haftaBasligi: { flexDirection: 'row', marginTop: aralik.s },
  haftaGun: { width: HUCRE, textAlign: 'center', color: '#a9bcd8' },
  izgara: { flexDirection: 'row', flexWrap: 'wrap', marginTop: aralik.xs },
  hucre: {
    width: HUCRE,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: yuvarlak.s,
  },
  hucreSecili: { backgroundColor: renk.beyaz },
  noktalar: { flexDirection: 'row', gap: 2, marginTop: 3, height: 5 },
  nokta: { width: 5, height: 5, borderRadius: 3 },
});
