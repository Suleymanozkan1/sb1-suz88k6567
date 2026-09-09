import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet,
  Text, TextInput, View, type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DOKUNMA_EN_AZ, aralik, renk, yazi, yuvarlak } from '../tema';
import { Yazi } from './temel';

/* Ekran iskeleti ve liste yapı taşları.

   Yirmiden fazla ekran aynı düzeni paylaşıyor: koyu bir başlık bandı, altında
   kaydırılabilir içerik, yükleniyor ve hata durumları. Bunlar her ekranda
   yeniden yazıldığında ufak farklar birikip ekranlar birbirine benzemez
   hâle geliyordu; iskelet buraya alındı. */

/** Koyu başlık bandı: üstlük, başlık ve isteğe bağlı özet kutusu. */
export function Band({
  ustluk, baslik, children, sekmede = true,
}: {
  ustluk: string;
  baslik: string;
  children?: React.ReactNode;
  /** Sekme ekranlarında üst çentik boşluğu bandın içine alınır. */
  sekmede?: boolean;
}) {
  const kenar = useSafeAreaInsets();
  return (
    <View style={[s.band, { paddingTop: (sekmede ? kenar.top : 0) + aralik.l }]}>
      <Text style={[yazi.minik as object, { color: renk.vurguAcik }]}>
        {ustluk.toLocaleUpperCase('tr-TR')}
      </Text>
      <Yazi tur="dev" renkli={renk.beyaz} style={{ marginTop: aralik.xs }}>{baslik}</Yazi>
      {children}
    </View>
  );
}

/** Bandın içindeki tek sayılık özet kutusu. */
export function BandOzet({ etiket, deger, sag }: { etiket: string; deger: string; sag?: React.ReactNode }) {
  return (
    <View style={s.ozet}>
      <View style={{ flex: 1 }}>
        <Text style={[yazi.minik as object, { color: '#a9bcd8' }]}>{etiket}</Text>
        <Text style={[yazi.tutarDev as object, { color: renk.beyaz, marginTop: 2 }]}>{deger}</Text>
      </View>
      {sag}
    </View>
  );
}

/**
 * Veri yükleyen ekran gövdesi.
 *
 * Yükleniyor, hata ve boş durumları tek yerde ele alınıyor. Hatanın sessizce
 * boş liste olarak görünmesi en kötü sonuç: kullanıcı verinin silindiğini
 * sanıyor. Bu yüzden hata her zaman yazılır ve yeniden deneme sunulur.
 */
