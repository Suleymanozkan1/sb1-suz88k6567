import { useState } from 'react';
import { View } from 'react-native';
import { Alan, Band, BandOzet, Govde, Satir, Secim } from '../../src/bilesenler/duzen';
import { BolumBasligi, Dugme, Kart, Yazi } from '../../src/bilesenler/temel';
import { tarihUzun, tutar } from '../../src/bicim';
import { aralik, renk } from '../../src/tema';
import {
  celikKasaBakiyesi, celikKasaHareketiSil, celikKasaHareketleri, celikKasayaIsle,
  dogalYon, kasaEkle, kasaHareketleri, kasaOzeti, kasayaIslenebilir, kaynakNeti,
  tanitim, type KasaHareketi, type KasaOzet, type KasaSatiri, type KasaYonu,
} from '../../src/veri';

interface Kasa { ozet: KasaOzet; hareketler: KasaSatiri[]; kasa: KasaHareketi[] }

/**
 * Kasa: özet, hareketler ve hızlı gelir-gider girişi.
 *
 * Kayıt girişi mobile de alındı; telefonu eline alan kişi genelde parayı
 * alırken ya da verirken kaydediyor ve masaüstüne dönene kadar unutuyordu.
 * Kategori serbest metin değil, kısa bir listeden seçiliyor: serbest metin
 * "Personel", "personel", "Personel gideri" gibi üç ayrı kategori üretip
 * raporları bozuyordu.
 */
const KATEGORILER = ['Rezervasyon', 'Personel', 'Tedarikçi', 'Sabit gider', 'Diğer'];

export default function Kasa() {
  return (
    <Govde<Kasa>
      yukle={async () => ({
        ozet: await kasaOzeti(),
        hareketler: await kasaHareketleri(),
        kasa: await celikKasaHareketleri(),
      })}
      band={(veri) => (
        <Band ustluk="Kasa" baslik="Gelir ve gider">
          <BandOzet
            etiket="KASA BAKİYESİ"
            deger={veri ? tutar(veri.ozet.bakiye) : '-'}
          />
        </Band>
      )}
    >
      {({ ozet, hareketler, kasa }, yenile) => (
        <>
          <Kart style={{ marginBottom: aralik.m }}>
            <View style={{ flexDirection: 'row', gap: aralik.l }}>
              <Kalem etiket="TOPLAM GELİR" deger={tutar(ozet.gelir)} renkli={renk.basari} />
              <Kalem etiket="TOPLAM GİDER" deger={tutar(ozet.gider)} renkli={renk.tehlike} />
            </View>
          </Kart>

          <Satir
            baslik="Kalan alacak"
            alt="Rezervasyonlardan tahsil edilmemiş"
            deger={tutar(ozet.alacak)}
            degerRengi={renk.uyari}
            solRenk={renk.uyari}
          />

          <CelikKasaKarti hareketler={kasa} />

          <Giris yenile={yenile} />

          <BolumBasligi>Son hareketler</BolumBasligi>
          {hareketler.length === 0 ? (
            <Yazi tur="kucuk" renkli={renk.metinSolgun}>Henüz kasa hareketi bulunmuyor.</Yazi>
          ) : hareketler.map((h) => (
            <View key={h.id}>
              <Satir
                baslik={h.baslik}
                alt={`${h.kategori} · ${tarihUzun(h.tarih)}`}
                deger={`${h.tur === 'Gider' ? '−' : '+'}${tutar(h.tutar)}`}
                degerRengi={h.tur === 'Gider' ? renk.tehlike : renk.basari}
                solRenk={h.tur === 'Gider' ? renk.tehlike : renk.basari}
              />
              <KasaDugmeleri satir={h} hareketler={kasa} yenile={yenile} />
            </View>
          ))}

          <BolumBasligi>Çelik kasa hareketleri</BolumBasligi>
          {kasa.length === 0 ? (
            <Yazi tur="kucuk" renkli={renk.metinSolgun}>
              Henüz çelik kasa hareketi bulunmuyor.
            </Yazi>
          ) : kasa.map((h) => (
            <Satir
              key={h.id}
              baslik={h.aciklama || (h.yon === 'Giriş' ? 'Kasaya giren' : 'Kasadan çıkan')}
              alt={tarihUzun(h.tarih)}
              deger={`${h.yon === 'Çıkış' ? '−' : '+'}${tutar(h.tutar)}`}
              degerRengi={h.yon === 'Çıkış' ? renk.tehlike : renk.basari}
              solRenk={h.yon === 'Çıkış' ? renk.tehlike : renk.basari}
              onPress={() => { void sil(h, yenile); }}
            />
          ))}
          {kasa.length > 0 ? (
            <Yazi tur="minik" renkli={renk.metinSolgun} style={{ marginTop: aralik.s }}>
              Yanlış işlenen hareketi silmek için üzerine dokunun.
            </Yazi>
          ) : null}

          <Yazi tur="kucuk" renkli={renk.metinSolgun} style={{ marginTop: aralik.l }}>
            Raporların ayrıntısı ve CSV dışa aktarım web panelindedir.
          </Yazi>
        </>
      )}
    </Govde>
  );
}

