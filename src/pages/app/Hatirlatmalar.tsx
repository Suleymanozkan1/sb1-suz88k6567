import { useEffect, useState } from 'react';
import Seo from '../../components/Seo';
import Alert from '../../components/Alert';
import { QueryBoundary } from '../../components/QueryState';
import { useAuth } from '../../context/AuthContext';
import { errorMessage } from '../../lib/authHelpers';
import {
  useReminderRules, useSaveReminderRule, useSaveTemplate, useTemplates,
} from '../../lib/queries';
import {
  OTOMATIK_OLABILEN, SABLON_ADI, YER_TUTUCULAR, olc,
  type HatirlatmaKurali, type Sablon,
} from '../../lib/sablon';
import { IconCheck, IconMessage } from '../../components/Icons';
import HizliYanitlar from '../../components/HizliYanitlar';

/**
 * Hatırlatma şablonları ve otomatik gönderim kuralları.
 *
 * İki ayrı şey düzenlenir ve bu ayrım ekranda da korunur:
 *   metin: müşteriye ne yazılacağı (her şablon için taslak)
 *   kural: o taslağın kendiliğinden ne zaman gideceği
 *
 * Bir şablonun metni her zaman düzenlenebilir; kural yalnızca otomatik
 * gönderilebilen türlerde vardır. Rezervasyon onayı ve tahsilat bildirimi
 * bir olaya bağlıdır, takvime değil: onların otomatik kuralı yoktur.
 */
