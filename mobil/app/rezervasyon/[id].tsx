import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { BolumBasligi, Dugme, Kart, Rozet, Yazi } from '../../src/bilesenler/temel';
import {
  gorecelıGun, okunakliMetin, tarihUzun, telefon, telefonUri, tutar,
} from '../../src/bicim';
import { aralik, renk, yazi, yuvarlak } from '../../src/tema';
import {
  isDurumu, isEmri, masalar, rezervasyon, tahsilatEkle, tahsilatlar,
  type IsSatiri, type Masa, type Rezervasyon, type Tahsilat,
} from '../../src/veri';
import HatirlatmaGonder from '../../src/bilesenler/HatirlatmaGonder';

/**
 * Rezervasyon ayrıntısı.
 *
 * Mobilde yapılabilen tek yazma işlemi burada: hızlı tahsilat girişi.
 * Salon sahibinin telefonu eline aldığı an genelde para aldığı andır;
 * bunun için masaüstüne dönmek zorunda kalmasın.
 */
export default function Ayrinti() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const yonlendir = useRouter();
  const [masaAcik, setMasaAcik] = useState(false);
  const [masaListe, setMasaListe] = useState<Masa[]>([]);
  const [kayit, setKayit] = useState<Rezervasyon | null>(null);
  const [odemeler, setOdemeler] = useState<Tahsilat[]>([]);
  const [isler, setIsler] = useState<IsSatiri[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState('');

  const [tutarMetin, setTutarMetin] = useState('');
  const [aciklama, setAciklama] = useState('');
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [basari, setBasari] = useState('');

  const yukle = useCallback(async () => {
    if (!id) return;
    try {
      setHata('');
      const [r, t, i, m] = await Promise.all([
        rezervasyon(id), tahsilatlar(id), isEmri(id), masalar(id),
      ]);
      setKayit(r);
      setOdemeler(t);
      setIsler(i);
      setMasaListe(m);
    } catch (e) {
      setHata(e instanceof Error ? e.message : 'Kayıt okunamadı.');
    } finally {
      setYukleniyor(false);
    }
  }, [id]);

  useEffect(() => { void yukle(); }, [yukle]);

  async function tahsilatKaydet() {
    if (!id || !kayit) return;
    setBasari('');
    setHata('');

    // Kullanıcı "12.500,50" ya da "12500" yazabilir; ikisini de kuruşa çevir.
    const sayi = Number(tutarMetin.replace(/\./g, '').replace(',', '.'));
    if (!Number.isFinite(sayi) || sayi <= 0) {
      setHata('Geçerli bir tutar giriniz.');
      return;
    }
    const kurus = Math.round(sayi * 100);
    const kalan = kayit.toplam - kayit.tahsilat;
    if (kurus > kalan) {
      setHata(`Tahsilat kalan alacağı aşamaz (kalan ${tutar(kalan)}).`);
      return;
    }

    setKaydediliyor(true);
    try {
      await tahsilatEkle(id, kurus, 'Nakit', aciklama.trim());
      setTutarMetin('');
      setAciklama('');
      setBasari('Tahsilat kaydedildi.');
      await yukle();
    } catch (e) {
      setHata(e instanceof Error ? e.message : 'Tahsilat kaydedilemedi.');
    } finally {
      setKaydediliyor(false);
    }
  }

  if (yukleniyor) {
    return (
      <View style={s.orta}><ActivityIndicator color={renk.vurguKoyu} /></View>
    );
  }

  if (!kayit) {
    return (
      <View style={s.orta}>
        <Yazi tur="altBaslik" renkli={renk.marka}>Kayıt bulunamadı</Yazi>
        {hata ? <Yazi tur="kucuk" renkli={renk.tehlike}>{hata}</Yazi> : null}
      </View>
    );
  }

  const kalan = kayit.toplam - kayit.tahsilat;
  const oran = kayit.toplam > 0 ? Math.min(1, kayit.tahsilat / kayit.toplam) : 0;

  return (
    <ScrollView style={{ backgroundColor: renk.zemin }} contentContainerStyle={{ padding: aralik.l, paddingBottom: aralik.xxl * 2 }}>
      <View style={s.ustBilgi}>
        <Rozet
          metin={kayit.tur.toLocaleUpperCase('tr-TR')}
          zemin={kayit.renk}
          yaziRengi={okunakliMetin(kayit.renk)}
        />
        <Yazi tur="minik" renkli={renk.metinSolgun}>{kayit.kod}</Yazi>
      </View>

      <Yazi tur="baslik" renkli={renk.lacivert} style={{ marginTop: aralik.s }}>{kayit.musteri}</Yazi>
      <Yazi tur="kucuk" renkli={renk.metinSolgun} style={{ marginTop: 2 }}>
        {tarihUzun(kayit.tarih)} · {kayit.seans} · {gorecelıGun(kayit.tarih)}
      </Yazi>

      <View style={s.kisayollar}>
        <Kisayol metin="Belgeler" onPress={() => yonlendir.push(`/belge/${kayit.id}`)} />
        <Kisayol metin="Masa düzeni" onPress={() => setMasaAcik((o) => !o)} />
      </View>

      {/* Para durumu: en üstte, tek bakışta okunacak şekilde. */}
      <Kart style={{ marginTop: aralik.l }}>
        <View style={s.paraSatir}>
          <View>
            <Yazi tur="minik" renkli={renk.metinSolgun}>TOPLAM</Yazi>
            <Text style={[yazi.tutar as object, { color: renk.lacivert }]}>{tutar(kayit.toplam)}</Text>
          </View>
          <View>
            <Yazi tur="minik" renkli={renk.metinSolgun}>TAHSİLAT</Yazi>
            <Text style={[yazi.tutar as object, { color: renk.basari }]}>{tutar(kayit.tahsilat)}</Text>
          </View>
          <View>
            <Yazi tur="minik" renkli={renk.metinSolgun}>KALAN</Yazi>
            <Text style={[yazi.tutar as object, { color: kalan > 0 ? renk.tehlike : renk.basari }]}>
              {tutar(kalan)}
            </Text>
          </View>
        </View>
        {/* Kapora ayrı yazılıyor: TAHSİLAT toplamı kaporayı da içeriyor ve
            aşağıdaki geçmiş listesinde kapora satırı görünmediği için
            iki rakam birbirini tutmuyor sanılıyordu. */}
        {kayit.kapora > 0 ? (
          <View style={[s.satir, { marginTop: aralik.m }]}>
            <Yazi tur="kucuk" renkli={renk.metinSolgun}>Kapora</Yazi>
            <Yazi tur="kucuk" renkli={renk.metin}>{tutar(kayit.kapora)}</Yazi>
          </View>
        ) : null}

        <View
          style={s.cubukArka}
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: 100, now: Math.round(oran * 100) }}
          accessibilityLabel="Tahsilat oranı"
        >
          <View style={[s.cubuk, { width: `${oran * 100}%` }]} />
        </View>
      </Kart>

      <BolumBasligi>Müşteri</BolumBasligi>
      <Kart>
        <View style={s.satir}>
          <View style={{ flex: 1 }}>
            <Yazi tur="kucuk" renkli={renk.metinSolgun}>Telefon</Yazi>
            <Yazi tur="altBaslik" renkli={renk.lacivert}>{telefon(kayit.telefon)}</Yazi>
          </View>
          {kayit.telefon ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Müşteriyi ara"
              onPress={() => void Linking.openURL(telefonUri(kayit.telefon))}
              style={({ pressed }) => [s.araDugme, pressed && { backgroundColor: renk.vurguDaha }]}
            >
              <Text style={{ color: renk.beyaz, fontWeight: '600' }}>Ara</Text>
            </Pressable>
          ) : null}
        </View>
        <View style={[s.satir, { marginTop: aralik.m }]}>
          <Yazi tur="kucuk" renkli={renk.metinSolgun}>Salon</Yazi>
          <Yazi tur="kucuk" renkli={renk.metin}>{kayit.salon}</Yazi>
        </View>
        <View style={[s.satir, { marginTop: aralik.s }]}>
          <Yazi tur="kucuk" renkli={renk.metinSolgun}>Davetli</Yazi>
          <Yazi tur="kucuk" renkli={renk.metin}>{kayit.davetli} kişi</Yazi>
        </View>
        <View style={[s.satir, { marginTop: aralik.s }]}>
          <Yazi tur="kucuk" renkli={renk.metinSolgun}>Durum</Yazi>
          <Yazi tur="kucuk" renkli={renk.metin}>{kayit.durum}</Yazi>
        </View>
      </Kart>

      <BolumBasligi>Hızlı tahsilat</BolumBasligi>
      <Kart>
        <Yazi tur="minik" renkli={renk.metinSolgun}>TUTAR (₺)</Yazi>
        <TextInput
          value={tutarMetin}
          onChangeText={setTutarMetin}
          keyboardType="decimal-pad"
          inputMode="decimal"
          placeholder="0,00"
          placeholderTextColor={renk.metinSolgun}
          style={s.giris}
          accessibilityLabel="Tahsilat tutarı"
        />
        <Yazi tur="minik" renkli={renk.metinSolgun} style={{ marginTop: aralik.m }}>AÇIKLAMA</Yazi>
        <TextInput
          value={aciklama}
          onChangeText={setAciklama}
          placeholder="Ara ödeme"
          placeholderTextColor={renk.metinSolgun}
          style={s.giris}
          accessibilityLabel="Tahsilat açıklaması"
        />
        {hata ? <Yazi tur="kucuk" renkli={renk.tehlike} style={{ marginTop: aralik.s }}>{hata}</Yazi> : null}
        {basari ? <Yazi tur="kucuk" renkli={renk.basari} style={{ marginTop: aralik.s }}>{basari}</Yazi> : null}
        <Dugme
          metin={kaydediliyor ? 'Kaydediliyor…' : 'Tahsilatı kaydet'}
          onPress={() => void tahsilatKaydet()}
          disabled={kaydediliyor || kalan <= 0}
          tam
          style={{ marginTop: aralik.l }}
        />
        {kalan <= 0 ? (
          <Yazi tur="kucuk" renkli={renk.metinSolgun} style={{ marginTop: aralik.s, textAlign: 'center' }}>
            Bu rezervasyonun tahsilatı tamamlanmış.
          </Yazi>
        ) : null}
      </Kart>

      {odemeler.length > 0 ? (
        <>
          <BolumBasligi>Tahsilat geçmişi</BolumBasligi>
          <Kart>
            {odemeler.map((o, i) => (
              <View key={o.id} style={[s.satir, i > 0 && { marginTop: aralik.m }]}>
                <View style={{ flex: 1 }}>
                  <Yazi tur="kucuk" renkli={renk.metin}>{tarihUzun(o.tarih)}</Yazi>
                  <Yazi tur="minik" renkli={renk.metinSolgun}>
                    {o.sekil}{o.aciklama ? ` · ${o.aciklama}` : ''}
                  </Yazi>
                </View>
                <Text style={[yazi.tutar as object, { color: renk.lacivert }]}>{tutar(o.tutar)}</Text>
              </View>
            ))}
          </Kart>
        </>
      ) : null}

      {masaAcik ? (
        <>
          <BolumBasligi
            sag={
              <Text style={[yazi.minik as object, { color: renk.metinSolgun }]}>
                {masaListe.reduce((t, m) => t + m.koltuk, 0)} koltuk
              </Text>
            }
          >
            Masa düzeni
          </BolumBasligi>
          <Kart>
            {masaListe.length === 0 ? (
              <Yazi tur="kucuk" renkli={renk.metinSolgun}>
                Bu rezervasyon için masa planı oluşturulmamış.
              </Yazi>
            ) : masaListe.map((m, i) => (
              <View key={m.id} style={[s.satir, i > 0 && { marginTop: aralik.m }]}>
                <View style={{ flex: 1 }}>
                  <Yazi tur="kucuk" renkli={renk.metin}>{m.no}. masa</Yazi>
                  {m.not ? <Yazi tur="minik" renkli={renk.metinSolgun}>{m.not}</Yazi> : null}
                </View>
                <Yazi tur="kucuk" renkli={renk.metinSolgun}>{m.koltuk} koltuk</Yazi>
              </View>
            ))}
            {masaListe.length > 0 && masaListe.reduce((t, m) => t + m.koltuk, 0) < kayit.davetli ? (
              <Yazi tur="kucuk" renkli={renk.tehlike} style={{ marginTop: aralik.m }}>
                Koltuk sayısı davetliyi karşılamıyor: {kayit.davetli - masaListe.reduce((t, m) => t + m.koltuk, 0)} kişilik eksik.
              </Yazi>
            ) : null}
          </Kart>
        </>
      ) : null}

      <BolumBasligi>Hatırlatma gönder</BolumBasligi>
      <HatirlatmaGonder kayit={kayit} odemeler={odemeler} />

      {isler.length > 0 ? (
        <>
          <BolumBasligi
            sag={
              <Text style={[yazi.minik as object, { color: renk.metinSolgun }]}>
                {isler.filter((i) => i.tamam).length}/{isler.length} tamam
              </Text>
            }
          >
            Etkinlik iş emri
          </BolumBasligi>
          <Kart>
            {isler.map((i, sira) => (
              <Pressable
                key={i.id}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: i.tamam }}
                accessibilityLabel={`${i.saat} ${i.is}`}
                onPress={() => {
                  const yeni = !i.tamam;
                  setIsler((o) => o.map((x) => (x.id === i.id ? { ...x, tamam: yeni } : x)));
                  void isDurumu(i.id, yeni);
                }}
                style={[s.isSatiri, sira > 0 && { borderTopWidth: 1, borderTopColor: renk.cizgiSolgun }]}
              >
                <View style={[s.kutucuk, i.tamam && { backgroundColor: renk.basari, borderColor: renk.basari }]}>
                  {i.tamam ? <Text style={{ color: renk.beyaz, fontSize: 12 }}>✓</Text> : null}
                </View>
                <Text style={[yazi.kucuk as object, s.saat]}>{i.saat}</Text>
                <View style={{ flex: 1 }}>
                  <Yazi tur="kucuk" renkli={i.tamam ? renk.metinSolgun : renk.metin}>{i.is}</Yazi>
                  {i.sorumlu ? <Yazi tur="minik" renkli={renk.metinSolgun}>{i.sorumlu}</Yazi> : null}
                </View>
              </Pressable>
            ))}
          </Kart>
        </>
      ) : null}
    </ScrollView>
  );
}

