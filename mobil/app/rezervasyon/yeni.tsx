import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Alan, Secim } from '../../src/bilesenler/duzen';
import { BolumBasligi, Dugme, Kart, Yazi } from '../../src/bilesenler/temel';
import { bugunIso, tutar } from '../../src/bicim';
import { aralik, renk } from '../../src/tema';
import {
  menuler, rezervasyonEkle, salonlar, tanitim, ULASIM_KANALLARI,
  type Menu, type Salon, type UlasimKanali,
} from '../../src/veri';

const TURLER = ['Düğün', 'Nişan', 'Kına', 'Sünnet', 'Nikâh', 'Kokteyl'];
const SEANSLAR = ['Gündüz', 'Gece'];
const DURUMLAR = ['Ön Rezervasyon', 'Kesin Rezervasyon'];

/**
 * Yeni rezervasyon.
 *
 * Panelde bu form tek ekranda ve geniş; telefonda bölümlere ayrıldı ve
 * yalnızca zorunlu alanlar soruldu. İkinci kişi adı, e-posta, adres ve
 * hizmet listesi gibi alanlar web panelinde kalıyor: telefonda uzun form
 * yarıda bırakılıyor ve eksik kayıt üretiyordu.
 *
 * Kapora tutarı toplam tutarı aşamaz; kural veritabanında da tanımlı, ama
 * kullanıcı hatayı kaydetmeden önce görsün diye burada da denetleniyor.
 */