export default function Hatirlatmalar() {
  const { user, can } = useAuth();
  const businessId = user?.activeBusinessId ?? '';
  const duzenleyebilir = can('ayarlar.duzenle');

  const { data: sablonlar = [], isLoading, error: yuklemeHatasi } = useTemplates(businessId);
  const { data: kurallar = [] } = useReminderRules(businessId);
  const sablonKaydet = useSaveTemplate(businessId);
  const kuralKaydet = useSaveReminderRule(businessId);

  const [taslak, setTaslak] = useState<Record<string, string>>({});
  const [hata, setHata] = useState('');
  const [kaydedilen, setKaydedilen] = useState('');

  // Sunucudan gelen metinler forma bir kez aktarılır; kullanıcı yazarken
  // her yeniden getirmede yazdığının silinmemesi için anahtar bazında.
  useEffect(() => {
    setTaslak((onceki) => {
      const yeni = { ...onceki };
      for (const s of sablonlar) if (yeni[s.id] === undefined) yeni[s.id] = s.body;
      return yeni;
    });
  }, [sablonlar]);

  async function metinKaydet(sablon: Sablon) {
    setHata(''); setKaydedilen('');
    const govde = (taslak[sablon.id] ?? '').trim();
    if (!govde) { setHata('Mesaj metni boş olamaz.'); return; }
    try {
      await sablonKaydet.mutateAsync({ ...sablon, body: govde });
      setKaydedilen(sablon.id);
    } catch (e) {
      setHata(errorMessage(e));
    }
  }

  async function kuralDegistir(kural: HatirlatmaKurali, degisiklik: Partial<HatirlatmaKurali>) {
    setHata('');
    try {
      await kuralKaydet.mutateAsync({ ...kural, ...degisiklik });
    } catch (e) {
      setHata(errorMessage(e));
    }
  }

  return (
    <>
      <Seo title="Hatırlatmalar" noindex />
      <h1 className="mb-1 font-heading text-2xl font-bold text-brand">Hatırlatmalar</h1>
      <p className="mb-6 max-w-3xl text-sm text-brand-muted">
        Müşteriye gidecek mesajların taslak metinleri burada durur. Rezervasyon
        ekranından tek tuşla gönderilirler; işaretlediğiniz türler ayrıca
        kendiliğinden gönderilir.
      </p>

      {hata ? <Alert kind="error" className="mb-4">{hata}</Alert> : null}

      <section className="card mb-6 p-5">
        <h2 className="mb-1 font-heading text-lg font-bold text-brand">Yer tutucular</h2>
        <p className="mb-3 text-sm text-brand-muted">
          Metne aşağıdaki adları yazarsanız gönderim sırasında rezervasyonun
          kendi bilgisiyle değiştirilir.
        </p>
        <ul className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {YER_TUTUCULAR.map(([ad, aciklama]) => (
            <li key={ad} className="flex gap-2">
              <code className="rounded bg-surface px-1.5 py-0.5 font-mono text-xs text-brand">{ad}</code>
              <span className="text-brand-muted">{aciklama}</span>
            </li>
          ))}
        </ul>
      </section>

      <QueryBoundary isLoading={isLoading} error={yuklemeHatasi}>
        <div className="space-y-4">
          {sablonlar.map((sablon) => {
            const kural = kurallar.find((k) => k.key === sablon.key);
            const govde = taslak[sablon.id] ?? sablon.body;
            const olcum = olc(govde);
            const degisti = govde !== sablon.body;

            return (
              <section key={sablon.id} className="card p-5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-heading text-lg font-bold text-brand">
                    {SABLON_ADI[sablon.key]}
                  </h2>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                      sablon.category === 'ticari'
                        ? 'bg-warning/10 text-warning-deep'
                        : 'bg-success/10 text-success-deep'
                    }`}
                  >
                    {sablon.category === 'ticari' ? 'Ticari ileti: İYS onayı gerekir' : 'İşlem bildirimi: onay gerekmez'}
                  </span>
                </div>

                <label htmlFor={`metin-${sablon.id}`} className="field-label">Mesaj metni</label>
                <textarea
                  id={`metin-${sablon.id}`}
                  className="field-input min-h-[92px] font-mono text-sm"
                  value={govde}
                  disabled={!duzenleyebilir}
                  onChange={(e) => setTaslak((o) => ({ ...o, [sablon.id]: e.target.value }))}
                />

                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-brand-muted">
                  <span>
                    {olcum.karakter} karakter · {olcum.parca} SMS
                  </span>
                  {olcum.turkce ? (
                    // Ücret iki katına çıkabildiği için sessiz geçilmiyor.
                    <span className="text-warning">
                      Türkçe harf kullanıldığı için parça başına 70 karakter sayılır.
                    </span>
                  ) : null}
                  {kaydedilen === sablon.id && !degisti ? (
                    <span className="flex items-center gap-1 text-success">
                      <IconCheck size={14} /> Kaydedildi
                    </span>
                  ) : null}
                </div>

                {duzenleyebilir ? (
                  <button
                    type="button"
                    className="btn-outline btn-sm mt-3"
                    disabled={!degisti || sablonKaydet.isPending}
                    onClick={() => void metinKaydet(sablon)}
                  >
                    <IconMessage size={14} /> Metni kaydet
                  </button>
                ) : null}

                {kural && OTOMATIK_OLABILEN.includes(sablon.key) ? (
                  <div className="mt-4 border-t border-line pt-4">
                    <label className="flex items-center gap-2 text-sm font-semibold text-brand">
                      <input
                        type="checkbox"
                        checked={kural.enabled}
                        disabled={!duzenleyebilir}
                        onChange={(e) => void kuralDegistir(kural, { enabled: e.target.checked })}
                      />
                      Kendiliğinden gönderilsin
                    </label>

                    <div className="mt-3 flex flex-wrap items-end gap-4">
                      <div>
                        <label htmlFor={`gun-${sablon.id}`} className="field-label">
                          {kural.daysBefore >= 0 ? 'Kaç gün önce' : 'Kaç gün sonra'}
                        </label>
                        <input
                          id={`gun-${sablon.id}`}
                          type="number"
                          className="field-input w-28"
                          value={Math.abs(kural.daysBefore)}
                          min={0}
                          max={365}
                          disabled={!duzenleyebilir || !kural.enabled}
                          onChange={(e) => {
                            const n = Math.abs(Number(e.target.value) || 0);
                            // İşaret kullanıcıya sorulmaz: teşekkür mesajı
                            // organizasyondan sonra, diğerleri önce gider.
                            void kuralDegistir(kural, {
                              daysBefore: sablon.key === 'tesekkur' ? -n : n,
                            });
                          }}
                        />
                      </div>
                      <div>
                        <label htmlFor={`saat-${sablon.id}`} className="field-label">Gönderim saati</label>
                        <input
                          id={`saat-${sablon.id}`}
                          type="number"
                          className="field-input w-28"
                          value={kural.sendHour}
                          min={0}
                          max={23}
                          disabled={!duzenleyebilir || !kural.enabled}
                          onChange={(e) => void kuralDegistir(kural, {
                            sendHour: Math.min(23, Math.max(0, Number(e.target.value) || 0)),
                          })}
                        />
                      </div>
                      <p className="max-w-md text-xs text-brand-muted">
                        {kural.daysBefore === 0
                          ? 'Organizasyon günü gönderilir.'
                          : kural.daysBefore > 0
                            ? `Organizasyondan ${kural.daysBefore} gün önce gönderilir.`
                            : `Organizasyondan ${-kural.daysBefore} gün sonra gönderilir.`}
                        {' '}Her rezervasyona bir kez gider; ikinci kez gönderilmez.
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="mt-4 border-t border-line pt-4 text-xs text-brand-muted">
                    Bu mesaj bir olaya bağlıdır (kayıt açılması, ödeme alınması) ve
                    takvime göre gönderilmez. Rezervasyon ekranından elle gönderilir.
                  </p>
                )}
              </section>
            );
          })}
        </div>
      </QueryBoundary>

      {/*
        Hızlı yanıtlar şablonlardan AYRI bir bölüm: şablon müşteriye giden,
        yer tutuculu ve olaya bağlı bir taslak; hızlı yanıt personelin
        yazarken kopyaladığı kısa metin. Aynı listede toplansalardı ikisi
        de anlaşılmaz olurdu.
      */}
      <div className="mt-6">
        <HizliYanitlar duzenleyebilir={duzenleyebilir} />
      </div>

      <p className="mt-6 text-xs text-brand-muted">
        Otomatik gönderim gece çalışan bir görevle yapılır; SMS sağlayıcısı
        tanımlı değilse mesajlar kuyrukta bekler, kaybolmaz. Ticari ileti
        sınıfındaki mesajlar İYS onayı olmayan numaraya gönderilmez, engellenen
        gönderim gerekçesiyle SMS kayıtlarına yazılır.
      </p>
    </>
  );
}
