import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Etiket } from '../../src/bilesenler/duzen';
import { BolumBasligi, Dugme, Kart, Yazi } from '../../src/bilesenler/temel';
import { tarihUzun, telefon as telefonBicim, tutar } from '../../src/bicim';
import { aralik, renk } from '../../src/tema';
import { faturaDetay, type FaturaDetay } from '../../src/veri';

/**
 * Kesilmiş faturanın görüntüsü.
 *
 * Liste satırındaki toplam "hangi kalemden geldi" sorusunu cevaplamıyor;
 * müşteri aradığında personelin bakacağı yer burası.
 *
 * Bu ekran RESMÎ BELGE DEĞİL, sistemdeki kaydın kendisi. Entegratöre
 * gönderilen belge ayrı; ikisi karışmasın diye durum en üstte duruyor.
 *
 * Fatura kesme ve iptal mobilde yok: gönderilmiş fatura düzeltilemiyor,
 * yalnızca iptal edilebiliyor ve iptal de vergisel bir işlem.
 */
const DURUM_ADI: Record<string, string> = {
  taslak: 'Taslak', gonderiliyor: 'Gönderiliyor', gonderildi: 'Gönderildi',
  onaylandi: 'Onaylandı', reddedildi: 'Reddedildi', iptal: 'İptal',
};

const BELGE_TURU: Record<string, string> = {
  'e-Arsiv': 'e-Arşiv Fatura',
  'e-Fatura': 'e-Fatura',
};

function durumTuru(durum: string): 'iyi' | 'uyari' | 'kotu' | 'notr' {
  if (durum === 'gonderildi' || durum === 'onaylandi') return 'iyi';
  if (durum === 'reddedildi' || durum === 'iptal') return 'kotu';
  if (durum === 'taslak' || durum === 'gonderiliyor') return 'uyari';
  return 'notr';
}

