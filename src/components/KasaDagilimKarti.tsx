import { useState } from 'react';
import { formatMoney } from '../lib/format';
import type { KasaDagilimi } from '../lib/kasa';

/**
 * Kasadaki paranın nerede durduğunu gösteren kart.
 *
 * Toplam herkese açık, dağılım gizli. Sebebi ekran başında duran
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
            Dağılımı görmek için hesap şifreniz
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
          <dl className="mt-4 space-y-2">
            {dagilim.kanallar.map((k) => (
              <div key={k.method} className="flex items-baseline justify-between gap-3">
                <dt className="text-sm text-brand-muted">{k.method}</dt>
                <dd className="font-medium text-brand">{formatMoney(k.tutar, currency)}</dd>
              </div>
            ))}

            {/*
              Tipi bilinmeyen kayıtlar ayrı satırda. Bir kanala yazmak
              uydurma olurdu; sıfırdan farklıysa sahibi geçmişe dönüp
              doldurabilsin diye görünür duruyor.
            */}
            {dagilim.belirtilmemis !== 0 && (
              <div className="flex items-baseline justify-between gap-3 border-t border-line pt-2">
                <dt className="text-sm text-brand-muted">
                  Belirtilmemiş
                  <span className="ml-1 text-xs">(ödeme tipi girilmemiş kayıtlar)</span>
                </dt>
                <dd className="font-medium text-brand">{formatMoney(dagilim.belirtilmemis, currency)}</dd>
              </div>
            )}
          </dl>

          {/*
            Çek ve senet kasaya GİRMEZ: ikisi de henüz tahsil edilmemiş bir
            vaattir. Kasadaki parayla toplanırsa kasa olduğundan büyük
            görünür ve olmayan bir paraya göre karar alınır.
          */}
          {dagilim.tahsilEdilmemis !== 0 && (
            <p className="mt-3 rounded-md bg-surface px-3 py-2 text-xs text-brand-muted">
              Çek / senet: <strong className="text-brand">{formatMoney(dagilim.tahsilEdilmemis, currency)}</strong>
              {' '}— henüz tahsil edilmedi, kasa toplamına dahil değil.
            </p>
          )}
        </>
      )}
    </section>
  );
}
