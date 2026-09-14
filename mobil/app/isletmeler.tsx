import { useState } from 'react';
import { View } from 'react-native';
import { Etiket, Govde } from '../src/bilesenler/duzen';
import { BosDurum, Dugme, Kart, Rozet, Yazi } from '../src/bilesenler/temel';
import { telefon as telefonBicim } from '../src/bicim';
import { aralik, renk } from '../src/tema';
import {
  aktifIsletmeSec, etkinIsletme, isletmeler, type Isletme,
} from '../src/veri';

/**
 * İşletmeler ve etkin işletme seçimi.
 *
 * Birden çok salonu olan kullanıcı telefonda tek bir şey soruyor:
 * "hangi salonun kayıtlarına bakıyorum" ve "diğerine geç". O yüzden
 * SEÇİM VAR, düzenleme yok.
 *
 * Ekleme, düzenleme ve silme panelde kalıyor: işletme kaydında kilit
 * süresi, rapor e-postası ve para birimi gibi bütün sistemi etkileyen
 * alanlar var; küçük ekranda yanlış dokunuşla bozulması en pahalı kayıt.
 *
 * Seçim değişince ekranlar yeni işletmenin verisini gösterir. Bu geri
 * alınabilir bir işlem ve hiçbir kaydı bozmuyor.
 */
export default function Isletmeler() {
  return (
    <Govde<{ liste: Isletme[]; etkin: string }>
      yukle={async () => ({ liste: await isletmeler(), etkin: await etkinIsletme() })}
      bos={<BosDurum baslik="İşletme yok" aciklama="Tanımlı işletme bulunmuyor." />}
    >
      {(veri, yenile) => (
        <>
          {veri.liste.map((i) => (
            <IsletmeKarti
              key={i.id}
              isletme={i}
              etkinMi={i.id === veri.etkin}
              yenile={yenile}
            />
          ))}

          <Etiket metin="İşletme ekleme ve düzenleme web panelinde" />
          <Yazi tur="kucuk" renkli={renk.metinSolgun} style={{ marginTop: aralik.m }}>
            İşletme kaydında kilit süresi, para birimi ve rapor e-postası gibi bütün
            sistemi etkileyen alanlar bulunuyor; bunlar web panelinden düzenlenir.
          </Yazi>
        </>
      )}
    </Govde>
  );
}

function IsletmeKarti({
  isletme, etkinMi, yenile,
}: { isletme: Isletme; etkinMi: boolean; yenile: () => void }) {
  const [isleniyor, setIsleniyor] = useState(false);
  const [hata, setHata] = useState('');

  async function sec() {
    setIsleniyor(true);
    setHata('');
    try {
      await aktifIsletmeSec(isletme.id);
      yenile();
    } catch (e) {
      // Sessiz başarısızlıkta kullanıcı salonu değiştirdiğini sanır ve
      // sonraki kaydı yanlış salona açar.
      setHata(e instanceof Error ? e.message : 'İşletme seçilemedi.');
    } finally {
      setIsleniyor(false);
    }
  }

  return (
    <Kart style={{ marginBottom: aralik.s }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <Yazi tur="altBaslik" renkli={renk.lacivert}>{isletme.ad}</Yazi>
          <Yazi tur="kucuk" renkli={renk.metinSolgun} style={{ marginTop: 2 }}>
            {isletme.kategori} · {isletme.kapasite} kişi
          </Yazi>
          <Yazi tur="minik" renkli={renk.metinSolgun} style={{ marginTop: 4 }}>
            {isletme.il}
            {isletme.ilce && isletme.ilce !== '-' ? ` / ${isletme.ilce}` : ''}
            {isletme.telefon ? ` · ${telefonBicim(isletme.telefon)}` : ''}
          </Yazi>
        </View>
        {etkinMi ? <Rozet metin="ETKİN" zemin="#e7f4ec" yaziRengi={renk.basari} /> : null}
      </View>

      {etkinMi ? null : (
        <Dugme
          metin="Bu işletmeye geç"
          ikincil
          tam
          disabled={isleniyor}
          style={{ marginTop: aralik.m }}
          onPress={() => { void sec(); }}
        />
      )}

      {hata ? (
        <Yazi tur="kucuk" renkli={renk.tehlike} style={{ marginTop: aralik.s }}>{hata}</Yazi>
      ) : null}
    </Kart>
  );
}
