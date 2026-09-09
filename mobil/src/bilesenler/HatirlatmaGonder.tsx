import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Etiket, Secim } from './duzen';
import { Dugme, Kart, Yazi } from './temel';
import { doldur, olcSms } from '../sablon';
import { tarihSayisal, telefon, tutar } from '../bicim';
import { aralik, renk } from '../tema';
import {
  ISLETME, mesajGonder, sablonlar, tanitim,
  type Rezervasyon, type Sablon, type Tahsilat,
} from '../veri';

/**
 * Rezervasyon ekranından tek tuşla hatırlatma gönderimi.
 *
 * Metin panelde tanımlı taslaktan gelir ve gönderilmeden önce doldurulmuş
 * hâliyle gösterilir. Önizlemenin zorunlu olmasının sebebi, taslakta bir
 * yer tutucu yanlış yazıldığında bunun ancak müşteriye giden mesajda fark
 * edilmesiydi.
 *
 * Gönderim doğrudan sağlayıcıya değil kuyruğa gider: İYS kuralı orada
 * uygulanır ve sağlayıcı erişilemezse mesaj kaybolmaz.
 */
export default function HatirlatmaGonder({
  kayit, odemeler,
}: {
  kayit: Rezervasyon;
  odemeler: Tahsilat[];
}) {
  const [liste, setListe] = useState<Sablon[]>([]);
  const [secili, setSecili] = useState('');
  const [durum, setDurum] = useState<'bos' | 'gonderiliyor' | 'kuyrukta' | 'engellendi'>('bos');
  const [gerekce, setGerekce] = useState('');

  useEffect(() => { void sablonlar().then(setListe); }, []);

  const sablon = liste.find((x) => x.baslik === secili);

  // Tutarlarda para simgesi yazılmaz: "₺" bazı operatörlerde mesajı Türkçe
  // alfabe moduna düşürüp ikiye bölüyor.
  const para = (n: number) => tutar(n).replace(/\s*₺\s*$/, '');
  const odenen = odemeler.reduce((t, o) => t + o.tutar, 0);

  const degerler: Record<string, string> = {
    musteri: kayit.musteri,
    isletme: ISLETME.ad,
    salon: kayit.salon,
    tarih: tarihSayisal(kayit.tarih),
    seans: kayit.seans,
    tur: kayit.tur,
    kod: kayit.kod,
    tutar: para(kayit.toplam),
    odenen: para(odenen),
    kalan: para(Math.max(0, kayit.toplam - kayit.tahsilat)),
  };

  const metin = sablon ? doldur(sablon.metin, degerler) : '';
  const olcum = olcSms(metin);

  async function gonder() {
    if (!sablon) return;
    setDurum('gonderiliyor'); setGerekce('');
    try {
      const sonuc = await mesajGonder(kayit.telefon, metin, 'Hatırlatma', sablon.sinif, kayit.id);
      if (sonuc.kuyruga) {
        setDurum('kuyrukta');
      } else {
        setDurum('engellendi');
        setGerekce(sonuc.gerekce || 'Mesaj gönderilemedi.');
      }
    } catch (e) {
      setDurum('engellendi');
      setGerekce(e instanceof Error ? e.message : 'Mesaj gönderilemedi.');
    }
  }

  if (liste.length === 0) return null;

  return (
    <Kart>
      <Secim
        secenekler={liste.map((x) => x.baslik)}
        secili={secili}
        sec={(v) => { setSecili(v === secili ? '' : v); setDurum('bos'); setGerekce(''); }}
      />

      {sablon ? (
        <View style={st.onizleme}>
          <Yazi tur="minik" renkli={renk.metinSolgun}>GÖNDERİLECEK METİN</Yazi>
          <Yazi tur="kucuk" renkli={renk.metin} style={{ marginTop: aralik.s }}>{metin}</Yazi>

          <Yazi tur="minik" renkli={renk.metinSolgun} style={{ marginTop: aralik.m }}>
            {olcum.karakter} karakter · {olcum.parca} SMS · Alıcı: {telefon(kayit.telefon)}
          </Yazi>

          {sablon.sinif === 'ticari' ? (
            <View style={{ marginTop: aralik.s }}>
              <Etiket metin="Ticari ileti: İYS onayı olmayan numaraya gönderilmez" tur="uyari" />
            </View>
          ) : null}

          {durum === 'kuyrukta' ? (
            <Yazi tur="kucuk" renkli={renk.basari} style={{ marginTop: aralik.m }}>
              Mesaj kuyruğa alındı ve kayıtlara işlendi.
            </Yazi>
          ) : null}
          {durum === 'engellendi' ? (
            <Yazi tur="kucuk" renkli={renk.tehlike} style={{ marginTop: aralik.m }}>{gerekce}</Yazi>
          ) : null}
          {tanitim ? (
            <Yazi tur="minik" renkli={renk.metinSolgun} style={{ marginTop: aralik.s }}>
              Tanıtım modunda mesaj gerçekten gönderilmez.
            </Yazi>
          ) : null}

          <Dugme
            metin={durum === 'gonderiliyor' ? 'Gönderiliyor…' : 'Bu mesajı gönder'}
            tam
            disabled={durum === 'gonderiliyor'}
            onPress={() => void gonder()}
            style={{ marginTop: aralik.m }}
          />
        </View>
      ) : (
        <Yazi tur="kucuk" renkli={renk.metinSolgun} style={{ marginTop: aralik.m }}>
          Bir taslak seçin; metin bu rezervasyonun bilgileriyle doldurulur.
        </Yazi>
      )}
    </Kart>
  );
}

const st = StyleSheet.create({
  onizleme: {
    marginTop: aralik.m, padding: aralik.m,
    borderRadius: 10, backgroundColor: renk.zemin,
    borderWidth: 1, borderColor: renk.cizgiSolgun,
  },
});
