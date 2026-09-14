import { View } from 'react-native';
import { Etiket, Govde, Satir } from '../src/bilesenler/duzen';
import { BolumBasligi, BosDurum, Kart, Rozet, Yazi } from '../src/bilesenler/temel';
import { bugunIso, tarihUzun } from '../src/bicim';
import { aralik, renk } from '../src/tema';
import { ozelGunler, type OzelGun } from '../src/veri';

/**
 * Takvimdeki özel günler.
 *
 * Panelle aynı iki kaynak var ve ayrım burada da korunuyor:
 *   • sağlayıcıdan gelen ortak günler (resmî tatil, bayram, arife,
 *     kandil, MEB okul takvimi) -- her ay yeniden yazılıyorlar
 *   • işletmenin kendi eklediği günler
 *
 * EKLEME VE SİLME YOK: ortak günler zaten düzenlenemiyor, işletmenin
 * günü ise takvimi doğrudan etkiliyor ve yanlış bir tarih rezervasyon
 * kararını bozuyor. Giriş panelde kalıyor.
 *
 * Geçmiş günler listelenmiyor: bu ekranda sorulan soru "bayram ne
 * zaman", cevabı geçen seneki bayram değil.
 */

/** `src/types/index.ts` içindeki OZEL_GUN_ADI ile aynı metinler. */
const TUR_ADI: Record<string, string> = {
  resmi_tatil: 'Resmî tatil',
  dini_bayram: 'Dini bayram',
  arife: 'Arife',
  kandil: 'Kandil',
  okul: 'Okul',
  ozel: 'Özel gün',
};

/** OZEL_GUN_RENGI ile aynı palet: panel ile mobil aynı günü aynı renkte gösterir. */
const TUR_RENGI: Record<string, string> = {
  resmi_tatil: '#b91c1c',
  dini_bayram: '#15803d',
  arife: '#a16207',
  kandil: '#5b21b6',
  okul: '#1d4ed8',
  ozel: '#475569',
};

const KAYNAK_ADI: Record<string, string> = {
  tohum: 'Sistem',
  saglayici: 'Otomatik',
  isletme: 'İşletme',
};

export default function OzelGunler() {
  const bugun = bugunIso();

  return (
    <Govde<OzelGun[]>
      yukle={() => ozelGunler()}
      bos={<BosDurum baslik="Özel gün yok" aciklama="Takvimde işaretlenmiş bir gün bulunmuyor." />}
    >
      {(liste) => {
        const yaklasan = liste
          .filter((g) => g.gun >= bugun)
          .sort((a, b) => a.gun.localeCompare(b.gun) || a.ad.localeCompare(b.ad, 'tr'));

        if (yaklasan.length === 0) {
          return (
            <BosDurum
              baslik="Yaklaşan özel gün yok"
              aciklama="Listedeki günlerin hepsi geçmişte kaldı. Geçmiş günler web panelinden görülebilir."
            />
          );
        }

        const kesinlesmeyen = yaklasan.filter((g) => g.kesinlesmedi).length;

        return (
          <>
            {yaklasan.map((g) => (
              <Satir
                key={g.id}
                baslik={g.ad}
                alt={tarihUzun(g.gun)}
                ikinciAlt={`${TUR_ADI[g.tur] ?? g.tur} · ${KAYNAK_ADI[g.kaynak] ?? 'İşletme'}`}
                solRenk={TUR_RENGI[g.tur] ?? renk.cizgi}
                deger={g.kesinlesmedi ? '~' : undefined}
                degerRengi={renk.uyari}
              />
            ))}

            {kesinlesmeyen > 0 ? (
              <Kart style={{ marginTop: aralik.m }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: aralik.s }}>
                  <Rozet metin="~" zemin="#fdf3e3" yaziRengi={renk.uyari} />
                  <Yazi tur="altBaslik" renkli={renk.lacivert} style={{ flex: 1 }}>
                    {kesinlesmeyen} günün tarihi kesinleşmedi
                  </Yazi>
                </View>
                <Yazi tur="kucuk" renkli={renk.metinSolgun} style={{ marginTop: aralik.s }}>
                  Uzak yılların dini bayramları ve hesaplanan kandiller için sağlayıcı
                  kesin konuşmuyor. Bu günlere göre rezervasyon kapatmadan önce tarihi
                  doğrulayın.
                </Yazi>
              </Kart>
            ) : null}

            <BolumBasligi>Kaynaklar</BolumBasligi>
            <Etiket metin="Ortak günler sunucudan otomatik çekilir" />
            <Yazi tur="kucuk" renkli={renk.metinSolgun} style={{ marginTop: aralik.m }}>
              Resmî tatiller, dini bayramlar, arifeler, kandiller ve MEB okul takvimi
              her ay yeniden çekilir; panelden de düzenlenemezler. İşletmenin kendi
              özel günleri web panelinden eklenir.
            </Yazi>
          </>
        );
      }}
    </Govde>
  );
}
