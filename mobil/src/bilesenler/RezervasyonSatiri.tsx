import { Pressable, StyleSheet, Text, View } from 'react-native';
import { aralik, renk, yazi, yuvarlak } from '../tema';
import { tutarKisa } from '../bicim';
import type { Rezervasyon } from '../veri';

/**
 * Ajanda satırı.
 *
 * Karta değil satıra kuruldu: mobilde bir günün üç etkinliği kart hâlinde
 * ekranı doldurup taramayı zorlaştırıyor. Soldaki renk çubuğu organizasyon
 * türünü taşır; tür bilgisi renge ek olarak metinle de yazılır, çünkü renk
 * tek başına ayırt edici olamaz (renk körlüğü).
 */
export default function RezervasyonSatiri({
  kayit, onPress, tarihGoster,
}: {
  kayit: Rezervasyon;
  onPress: () => void;
  tarihGoster?: string;
}) {
  const kalan = kayit.toplam - kayit.tahsilat;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${kayit.musteri}, ${kayit.tur}, ${kayit.seans}`}
      style={({ pressed }) => [s.satir, pressed && { backgroundColor: renk.zemin }]}
    >
      <View style={[s.cubuk, { backgroundColor: kayit.renk }]} />

      <View style={s.orta}>
        <View style={s.ustSatir}>
          <Text style={[yazi.altBaslik as object, { color: renk.lacivert }]} numberOfLines={1}>
            {kayit.musteri}
          </Text>
          {tarihGoster ? (
            <Text style={[yazi.minik as object, { color: renk.metinSolgun }]}>{tarihGoster}</Text>
          ) : null}
        </View>

        <Text style={[yazi.kucuk as object, { color: renk.metinSolgun, marginTop: 2 }]} numberOfLines={1}>
          {kayit.tur} · {kayit.seans} · {kayit.salon} · {kayit.davetli} kişi
        </Text>

        <View style={s.altSatir}>
          <Text style={[yazi.kucuk as object, { color: renk.metin }]}>
            {tutarKisa(kayit.toplam)}
          </Text>
          <Text style={s.ayrac}>·</Text>
          {kalan > 0 ? (
            <Text style={[yazi.kucuk as object, { color: renk.tehlike, fontWeight: '600' }]}>
              {tutarKisa(kalan)} kalan
            </Text>
          ) : (
            <Text style={[yazi.kucuk as object, { color: renk.basari, fontWeight: '600' }]}>
              tahsilat tamam
            </Text>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  satir: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: renk.kart,
    borderRadius: yuvarlak.m,
    borderWidth: 1,
    borderColor: renk.cizgiSolgun,
    marginBottom: aralik.s,
    overflow: 'hidden',
    minHeight: 72,
  },
  cubuk: { width: 4 },
  orta: { flex: 1, paddingVertical: aralik.m, paddingHorizontal: aralik.m },
  ustSatir: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: aralik.s },
  altSatir: { flexDirection: 'row', alignItems: 'center', marginTop: aralik.s, gap: aralik.xs },
  ayrac: { color: renk.cizgi },
});