export default function YeniRezervasyon() {
  const yonlendir = useRouter();
  const [salonListe, setSalonListe] = useState<Salon[]>([]);
  const [menuListe, setMenuListe] = useState<Menu[]>([]);

  const [musteri, setMusteri] = useState('');
  const [telefon, setTelefon] = useState('');
  const [tarih, setTarih] = useState(bugunIso());
  const [seans, setSeans] = useState('Gece');
  const [tur, setTur] = useState('Düğün');
  const [salon, setSalon] = useState('');
  const [menu, setMenu] = useState('');
  const [davetli, setDavetli] = useState('');
  const [toplam, setToplam] = useState('');
  const [kapora, setKapora] = useState('');
  const [durum, setDurum] = useState('Ön Rezervasyon');
  // Ulaşım kanalı: yıl sonu kanal raporunun kaynağı. Kayıt açılırken
  // sorulmazsa sonradan kimse hatırlamıyor.
  const [kanal, setKanal] = useState<UlasimKanali | ''>('');
  const [kanalDetay, setKanalDetay] = useState('');

  const [hata, setHata] = useState('');
  const [kaydediliyor, setKaydediliyor] = useState(false);

  useEffect(() => {
    void salonlar().then((l) => {
      setSalonListe(l.filter((x) => x.aktif));
      setSalon((o) => o || (l.find((x) => x.aktif)?.ad ?? ''));
    });
    void menuler().then((l) => setMenuListe(l.filter((x) => x.aktif)));
  }, []);

  /**
   * Menü seçilince tutar önerilir, dayatılmaz: pazarlık sonucu tutar
   * neredeyse her zaman listeden farklı oluyor.
   */
  function menuSec(ad: string) {
    setMenu(ad);
    const m = menuListe.find((x) => x.ad === ad);
    const kisi = Number(davetli);
    if (!m) return;
    const oneri = m.fiyatTuru === 'sabit' ? m.fiyat : m.fiyat * (Number.isFinite(kisi) ? kisi : 0);
    if (oneri > 0) setToplam(String(oneri / 100));
  }

  function sayi(metin: string): number {
    return Number(metin.replace(/\./g, '').replace(',', '.'));
  }

  async function kaydet() {
    setHata('');
    if (!musteri.trim()) { setHata('Müşteri adı giriniz.'); return; }
    const tel = telefon.replace(/\D/g, '').replace(/^90/, '').replace(/^0/, '');
    if (!/^5\d{9}$/.test(tel)) { setHata('Geçerli bir cep telefonu giriniz (5XX XXX XX XX).'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tarih)) { setHata('Tarihi YYYY-AA-GG biçiminde giriniz.'); return; }
    const kisi = Number(davetli);
    if (!Number.isFinite(kisi) || kisi <= 0) { setHata('Davetli sayısı giriniz.'); return; }
    const tutarKurus = Math.round(sayi(toplam) * 100);
    if (!Number.isFinite(tutarKurus) || tutarKurus <= 0) { setHata('Geçerli bir toplam tutar giriniz.'); return; }
    const kaporaKurus = kapora.trim() ? Math.round(sayi(kapora) * 100) : 0;
    if (!Number.isFinite(kaporaKurus) || kaporaKurus < 0) { setHata('Geçerli bir kapora giriniz.'); return; }
    if (kaporaKurus > tutarKurus) { setHata('Kapora toplam tutarı aşamaz.'); return; }
    // "Diğer 23 kayıt" satırını raporda görüp içine bakamamak, alanı hiç
    // tutmamakla aynı kapıya çıkar.
    if (kanal === 'Diğer' && !kanalDetay.trim()) {
      setHata('Diğer seçildiğinde nereden ulaştığını yazınız.'); return;
    }

    setKaydediliyor(true);
    try {
      const id = await rezervasyonEkle({
        musteri: musteri.trim(), telefon: tel, tarih, seans, tur,
        salon, davetli: kisi, toplam: tutarKurus, kapora: kaporaKurus, durum,
        kanal, kanalDetay,
      });
      yonlendir.replace(id ? `/rezervasyon/${id}` : '/kayitlar');
    } catch (e) {
      setHata(e instanceof Error ? e.message : 'Kayıt oluşturulamadı.');
    } finally {
      setKaydediliyor(false);
    }
  }

  const kalan = Math.round(sayi(toplam) * 100) - (kapora.trim() ? Math.round(sayi(kapora) * 100) : 0);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: renk.zemin }}
      contentContainerStyle={{ padding: aralik.l, paddingBottom: aralik.xxl * 2 }}
      keyboardShouldPersistTaps="handled"
    >
      <BolumBasligi>Müşteri</BolumBasligi>
      <Kart>
        <Alan etiket="Ad soyad" deger={musteri} degistir={setMusteri} ipucu="Zeynep & Can Arslan" />
        <Alan etiket="Cep telefonu" deger={telefon} degistir={setTelefon} ipucu="5XX XXX XX XX" klavye="phone-pad" />
      </Kart>

      <BolumBasligi>Organizasyon</BolumBasligi>
      <Kart>
        <Alan etiket="Tarih (YYYY-AA-GG)" deger={tarih} degistir={setTarih} ipucu="2027-06-12" />

        <View style={{ marginTop: aralik.m }}>
          <Yazi tur="minik" renkli={renk.metinSolgun}>SEANS</Yazi>
          <Secim secenekler={SEANSLAR} secili={seans} sec={setSeans} />
        </View>

        <View style={{ marginTop: aralik.m }}>
          <Yazi tur="minik" renkli={renk.metinSolgun}>TÜR</Yazi>
          <Secim secenekler={TURLER} secili={tur} sec={setTur} />
        </View>

        {salonListe.length > 0 ? (
          <View style={{ marginTop: aralik.m }}>
            <Yazi tur="minik" renkli={renk.metinSolgun}>SALON</Yazi>
            <Secim secenekler={salonListe.map((x) => x.ad)} secili={salon} sec={setSalon} />
          </View>
        ) : null}

        <Alan etiket="Davetli sayısı" deger={davetli} degistir={setDavetli} ipucu="300" klavye="number-pad" />

        <View style={{ marginTop: aralik.m }}>
          <Yazi tur="minik" renkli={renk.metinSolgun}>BİZE NEREDEN ULAŞTI</Yazi>
          <Secim
            secenekler={['-', ...ULASIM_KANALLARI]}
            secili={kanal || '-'}
            sec={(v) => setKanal(v === '-' ? '' : (v as UlasimKanali))}
          />
        </View>
        {kanal === 'Referans' || kanal === 'Diğer' ? (
          <Alan
            etiket={kanal === 'Referans' ? 'Tavsiye eden (varsa)' : 'Kanal açıklaması'}
            deger={kanalDetay}
            degistir={setKanalDetay}
            ipucu={kanal === 'Referans' ? 'Ayşe Yılmaz' : 'Tabela, fuar, tanıdık esnaf...'}
          />
        ) : null}
      </Kart>

      <BolumBasligi>Tutar</BolumBasligi>
      <Kart>
        {menuListe.length > 0 ? (
          <View>
            <Yazi tur="minik" renkli={renk.metinSolgun}>MENÜ (tutar önerilir)</Yazi>
            <Secim secenekler={menuListe.map((x) => x.ad)} secili={menu} sec={menuSec} />
          </View>
        ) : null}

        <Alan etiket="Toplam tutar (₺)" deger={toplam} degistir={setToplam} ipucu="210.000" klavye="decimal-pad" />
        <Alan etiket="Kapora (₺)" deger={kapora} degistir={setKapora} ipucu="60.000" klavye="decimal-pad" />

        {Number.isFinite(kalan) && kalan > 0 ? (
          <Yazi tur="kucuk" renkli={renk.metinSolgun} style={{ marginTop: aralik.m }}>
            Kapora sonrası kalan: {tutar(kalan)}
          </Yazi>
        ) : null}

        <View style={{ marginTop: aralik.m }}>
          <Yazi tur="minik" renkli={renk.metinSolgun}>DURUM</Yazi>
          <Secim secenekler={DURUMLAR} secili={durum} sec={setDurum} />
        </View>
      </Kart>

      {hata ? (
        <Yazi tur="kucuk" renkli={renk.tehlike} style={{ marginTop: aralik.m }}>{hata}</Yazi>
      ) : null}
      {tanitim ? (
        <Yazi tur="minik" renkli={renk.metinSolgun} style={{ marginTop: aralik.m }}>
          Tanıtım modunda kayıt saklanmaz.
        </Yazi>
      ) : null}

      <Dugme
        metin={kaydediliyor ? 'Kaydediliyor…' : 'Rezervasyonu kaydet'}
        tam
        disabled={kaydediliyor}
        onPress={() => void kaydet()}
        style={{ marginTop: aralik.xl }}
      />

      <Yazi tur="minik" renkli={renk.metinSolgun} style={{ marginTop: aralik.m, textAlign: 'center' }}>
        Dolu bir salon-gün-seans birleşimine ikinci kayıt açılamaz; kural
        veritabanında uygulanır.
      </Yazi>
    </ScrollView>
  );
}
