import { Govde, Satir } from '../src/bilesenler/duzen';
import { BosDurum, Kart, Yazi } from '../src/bilesenler/temel';
import { tutar } from '../src/bicim';
import { aralik, renk } from '../src/tema';
import { menuler, type Menu } from '../src/veri';

/** Örnek davetli sayıları: kişi başı menünün ne tuttuğunu göstermek için. */
const ORNEK_KISI = [150, 300, 500];

/**
 * Menü ve paket tanımları.
 *
 * Kişi başı menülerde örnek tutarlar gösteriliyor: birim fiyat tek başına
 * "bu düğün ne tutar" sorusunu cevaplamıyor ve kullanıcı hesap makinesine
 * gidiyordu.
 */
export default function Menuler() {
  return (
    <Govde<Menu[]>
      yukle={menuler}
      bos={<BosDurum baslik="Menü yok" aciklama="Henüz menü tanımlanmamış." />}
    >
      {(liste) => (
        <>
          {liste.map((m) => (
            <Kart key={m.id} style={{ marginBottom: aralik.s }}>
              <Yazi tur="altBaslik" renkli={renk.lacivert}>{m.ad}</Yazi>
              {m.aciklama ? (
                <Yazi tur="kucuk" renkli={renk.metinSolgun} style={{ marginTop: 2 }}>
                  {m.aciklama}
                </Yazi>
              ) : null}

              <Yazi tur="tutar" renkli={renk.vurguKoyu} style={{ marginTop: aralik.s }}>
                {tutar(m.fiyat)}{m.fiyatTuru === 'kisi_basi' ? ' / kişi' : ' sabit'}
              </Yazi>

              {m.fiyatTuru === 'kisi_basi' ? (
                <Yazi tur="minik" renkli={renk.metinSolgun} style={{ marginTop: aralik.s }}>
                  {ORNEK_KISI.map((k) => `${k} kişi: ${tutar(m.fiyat * k)}`).join('   ')}
                </Yazi>
              ) : null}
            </Kart>
          ))}

          <Satir
            baslik="Tutar önerisi"
            alt="Rezervasyona menü seçildiğinde toplam tutar hesaplanıp önerilir; kullanıcı değiştirebilir."
            style={{ marginTop: aralik.l }}
          />
        </>
      )}
    </Govde>
  );
}
