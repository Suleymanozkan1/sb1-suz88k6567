import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Govde, Satir, Secim } from '../../src/bilesenler/duzen';
import { BosDurum, Dugme, Yazi } from '../../src/bilesenler/temel';
import { bugunIso, tarihSayisal, telefon as telefonBicim, tutarKisa } from '../../src/bicim';
import { aralik, renk } from '../../src/tema';
import { adaylar, adayDurumlari, type Aday, type AdayDurumu } from '../../src/veri';

/**
 * Müşteri adayları.
 *
 * Instagram'dan gelip WhatsApp'a yazan kişi buraya düşüyor; rezervasyona
 * dönüşene kadar takip burada yürüyor. Müşteriler ekranı rezervasyonlardan
 * türeyen ayrı bir görünüm; aday oraya karışmıyor.
 *
 * Süzgeç panelde sekiz alanlı (arama, durum, kaynak, sorumlu, iki tarih
 * aralığı). Telefonda ÜÇ DURUM kutusu var: personelin sahada sorduğu soru
 * "bugün kimi arayacağım" ve "geciken var mı". Ayrıntılı süzme panelde.
 *
 * Hiçbir kural durum ADINA bakmıyor. Durumlar işletmenin düzenlediği
 * satırlar; "Rezervasyona Döndü" yazan bir karşılaştırma, sahibi adı
 * değiştirdiği anda sessizce yanlış sayardı. Kurallar bayrağa bakıyor.
 */
type Suzgec = 'acik' | 'bugun' | 'hepsi';

const SUZGECLER: { deger: Suzgec; ad: string }[] = [
  { deger: 'acik', ad: 'Açık' },
  { deger: 'bugun', ad: 'Bugün / geciken' },
  { deger: 'hepsi', ad: 'Hepsi' },
];

/** `src/lib/lead.ts` TON_SINIFI ile aynı anlam; mobilde sol çubuk rengi. */
const TON_RENGI: Record<string, string> = {
  bekleyen: '#92600e',
  ilerleyen: '#0c5e8a',
  olumlu: '#15803d',
  teklif: '#5b21b6',
  dikkat: '#b91c1c',
  kapali: '#94a3b8',
  notr: '#94a3b8',
};

export default function MusteriAdaylari() {
  const yonlendir = useRouter();
  const [suzgec, setSuzgec] = useState<Suzgec>('acik');

  return (
    <Govde<{ liste: Aday[]; durumlar: AdayDurumu[] }>
      yukle={async () => ({ liste: await adaylar(), durumlar: await adayDurumlari() })}
    >
      {(veri) => {
        const harita = new Map(veri.durumlar.map((d) => [d.kod, d]));
        const bugun = bugunIso();
        const kapandi = (a: Aday) => harita.get(a.durum)?.kapali ?? false;

        const gorunen = veri.liste.filter((a) => {
          if (suzgec === 'hepsi') return true;
          if (kapandi(a)) return false;
          if (suzgec === 'acik') return true;
          // "Bugün / geciken": takip günü gelmiş ya da geçmiş olanlar.
          return a.takip !== '' && a.takip <= bugun;
        });

        return (
          <>
            <Secim
              secenekler={SUZGECLER.map((s) => s.ad)}
              secili={SUZGECLER.find((s) => s.deger === suzgec)!.ad}
              sec={(ad) => setSuzgec(SUZGECLER.find((s) => s.ad === ad)!.deger)}
            />

            <Dugme
              metin="Yeni aday"
              tam
              style={{ marginTop: aralik.m, marginBottom: aralik.m }}
              onPress={() => yonlendir.push('/musteri-adaylari/yeni')}
            />

            {gorunen.length === 0 ? (
              <BosDurum
                baslik="Aday yok"
                aciklama={
                  suzgec === 'bugun'
                    ? 'Takip günü gelen aday bulunmuyor.'
                    : 'Bu süzgeçte gösterilecek aday bulunmuyor.'
                }
              />
            ) : (
              gorunen.map((a) => {
                const durum = harita.get(a.durum);
                const gecikti = a.takip !== '' && a.takip < bugun && !kapandi(a);
                return (
                  <Satir
                    key={a.id}
                    baslik={a.ad || telefonBicim(a.telefon)}
                    alt={`${durum?.ad ?? a.durum} · ${a.kaynak}`}
                    ikinciAlt={satirAlt(a, gecikti)}
                    deger={a.teklif === null ? undefined : tutarKisa(a.teklif)}
                    solRenk={TON_RENGI[durum?.ton ?? 'notr']}
                    onPress={() => yonlendir.push(`/musteri-adaylari/${a.id}`)}
                  />
                );
              })
            )}

            <View style={{ marginTop: aralik.l }}>
              <Yazi tur="kucuk" renkli={renk.metinSolgun}>
                {gorunen.length} aday gösteriliyor. Ayrıntılı süzme (kaynak, sorumlu,
                tarih aralığı) ve durum tanımları web panelinden yapılır.
              </Yazi>
              <Dugme
                metin="Durum tanımları"
                ikincil
                tam
                style={{ marginTop: aralik.m }}
                onPress={() => yonlendir.push('/musteri-adaylari/durumlar')}
              />
            </View>
          </>
        );
      }}
    </Govde>
  );
}

/** Etkinlik tarihi ve takip günü tek satırda; ikisi de boş olabilir. */
function satirAlt(a: Aday, gecikti: boolean): string {
  const parcalar: string[] = [];
  // Gün taşımayan ifade tarihe çevrilmiyor; olduğu gibi yazılıyor.
  if (a.etkinlikTarihi) parcalar.push(tarihSayisal(a.etkinlikTarihi));
  else if (a.tarihMetni) parcalar.push(a.tarihMetni);
  if (a.kisi) parcalar.push(`${a.kisi} kişi`);
  if (a.takip) parcalar.push(gecikti ? `Takip gecikti: ${tarihSayisal(a.takip)}` : `Takip: ${tarihSayisal(a.takip)}`);
  return parcalar.join(' · ');
}