export default function FaturaKarti() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [kayit, setKayit] = useState<FaturaDetay | null>(null);
  const [hata, setHata] = useState('');
  const [yok, setYok] = useState(false);

  const getir = useCallback(async () => {
    try {
      setHata('');
      const f = await faturaDetay(String(id));
      setKayit(f);
      setYok(f === null);
    } catch (e) {
      setHata(e instanceof Error ? e.message : 'Fatura okunamadı.');
    }
  }, [id]);

  useEffect(() => { void getir(); }, [getir]);

  if (hata) {
    return (
      <View style={{ flex: 1, backgroundColor: renk.zemin, padding: aralik.l }}>
        <Yazi tur="kucuk" renkli={renk.tehlike}>{hata}</Yazi>
        <Dugme metin="Yeniden dene" ikincil tam style={{ marginTop: aralik.m }}
          onPress={() => { void getir(); }} />
      </View>
    );
  }

  if (yok) {
    return (
      <View style={{ flex: 1, backgroundColor: renk.zemin, padding: aralik.l }}>
        <Yazi tur="kucuk" renkli={renk.tehlike}>Fatura kaydı bulunamadı.</Yazi>
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

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: renk.zemin }}
      contentContainerStyle={{ padding: aralik.l, paddingBottom: aralik.xxl }}
    >
      <Kart>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}>
            <Yazi tur="altBaslik" renkli={renk.lacivert}>{kayit.no}</Yazi>
            <Yazi tur="minik" renkli={renk.metinSolgun} style={{ marginTop: 2 }}>
              {BELGE_TURU[kayit.tur] ?? kayit.tur} · {tarihUzun(kayit.tarih)}
            </Yazi>
          </View>
          <Etiket metin={DURUM_ADI[kayit.durum] ?? kayit.durum} tur={durumTuru(kayit.durum)} />
        </View>
      </Kart>

      <BolumBasligi>Alıcı</BolumBasligi>
      <Kart>
        <Alan etiket="Ad / unvan" deger={kayit.alici} />
        {kayit.vergiNo ? <Alan etiket="VKN / TCKN" deger={kayit.vergiNo} /> : null}
        {kayit.vergiDairesi ? <Alan etiket="Vergi dairesi" deger={kayit.vergiDairesi} /> : null}
        {kayit.adres ? <Alan etiket="Adres" deger={kayit.adres} /> : null}
        {kayit.aliciTelefon ? <Alan etiket="Telefon" deger={telefonBicim(kayit.aliciTelefon)} /> : null}
        {kayit.eposta ? <Alan etiket="E-posta" deger={kayit.eposta} /> : null}
      </Kart>

      <BolumBasligi>Kalemler</BolumBasligi>
      {kayit.satirlar.length === 0 ? (
        <Kart>
          <Yazi tur="kucuk" renkli={renk.metinSolgun}>Bu faturada kalem kaydı yok.</Yazi>
        </Kart>
      ) : (
        kayit.satirlar.map((k) => (
          <Kart key={k.id} style={{ marginBottom: aralik.s }}>
            <Yazi tur="altBaslik" renkli={renk.lacivert}>{k.sira}. {k.aciklama}</Yazi>
            <Yazi tur="minik" renkli={renk.metinSolgun} style={{ marginTop: 2 }}>
              {k.miktar} {k.birim} × {tutar(k.birimFiyat)} · %{k.kdvOrani} KDV
            </Yazi>
            <View style={s.satirTutar}>
              <Kalem etiket="MATRAH" deger={tutar(k.matrah)} />
              <Kalem etiket="KDV" deger={tutar(k.kdv)} />
              <Kalem etiket="TOPLAM" deger={tutar(k.toplam)} vurgu />
            </View>
          </Kart>
        ))
      )}

      <BolumBasligi>Toplam</BolumBasligi>
      <Kart>
        <Alan etiket="Brüt" deger={tutar(kayit.brut)} />
        {kayit.iskonto > 0 ? <Alan etiket="İskonto" deger={`- ${tutar(kayit.iskonto)}`} /> : null}
        <Alan etiket="Matrah" deger={tutar(kayit.matrah)} />
        <Alan etiket="KDV" deger={tutar(kayit.kdv)} />
        <Alan etiket="Genel toplam" deger={tutar(kayit.toplam)} vurgu />
      </Kart>

      {kayit.saglayiciHatasi ? (
        <>
          <BolumBasligi>Sağlayıcı hatası</BolumBasligi>
          <Kart>
            <Yazi tur="kucuk" renkli={renk.tehlike}>{kayit.saglayiciHatasi}</Yazi>
          </Kart>
        </>
      ) : null}

      {kayit.iptalGerekcesi ? (
        <>
          <BolumBasligi>İptal gerekçesi</BolumBasligi>
          <Kart>
            <Yazi tur="kucuk" renkli={renk.metin}>{kayit.iptalGerekcesi}</Yazi>
          </Kart>
        </>
      ) : null}

      {kayit.not ? (
        <>
          <BolumBasligi>Not</BolumBasligi>
          <Kart><Yazi tur="kucuk" renkli={renk.metin}>{kayit.not}</Yazi></Kart>
        </>
      ) : null}

      <Yazi tur="kucuk" renkli={renk.metinSolgun} style={{ marginTop: aralik.l }}>
        Burada görünen sistemdeki kayıttır; entegratöre gönderilen resmî belge
        ayrıdır. Fatura kesme ve iptal web panelinden yapılır.
      </Yazi>
    </ScrollView>
  );
}

function Alan({ etiket, deger, vurgu }: { etiket: string; deger: string; vurgu?: boolean }) {
  return (
    <View style={{
      flexDirection: 'row', justifyContent: 'space-between',
      alignItems: 'center', marginTop: aralik.s,
    }}>
      <Yazi tur="minik" renkli={renk.metinSolgun}>{etiket.toLocaleUpperCase('tr-TR')}</Yazi>
      <Yazi
        tur={vurgu ? 'tutar' : 'kucuk'}
        renkli={vurgu ? renk.lacivert : renk.metin}
        style={{ flexShrink: 1, textAlign: 'right', marginLeft: aralik.m }}
      >
        {deger}
      </Yazi>
    </View>
  );
}

function Kalem({ etiket, deger, vurgu }: { etiket: string; deger: string; vurgu?: boolean }) {
  return (
    <View style={{ flex: 1 }}>
      <Yazi tur="minik" renkli={renk.metinSolgun}>{etiket}</Yazi>
      <Yazi tur="tutar" renkli={vurgu ? renk.lacivert : renk.metin} style={{ marginTop: 2 }}>
        {deger}
      </Yazi>
    </View>
  );
}

const s = {
  satirTutar: {
    flexDirection: 'row' as const,
    marginTop: aralik.m,
    borderTopWidth: 1,
    borderTopColor: renk.cizgiSolgun,
    paddingTop: aralik.m,
    gap: aralik.s,
  },
};
