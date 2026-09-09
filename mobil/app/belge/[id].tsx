import { useEffect, useState } from 'react';
import { ScrollView, Share, StyleSheet } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Secim } from '../../src/bilesenler/duzen';
import { BosDurum, Dugme, Kart, Yazi } from '../../src/bilesenler/temel';
import { tarihUzun, telefon, tutar } from '../../src/bicim';
import { aralik, renk } from '../../src/tema';
import {
  ISLETME, rezervasyon, tahsilatlar, type Rezervasyon, type Tahsilat,
} from '../../src/veri';

/**
 * Sözleşme ve tahsilat makbuzu.
 *
 * A4 çıktı web panelinde; burada belgenin metni okunur ve paylaşılır.
 * Telefondan yazıcıya gönderme yerine paylaşım seçildi: salon sahibi
 * belgeyi genelde müşteriye WhatsApp'tan iletiyor, yazdırmıyor.
 *
 * Metin belgenin kendisidir, ekran görüntüsü değil: kopyalanabilir ve
 * paylaşıldığında okunabilir kalır.
 */
export default function Belge() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [kayit, setKayit] = useState<Rezervasyon | null>(null);
  const [odemeler, setOdemeler] = useState<Tahsilat[]>([]);
  const [tur, setTur] = useState('Sözleşme');
  const [yukleniyor, setYukleniyor] = useState(true);

  useEffect(() => {
    if (!id) return;
    void Promise.all([rezervasyon(id), tahsilatlar(id)]).then(([r, t]) => {
      setKayit(r); setOdemeler(t); setYukleniyor(false);
    });
  }, [id]);

  if (yukleniyor) return null;
  if (!kayit) {
    return <BosDurum baslik="Kayıt bulunamadı" aciklama="Belge üretilecek rezervasyon yok." />;
  }

  const metin = tur === 'Sözleşme' ? sozlesmeMetni(kayit) : makbuzMetni(kayit, odemeler);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: renk.zemin }}
      contentContainerStyle={{ padding: aralik.l, paddingBottom: aralik.xxl }}
    >
      <Secim secenekler={['Sözleşme', 'Makbuz']} secili={tur} sec={setTur} />

      <Kart style={{ marginTop: aralik.l }}>
        <Yazi tur="kucuk" renkli={renk.metin} style={s.belge} selectable>
          {metin}
        </Yazi>
      </Kart>

      <Dugme
        metin="Belgeyi paylaş"
        tam
        onPress={() => void Share.share({ message: metin })}
        style={{ marginTop: aralik.l }}
      />

      <Yazi tur="minik" renkli={renk.metinSolgun} style={{ marginTop: aralik.m, textAlign: 'center' }}>
        A4 çıktı ve imza alanlı biçim web panelindedir.
      </Yazi>
    </ScrollView>
  );
}

function sozlesmeMetni(r: Rezervasyon): string {
  return [
    'SALON KİRALAMA SÖZLEŞMESİ',
    '',
    `KİRAYA VEREN : ${ISLETME.ad}`,
    `KİRACI       : ${r.musteri}`,
    `TELEFON      : ${telefon(r.telefon)}`,
    '',
    `Rezervasyon kodu : ${r.kod}`,
    `Organizasyon     : ${r.tur}`,
    `Tarih            : ${tarihUzun(r.tarih)}`,
    `Seans            : ${r.seans}`,
    `Salon            : ${r.salon}`,
    `Davetli sayısı   : ${r.davetli} kişi`,
    '',
    `Toplam tutar     : ${tutar(r.toplam)}`,
    `Tahsil edilen    : ${tutar(r.tahsilat)}`,
    `Kalan            : ${tutar(Math.max(0, r.toplam - r.tahsilat))}`,
    '',
    'Taraflar, yukarıda belirtilen tarih ve seansta salonun kiracıya',
    'tahsis edilmesi konusunda anlaşmıştır. Kalan tutar organizasyon',
    'tarihinden önce ödenir.',
    '',
    'KİRAYA VEREN                         KİRACI',
    'İmza                                 İmza',
  ].join('\n');
}

function makbuzMetni(r: Rezervasyon, odemeler: Tahsilat[]): string {
  if (odemeler.length === 0) {
    return [
      'TAHSİLAT MAKBUZU',
      '',
      `${ISLETME.ad}`,
      `Rezervasyon: ${r.kod} · ${r.musteri}`,
      '',
      'Bu rezervasyon için henüz tahsilat kaydı bulunmuyor.',
    ].join('\n');
  }
  const satirlar = odemeler.map(
    (o) => `${tarihUzun(o.tarih).padEnd(20)} ${o.sekil.padEnd(10)} ${tutar(o.tutar)}`,
  );
  return [
    'TAHSİLAT MAKBUZU',
    '',
    `${ISLETME.ad}`,
    `Rezervasyon: ${r.kod} · ${r.musteri}`,
    `Organizasyon: ${tarihUzun(r.tarih)} · ${r.seans}`,
    '',
    'TARİH                ŞEKİL      TUTAR',
    '-------------------------------------------',
    ...satirlar,
    '-------------------------------------------',
    `TOPLAM TAHSİLAT      ${tutar(r.tahsilat)}`,
    `KALAN                ${tutar(Math.max(0, r.toplam - r.tahsilat))}`,
    '',
    'Bu makbuz rezervasyon kaydından üretilmiştir.',
  ].join('\n');
}

const s = StyleSheet.create({
  // Belge hizası boşluklarla kuruluyor; eşit genişlikte rakam ve harf şart.
  belge: { fontFamily: 'monospace', lineHeight: 20 },
});
