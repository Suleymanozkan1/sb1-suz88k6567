import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Alan, Secim } from '../../src/bilesenler/duzen';
import { BolumBasligi, Dugme, Kart, Yazi } from '../../src/bilesenler/temel';
import { bugunIso, tutar } from '../../src/bicim';
import { aralik, renk } from '../../src/tema';
import { fiyatHesapla } from '../../src/fiyat';
import {
  menuler, rezervasyonEkle, salonlar, tanitim, tarafEtiketleri, ULASIM_KANALLARI,
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
  const [damat, setDamat] = useState('');
  const [damatTelefon, setDamatTelefon] = useState('');
  const [damatMemleket, setDamatMemleket] = useState('');
  const [gelin, setGelin] = useState('');
  const [gelinTelefon, setGelinTelefon] = useState('');
  const [gelinMemleket, setGelinMemleket] = useState('');
  const [sozlesmeTarihi, setSozlesmeTarihi] = useState('');
  const [evTelefonu, setEvTelefonu] = useState('');
  const [kisiBasiFiyat, setKisiBasiFiyat] = useState('');
  const [iskonto, setIskonto] = useState('');
  const [iskontoYuzdeMi, setIskontoYuzdeMi] = useState(false);
  const [kdvOrani, setKdvOrani] = useState('0');
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

  // Tür değiştiğinde alan başlıkları da değişiyor.
  const etiket = tarafEtiketleri(tur);

  // Panelle AYNI hesap fonksiyonu kullanılsaydı iyi olurdu ama mobil
  // ayrı bir paket; formül burada tekrarlanmıyor, kuruş cinsinden
  // çalışan küçük bir sarmalayıcı `fiyatHesapla`yı çağırıyor.
  const hesap = fiyatHesapla({
    kisiBasi: sayi(kisiBasiFiyat) || 0,
    davetli: Number(davetli) || 0,
    ekler: 0,
    iskonto: sayi(iskonto) || 0,
    yuzdeMi: iskontoYuzdeMi,
    kdvOrani: Number(kdvOrani) || 0,
  });

  function sayi(metin: string): number {
    return Number(metin.replace(/\./g, '').replace(',', '.'));
  }

  async function kaydet() {
    setHata('');
    if (!musteri.trim()) { setHata('Müşteri adı giriniz.'); return; }
    const tel = telefon.replace(/\D/g, '').replace(/^90/, '').replace(/^0/, '');
    if (!/^5\d{9}$/.test(tel)) { setHata('Geçerli bir cep telefonu giriniz (5XX XXX XX XX).'); return; }
    /*
      İKİNCİ TELEFON DA DOĞRULANIYOR. Alan isteğe bağlı ama BOŞ
      DEĞİLSE numara olmalı: `bride_phone` sütununda kısıt yok, yani
      "123" olduğu gibi kaydediliyordu. Sonradan o numaraya hatırlatma
      göndermeye çalışıldığında sessizce düşerdi.
    */
    const damatTel = damatTelefon.replace(/\D/g, '').replace(/^90/, '').replace(/^0/, '');
    if (damatTelefon.trim() && !/^5\d{9}$/.test(damatTel)) {
      setHata(`${etiket.birinci} cep telefonu geçersiz (5XX XXX XX XX).`); return;
    }
    const gelinTel = gelinTelefon.replace(/\D/g, '').replace(/^90/, '').replace(/^0/, '');
    if (gelinTelefon.trim() && !/^5\d{9}$/.test(gelinTel)) {
      setHata(`${etiket.ikinci} cep telefonu geçersiz (5XX XXX XX XX).`); return;
    }
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
        damat, damatTelefon: damatTel, damatMemleket,
        gelin, gelinTelefon: gelinTel, gelinMemleket,
        sozlesmeTarihi: sozlesmeTarihi || undefined,
        evTelefonu: evTelefonu || undefined,
        kisiBasiFiyat: kisiBasiFiyat.trim() ? Math.round(sayi(kisiBasiFiyat) * 100) : undefined,
        iskonto: iskonto.trim() ? Math.round(sayi(iskonto) * 100) : undefined,
        iskontoYuzdeMi,
        kdvOrani: Number(kdvOrani) || 0,
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
        {/*
          TARAF ETİKETLERİ TÜRE GÖRE, PANELLE AYNI KURAL. Düğün, nişan,
          kına ve nikâhta "Damat / Gelin"; toplantı ya da konferansta
          "Müşteri / İkinci kişi". Sabit "Damat" olsaydı bir toplantı
          kaydı girerken kullanıcı müşterisini damat diye kaydederdi.
        */}
        {/*
          ÜÇ AYRI KİŞİ, PANELLE AYNI MODEL. Sözleşmeyi imzalayan çoğu
          zaman damat ya da gelin değil: gelinin babası, bir şirket
          yetkilisi. İmzalayanın adı damadın yerine yazılırsa damadın
          adı kayda hiç girmiyor ve bu sonradan telafi edilemiyor.
        */}
        <Alan etiket="Sözleşme tarihi (YYYY-AA-GG)" deger={sozlesmeTarihi} degistir={setSozlesmeTarihi} ipucu="2026-09-16" />
        <Alan etiket="Ad soyad (sözleşmeyi imzalayan)" deger={musteri} degistir={setMusteri} ipucu="Ahmet Arslan" />
        <Alan etiket="Ev telefonu" deger={evTelefonu} degistir={setEvTelefonu} ipucu="312 333 44 55" klavye="phone-pad" />
        <Alan etiket="Cep telefonu" deger={telefon} degistir={setTelefon} ipucu="5XX XXX XX XX" klavye="phone-pad" />
        <Alan etiket={`${etiket.birinci} ad soyad`} deger={damat} degistir={setDamat} ipucu="Can Arslan" />
        <Alan etiket={`${etiket.birinci} cep`} deger={damatTelefon} degistir={setDamatTelefon} ipucu="5XX XXX XX XX" klavye="phone-pad" />
        <Alan etiket={`${etiket.ikinci} ad soyad`} deger={gelin} degistir={setGelin} ipucu="Zeynep Arslan" />
        <Alan etiket={`${etiket.ikinci} cep`} deger={gelinTelefon} degistir={setGelinTelefon} ipucu="5XX XXX XX XX" klavye="phone-pad" />
        {/*
          Memleket, yaşanan ilden AYRI tutuluyor: İstanbul'da oturan bir
          Sivaslı için ikisi farklıdır. Salon karşılamayı, ikramı ve
          müziği buna göre planlıyor.
        */}
        <Alan etiket={`${etiket.birinci} memleketi`} deger={damatMemleket} degistir={setDamatMemleket} ipucu="Sivas" />
        <Alan etiket={`${etiket.ikinci} memleketi`} deger={gelinMemleket} degistir={setGelinMemleket} ipucu="Konya" />
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
        <Alan etiket="Kişi başı fiyat (₺)" deger={kisiBasiFiyat} degistir={setKisiBasiFiyat} ipucu="1.000" klavye="decimal-pad" />
        <Alan etiket="İskonto" deger={iskonto} degistir={setIskonto} ipucu="0" klavye="decimal-pad" />

        <View style={{ marginTop: aralik.m }}>
          <Yazi tur="minik" renkli={renk.metinSolgun}>İSKONTO TÜRÜ</Yazi>
          <Secim
            secenekler={['Tutar', 'Yüzde']}
            secili={iskontoYuzdeMi ? 'Yüzde' : 'Tutar'}
            sec={(d) => setIskontoYuzdeMi(d === 'Yüzde')}
          />
        </View>

        <View style={{ marginTop: aralik.m }}>
          <Yazi tur="minik" renkli={renk.metinSolgun}>KDV ORANI</Yazi>
          <Secim
            secenekler={['0', '1', '10', '20']}
            secili={kdvOrani}
            sec={setKdvOrani}
          />
        </View>

        {/*
          HESAP EKRANDA, KAYITTA DEĞİL. Panelle aynı kural: kişibaşı
          toplam ve KDV tutarı saklanmıyor, her açılışta hesaplanıyor.
          Toplam tutar elle giriliyor -- pazarlık sonucu tutar
          neredeyse her zaman hesaptan farklı oluyor.
        */}
        <View style={{ marginTop: aralik.m }}>
          <Yazi tur="kucuk" renkli={renk.metinSolgun}>
            Hesaplanan: {tutar(hesap.kisiBasiToplam)} · iskonto {tutar(hesap.iskontoTutari)}
            {' '}· KDV {tutar(hesap.kdvTutari)} · genel toplam {tutar(hesap.genelToplam)}
          </Yazi>
        </View>

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