/** Ayrıntının üstündeki iki kısayol; ekranın en sık kullanılan iki çıkışı. */
function Kisayol({ metin, onPress }: { metin: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [s.kisayol, pressed && { backgroundColor: renk.zemin }]}
    >
      <Text style={[yazi.kucuk as object, { color: renk.vurguKoyu, fontWeight: '600' }]}>
        {metin}
      </Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  kisayollar: { flexDirection: 'row', gap: aralik.s, marginTop: aralik.m },
  kisayol: {
    minHeight: 40, paddingHorizontal: aralik.l, justifyContent: 'center',
    borderRadius: yuvarlak.tam, borderWidth: 1.5, borderColor: renk.vurguKoyu,
    backgroundColor: renk.kart,
  },
  orta: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: renk.zemin },
  ustBilgi: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  paraSatir: { flexDirection: 'row', justifyContent: 'space-between' },
  cubukArka: {
    height: 6, borderRadius: 3, backgroundColor: renk.cizgiSolgun,
    marginTop: aralik.m, overflow: 'hidden',
  },
  cubuk: { height: 6, borderRadius: 3, backgroundColor: renk.basari },
  satir: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  araDugme: {
    minHeight: 44, minWidth: 72, paddingHorizontal: aralik.l,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: renk.vurguKoyu, borderRadius: yuvarlak.tam,
  },
  giris: {
    marginTop: aralik.xs, minHeight: 46, borderWidth: 1, borderColor: renk.cizgi,
    borderRadius: yuvarlak.m, paddingHorizontal: aralik.m, fontSize: 16,
    color: renk.metin, backgroundColor: renk.beyaz,
  },
  isSatiri: { flexDirection: 'row', alignItems: 'center', gap: aralik.m, paddingVertical: aralik.m, minHeight: 44 },
  kutucuk: {
    width: 20, height: 20, borderRadius: 5, borderWidth: 1.5,
    borderColor: renk.cizgi, alignItems: 'center', justifyContent: 'center',
  },
  saat: { width: 44, color: renk.metinSolgun, fontVariant: ['tabular-nums'] },
});
