import { Etiket, Govde, Satir } from '../src/bilesenler/duzen';
import { BolumBasligi, BosDurum, Kart, Yazi } from '../src/bilesenler/temel';
import { tarihUzun, telefon } from '../src/bicim';
import { aralik, renk } from '../src/tema';
import { izinler, type Izin } from '../src/veri';

/**
 * İYS izin kayıtları.
 *
 * Onay ve ret ayrı bölümlerde: karışık bir listede kullanıcı bir numaranın
 * ticari ileti alıp alamayacağını ancak satırı okuyarak anlıyordu.
 */
export default function Izinler() {
  return (
    <Govde<Izin[]>
      yukle={() => izinler()}
      bos={<BosDurum baslik="İzin kaydı yok" aciklama="Henüz onay ya da ret kaydı bulunmuyor." />}
    >
      {(liste) => {
        const onay = liste.filter((x) => x.durum === 'ONAY');
        const ret = liste.filter((x) => x.durum === 'RET');
        const bekleyen = liste.filter((x) => x.iysAktarim !== 'Aktarıldı').length;

        return (
          <>
            <Kart style={{ marginBottom: aralik.m }}>
              <Yazi tur="kucuk" renkli={renk.metin}>
                {onay.length} onay, {ret.length} ret.
                {bekleyen > 0
                  ? ` ${bekleyen} kayıt İYS'ye aktarılmayı bekliyor.`
                  : ' Tüm kayıtlar İYS ile eşleşmiş.'}
              </Yazi>
              <Yazi tur="minik" renkli={renk.metinSolgun} style={{ marginTop: aralik.s }}>
                Mevzuat yeni onayların ve retlerin üç iş günü içinde işlenmesini istiyor;
                aktarım her gece kendiliğinden yapılır.
              </Yazi>
            </Kart>

            <BolumBasligi>Onay verenler</BolumBasligi>
            {onay.length === 0 ? (
              <BosDurum baslik="Onay yok" aciklama="Ticari ileti gönderilebilecek numara bulunmuyor." />
            ) : onay.map((x) => (
              <Satir
                key={x.telefon}
                baslik={telefon(x.telefon)}
                alt={`${x.kaynak} · ${tarihUzun(x.tarih)}`}
                ikinciAlt={`İYS: ${x.iysAktarim}`}
              />
            ))}

            <BolumBasligi>Ret verenler</BolumBasligi>
            {ret.length === 0 ? (
              <BosDurum baslik="Ret yok" aciklama="Ticari ileti almayı reddeden numara bulunmuyor." />
            ) : ret.map((x) => (
              <Satir
                key={x.telefon}
                baslik={telefon(x.telefon)}
                alt={`${x.kaynak} · ${tarihUzun(x.tarih)}`}
                ikinciAlt={`İYS: ${x.iysAktarim}`}
                solRenk={renk.tehlike}
              />
            ))}

            <Etiket metin="Ret alan numaraya ticari ileti gönderilemez" tur="kotu" />
            <Yazi tur="kucuk" renkli={renk.metinSolgun} style={{ marginTop: aralik.m }}>
              Kural veritabanı düzeyinde uygulanır: onayı olmayan numaraya ticari ileti
              kaydı açılamaz. Rezervasyon onayı ve hatırlatma işlem bildirimidir, bu
              kurala tabi değildir.
            </Yazi>
          </>
        );
      }}
    </Govde>
  );
}
