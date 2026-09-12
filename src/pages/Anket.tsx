import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import Seo from '../components/Seo';
import Alert from '../components/Alert';
import { formatDateLong } from '../lib/format';
import {
  ANKET_EN_DUSUK, ANKET_EN_YUKSEK, ANKET_SORULARI,
} from '../types';

/**
 * Deneyim anketi (madde 31) — müşteriye açık sayfa.
 *
 * Çiftin sistemde hesabı yok. Sayfa, e-postayla gelen bağlantıdaki
 * JETONLA açılıyor ve okuma da yazma da `/api/anket-yanit` üzerinden,
 * yani SUNUCUDAN geçiyor. Anket tablosuna yazma yetkisi yalnızca
 * sunucuda; o yetki tarayıcıya verilseydi bağlantıyı ele geçiren biri
 * başka kayıtlara da yazabilirdi.
 *
 * Sayfa arama motorlarına KAPALI: bağlantı kişiye özel.
 */
interface AnketBilgisi {
  business: string;
  date: string;
  answered: boolean;
}

const PUANLAR = Array.from(
  { length: ANKET_EN_YUKSEK - ANKET_EN_DUSUK + 1 },
  (_, i) => ANKET_EN_DUSUK + i,
);

export default function Anket() {
  const [params] = useSearchParams();
  const jeton = params.get('jeton') ?? '';

  const [bilgi, setBilgi] = useState<AnketBilgisi | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState('');
  const [puanlar, setPuanlar] = useState<Record<string, number>>({});
  const [yorum, setYorum] = useState('');
  const [gonderiliyor, setGonderiliyor] = useState(false);
  const [tesekkur, setTesekkur] = useState(false);

  useEffect(() => {
    if (!jeton) {
      setHata('Anket bağlantısı eksik. Lütfen e-postadaki bağlantıyı kullanınız.');
      setYukleniyor(false);
      return;
    }

    let iptal = false;
    (async () => {
      try {
        const yanit = await fetch(`/api/anket-yanit?jeton=${encodeURIComponent(jeton)}`);
        const govde = (await yanit.json()) as AnketBilgisi & { error?: string };
        if (iptal) return;
        if (!yanit.ok) setHata(govde.error ?? 'Anket açılamadı.');
        else setBilgi(govde);
      } catch {
        if (!iptal) setHata('Sunucuya ulaşılamadı.');
      } finally {
        if (!iptal) setYukleniyor(false);
      }
    })();
    return () => { iptal = true; };
  }, [jeton]);

  async function gonder(e: React.FormEvent) {
    e.preventDefault();
    setHata('');

    /*
      En az bir soru puanlanmalı. Boş bir form gönderilebilseydi anket
      "cevaplandı" sayılır, bağlantı kapanır ve çift bir daha
      cevaplayamazdı.
    */
    if (Object.keys(puanlar).length === 0) {
      setHata('Lütfen en az bir soruyu puanlayınız.');
      return;
    }

    setGonderiliyor(true);
    try {
      const yanit = await fetch('/api/anket-yanit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jeton, puanlar, yorum }),
      });
      if (yanit.ok) {
        setTesekkur(true);
      } else {
        const govde = (await yanit.json()) as { error?: string };
        setHata(govde.error ?? 'Anket kaydedilemedi.');
      }
    } catch {
      setHata('Sunucuya ulaşılamadı.');
    } finally {
      setGonderiliyor(false);
    }
  }

  const baslik = bilgi?.business ? `${bilgi.business} - Deneyim Anketi` : 'Deneyim Anketi';

  return (
    <>
      {/* noindex: bağlantı kişiye özel, dizine girmemeli. */}
      <Seo title={`${baslik} - Sahra Takip`} noindex />
      <PageHeader
        title="Deneyim Anketi"
        breadcrumbs={[{ label: 'Deneyim Anketi' }]}
        description="Organizasyonunuzu değerlendirmeniz bizim için değerli."
      />

      <section className="py-12">
        <div className="container-dt max-w-2xl">
          {yukleniyor && (
            <p className="py-8 text-center text-sm text-brand-muted" role="status">
              Anket yükleniyor…
            </p>
          )}

          {!yukleniyor && hata && !bilgi && <Alert kind="error">{hata}</Alert>}

          {tesekkur && (
            <Alert kind="success">
              Değerlendirmeniz için teşekkür ederiz. Yanıtlarınız kaydedildi.
            </Alert>
          )}

          {/*
            Daha önce cevaplanmış anket yeniden AÇILMIYOR. Bağlantı
            e-postada duruyor ve tekrar tıklanabilir; üzerine yazılabilseydi
            aynı çift ortalamayı istediği kadar değiştirebilirdi.
          */}
          {!yukleniyor && bilgi?.answered && !tesekkur && (
            <Alert kind="info">
              Bu anket daha önce cevaplanmış. Katkınız için teşekkür ederiz.
            </Alert>
          )}

          {!yukleniyor && bilgi && !bilgi.answered && !tesekkur && (
            <form onSubmit={(e) => { void gonder(e); }} className="card p-6">
              <p className="mb-5 text-sm text-brand-muted">
                {bilgi.business}
                {bilgi.date && ` · ${formatDateLong(bilgi.date)}`}
              </p>

              {hata && <Alert kind="error" className="mb-4">{hata}</Alert>}

              {ANKET_SORULARI.map((soru) => (
                <fieldset key={soru.key} className="mb-5 border-0 p-0">
                  <legend className="field-label">{soru.label}</legend>
                  {/*
                    Puanlar radyo düğmesi: kaydırıcı (slider) ekran
                    okuyucuda ve dokunmatik ekranda yanlış değere kolayca
                    kayıyor, seçim burada kesin olmalı.
                  */}
                  <div className="flex flex-wrap gap-2">
                    {PUANLAR.map((puan) => (
                      <label
                        key={puan}
                        className={`flex h-10 w-10 cursor-pointer items-center justify-center rounded-md border text-sm transition ${
                          puanlar[soru.key] === puan
                            ? 'border-accent-ink bg-accent-ink text-white'
                            : 'border-line bg-white text-brand hover:border-accent-ink'
                        }`}
                      >
                        <input
                          type="radio"
                          className="sr-only"
                          name={soru.key}
                          value={puan}
                          checked={puanlar[soru.key] === puan}
                          onChange={() => {
                            setPuanlar((p) => ({ ...p, [soru.key]: puan }));
                            setHata('');
                          }}
                        />
                        {puan}
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}

              <div className="mb-5">
                <label htmlFor="anket-yorum" className="field-label">
                  Eklemek istedikleriniz (isteğe bağlı)
                </label>
                <textarea
                  id="anket-yorum"
                  rows={4}
                  maxLength={2000}
                  className="field-input"
                  value={yorum}
                  onChange={(e) => setYorum(e.target.value)}
                />
              </div>

              <button type="submit" className="btn-primary text-white hover:text-white"
                disabled={gonderiliyor}>
                {gonderiliyor ? 'Gönderiliyor…' : 'Gönder'}
              </button>

              <p className="mt-4 text-xs text-brand-muted">
                1 en düşük, {ANKET_EN_YUKSEK} en yüksek puandır. Yanıtlarınız yalnızca
                hizmetin geliştirilmesi için kullanılır.
              </p>
            </form>
          )}
        </div>
      </section>
    </>
  );
}
