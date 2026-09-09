import { useState } from 'react';
import { View } from 'react-native';
import { Alan, Etiket, Govde } from '../src/bilesenler/duzen';
import { BosDurum, Dugme, Kart, Yazi } from '../src/bilesenler/temel';
import { olcSms } from '../src/sablon';
import { aralik, renk } from '../src/tema';
import { sablonKaydet, sablonlar, tanitim, type Sablon } from '../src/veri';

/**
 * Hatırlatma taslakları ve otomatik gönderim kuralları.
 *
 * Metin telefondan düzenlenebiliyor; kural (kaç gün önce, hangi saat)
 * yalnızca gösteriliyor. Sebebi, kuralın bütün müşterileri aynı anda
 * etkilemesi: yanlışlıkla değiştirilen bir gün sayısı yüzlerce mesajın
 * yanlış zamanda gitmesine yol açabilir; bu karar masaüstünde verilsin.
 *
 * Mesaj uzunluğu yanında yazılı: tek bir Türkçe harf sınırı 160'tan 70'e
 * düşürüyor ve fatura sessizce ikiye katlanıyordu.
 */
export default function Hatirlatmalar() {
  return (
    <Govde<Sablon[]>
      yukle={sablonlar}
      bos={<BosDurum baslik="Şablon yok" aciklama="Henüz taslak mesaj tanımlanmamış." />}
    >
      {(liste, yenile) => (
        <>
          {liste.map((s) => <SablonKarti key={s.id} sablon={s} yenile={yenile} />)}
          <Yazi tur="kucuk" renkli={renk.metinSolgun} style={{ marginTop: aralik.l }}>
            Yer tutucular ({'{musteri}'}, {'{tarih}'}, {'{salon}'}, {'{kalan}'} …) gönderim
            sırasında rezervasyonun kendi bilgisiyle değiştirilir. Otomatik gönderim
            kuralları web panelinden düzenlenir.
          </Yazi>
        </>
      )}
    </Govde>
  );
}

function SablonKarti({ sablon, yenile }: { sablon: Sablon; yenile: () => void }) {
  const [metin, setMetin] = useState(sablon.metin);
  const [durum, setDurum] = useState<'bos' | 'kaydediliyor' | 'kaydedildi' | 'hata'>('bos');
  const [hata, setHata] = useState('');
  const olcum = olcSms(metin);
  const degisti = metin !== sablon.metin;

  async function kaydet() {
    setDurum('kaydediliyor'); setHata('');
    try {
      await sablonKaydet(sablon.id, metin.trim());
      setDurum('kaydedildi');
      yenile();
    } catch (e) {
      setDurum('hata');
      setHata(e instanceof Error ? e.message : 'Kaydedilemedi.');
    }
  }

  return (
    <Kart style={{ marginBottom: aralik.m }}>
      <View style={st.ust}>
        <Yazi tur="altBaslik" renkli={renk.lacivert}>{sablon.baslik}</Yazi>
        <Etiket
          metin={sablon.sinif === 'ticari' ? 'Ticari ileti' : 'İşlem bildirimi'}
          tur={sablon.sinif === 'ticari' ? 'uyari' : 'iyi'}
        />
      </View>

      <Alan etiket="Mesaj metni" deger={metin} degistir={setMetin} cokSatir />

      <Yazi tur="minik" renkli={olcum.turkce ? renk.uyari : renk.metinSolgun} style={{ marginTop: aralik.s }}>
        {olcum.karakter} karakter · {olcum.parca} SMS
        {olcum.turkce ? ' · Türkçe harf kullanıldığı için parça başına 70 karakter' : ''}
      </Yazi>

      {sablon.otomatik ? (
        <Yazi tur="minik" renkli={renk.basari} style={{ marginTop: aralik.s }}>
          Kendiliğinden gönderiliyor: organizasyondan {Math.abs(sablon.gunOnce)} gün
          {sablon.gunOnce < 0 ? ' sonra' : sablon.gunOnce === 0 ? ' (etkinlik günü)' : ' önce'},
          saat {String(sablon.saat).padStart(2, '0')}:00 sonrası.
        </Yazi>
      ) : (
        <Yazi tur="minik" renkli={renk.metinSolgun} style={{ marginTop: aralik.s }}>
          Otomatik gönderim kapalı; rezervasyon ekranından elle gönderilir.
        </Yazi>
      )}

      {hata ? (
        <Yazi tur="kucuk" renkli={renk.tehlike} style={{ marginTop: aralik.s }}>{hata}</Yazi>
      ) : null}
      {durum === 'kaydedildi' && !degisti ? (
        <Yazi tur="kucuk" renkli={renk.basari} style={{ marginTop: aralik.s }}>Kaydedildi.</Yazi>
      ) : null}
      {tanitim && degisti ? (
        <Yazi tur="minik" renkli={renk.metinSolgun} style={{ marginTop: aralik.s }}>
          Tanıtım modunda değişiklik saklanmaz.
        </Yazi>
      ) : null}

      <Dugme
        metin={durum === 'kaydediliyor' ? 'Kaydediliyor…' : 'Metni kaydet'}
        ikincil
        tam
        disabled={!degisti || durum === 'kaydediliyor'}
        onPress={() => void kaydet()}
        style={{ marginTop: aralik.m }}
      />
    </Kart>
  );
}

const st = {
  ust: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: aralik.s,
  },
};
