import { useState } from 'react';
import { Link } from 'react-router-dom';
import Seo from '../../components/Seo';
import Alert from '../../components/Alert';
import { QueryBoundary } from '../../components/QueryState';
import { useAuth } from '../../context/AuthContext';
import {
  useDeleteLeadStatus, useLeadStatuses, useLeads, useSaveLeadStatus,
} from '../../lib/queries';
import { TON_SINIFI } from '../../lib/lead';
import { errorMessage } from '../../lib/authHelpers';
import { uid } from '../../lib/ids';
import { LEAD_STATUS_TONES } from '../../types';
import type { LeadStatusDef, LeadStatusTone } from '../../types';

/**
 * Müşteri adayı durumlarının yönetimi.
 *
 * Her salonun takip akışı aynı değil: biri "Yer Gösterildi" ister, biri
 * "Kapora Bekliyor". Durumlar bu yüzden koda gömülü değil, işletmeye ait
 * satırlar.
 *
 * Ekranda kod DEĞİL ad düzenleniyor. Kod, kayıtların taşıdığı değişmez
 * değer; adı değiştirmek binlerce aday satırını yeniden yazmadan sadece
 * görüneni değiştiriyor.
 */
const TON_ADI: Record<LeadStatusTone, string> = {
  bekleyen: 'Bekleyen iş',
  ilerleyen: 'İlerliyor',
  olumlu: 'Olumlu',
  teklif: 'Teklif aşaması',
  dikkat: 'Dikkat',
  kapali: 'Kapandı',
  notr: 'Nötr',
};

/** Ada bakarak kod üretir: "Yer Gösterildi" -> "yer_gosterildi". */
function kodUret(ad: string): string {
  const sade = ad.toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g')
    .replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return sade.slice(0, 40);
}

