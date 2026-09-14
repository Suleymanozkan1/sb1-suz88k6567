import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Etiket, Secim } from '../../src/bilesenler/duzen';
import { BolumBasligi, Dugme, Kart, Yazi } from '../../src/bilesenler/temel';
import {
  bugunIso, tarihSayisal, tarihUzun, telefon as telefonBicim, telefonUri, tutar,
} from '../../src/bicim';
import { aralik, renk } from '../../src/tema';
import {
  aday, adayDurumlari, adayDurumYaz, type Aday, type AdayDurumu,
} from '../../src/veri';

/**
 * Müşteri adayı kartı.
 *
 * Personel bu ekranı müşteriyi ararken açıyor, o yüzden iki şey öne
 * çıkıyor: ARAMA düğmesi ve DURUM DEĞİŞTİRME. Görüşme bittiğinde tek
 * dokunuşla "teklif verildi" işaretlenebilmeli; panele dönüp yapılan bir
 * işaretleme hiç yapılmıyor ve liste gerçeği anlatmaz hâle geliyor.
 *
 * Durum değişince `last_contact_at` da yazılıyor (veri katmanında):
 * ayrı bırakılsaydı "bugün arananlar" süzgeci yapılan aramayı görmezdi.
 *
 * Teklif tutarı, sorumlu personel ve opsiyon tarihi burada OKUNUYOR ama
 * düzenlenmiyor: bunlar pazarlık sonucu yazılan alanlar ve telefonda
 * yanlış girilen bir rakam müşteriye söylenen fiyatla çelişiyor.
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

export default function AdayKarti() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [kayit, setKayit] = useState<Aday | null>(null);
  const [durumlar, setDurumlar] = useState<AdayDurumu[]>([]);
  const [hata, setHata] = useState('');
  const [yaziliyor, setYaziliyor] = useState(false);

  const getir = useCallback(async () => {
    try {
      setHata('');
      const [k, d] = await Promise.all([aday(String(id)), adayDurumlari()]);
      setKayit(k);
      setDurumlar(d);
    } catch (e) {
      setHata(e instanceof Error ? e.message : 'Aday okunamadı.');
    }
  }, [id]);

  useEffect(() => { void getir(); }, [getir]);

  async function durumSec(ad: string) {
    const hedef = durumlar.find((d) => d.ad === ad);
    if (!hedef || !kayit || hedef.kod === kayit.durum) return;
    setYaziliyor(true);
    try {
      await adayDurumYaz(kayit.id, hedef.kod);
      await getir();
    } catch (e) {
      // Sessiz başarısızlıkta personel kaydı işaretlediğini sanır.
      setHata(e instanceof Error ? e.message : 'Durum değiştirilemedi.');
    } finally {
      setYaziliyor(false);
    }
  }

  if (hata && !kayit) {
    return (
      <View style={{ flex: 1, backgroundColor: renk.zemin, padding: aralik.l }}>
        <Yazi tur="kucuk" renkli={renk.tehlike}>{hata}</Yazi>
        <Dugme metin="Yeniden dene" ikincil tam style={{ marginTop: aralik.m }}
          onPress={() => { void getir(); }} />
      </View>
    );
  }

  if (!kayit) {
    return (
      <View style={{ flex: 1, backgroundColor: renk.zemin, justifyContent: 'center' }}>
        <ActivityIndicator color={renk.vurguKoyu} />
      </View>
    );
  }

  const durum = durumlar.find((d) => d.kod === kayit.durum);
  /*
    Pasife alınmış durumlar listeden düşer AMA adayın o an taşıdığı durum,
    pasif olsa bile kalır: yoksa personel kendi kaydının durumunu göremez
    ve ilk dokunuşta sessizce başka bir duruma atlar.
  */
  const secilebilir = durumlar.filter((d) => d.etkin || d.kod === kayit.durum);
  const gecikti = kayit.takip !== '' && kayit.takip < bugunIso() && !(durum?.kapali ?? false);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: renk.zemin }}
      contentContainerStyle={{ padding: aralik.l, paddingBottom: aralik.xxl }}
    >
      <Kart>
        <Yazi tur="altBaslik" renkli={renk.lacivert}>
          {kayit.ad || telefonBicim(kayit.telefon)}
        </Yazi>
        <Yazi tur="kucuk" renkli={renk.metinSolgun} style={{ marginTop: 2 }}>
          {kayit.kaynak}
          {kayit.telefon ? ` · ${telefonBicim(kayit.telefon)}` : ''}
        </Yazi>

        {kayit.telefon ? (
          <Dugme
            metin="Ara"
            tam
            style={{ marginTop: aralik.m }}
            onPress={() => void Linking.openURL(telefonUri(kayit.telefon))}
          />
        ) : null}
      </Kart>

      <BolumBasligi>Durum</BolumBasligi>
      <Kart>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: aralik.s }}>
          <View style={{
            width: 10, height: 10, borderRadius: 5,
            backgroundColor: TON_RENGI[durum?.ton ?? 'notr'],
          }} />
          <Yazi tur="altBaslik" renkli={renk.lacivert} style={{ flex: 1 }}>
            {durum?.ad ?? kayit.durum}
          </Yazi>
          {yaziliyor ? <ActivityIndicator color={renk.vurguKoyu} /> : null}
        </View>

        <Yazi tur="minik" renkli={renk.metinSolgun} style={{ marginTop: aralik.m }}>
          DEĞİŞTİR
        </Yazi>
        <Secim
          secenekler={secilebilir.map((d) => d.ad)}
          secili={durum?.ad ?? ''}
          sec={(ad) => { void durumSec(ad); }}
        />

        {durum && durum.takipGunu > 0 ? (
          <Yazi tur="kucuk" renkli={renk.metinSolgun} style={{ marginTop: aralik.m }}>
            Bu duruma geçildiğinde {durum.takipGunu} gün sonrasına takip hatırlatması
            kurulur.
          </Yazi>
        ) : null}

        {hata ? (
          <Yazi tur="kucuk" renkli={renk.tehlike} style={{ marginTop: aralik.s }}>{hata}</Yazi>
        ) : null}
      </Kart>

      <BolumBasligi>Talep</BolumBasligi>
      <Kart>
        <Alan etiket="Etkinlik tarihi" deger={tarihAlani(kayit)} />
        <Alan etiket="Kişi sayısı" deger={kayit.kisi ? `${kayit.kisi} kişi` : '-'} />
        <Alan etiket="Teklif" deger={kayit.teklif === null ? '-' : tutar(kayit.teklif)} />
        <Alan
          etiket="Opsiyon tarihi"
          deger={kayit.opsiyon ? tarihUzun(kayit.opsiyon) : '-'}
          uyari={kayit.opsiyon !== '' && kayit.opsiyon < bugunIso()}
        />
        {kayit.talep ? <Alan etiket="Ne sordu" deger={kayit.talep} /> : null}
        {kayit.not ? <Alan etiket="Not" deger={kayit.not} /> : null}
      </Kart>

      <BolumBasligi>Takip</BolumBasligi>
      <Kart>
        <Alan
          etiket="Son iletişim"
          deger={kayit.sonIletisim ? tarihSayisal(kayit.sonIletisim.slice(0, 10)) : '-'}
        />
        <Alan
          etiket="Sonraki takip"
          deger={kayit.takip ? tarihSayisal(kayit.takip) : '-'}
          uyari={gecikti}
        />
      </Kart>

      {kayit.opsiyon !== '' && kayit.opsiyon < bugunIso() ? (
        <Etiket metin="Opsiyon tarihi geçti: salon başkasına satılabilir" tur="kotu" />
      ) : null}

      <Yazi tur="kucuk" renkli={renk.metinSolgun} style={{ marginTop: aralik.l }}>
        Teklif tutarı, sorumlu personel, düşünülen salon ve opsiyon tarihi web
        panelinden girilir. Rezervasyona dönüştürme de panelde yapılır.
      </Yazi>
    </ScrollView>
  );
}

/** Gün varsa tarih, yoksa müşterinin söylediği ifade. */
function tarihAlani(a: Aday): string {
  if (a.etkinlikTarihi) return tarihUzun(a.etkinlikTarihi);
  if (a.tarihMetni) return a.tarihMetni;
  return '-';
}

function Alan({ etiket, deger, uyari }: { etiket: string; deger: string; uyari?: boolean }) {
  return (
    <View style={{ marginTop: aralik.s }}>
      <Yazi tur="minik" renkli={renk.metinSolgun}>{etiket.toLocaleUpperCase('tr-TR')}</Yazi>
      <Yazi tur="kucuk" renkli={uyari ? renk.tehlike : renk.metin} style={{ marginTop: 2 }}>
        {deger}
      </Yazi>
    </View>
  );
}
