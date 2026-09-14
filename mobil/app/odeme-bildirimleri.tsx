import { useState } from 'react';
import { View } from 'react-native';
import { Etiket, Govde, Satir } from '../src/bilesenler/duzen';
import { BolumBasligi, BosDurum, Dugme, Kart, Yazi } from '../src/bilesenler/temel';
import { telefon as telefonBicim } from '../src/bicim';
import { aralik, renk } from '../src/tema';
import {
  ODEME_OLAY_ADI, odemeAlicilari, odemeKuralDurumu, odemeKurallari,
  type OdemeAlicisi, type OdemeKurali,
} from '../src/veri';

/**
 * Ödeme değişikliklerinde yöneticiye giden bildirimler.
 *
 * Panelle aynı iki şey görünüyor:
 *   kural : hangi olayda mesaj gider, metni ne
 *   alıcı : mesaj kime gider
 *
 * Mobilde AÇMA/KAPAMA var, METİN DÜZENLEME YOK. Kapatmak telefonda en
 * çok istenen işlem (gece gelen mesajı susturmak), tek dokunuşluk ve
 * geri alınabilir. Metin ise 400 karaktere kadar çıkıyor ve içindeki
 * {tutar}, {kalan} gibi yer tutucular bozulursa mesaj yanlış gidiyor;
 * telefon klavyesinde düzeltmek bu riski gereksiz yere taşır.
 *
 * Alıcı ekleme ve silme de panelde: yanlış girilen bir numara, ödeme
 * bilgisinin başkasına gitmesi demek.
 */
const KANAL_ADI: Record<string, string> = { sms: 'SMS', whatsapp: 'WhatsApp' };

export default function OdemeBildirimleri() {
  return (
    <Govde<{ kurallar: OdemeKurali[]; alicilar: OdemeAlicisi[] }>
      yukle={async () => ({
        kurallar: await odemeKurallari(),
        alicilar: await odemeAlicilari(),
      })}
    >
      {(veri, yenile) => (
        <>
          <BolumBasligi>Kurallar</BolumBasligi>
          {veri.kurallar.length === 0 ? (
            <BosDurum
              baslik="Kural yok"
              aciklama="Tanımlı bildirim kuralı bulunmuyor; web panelinden eklenir."
            />
          ) : (
            veri.kurallar.map((k) => <Kural key={k.id} kural={k} yenile={yenile} />)
          )}

          <BolumBasligi>Alıcılar</BolumBasligi>
          {veri.alicilar.length === 0 ? (
            <BosDurum
              baslik="Alıcı yok"
              aciklama="Kural açık olsa bile mesaj gidecek kimse tanımlı değil."
            />
          ) : (
            veri.alicilar.map((a) => (
              <Satir
                key={a.id}
                baslik={a.ad}
                alt={telefonBicim(a.telefon)}
                ikinciAlt={a.acik ? KANAL_ADI[a.kanal] ?? a.kanal : 'Kapalı'}
                solRenk={a.acik ? renk.basari : renk.cizgi}
              />
            ))
          )}

          <Etiket metin="Alıcı ekleme ve metin düzenleme web panelinde" />
          <Yazi tur="kucuk" renkli={renk.metinSolgun} style={{ marginTop: aralik.m }}>
            WhatsApp seçili alıcıya mesaj gönderilemezse SMS yedeği devreye girer.
            SMS ücretlidir; kapalı bir kural için hiçbir mesaj gönderilmez.
          </Yazi>
        </>
      )}
    </Govde>
  );
}

function Kural({ kural, yenile }: { kural: OdemeKurali; yenile: () => void }) {
  const [isleniyor, setIsleniyor] = useState(false);
  const [hata, setHata] = useState('');

  async function degistir() {
    setIsleniyor(true);
    setHata('');
    try {
      await odemeKuralDurumu(kural.id, !kural.acik);
      yenile();
    } catch (e) {
      // Sessiz başarısızlıkta kullanıcı kuralı kapattığını sanır ve
      // mesaj gelmeye devam eder.
      setHata(e instanceof Error ? e.message : 'Kural değiştirilemedi.');
    } finally {
      setIsleniyor(false);
    }
  }

  return (
    <Kart style={{ marginBottom: aralik.s }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <Yazi tur="altBaslik" renkli={renk.lacivert}>
            {ODEME_OLAY_ADI[kural.olay] ?? kural.olay}
          </Yazi>
          <Yazi tur="minik" renkli={kural.acik ? renk.basari : renk.metinSolgun} style={{ marginTop: 2 }}>
            {kural.acik ? 'Mesaj gönderiliyor' : 'Kapalı'}
          </Yazi>
        </View>
        <Dugme
          metin={kural.acik ? 'Kapat' : 'Aç'}
          ikincil={kural.acik}
          disabled={isleniyor}
          onPress={() => { void degistir(); }}
        />
      </View>

      <Yazi tur="kucuk" renkli={renk.metinSolgun} style={{ marginTop: aralik.m }}>
        {kural.metin}
      </Yazi>

      {hata ? (
        <Yazi tur="kucuk" renkli={renk.tehlike} style={{ marginTop: aralik.s }}>{hata}</Yazi>
      ) : null}
    </Kart>
  );
}
