import { useState } from 'react';
import { View } from 'react-native';
import { Etiket, Govde, Secim } from '../src/bilesenler/duzen';
import { BosDurum, Kart, Yazi } from '../src/bilesenler/temel';
import { tarihUzun, telefon } from '../src/bicim';
import { aralik, renk } from '../src/tema';
import { smsKayitlari, type SmsKaydi } from '../src/veri';

/**
 * SMS gönderim kayıtları.
 *
 * Engellenen gönderim de listede: sessizce atılan bir mesaj, "gönderdim
 * sanıyordum" durumunu üretiyor. Neden gönderilmediği gerekçesiyle
 * birlikte yazılıyor ve denetlenebilir kalıyor.
 */
const SUZGECLER = ['Tümü', 'Gönderildi', 'Bekliyor', 'Engellendi'];

export default function Sms() {
  const [suzgec, setSuzgec] = useState('Tümü');

  return (
    <Govde<SmsKaydi[]>
      yukle={() => smsKayitlari()}
      bos={<BosDurum baslik="Kayıt yok" aciklama="Henüz mesaj gönderilmemiş." />}
    >
      {(liste) => {
        const sonuc = liste.filter((m) => {
          if (suzgec === 'Gönderildi') return m.durum === 'Gönderildi' || m.durum === 'gonderildi';
          if (suzgec === 'Bekliyor') return m.durum === 'Bekliyor' || m.durum === 'bekliyor';
          if (suzgec === 'Engellendi') return m.durum === 'İptal' || m.durum === 'iptal';
          return true;
        });

        return (
          <>
            <Secim secenekler={SUZGECLER} secili={suzgec} sec={setSuzgec} />

            <View style={{ marginTop: aralik.l }}>
              {sonuc.length === 0 ? (
                <BosDurum baslik="Sonuç yok" aciklama="Bu süzgece uyan kayıt bulunmuyor." />
              ) : sonuc.map((m) => (
                <Kart key={m.id} style={{ marginBottom: aralik.s }}>
                  <View style={s.ust}>
                    <Yazi tur="altBaslik" renkli={renk.lacivert}>{telefon(m.telefon)}</Yazi>
                    <Etiket
                      metin={m.durum}
                      tur={/gönderildi|gonderildi/i.test(m.durum) ? 'iyi'
                        : /iptal/i.test(m.durum) ? 'kotu' : 'uyari'}
                    />
                  </View>

                  <Yazi tur="minik" renkli={renk.metinSolgun} style={{ marginTop: 2 }}>
                    {m.tur} · {m.sinif === 'ticari' ? 'Ticari ileti' : 'İşlem bildirimi'} · {tarihUzun(m.tarih)}
                  </Yazi>

                  <Yazi tur="kucuk" renkli={renk.metin} style={{ marginTop: aralik.m }}>
                    {m.metin}
                  </Yazi>

                  {m.gerekce ? (
                    <Yazi tur="minik" renkli={renk.tehlike} style={{ marginTop: aralik.s }}>
                      {m.gerekce}
                    </Yazi>
                  ) : null}
                </Kart>
              ))}
            </View>

            <Yazi tur="kucuk" renkli={renk.metinSolgun} style={{ marginTop: aralik.l }}>
              Sağlayıcı tanımlı değilse mesaj gönderilmez ama kaydı tutulur ve
              kuyrukta bekler; gönderim daha sonra yeniden denenir.
            </Yazi>
          </>
        );
      }}
    </Govde>
  );
}

const s = {
  ust: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: aralik.s,
  },
};