/**
 * Yanlış işlenen hareketi defterden siler.
 *
 * Gelir/gider kaydına dokunulmaz: kasadaki para ile muhasebe kaydı iki ayrı
 * şeydir ve birini düzeltmek diğerini silmeyi gerektirmez.
 */
async function sil(hareket: KasaHareketi, yenile: () => void) {
  try {
    await celikKasaHareketiSil(hareket.id);
    yenile();
  } catch {
    // Hata Govde'nin yeniden yüklemesinde zaten yüzeye çıkıyor.
    yenile();
  }
}

/**
 * Çelik kasa kartı.
 *
 * Kasadaki gerçek para, gelir/gider bakiyesiyle aynı değildir: havaleyle
 * gelen tahsilat kasaya girmez, kasadan alınıp bankaya yatırılan para
 * kasadan çıkar ama gelir kaydı yerinde durur. İki bakiye bu yüzden yan
 * yana ama ayrı duruyor; hiçbir yerde toplanmıyor.
 */
function CelikKasaKarti({ hareketler }: { hareketler: KasaHareketi[] }) {
  const bakiye = celikKasaBakiyesi(hareketler);
  const giren = hareketler.filter((h) => h.yon === 'Giriş').reduce((t, h) => t + h.tutar, 0);
  const cikan = hareketler.filter((h) => h.yon === 'Çıkış').reduce((t, h) => t + h.tutar, 0);

  return (
    <Kart style={{ marginTop: aralik.m, borderColor: renk.vurgu, borderWidth: 2 }}>
      <Yazi tur="minik" renkli={renk.metinSolgun}>ÇELİK KASA</Yazi>
      <Yazi tur="tutar" renkli={renk.lacivert} style={{ marginTop: 2 }}>{tutar(bakiye)}</Yazi>
      <Yazi tur="minik" renkli={renk.metinSolgun} style={{ marginTop: 4 }}>
        {`Giren ${tutar(giren)} · Çıkan ${tutar(cikan)}`}
      </Yazi>
      <Yazi tur="minik" renkli={renk.metinSolgun} style={{ marginTop: aralik.s }}>
        Kasadaki gerçek para. Yukarıdaki kasa bakiyesinden ayrı tutulur.
      </Yazi>
      {tanitim ? (
        <Yazi tur="minik" renkli={renk.metinSolgun} style={{ marginTop: 4 }}>
          Tanıtım modunda kasa hareketi saklanmaz.
        </Yazi>
      ) : null}
    </Kart>
  );
}

/**
 * Bir gelir/gider satırının çelik kasa düğmeleri.
 *
 * Düğmelerin ne yazdığı satırın türüne göre değişiyor: gelir kasaya girer,
 * gider kasadan çıkar. Yönü kullanıcıya bırakmak, nakit ödenen bir maaşı
 * kasaya para giriyormuş gibi işlemeye izin verirdi.
 */
