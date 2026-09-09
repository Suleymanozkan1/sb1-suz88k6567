import { View } from 'react-native';
import { Etiket, Govde } from '../src/bilesenler/duzen';
import { BosDurum, Kart, Yazi } from '../src/bilesenler/temel';
import { tarihUzun, tutar } from '../src/bicim';
import { aralik, renk } from '../src/tema';
import { faturalar, type Fatura } from '../src/veri';

/**
 * Fatura listesi.
 *
 * Fatura kesme telefonda yapılmıyor: matrah, KDV oranı ve alıcı bilgisi
 * yanlış girildiğinde gönderilmiş fatura düzeltilemiyor, yalnızca iptal
 * edilebiliyor. Mobilde yalnızca görüntülenir.
 */
export default function Faturalar() {
  return (
    <Govde<Fatura[]>
      yukle={() => faturalar()}
      bos={<BosDurum baslik="Fatura yok" aciklama="Henüz fatura düzenlenmemiş." />}
    >
      {(liste) => (
        <>
          {liste.map((f) => (
            <Kart key={f.id} style={{ marginBottom: aralik.s }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1 }}>
                  <Yazi tur="altBaslik" renkli={renk.lacivert}>{f.musteri}</Yazi>
                  <Yazi tur="minik" renkli={renk.metinSolgun} style={{ marginTop: 2 }}>
                    {f.no} · {f.tur} · {tarihUzun(f.tarih)}
                  </Yazi>
                </View>
                <Etiket
                  metin={f.durum}
                  tur={f.durum === 'Gönderildi' ? 'iyi' : f.durum === 'İptal' ? 'kotu' : 'uyari'}
                />
              </View>

              <View style={s.tutarlar}>
                <Kalem etiket="MATRAH" deger={tutar(f.matrah)} />
                <Kalem etiket="KDV" deger={tutar(f.kdv)} />
                <Kalem etiket="TOPLAM" deger={tutar(f.toplam)} vurgu />
              </View>
            </Kart>
          ))}

          <Yazi tur="kucuk" renkli={renk.metinSolgun} style={{ marginTop: aralik.l }}>
            Gönderilmiş fatura değiştirilemez ve silinemez; yalnızca iptal edilebilir.
            Fatura kesme işlemi web panelinden yapılır.
          </Yazi>
        </>
      )}
    </Govde>
  );
}

function Kalem({ etiket, deger, vurgu }: { etiket: string; deger: string; vurgu?: boolean }) {
  return (
    <View style={{ flex: 1 }}>
      <Yazi tur="minik" renkli={renk.metinSolgun}>{etiket}</Yazi>
      <Yazi tur="tutar" renkli={vurgu ? renk.lacivert : renk.metin} style={{ marginTop: 2 }}>
        {deger}
      </Yazi>
    </View>
  );
}

const s = {
  tutarlar: {
    flexDirection: 'row' as const,
    marginTop: aralik.m,
    borderTopWidth: 1,
    borderTopColor: renk.cizgiSolgun,
    paddingTop: aralik.m,
    gap: aralik.s,
  },
};
