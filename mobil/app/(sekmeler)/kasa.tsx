import { useState } from 'react';
import { View } from 'react-native';
import { Alan, Band, BandOzet, Govde, Satir, Secim } from '../../src/bilesenler/duzen';
import { BolumBasligi, Dugme, Kart, Yazi } from '../../src/bilesenler/temel';
import { tarihUzun, tutar } from '../../src/bicim';
import { aralik, renk } from '../../src/tema';
import { kasaEkle, kasaHareketleri, kasaOzeti, tanitim, type KasaOzet, type KasaSatiri } from '../../src/veri';

interface Kasa { ozet: KasaOzet; hareketler: KasaSatiri[] }

/**
 * Kasa: özet, hareketler ve hızlı gelir–gider girişi.
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
      yukle={async () => ({ ozet: await kasaOzeti(), hareketler: await kasaHareketleri() })}
      band={(veri) => (
        <Band ustluk="Kasa" baslik="Gelir ve gider">
          <BandOzet
            etiket="KASA BAKİYESİ"
            deger={veri ? tutar(veri.ozet.bakiye) : '—'}
          />
        </Band>
      )}
    >
      {({ ozet, hareketler }, yenile) => (
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

          <Giris yenile={yenile} />

          <BolumBasligi>Son hareketler</BolumBasligi>
          {hareketler.length === 0 ? (
            <Yazi tur="kucuk" renkli={renk.metinSolgun}>Henüz kasa hareketi bulunmuyor.</Yazi>
          ) : hareketler.map((h) => (
            <Satir
              key={h.id}
              baslik={h.baslik}
              alt={`${h.kategori} · ${tarihUzun(h.tarih)}`}
              deger={`${h.tur === 'Gider' ? '−' : '+'}${tutar(h.tutar)}`}
              degerRengi={h.tur === 'Gider' ? renk.tehlike : renk.basari}
              solRenk={h.tur === 'Gider' ? renk.tehlike : renk.basari}
            />
          ))}

          <Yazi tur="kucuk" renkli={renk.metinSolgun} style={{ marginTop: aralik.l }}>
            Raporların ayrıntısı ve CSV dışa aktarım web panelindedir.
          </Yazi>
        </>
      )}
    </Govde>
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