function KasaDugmeleri({
  satir, hareketler, yenile,
}: { satir: KasaSatiri; hareketler: KasaHareketi[]; yenile: () => void }) {
  const [hata, setHata] = useState('');
  const [calisiyor, setCalisiyor] = useState(false);

  const net = kaynakNeti(hareketler, satir.id);
  const dogal = dogalYon(satir.tur);
  const karsi: KasaYonu = dogal === 'Giriş' ? 'Çıkış' : 'Giriş';
  const gider = satir.tur === 'Gider';

  async function isle(yon: KasaYonu) {
    setHata('');
    setCalisiyor(true);
    try {
      await celikKasayaIsle(satir, yon, hareketler);
      yenile();
    } catch (e) {
      setHata(e instanceof Error ? e.message : 'Çelik kasaya işlenemedi.');
    } finally {
      setCalisiyor(false);
    }
  }

  return (
    <View style={{ marginTop: -aralik.s, marginBottom: aralik.s, paddingHorizontal: aralik.m }}>
      <View style={{ flexDirection: 'row', gap: aralik.s, alignItems: 'center' }}>
        <Dugme
          metin={gider ? 'Kasadan öde' : 'Kasaya ekle'}
          ikincil
          disabled={calisiyor || !kasayaIslenebilir(hareketler, satir.id, dogal, satir.tur)}
          onPress={() => { void isle(dogal); }}
        />
        <Dugme
          metin={gider ? 'Geri al' : 'Kasadan çıkar'}
          ikincil
          disabled={calisiyor || !kasayaIslenebilir(hareketler, satir.id, karsi, satir.tur)}
          onPress={() => { void isle(karsi); }}
        />
        {net !== 0 ? (
          <Yazi tur="minik" renkli={net < 0 ? renk.tehlike : renk.basari}>{tutar(net)}</Yazi>
        ) : null}
      </View>
      {hata ? (
        <Yazi tur="minik" renkli={renk.tehlike} style={{ marginTop: 4 }}>{hata}</Yazi>
      ) : null}
    </View>
  );
}

function Kalem({ etiket, deger, renkli }: { etiket: string; deger: string; renkli: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Yazi tur="minik" renkli={renk.metinSolgun}>{etiket}</Yazi>
      <Yazi tur="tutar" renkli={renkli} style={{ marginTop: 2 }}>{deger}</Yazi>
    </View>
  );
}

function Giris({ yenile }: { yenile: () => void }) {
  const [acik, setAcik] = useState(false);
  const [tur, setTur] = useState<'Gelir' | 'Gider'>('Gider');
  const [baslik, setBaslik] = useState('');
  const [kategori, setKategori] = useState('Tedarikçi');
  const [miktar, setMiktar] = useState('');
  const [hata, setHata] = useState('');
  const [kaydediliyor, setKaydediliyor] = useState(false);

  async function kaydet() {
    setHata('');
    if (!baslik.trim()) { setHata('Açıklama giriniz.'); return; }
    const kurus = Math.round(Number(miktar.replace(/\./g, '').replace(',', '.')) * 100);
    if (!Number.isFinite(kurus) || kurus <= 0) { setHata('Geçerli bir tutar giriniz.'); return; }

    setKaydediliyor(true);
    try {
      await kasaEkle(tur, baslik.trim(), kategori, kurus);
      setBaslik(''); setMiktar(''); setAcik(false);
      yenile();
    } catch (e) {
      setHata(e instanceof Error ? e.message : 'Kayıt eklenemedi.');
    } finally {
      setKaydediliyor(false);
    }
  }

  if (!acik) {
    return (
      <Dugme
        metin="Gelir / gider ekle"
        ikincil
        tam
        onPress={() => setAcik(true)}
        style={{ marginTop: aralik.l }}
      />
    );
  }

  return (
    <Kart style={{ marginTop: aralik.l }}>
      <Secim secenekler={['Gelir', 'Gider']} secili={tur} sec={(v) => setTur(v as 'Gelir' | 'Gider')} />
      <Alan etiket="Açıklama" deger={baslik} degistir={setBaslik} ipucu="Mutfak tedariki" />
      <View style={{ marginTop: aralik.m }}>
        <Yazi tur="minik" renkli={renk.metinSolgun}>KATEGORİ</Yazi>
        <Secim secenekler={KATEGORILER} secili={kategori} sec={setKategori} />
      </View>
      <Alan etiket="Tutar (₺)" deger={miktar} degistir={setMiktar} ipucu="18.500" klavye="decimal-pad" />

      {hata ? (
        <Yazi tur="kucuk" renkli={renk.tehlike} style={{ marginTop: aralik.s }}>{hata}</Yazi>
      ) : null}
      {tanitim ? (
        <Yazi tur="minik" renkli={renk.metinSolgun} style={{ marginTop: aralik.s }}>
          Tanıtım modunda kayıt saklanmaz.
        </Yazi>
      ) : null}

      <Dugme
        metin={kaydediliyor ? 'Kaydediliyor…' : 'Kaydet'}
        tam
        disabled={kaydediliyor}
        onPress={() => void kaydet()}
        style={{ marginTop: aralik.m }}
      />
      <Dugme metin="Vazgeç" ikincil tam onPress={() => setAcik(false)} style={{ marginTop: aralik.s }} />
    </Kart>
  );
}
