import { Linking, View } from 'react-native';
import { Etiket, Govde, Satir } from '../src/bilesenler/duzen';
import { BolumBasligi, BosDurum, Kart, Rozet, Yazi } from '../src/bilesenler/temel';
import { telefon, telefonUri, tutar } from '../src/bicim';
import { aralik, renk } from '../src/tema';
import { stokToplami, tedarikciler, type Tedarikci } from '../src/veri';

/**
 * Ürün ve Hizmet (eski adıyla Tedarikçiler).
 *
 * İki tür kalem aynı ekranda, panelde olduğu gibi:
 *   hizmet : orkestra, fotoğraf, çiçek, vale -- düğün içi gidere girer
 *   ürün   : su, kola, peçete -- stoğu takip edilir
 *
 * Ayrı ekranlar yapılsaydı aynı kalem iki yerden girilebilir, hangisinin
 * doğru olduğu belirsiz kalırdı.
 *
 * STOK ÖNCE: telefonu eline alan kişi depoya bakarken bu ekranı açıyor
 * ve sorduğu soru "neyimiz bitmek üzere". Kritik seviyenin altındaki
 * ürünler en üstte toplanıyor.
 *
 * Hizmet satırına dokunmak aramayı açıyor; listedeki ikinci sebep bu.
 */
export default function UrunHizmet() {
  return (
    <Govde<Tedarikci[]>
      yukle={tedarikciler}
      bos={<BosDurum baslik="Kayıt yok" aciklama="Henüz ürün ya da hizmet tanımlanmamış." />}
    >
      {(liste) => {
        const urunler = liste.filter((x) => x.tur === 'urun' && x.aktif);
        const hizmetler = liste.filter((x) => x.tur === 'hizmet' && x.aktif);
        const pasif = liste.filter((x) => !x.aktif);

        // Eşik sıfırsa takip edilmiyor demek; her ürünü kritik saymak
        // uyarıyı anlamsızlaştırırdı.
        const kritik = urunler.filter(
          (u) => u.kritikEsik > 0 && stokToplami(u) < u.kritikEsik,
        );

        return (
          <>
            {kritik.length > 0 ? (
              <>
                <BolumBasligi>Stok kritik</BolumBasligi>
                {kritik.map((u) => (
                  <Kart key={u.id} style={{ marginBottom: aralik.xs }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <View style={{ flex: 1 }}>
                        <Yazi tur="altBaslik" renkli={renk.tehlike}>{u.ad}</Yazi>
                        <Yazi tur="minik" renkli={renk.metinSolgun} style={{ marginTop: 2 }}>
                          {stokAciklama(u)}
                        </Yazi>
                      </View>
                      <Rozet
                        metin={`EN AZ ${u.kritikEsik}`}
                        zemin="#fdecea"
                        yaziRengi={renk.tehlike}
                      />
                    </View>
                  </Kart>
                ))}
              </>
            ) : null}

            {urunler.length > 0 ? (
              <>
                <BolumBasligi>Ürünler</BolumBasligi>
                {urunler.map((u) => (
                  <Satir
                    key={u.id}
                    baslik={u.ad}
                    alt={u.kategori}
                    ikinciAlt={stokAciklama(u)}
                    deger={`${stokToplami(u)}`}
                    degerRengi={
                      u.kritikEsik > 0 && stokToplami(u) < u.kritikEsik
                        ? renk.tehlike : renk.lacivert
                    }
                  />
                ))}
              </>
            ) : null}

            {hizmetler.length > 0 ? (
              <>
                <BolumBasligi>Hizmetler</BolumBasligi>
                {hizmetler.map((h) => (
                  <Satir
                    key={h.id}
                    baslik={h.ad}
                    alt={h.telefon ? `${h.kategori} · ${telefon(h.telefon)}` : h.kategori}
                    deger={h.birimFiyat > 0 ? tutar(h.birimFiyat) : undefined}
                    onPress={
                      h.telefon
                        ? () => void Linking.openURL(telefonUri(h.telefon))
                        : undefined
                    }
                  />
                ))}
              </>
            ) : null}

            {pasif.length > 0 ? (
              <>
                <BolumBasligi>Pasif</BolumBasligi>
                {pasif.map((x) => (
                  <Satir
                    key={x.id}
                    baslik={x.ad}
                    alt={x.telefon ? `${x.kategori} · ${telefon(x.telefon)}` : x.kategori}
                  />
                ))}
              </>
            ) : null}

            <Etiket metin="Hizmet satırına dokunmak arama açar" />
            <Yazi tur="kucuk" renkli={renk.metinSolgun} style={{ marginTop: aralik.m }}>
              Toplam adet saklanmaz, kolilerden hesaplanır: koli x koli içi + tek adet.
              Bir organizasyona atanmış kalem silinemez, pasife alınır; geçmiş
              kayıtların bilgisi böylece kaybolmaz. Tanım ve sayım web panelinden
              yapılır.
            </Yazi>
          </>
        );
      }}
    </Govde>
  );
}

/** "10 koli x 24 + 6 = 246 adet"; koli girilmemişse yalnızca adet. */
function stokAciklama(u: Tedarikci): string {
  const toplam = stokToplami(u);
  if (u.koli > 0 && u.koliIci > 0) {
    return `${u.koli} koli × ${u.koliIci}${u.tekAdet > 0 ? ` + ${u.tekAdet}` : ''} = ${toplam} adet`;
  }
  return `${toplam} adet`;
}