export function Govde<T>({
  yukle, bos, children, band, altBosluk = aralik.xxl,
}: {
  yukle: () => Promise<T>;
  bos?: React.ReactNode;
  children: (veri: T, yenile: () => void) => React.ReactNode;
  /** Kaydırma alanının üstünde, sabit duran koyu bant. Veri yüklenmeden
   *  önce de çizilir; ekran boş bir beyazlıkla açılmasın diye. */
  band?: (veri: T | null) => React.ReactNode;
  altBosluk?: number;
}) {
  const [veri, setVeri] = useState<T | null>(null);
  const [hata, setHata] = useState('');
  const [yenileniyor, setYenileniyor] = useState(false);

  const getir = useCallback(async () => {
    try {
      setHata('');
      setVeri(await yukle());
    } catch (e) {
      setHata(e instanceof Error ? e.message : 'Kayıtlar okunamadı.');
    }
    // yukle her render'da yeniden üretilen bir kapanış; bağımlılığa
    // konduğunda sonsuz döngü oluşuyor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { void getir(); }, [getir]);

  const bosMu = Array.isArray(veri) && veri.length === 0;

  const govde = (
    <ScrollView
      style={{ flex: 1, backgroundColor: renk.zemin }}
      contentContainerStyle={{ padding: aralik.l, paddingBottom: altBosluk }}
      refreshControl={
        <RefreshControl
          refreshing={yenileniyor}
          onRefresh={() => { setYenileniyor(true); void getir().finally(() => setYenileniyor(false)); }}
          tintColor={renk.vurguKoyu}
        />
      }
    >
      {hata ? (
        <View style={s.hata}>
          <Yazi tur="kucuk" renkli={renk.tehlike}>{hata}</Yazi>
          <Pressable onPress={() => { void getir(); }} style={s.tekrar} accessibilityRole="button">
            <Text style={[yazi.kucuk as object, { color: renk.vurguKoyu, fontWeight: '600' }]}>
              Yeniden dene
            </Text>
          </Pressable>
        </View>
      ) : null}

      {veri === null && !hata ? (
        <ActivityIndicator color={renk.vurguKoyu} style={{ marginTop: aralik.xxl }} />
      ) : null}

      {veri !== null && bosMu && bos ? bos : null}
      {veri !== null && !(bosMu && bos) ? children(veri, () => { void getir(); }) : null}
    </ScrollView>
  );

  if (!band) return govde;
  return (
    <View style={{ flex: 1, backgroundColor: renk.zemin }}>
      {band(veri)}
      {govde}
    </View>
  );
}

/**
 * Liste satırı: solda başlık ve açıklama, sağda değer.
 *
 * Tablo yerine satır kullanılıyor; telefon genişliğinde üç sütunlu tablo
 * ya taşıyor ya da okunamayacak kadar küçülüyor.
 */
export function Satir({
  baslik, alt, deger, degerRengi, ikinciAlt, onPress, solRenk, style,
}: {
  baslik: string;
  alt?: string;
  deger?: string;
  degerRengi?: string;
  ikinciAlt?: string;
  onPress?: () => void;
  solRenk?: string;
  style?: ViewStyle;
}) {
  const icerik = (
    <>
      {solRenk ? <View style={[s.solCubuk, { backgroundColor: solRenk }]} /> : null}
      <View style={s.satirOrta}>
        <Text style={[yazi.altBaslik as object, { color: renk.lacivert }]} numberOfLines={1}>
          {baslik}
        </Text>
        {alt ? (
          <Text style={[yazi.kucuk as object, { color: renk.metinSolgun, marginTop: 2 }]} numberOfLines={2}>
            {alt}
          </Text>
        ) : null}
        {ikinciAlt ? (
          <Text style={[yazi.minik as object, { color: renk.metinSolgun, marginTop: 4 }]} numberOfLines={1}>
            {ikinciAlt}
          </Text>
        ) : null}
      </View>
      {deger ? (
        <Text style={[yazi.tutar as object, { color: degerRengi ?? renk.lacivert, marginLeft: aralik.m }]}>
          {deger}
        </Text>
      ) : null}
    </>
  );

  if (!onPress) return <View style={[s.satir, style]}>{icerik}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={baslik}
      style={({ pressed }) => [s.satir, pressed && { backgroundColor: renk.zemin }, style]}
    >
      {icerik}
    </Pressable>
  );
}

/** Küçük, renkli durum etiketi. Renk tek başına anlam taşımaz, metni de var. */
export function Etiket({ metin, tur = 'notr' }: {
  metin: string;
  tur?: 'notr' | 'iyi' | 'uyari' | 'kotu';
}) {
  const renkler = {
    notr: { zemin: renk.zemin, yazi: renk.metinSolgun },
    iyi: { zemin: '#e7f4ec', yazi: renk.basari },
    uyari: { zemin: '#fdf3e3', yazi: renk.uyari },
    kotu: { zemin: '#fdecea', yazi: renk.tehlike },
  }[tur];
  return (
    <View style={[s.etiket, { backgroundColor: renkler.zemin }]}>
      <Text style={[yazi.minik as object, { color: renkler.yazi }]}>{metin}</Text>
    </View>
  );
}

/** Form alanı: etiket ve giriş kutusu. */
export function Alan({
  etiket, deger, degistir, ipucu, klavye, cokSatir, duzenlenebilir = true,
}: {
  etiket: string;
  deger: string;
  degistir: (v: string) => void;
  ipucu?: string;
  klavye?: 'default' | 'decimal-pad' | 'phone-pad' | 'number-pad';
  cokSatir?: boolean;
  duzenlenebilir?: boolean;
}) {
  return (
    <View style={{ marginTop: aralik.m }}>
      <Text style={[yazi.minik as object, { color: renk.metinSolgun }]}>
        {etiket.toLocaleUpperCase('tr-TR')}
      </Text>
      <TextInput
        value={deger}
        onChangeText={degistir}
        placeholder={ipucu}
        placeholderTextColor={renk.metinSolgun}
        keyboardType={klavye ?? 'default'}
        inputMode={klavye === 'decimal-pad' ? 'decimal' : klavye === 'phone-pad' ? 'tel' : undefined}
        multiline={cokSatir}
        editable={duzenlenebilir}
        accessibilityLabel={etiket}
        style={[s.giris, cokSatir && { minHeight: 96, paddingTop: aralik.m, textAlignVertical: 'top' }]}
      />
    </View>
  );
}

/** Seçenek şeridi: az sayıda seçenek arasından biri. */
export function Secim({
  secenekler, secili, sec,
}: {
  secenekler: string[];
  secili: string;
  sec: (v: string) => void;
}) {
  return (
    <View style={s.secimSeridi}>
      {secenekler.map((o) => {
        const aktif = o === secili;
        return (
          <Pressable
            key={o}
            onPress={() => sec(o)}
            accessibilityRole="radio"
            accessibilityState={{ selected: aktif }}
            style={[s.secim, aktif && { backgroundColor: renk.vurguKoyu, borderColor: renk.vurguKoyu }]}
          >
            <Text style={[
              yazi.kucuk as object,
              { color: aktif ? renk.beyaz : renk.metin, fontWeight: aktif ? '600' : '400' },
            ]}>
              {o}
            </Text>
          </Pressable>
        );
      })}
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
  hata: {
    padding: aralik.m, borderRadius: yuvarlak.m,
    backgroundColor: '#fdecea', marginBottom: aralik.l,
  },
  tekrar: { marginTop: aralik.s, minHeight: 32, justifyContent: 'center' },
  satir: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: renk.kart,
    borderRadius: yuvarlak.m,
    borderWidth: 1,
    borderColor: renk.cizgiSolgun,
    marginBottom: aralik.s,
    overflow: 'hidden',
    minHeight: DOKUNMA_EN_AZ + 16,
    paddingRight: aralik.m,
  },
  solCubuk: { width: 4, alignSelf: 'stretch' },
  satirOrta: { flex: 1, paddingVertical: aralik.m, paddingLeft: aralik.m },
  etiket: {
    paddingHorizontal: aralik.s, paddingVertical: 3,
    borderRadius: yuvarlak.tam, alignSelf: 'flex-start',
  },
  giris: {
    marginTop: aralik.xs, minHeight: 46, borderWidth: 1, borderColor: renk.cizgi,
    borderRadius: yuvarlak.m, paddingHorizontal: aralik.m, fontSize: 16,
    color: renk.metin, backgroundColor: renk.beyaz,
  },
  secimSeridi: { flexDirection: 'row', flexWrap: 'wrap', gap: aralik.s, marginTop: aralik.xs },
  secim: {
    minHeight: DOKUNMA_EN_AZ - 8, paddingHorizontal: aralik.l, justifyContent: 'center',
    borderRadius: yuvarlak.tam, borderWidth: 1, borderColor: renk.cizgi, backgroundColor: renk.kart,
  },
});
