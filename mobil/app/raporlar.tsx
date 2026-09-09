import { View } from 'react-native';
import { Govde, Satir } from '../src/bilesenler/duzen';
import { BolumBasligi, BosDurum, Kart, Yazi } from '../src/bilesenler/temel';
import { ayAdi, tutarKisa } from '../src/bicim';
import { aralik, renk, yuvarlak } from '../src/tema';
import { aylikCiro, turDagilimi, type AyCiro, type TurDagilim } from '../src/veri';

interface Rapor { ciro: AyCiro[]; dagilim: TurDagilim[] }

/**
 * Raporlar.
 *
 * Grafik kütüphanesi yerine oranlı çubuklar kullanılıyor: telefonda eksenli
 * bir grafik ya okunamıyor ya da yatay kaydırma gerektiriyor. Çubuk, en
 * yüksek değere göre ölçekleniyor ve sayının kendisi yanında yazılı —
 * uzunluk tek başına anlam taşımıyor.
 */
export default function Raporlar() {
  return (
    <Govde<Rapor>
      yukle={async () => ({ ciro: await aylikCiro(), dagilim: await turDagilimi() })}
    >
      {({ ciro, dagilim }) => {
        if (ciro.length === 0) {
          return <BosDurum baslik="Veri yok" aciklama="Rapor üretecek kayıt bulunmuyor." />;
        }
        const enBuyuk = Math.max(...ciro.map((a) => a.tutar), 1);
        const toplamAdet = dagilim.reduce((t, d) => t + d.adet, 0) || 1;

        return (
          <>
            <BolumBasligi>Aylık ciro</BolumBasligi>
            <Kart>
              {ciro.map((a) => {
                const [yil, ay] = a.ay.split('-');
                return (
                  <View key={a.ay} style={{ marginBottom: aralik.m }}>
                    <View style={s.satirBasi}>
                      <Yazi tur="kucuk" renkli={renk.metin}>
                        {ayAdi(Number(ay) - 1)} {yil}
                      </Yazi>
                      <Yazi tur="kucuk" renkli={renk.lacivert}>
                        {tutarKisa(a.tutar)} · {a.adet} kayıt
                      </Yazi>
                    </View>
                    <View style={s.cubukArka}>
                      <View style={[s.cubuk, { width: `${(a.tutar / enBuyuk) * 100}%` }]} />
                    </View>
                  </View>
                );
              })}
            </Kart>

            <BolumBasligi>Organizasyon dağılımı</BolumBasligi>
            <Kart>
              {dagilim.map((d) => (
                <View key={d.tur} style={{ marginBottom: aralik.m }}>
                  <View style={s.satirBasi}>
                    <Yazi tur="kucuk" renkli={renk.metin}>{d.tur}</Yazi>
                    <Yazi tur="kucuk" renkli={renk.metinSolgun}>
                      {d.adet} · %{Math.round((d.adet / toplamAdet) * 100)}
                    </Yazi>
                  </View>
                  <View style={s.cubukArka}>
                    <View style={[s.cubuk, {
                      width: `${(d.adet / toplamAdet) * 100}%`, backgroundColor: d.renk,
                    }]} />
                  </View>
                </View>
              ))}
            </Kart>

            <Satir
              baslik="Ayrıntılı rapor"
              alt="Tarih aralığı seçimi ve CSV dışa aktarım web panelindedir."
              style={{ marginTop: aralik.l }}
            />
          </>
        );
      }}
    </Govde>
  );
}

const s = {
  satirBasi: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    marginBottom: aralik.xs,
  },
  cubukArka: {
    height: 8, borderRadius: yuvarlak.s,
    backgroundColor: renk.cizgiSolgun, overflow: 'hidden' as const,
  },
  cubuk: { height: 8, borderRadius: yuvarlak.s, backgroundColor: renk.vurguKoyu },
};
