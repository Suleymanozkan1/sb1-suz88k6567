import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { Etiket } from '../src/bilesenler/duzen';
import { BolumBasligi, Dugme, Kart, Rozet, Yazi } from '../src/bilesenler/temel';
import { aralik, renk } from '../src/tema';
import { whatsappHesabi, whatsappOtomatikDurumu, type WhatsappHesabi } from '../src/veri';

/**
 * WhatsApp numarası eşlemesi ve otomatik cevap ayarları.
 *
 * Mobilde AÇMA/KAPAMA ve okuma var. Numara kimliği ve mesaj metinleri
 * panelde düzenleniyor: `phone_number_id` Meta'dan gelen on beş haneli
 * bir sayı ve yanlış girildiğinde webhook işletmeyi hiç bulamıyor --
 * gelen bütün mesajlar sessizce düşer, hata da görünmez.
 *
 * Otomatik cevabı kapatmak ise telefonda gerçekten gereken işlem: salon
 * kapalıyken ya da numara devredilirken mesaj gitmesin isteniyor.
 *
 * Saatler işletmenin YEREL saati (Türkiye, UTC+3).
 */
const GUNLER: [number, string][] = [
  [1, 'Pzt'], [2, 'Sal'], [3, 'Çar'], [4, 'Per'], [5, 'Cum'], [6, 'Cmt'], [7, 'Paz'],
];

export default function WhatsappAyarlari() {
  const [hesap, setHesap] = useState<WhatsappHesabi | null>(null);
  const [yuklendi, setYuklendi] = useState(false);
  const [hata, setHata] = useState('');
  const [isleniyor, setIsleniyor] = useState(false);

  const getir = useCallback(async () => {
    try {
      setHata('');
      setHesap(await whatsappHesabi());
    } catch (e) {
      setHata(e instanceof Error ? e.message : 'WhatsApp ayarları okunamadı.');
    } finally {
      setYuklendi(true);
    }
  }, []);

  useEffect(() => { void getir(); }, [getir]);

  async function otomatikDegistir() {
    if (!hesap) return;
    setIsleniyor(true);
    try {
      await whatsappOtomatikDurumu(hesap.numaraKimligi, !hesap.otomatikAcik);
      await getir();
    } catch (e) {
      setHata(e instanceof Error ? e.message : 'Ayar değiştirilemedi.');
    } finally {
      setIsleniyor(false);
    }
  }

  if (!yuklendi) {
    return (
      <View style={{ flex: 1, backgroundColor: renk.zemin, justifyContent: 'center' }}>
        <ActivityIndicator color={renk.vurguKoyu} />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: renk.zemin }}
      contentContainerStyle={{ padding: aralik.l, paddingBottom: aralik.xxl }}
    >
      {hata ? (
        <Kart style={{ marginBottom: aralik.s }}>
          <Yazi tur="kucuk" renkli={renk.tehlike}>{hata}</Yazi>
          <Dugme metin="Yeniden dene" ikincil tam style={{ marginTop: aralik.m }}
            onPress={() => { void getir(); }} />
        </Kart>
      ) : null}

      {!hesap ? (
        <Kart>
          <Yazi tur="altBaslik" renkli={renk.lacivert}>WhatsApp kurulu değil</Yazi>
          <Yazi tur="kucuk" renkli={renk.metinSolgun} style={{ marginTop: aralik.s }}>
            Bu işletme için WhatsApp Business numarası eşlenmemiş. Kurulum web
            panelinden yapılır: Meta'dan alınan numara kimliği girilmeden gelen
            mesajlar hiçbir işletmeye düşmez.
          </Yazi>
        </Kart>
      ) : (
        <>
          <Kart>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Yazi tur="altBaslik" renkli={renk.lacivert}>
                  {hesap.gorunenNumara || 'Numara yazılmamış'}
                </Yazi>
                <Yazi tur="minik" renkli={renk.metinSolgun} style={{ marginTop: 2 }}>
                  Numara kimliği: {hesap.numaraKimligi}
                </Yazi>
              </View>
              {isleniyor ? <ActivityIndicator color={renk.vurguKoyu} /> : null}
            </View>
          </Kart>

          <BolumBasligi>Otomatik cevap</BolumBasligi>
          <Kart>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Yazi
                  tur="altBaslik"
                  renkli={hesap.otomatikAcik ? renk.basari : renk.metinSolgun}
                >
                  {hesap.otomatikAcik ? 'Açık' : 'Kapalı'}
                </Yazi>
                <Yazi tur="minik" renkli={renk.metinSolgun} style={{ marginTop: 2 }}>
                  Gelen ilk mesaja karşılama gönderilir
                </Yazi>
              </View>
              <Dugme
                metin={hesap.otomatikAcik ? 'Kapat' : 'Aç'}
                ikincil={hesap.otomatikAcik}
                disabled={isleniyor}
                onPress={() => { void otomatikDegistir(); }}
              />
            </View>

            <Yazi tur="kucuk" renkli={renk.metinSolgun} style={{ marginTop: aralik.m }}>
              {hesap.karsilamaMesaji}
            </Yazi>
          </Kart>

          <BolumBasligi>Mesai dışı</BolumBasligi>
          <Kart>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: aralik.s }}>
              <Rozet
                metin={hesap.mesaiDisiAcik ? 'AÇIK' : 'KAPALI'}
                zemin={hesap.mesaiDisiAcik ? '#e7f4ec' : renk.zemin}
                yaziRengi={hesap.mesaiDisiAcik ? renk.basari : renk.metinSolgun}
              />
              <Yazi tur="altBaslik" renkli={renk.lacivert} style={{ flex: 1 }}>
                {hesap.mesaiBaslangic} - {hesap.mesaiBitis}
              </Yazi>
            </View>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: aralik.xs, marginTop: aralik.m }}>
              {GUNLER.map(([no, ad]) => {
                const acik = hesap.mesaiGunleri.includes(no);
                return (
                  <Rozet
                    key={no}
                    metin={ad}
                    zemin={acik ? '#e7f4ec' : renk.zemin}
                    yaziRengi={acik ? renk.basari : renk.metinSolgun}
                  />
                );
              })}
            </View>

            <Yazi tur="kucuk" renkli={renk.metinSolgun} style={{ marginTop: aralik.m }}>
              {hesap.mesaiDisiMesaji}
            </Yazi>
          </Kart>

          <Etiket metin="Numara, mesaj metinleri ve saatler web panelinde" />
          <Yazi tur="kucuk" renkli={renk.metinSolgun} style={{ marginTop: aralik.m }}>
            Numara kimliği Meta'dan gelen bir sayıdır; yanlış girildiğinde gelen
            mesajlar hiçbir işletmeye düşmez ve hata görünmez. Bu yüzden telefondan
            değiştirilmiyor. Saatler işletmenin yerel saatidir.
          </Yazi>
        </>
      )}
    </ScrollView>
  );
}
