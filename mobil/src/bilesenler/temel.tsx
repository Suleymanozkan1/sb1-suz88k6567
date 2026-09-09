import { Pressable, StyleSheet, Text, View, type PressableProps, type ViewStyle } from 'react-native';
import { DOKUNMA_EN_AZ, aralik, renk, yazi, yuvarlak } from '../tema';

/* Ortak, küçük yapı taşları. Ekranlar bunları birleştirir; her ekranın kendi
   gölge ve kenar yuvarlaması tanımlaması görsel tutarsızlık üretiyordu. */

export function Yazi({
  tur = 'govde', renkli, style, children, ...kalan
}: {
  tur?: keyof typeof yazi;
  renkli?: string;
  style?: ViewStyle | object;
  children: React.ReactNode;
} & React.ComponentProps<typeof Text>) {
  return (
    <Text {...kalan} style={[yazi[tur] as object, { color: renkli ?? renk.metin }, style]}>
      {children}
    </Text>
  );
}

/** İçerik kartı: tek bir kenarlık, gölge yok — liste hâlinde gölge gürültü yapıyor. */
export function Kart({ style, children }: { style?: ViewStyle; children: React.ReactNode }) {
  return <View style={[s.kart, style]}>{children}</View>;
}

/**
 * Bölüm başlığı: küçük, harf aralıklı, solgun.
 *
 * Büyük harfe CSS `textTransform` ile değil, Türkçe yerelle çevriliyor:
 * `textTransform: 'uppercase'` "Müşteri" sözcüğünü "MÜŞTERI" yapıyor,
 * oysa Türkçede "MÜŞTERİ" olmalı.
 */
export function BolumBasligi({ children, sag }: { children: string; sag?: React.ReactNode }) {
  return (
    <View style={s.bolum}>
      <Text style={[yazi.minik as object, { color: renk.metinSolgun }]}>
        {children.toLocaleUpperCase('tr-TR')}
      </Text>
      {sag}
    </View>
  );
}

export function Rozet({ metin, zemin, yaziRengi }: { metin: string; zemin: string; yaziRengi: string }) {
  return (
    <View style={[s.rozet, { backgroundColor: zemin }]}>
      <Text style={[yazi.minik as object, { color: yaziRengi }]}>{metin}</Text>
    </View>
  );
}

export function Dugme({
  metin, ikincil, tam, style, ...kalan
}: { metin: string; ikincil?: boolean; tam?: boolean } & PressableProps & { style?: ViewStyle }) {
  return (
    <Pressable
      accessibilityRole="button"
      {...kalan}
      style={({ pressed }) => [
        s.dugme,
        ikincil ? s.dugmeIkincil : s.dugmeBirincil,
        tam && { alignSelf: 'stretch' },
        pressed && { backgroundColor: ikincil ? renk.zemin : renk.vurguDaha },
        (kalan.disabled ?? false) && { opacity: 0.5 },
        style,
      ]}
    >
      <Text style={[yazi.altBaslik as object, { color: ikincil ? renk.vurguKoyu : renk.beyaz }]}>
        {metin}
      </Text>
    </Pressable>
  );
}

/** Boş liste durumu: neden boş olduğunu söyler, sessiz kalmaz. */
export function BosDurum({ baslik, aciklama }: { baslik: string; aciklama: string }) {
  return (
    <View style={s.bos}>
      <Text style={[yazi.altBaslik as object, { color: renk.marka }]}>{baslik}</Text>
      <Text style={[yazi.kucuk as object, { color: renk.metinSolgun, textAlign: 'center', marginTop: aralik.xs }]}>
        {aciklama}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  kart: {
    backgroundColor: renk.kart,
    borderRadius: yuvarlak.l,
    borderWidth: 1,
    borderColor: renk.cizgiSolgun,
    padding: aralik.l,
  },
  bolum: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: aralik.s,
    marginTop: aralik.xl,
  },
  rozet: {
    paddingHorizontal: aralik.s,
    paddingVertical: 3,
    borderRadius: yuvarlak.tam,
    alignSelf: 'flex-start',
  },
  dugme: {
    minHeight: DOKUNMA_EN_AZ,
    paddingHorizontal: aralik.xl,
    borderRadius: yuvarlak.tam,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dugmeBirincil: { backgroundColor: renk.vurguKoyu },
  dugmeIkincil: { backgroundColor: renk.kart, borderWidth: 1.5, borderColor: renk.vurguKoyu },
  bos: { alignItems: 'center', paddingVertical: aralik.xxl * 1.5, paddingHorizontal: aralik.xl },
});
