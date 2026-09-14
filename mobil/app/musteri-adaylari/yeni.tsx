import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Alan, Secim } from '../../src/bilesenler/duzen';
import { BolumBasligi, Dugme, Kart, Yazi } from '../../src/bilesenler/temel';
import { aralik, renk } from '../../src/tema';
import { adayDurumlari, adayEkle, tanitim, type AdayDurumu } from '../../src/veri';

/**
 * Yeni müşteri adayı.
 *
 * Telefon başında konuşurken açılan form; kısa olmak zorunda. Panelde
 * on dört alan var (e-posta, sorumlu personel, düşünülen salon, teklif
 * tutarı, opsiyon tarihi, geçerlilik...). Burada ALTI alan soruluyor:
 * bunlar konuşmanın ilk otuz saniyesinde öğrenilen şeyler. Gerisi kart
 * ekranından ve panelden dolduruluyor.
 *
 * TARİH İKİ ALAN. Müşteri çoğu zaman gün söylemiyor: "mayısın ilk
 * haftası". Uydurma bir gün yazmak salonun o tarihte dolu sanılmasına yol
 * açardı; ifade olduğu gibi saklanıyor.
 *
 * Başlangıç durumu KODA GÖMÜLÜ DEĞİL: işletmenin `is_initial` işaretli
 * durumu kullanılıyor. Sabit bir "yeni" kodu, durumlarını yeniden
 * adlandıran bir salonda kaydı hiç açtırmazdı.
 */
const KAYNAKLAR = [
  'Instagram', 'Facebook', 'WhatsApp', 'Web Sitesi',
  'Google', 'Tavsiye', 'Telefon', 'Diğer',
];

export default function YeniAday() {
  const yonlendir = useRouter();
  const [durumlar, setDurumlar] = useState<AdayDurumu[]>([]);

  const [ad, setAd] = useState('');
  const [telefon, setTelefon] = useState('');
  const [kaynak, setKaynak] = useState('Instagram');
  const [tarih, setTarih] = useState('');
  const [tarihMetni, setTarihMetni] = useState('');
  const [kisi, setKisi] = useState('');
  const [talep, setTalep] = useState('');

  const [hata, setHata] = useState('');
  const [kaydediliyor, setKaydediliyor] = useState(false);

  useEffect(() => { void adayDurumlari().then(setDurumlar); }, []);

  const baslangic = durumlar.find((d) => d.baslangic) ?? durumlar[0];

  async function kaydet() {
    setHata('');
    if (!ad.trim() && !telefon.trim()) {
      setHata('En az ad ya da telefon giriniz.'); return;
    }
    const tel = telefon.replace(/\D/g, '').replace(/^90/, '').replace(/^0/, '');
    if (telefon.trim() && !/^5\d{9}$/.test(tel)) {
      setHata('Geçerli bir cep telefonu giriniz (5XX XXX XX XX).'); return;
    }
    if (tarih.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(tarih)) {
      setHata('Tarihi YYYY-AA-GG biçiminde giriniz ya da boş bırakıp ifadeyi yazınız.');
      return;
    }
    const sayi = kisi.trim() ? Number(kisi) : null;
    if (sayi !== null && (!Number.isFinite(sayi) || sayi <= 0)) {
      setHata('Kişi sayısı giriniz.'); return;
    }
    if (!baslangic) {
      // Durum listesi boşsa kayıt yabancı anahtar hatasıyla düşerdi;
      // anlaşılır bir hata vermek daha doğru.
      setHata('Aday durumları okunamadı, kayıt açılamıyor.'); return;
    }

    setKaydediliyor(true);
    try {
      const id = await adayEkle({
        ad: ad.trim(), telefon: tel, durum: baslangic.kod, kaynak,
        tarih: tarih.trim(), tarihMetni: tarihMetni.trim(), kisi: sayi,
        talep: talep.trim(),
      });
      yonlendir.replace(id ? `/musteri-adaylari/${id}` : '/musteri-adaylari');
    } catch (e) {
      setHata(e instanceof Error ? e.message : 'Aday kaydedilemedi.');
    } finally {
      setKaydediliyor(false);
    }
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: renk.zemin }}
      contentContainerStyle={{ padding: aralik.l, paddingBottom: aralik.xxl * 2 }}
      keyboardShouldPersistTaps="handled"
    >
      <BolumBasligi>Kişi</BolumBasligi>
      <Kart>
        <Alan etiket="Ad soyad" deger={ad} degistir={setAd} ipucu="Sena & Barış" />
        <Alan
          etiket="Cep telefonu"
          deger={telefon}
          degistir={setTelefon}
          ipucu="5XX XXX XX XX"
          klavye="phone-pad"
        />
        <View style={{ marginTop: aralik.m }}>
          <Yazi tur="minik" renkli={renk.metinSolgun}>NEREDEN ULAŞTI</Yazi>
          <Secim secenekler={KAYNAKLAR} secili={kaynak} sec={setKaynak} />
        </View>
      </Kart>

      <BolumBasligi>Talep</BolumBasligi>
      <Kart>
        <Alan
          etiket="Tarih (YYYY-AA-GG)"
          deger={tarih}
          degistir={setTarih}
          ipucu="2027-06-12"
        />
        <Alan
          etiket="Gün belli değilse ifade"
          deger={tarihMetni}
          degistir={setTarihMetni}
          ipucu="Mayısın ilk haftası"
        />
        <Alan etiket="Kişi sayısı" deger={kisi} degistir={setKisi} ipucu="300" klavye="number-pad" />
        <Alan
          etiket="Ne sordu"
          deger={talep}
          degistir={setTalep}
          ipucu="300 kişilik düğün için fiyat"
          cokSatir
        />
      </Kart>

      {baslangic ? (
        <Yazi tur="kucuk" renkli={renk.metinSolgun} style={{ marginTop: aralik.m }}>
          Kayıt "{baslangic.ad}" durumunda açılır. Teklif tutarı, sorumlu personel
          ve opsiyon tarihi kart ekranından ve web panelinden girilir.
        </Yazi>
      ) : null}

      {hata ? (
        <Yazi tur="kucuk" renkli={renk.tehlike} style={{ marginTop: aralik.m }}>{hata}</Yazi>
      ) : null}

      {tanitim ? (
        <Yazi tur="kucuk" renkli={renk.uyari} style={{ marginTop: aralik.m }}>
          Tanıtım modu: kayıt sunucuya yazılmaz.
        </Yazi>
      ) : null}

      <Dugme
        metin={kaydediliyor ? 'Kaydediliyor...' : 'Adayı kaydet'}
        tam
        disabled={kaydediliyor}
        style={{ marginTop: aralik.l }}
        onPress={() => { void kaydet(); }}
      />
    </ScrollView>
  );
}