export default function AdayDurumlari() {
  const { user, can } = useAuth();
  const { data: durumlar = [], isLoading, error } = useLeadStatuses();
  const { data: adaylar = [] } = useLeads();
  const kaydet = useSaveLeadStatus();
  const sil = useDeleteLeadStatus();

  const [hata, setHata] = useState('');
  const [yeniAd, setYeniAd] = useState('');
  const [yeniTon, setYeniTon] = useState<LeadStatusTone>('bekleyen');

  const duzenlenebilir = can('ayarlar.duzenle');
  const kullanim = (kod: string) => adaylar.filter((a) => a.status === kod).length;

  async function yaz(durum: LeadStatusDef) {
    setHata('');
    try {
      await kaydet.mutateAsync(durum);
    } catch (err) {
      setHata(errorMessage(err));
    }
  }

  async function ekle(e: React.FormEvent) {
    e.preventDefault();
    setHata('');
    const ad = yeniAd.trim();
    if (!ad) { setHata('Durum adı giriniz.'); return; }

    const kod = kodUret(ad);
    if (!kod) { setHata('Bu ad bir kod üretmedi. Harf içeren bir ad giriniz.'); return; }
    if (durumlar.some((d) => d.code === kod)) {
      setHata('Bu ada çok benzeyen bir durum zaten var.'); return;
    }

    // Sona ekleniyor: yeni durum akışın sonunda beliriyor, sahibi
    // sırasını oklarla istediği yere taşıyor.
    const enSon = durumlar.reduce((m, d) => Math.max(m, d.sortOrder), 0);
    await yaz({
      id: uid('durum'),
      businessId: user?.activeBusinessId ?? '',
      code: kod, label: ad, sortOrder: enSon + 10, tone: yeniTon,
      isInitial: false, isClosed: false, isWon: false, active: true,
    });
    setYeniAd('');
  }

  /** İki durumun sırasını takas eder. */
  async function tasi(dizin: number, yon: -1 | 1) {
    const a = durumlar[dizin];
    const b = durumlar[dizin + yon];
    if (!a || !b) return;
    await yaz({ ...a, sortOrder: b.sortOrder });
    await yaz({ ...b, sortOrder: a.sortOrder });
  }

  async function kaldir(durum: LeadStatusDef) {
    setHata('');
    try {
      await sil.mutateAsync(durum.id);
    } catch (err) {
      setHata(errorMessage(err));
    }
  }

  return (
    <QueryBoundary isLoading={isLoading} error={error}>
      <Seo title="Müşteri Adayı Durumları" noindex />

      <div className="mb-4">
        <Link to="/panel/musteri-adaylari" className="text-sm text-brand-muted hover:text-brand">
          ← Müşteri adayları
        </Link>
      </div>

      <header className="mb-6">
        <h1 className="font-heading text-2xl font-bold text-brand">Müşteri Adayı Durumları</h1>
        <p className="mt-1 text-sm text-brand-muted">
          Takip akışınızı buradan düzenlersiniz. Durum adını değiştirmek mevcut
          kayıtları bozmaz; kayıtlar adı değil, değişmeyen bir kodu taşır.
        </p>
      </header>

      {hata && <Alert kind="error" className="mb-4">{hata}</Alert>}

      <div className="card mb-4 overflow-x-auto">
        <table className="w-full min-w-[46rem] text-sm">
          <caption className="sr-only">Müşteri adayı durumları</caption>
          <thead>
            <tr className="border-b border-line text-left text-brand-muted">
              <th scope="col" className="px-4 py-3 font-medium">Sıra</th>
              <th scope="col" className="px-4 py-3 font-medium">Ad</th>
              <th scope="col" className="px-4 py-3 font-medium">Renk</th>
              <th scope="col" className="px-4 py-3 font-medium">Başlangıç</th>
              <th scope="col" className="px-4 py-3 font-medium">Kapanış</th>
              <th scope="col" className="px-4 py-3 font-medium">Rezervasyon</th>
              <th scope="col" className="px-4 py-3 font-medium">Kullanım</th>
              <th scope="col" className="px-4 py-3 font-medium">Durum</th>
              <th scope="col" className="px-4 py-3 font-medium"><span className="sr-only">İşlem</span></th>
            </tr>
          </thead>
          <tbody>
            {durumlar.map((d, i) => (
              <tr key={d.id} className={`border-b border-line last:border-0 ${d.active ? '' : 'opacity-60'}`}>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    <button type="button" className="px-1.5 text-brand-muted hover:text-brand disabled:opacity-30"
                      disabled={!duzenlenebilir || i === 0}
                      aria-label={`${d.label} yukarı taşı`}
                      onClick={() => { void tasi(i, -1); }}>↑</button>
                    <button type="button" className="px-1.5 text-brand-muted hover:text-brand disabled:opacity-30"
                      disabled={!duzenlenebilir || i === durumlar.length - 1}
                      aria-label={`${d.label} aşağı taşı`}
                      onClick={() => { void tasi(i, 1); }}>↓</button>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <input
                    className="field-input"
                    aria-label={`${d.label} adı`}
                    defaultValue={d.label}
                    disabled={!duzenlenebilir}
                    // Her tuşta yazmak yerine alandan çıkınca: durum adı
                    // düzenlenirken her harf bir istek göndermemeli.
                    onBlur={(e) => {
                      const yeni = e.target.value.trim();
                      if (yeni && yeni !== d.label) void yaz({ ...d, label: yeni });
                      else e.target.value = d.label;
                    }}
                  />
                  <span className="mt-1 block text-xs text-brand-muted">kod: {d.code}</span>
                </td>
                <td className="px-4 py-3">
                  <select
                    className="field-input"
                    aria-label={`${d.label} rengi`}
                    value={d.tone}
                    disabled={!duzenlenebilir}
                    onChange={(e) => { void yaz({ ...d, tone: e.target.value as LeadStatusTone }); }}
                  >
                    {LEAD_STATUS_TONES.map((t) => <option key={t} value={t}>{TON_ADI[t]}</option>)}
                  </select>
                  <span className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-xs ${TON_SINIFI[d.tone]}`}>
                    {d.label}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <input type="radio" name="baslangic" checked={d.isInitial}
                    aria-label={`${d.label} başlangıç durumu olsun`}
                    disabled={!duzenlenebilir}
                    onChange={() => { void yaz({ ...d, isInitial: true, isClosed: false }); }} />
                </td>
                <td className="px-4 py-3">
                  <input type="checkbox" checked={d.isClosed}
                    aria-label={`${d.label} kapanmış sayılsın`}
                    // Başlangıç durumu kapanmış olamaz: yeni gelen her
                    // aday anında takip listesinden düşerdi.
                    disabled={!duzenlenebilir || d.isInitial}
                    onChange={(e) => { void yaz({ ...d, isClosed: e.target.checked }); }} />
                </td>
                <td className="px-4 py-3">
                  <input type="radio" name="kazanim" checked={d.isWon}
                    aria-label={`${d.label} rezervasyona dönüş sayılsın`}
                    disabled={!duzenlenebilir}
                    onChange={() => { void yaz({ ...d, isWon: true, isClosed: true }); }} />
                </td>
                <td className="px-4 py-3 text-brand-muted">{kullanim(d.code)}</td>
                <td className="px-4 py-3">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={d.active}
                      aria-label={`${d.label} kullanımda`}
                      disabled={!duzenlenebilir || d.isInitial}
                      onChange={(e) => { void yaz({ ...d, active: e.target.checked }); }} />
                    <span className="text-xs text-brand-muted">{d.active ? 'Kullanımda' : 'Pasif'}</span>
                  </label>
                </td>
                <td className="px-4 py-3 text-right">
                  {/*
                    Silme yalnızca hiç kullanılmamış durumlar için. Kullanımdaki
                    bir durumu silmek, o adayların durumunu yok etmek demek;
                    doğru işlem pasife almaktır.
                  */}
                  <button
                    type="button"
                    className="text-sm text-danger underline disabled:text-brand-muted disabled:no-underline"
                    disabled={!duzenlenebilir || d.isInitial || kullanim(d.code) > 0}
                    title={kullanim(d.code) > 0 ? 'Kullanımda; pasife alın' : undefined}
                    onClick={() => { void kaldir(d); }}
                  >
                    Sil
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {duzenlenebilir && (
        <form onSubmit={(e) => { void ekle(e); }} className="card p-5">
          <h2 className="mb-3 font-heading font-bold text-brand">Yeni durum ekle</h2>
          <div className="grid gap-3 sm:grid-cols-[1fr_14rem_auto] sm:items-end">
            <label className="block">
              <span className="field-label">Durum adı</span>
              <input className="field-input" value={yeniAd} placeholder="Yer Gösterildi"
                onChange={(e) => setYeniAd(e.target.value)} />
            </label>
            <label className="block">
              <span className="field-label">Renk</span>
              <select className="field-input" value={yeniTon}
                onChange={(e) => setYeniTon(e.target.value as LeadStatusTone)}>
                {LEAD_STATUS_TONES.map((t) => <option key={t} value={t}>{TON_ADI[t]}</option>)}
              </select>
            </label>
            <button type="submit" className="btn-primary text-white hover:text-white"
              disabled={kaydet.isPending}>
              {kaydet.isPending ? 'Ekleniyor…' : 'Ekle'}
            </button>
          </div>
          {yeniAd.trim() && (
            <p className="mt-2 text-xs text-brand-muted">Kod: {kodUret(yeniAd) || '—'}</p>
          )}
        </form>
      )}
    </QueryBoundary>
  );
}
