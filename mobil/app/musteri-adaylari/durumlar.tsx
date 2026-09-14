import { View } from 'react-native';
import { Etiket, Govde } from '../../src/bilesenler/duzen';
import { BosDurum, Kart, Rozet, Yazi } from '../../src/bilesenler/temel';
import { aralik, renk } from '../../src/tema';
import { adayDurumlari, type AdayDurumu } from '../../src/veri';

/**
 * Aday durum tanımları.
 *
 * Durumlar koda gömülü değil, işletmenin düzenlediği satırlar: her salonun
 * takip akışı farklı. Bu ekran o akışı gösteriyor -- hangi durumda yeni
 * kayıt açılır, hangisi rezervasyon sayılır, hangisi işi kapatır, hangi
 * durumda kaç gün sonra takip kurulur.
 *
 * DÜZENLEME PANELDE. Bir durum kodu değiştiğinde ona bağlı bütün aday
 * satırları ve geçmiş kayıtları etkileniyor; kullanımdaki bir durumu
 * silmek de mümkün değil, yerine pasife alınıyor. Bu kurallar telefonda
 * anlatılamayacak kadar bağlantılı.
 */
const TON_RENGI: Record<string, string> = {
  bekleyen: '#92600e',
  ilerleyen: '#0c5e8a',
  olumlu: '#15803d',
  teklif: '#5b21b6',
  dikkat: '#b91c1c',
  kapali: '#94a3b8',
  notr: '#94a3b8',
};

export default function AdayDurumlari() {
  return (
    <Govde<AdayDurumu[]>
      yukle={adayDurumlari}
      bos={<BosDurum baslik="Durum yok" aciklama="Tanımlı aday durumu bulunmuyor." />}
    >
      {(liste) => (
        <>
          {liste.map((d, sira) => (
            <Kart key={d.kod} style={{ marginBottom: aralik.s }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: aralik.s }}>
                <View style={{
                  width: 10, height: 10, borderRadius: 5,
                  backgroundColor: TON_RENGI[d.ton] ?? TON_RENGI.notr,
                }} />
                <Yazi tur="altBaslik" renkli={d.etkin ? renk.lacivert : renk.metinSolgun} style={{ flex: 1 }}>
                  {sira + 1}. {d.ad}
                </Yazi>
                {d.etkin ? null : <Rozet metin="PASİF" zemin={renk.zemin} yaziRengi={renk.metinSolgun} />}
              </View>

              <Yazi tur="minik" renkli={renk.metinSolgun} style={{ marginTop: 4 }}>
                {d.kod}
              </Yazi>

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: aralik.xs, marginTop: aralik.s }}>
                {d.baslangic ? <Rozet metin="YENİ KAYIT BURAYA" zemin="#fef6e7" yaziRengi="#92600e" /> : null}
                {d.kazanim ? <Rozet metin="REZERVASYON SAYILIR" zemin="#e8f8ef" yaziRengi="#15803d" /> : null}
                {d.kapali ? <Rozet metin="KAPANIR" zemin={renk.zemin} yaziRengi={renk.metinSolgun} /> : null}
                {d.takipGunu > 0
                  ? <Rozet metin={`${d.takipGunu} GÜN SONRA TAKİP`} zemin="#ede9fe" yaziRengi="#5b21b6" />
                  : null}
              </View>
            </Kart>
          ))}

          <Etiket metin="Durum ekleme, adlandırma ve sıralama web panelinde" />
          <Yazi tur="kucuk" renkli={renk.metinSolgun} style={{ marginTop: aralik.m }}>
            Durum kodu değişmez; ad düzenlenebilir. Kullanımdaki bir durum silinemez,
            yerine pasife alınır: eski adaylar ve geçmiş satırları okunabilir kalsın diye.
          </Yazi>
        </>
      )}
    </Govde>
  );
}
