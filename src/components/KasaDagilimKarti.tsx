import { useState } from 'react';
import { formatMoney } from '../lib/format';
import type { KasaDagilimi } from '../lib/kasa';

/**
 * Kasadaki paranın nerede durduğunu gösteren kart.
 *
 * Üstte güncel kasa toplamı, altında küçük bir ÇELİK KASA bölümü: nakit,
 * kredi kartı ve havale ayrı ayrı bakiye olarak duruyor. Tek bir toplam
 * "para nerede" sorusunu cevaplamıyor; nakit kasada, kart ve havale
 * bankadadır ve ikisi aynı şey değildir.
 *
 * Toplam herkese açık, çelik kasa gizli. Sebebi ekran başında duran
 * personelin değil, yanından geçenin görmesi: salonun kasasında ne kadar
 * nakit olduğu, ekranda sürekli açık duran bir bilgi olmamalı.
 *
 * Kilit bir GÜVENLİK duvarı değil, bir perde. Gerçek koruma yetki
 * sisteminde: `kasa.goruntule` yetkisi olmayan kullanıcıya bu kart hiç
 * gönderilmiyor. Buradaki şifre, yetkili kullanıcının omzunun üstünden
 * bakılmasına karşı.
 */
export default function KasaDagilimKarti({
  dagilim, currency, email, baslik = 'Kasa Durumu',
}: {
  dagilim: KasaDagilimi;
  currency: string;
  /**
   * Kullanıcının e-postası. Verilirse dağılım şifreyle açılır; verilmezse
   * doğrudan açık gelir (Kasa ekranında zaten tüm satırlar görünüyor,
   * orada perde anlamsız).
   */
  email?: string;
  baslik?: string;
}) {
  const [acik, setAcik] = useState(!email);
  const [girilen, setGirilen] = useState('');
  const [hata, setHata] = useState('');
  const [bekliyor, setBekliyor] = useState(false);

  /*
    Doğrulama SUNUCUDA yapılıyor. Tarayıcıda karşılaştırılsaydı şifrenin
    kendisini ya da bir kopyasını istemciye göndermek gerekirdi; kaynağı
    açan herkes görürdü.
  */
  async function ac(e: React.FormEvent) {
    e.preventDefault();
    setBekliyor(true);
    setHata('');
    try {
      const yanit = await fetch('/api/sifre', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ islem: 'dogrula', email, mevcut: girilen }),
      });
      if (yanit.ok) {
        setAcik(true);
        setGirilen('');
      } else {
        const govde = (await yanit.json()) as { error?: string };
        setHata(govde.error ?? 'Şifre doğrulanamadı.');
      }
    } catch {
      setHata('Sunucuya ulaşılamadı.');
    } finally {
      setBekliyor(false);
    }
  }

  return (
    <section className="card p-5" aria-labelledby="kasa-durumu-baslik">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="kasa-durumu-baslik" className="text-xs uppercase tracking-wide text-brand-muted">
            {baslik}
          </h2>
          <p className={`mt-1 font-heading text-2xl font-bold ${dagilim.toplam >= 0 ? 'text-brand' : 'text-danger'}`}>
            {formatMoney(dagilim.toplam, currency)}
          </p>
        </div>
        {email && acik && (
          <button
            type="button"
            className="text-xs text-brand-muted underline hover:text-brand"
            onClick={() => setAcik(false)}
          >
            Gizle
          </button>
        )}
      </div>

      {!acik ? (
        <form onSubmit={(e) => { void ac(e); }} className="mt-4">
          <label htmlFor="kasa-sifre" className="field-label">
            Çelik kasayı görmek için hesap şifreniz
          </label>
          <div className="flex gap-2">
            <input
              id="kasa-sifre"
              type="password"
              className="field-input"
              value={girilen}
              autoComplete="off"
              onChange={(e) => { setGirilen(e.target.value); setHata(''); }}
            />
            <button type="submit" className="btn-primary text-white hover:text-white"
              disabled={bekliyor || !girilen}>
              {bekliyor ? 'Kontrol…' : 'Aç'}
            </button>
          </div>
          {hata && <p className="mt-1 text-xs text-danger" role="alert">{hata}</p>}
        </form>
      ) : (
        <>
          {/*
            ÇELİK KASA: güncel kasanın altında, küçük. Kanalların her biri
            AYRI BAKİYE olarak duruyor -- "nerede ne kadar var" sorusunun
            cevabı tek bir toplamda görünmez.

            Hareket defteri YOK. Eskiden paranın fiziksel yeri ayrı bir
            defterde elle işaretleniyordu; bu ikinci bir muhasebeydi ve
            unutulan her işaret kasayı olduğundan farklı gösteriyordu.
            Buradaki bakiyeler paranın zaten taşıdığı ödeme tipinden
            hesaplanıyor, elle bakım istemiyor.
          */}
          <div className="mt-4 rounded-lg bg-surface p-3">
            <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-brand-muted">
              Çelik Kasa
            </h3>
            <dl className="space-y-1.5">
              {dagilim.kanallar.map((k) => (
                <div key={k.method} className="flex items-baseline justify-between gap-3">
                  <dt className="text-xs text-brand-muted">{k.method}</dt>
                  <dd className="whitespace-nowrap text-sm font-medium text-brand">{formatMoney(k.tutar, currency)}</dd>
                </div>
              ))}

              {/*
                Tipi bilinmeyen kayıtlar ayrı satırda. Bir kanala yazmak
                uydurma olurdu; sıfırdan farklıysa sahibi geçmişe dönüp
                doldurabilsin diye görünür duruyor.
              */}
              {dagilim.belirtilmemis !== 0 && (
                <div className="flex items-baseline justify-between gap-3 border-t border-line pt-1.5">
                  <dt className="text-xs text-brand-muted">Belirtilmemiş</dt>
                  <dd className="whitespace-nowrap text-sm font-medium text-brand">
                    {formatMoney(dagilim.belirtilmemis, currency)}
                  </dd>
                </div>
              )}
            </dl>

            {/*
              Açıklama listenin DIŞINDA: tanım listesinin içinde yalnızca
              dt/dd durabilir, araya konan bir paragraf listeyi bozuyor ve
              ekran okuyucuda eşleşme kayboluyor. Etiketin yanında da
              duramaz; tutarı sıkıştırıp rakamı iki satıra bölüyordu.
            */}
            {dagilim.belirtilmemis !== 0 && (
              <p className="mt-1 text-[11px] leading-tight text-brand-muted">
                Ödeme tipi girilmemiş kayıtlar
              </p>
            )}
          </div>

          {/*
            Çek ve senet kasaya GİRMEZ: ikisi de henüz tahsil edilmemiş bir
            vaattir. Kasadaki parayla toplanırsa kasa olduğundan büyük
            görünür ve olmayan bir paraya göre karar alınır.
          */}
          {dagilim.tahsilEdilmemis !== 0 && (
            <p className="mt-2 px-1 text-xs text-brand-muted">
              Çek / senet: <strong className="text-brand">{formatMoney(dagilim.tahsilEdilmemis, currency)}</strong>
              {' '}— henüz tahsil edilmedi, kasa toplamına dahil değil.
            </p>
          )}
        </>
      )}
    </section>
  );
}
