import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import Seo from '../../components/Seo';
import StatCard from '../../components/StatCard';
import KasaDagilimKarti from '../../components/KasaDagilimKarti';
import StokDurumu from '../../components/StokDurumu';
import KurSeridi from '../../components/KurSeridi';
import HavaDurumu from '../../components/HavaDurumu';
import { useAuth } from '../../context/AuthContext';
import {
  useCashFlow, useLeadStatuses, useLeads, useReservationsWithBalances,
} from '../../lib/queries';
import { leadOzeti, opsiyonuYaklasanlar, toplamAday } from '../../lib/lead';
import { kasaDagilimi, kasaHareketleri } from '../../lib/kasa';
import type { CustomerLead, LeadStatusDef } from '../../types';
import { QueryBoundary } from '../../components/QueryState';
import { formatDate, formatMoney, formatNumber, todayIso } from '../../lib/format';
import { programReport, reservationIncome, summarize } from '../../lib/reports';
import { IconCalendar, IconPlus, IconWallet } from '../../components/Icons';
import { MONTH_NAMES } from '../../data/constants';

/**
 * Özet sayfası.
 *
 * Yalnızca İÇİNDE BULUNULAN AYI gösterir. Geçmiş dönem toplamları,
 * yıllık ciro ve dönem karşılaştırmaları Raporlar ekranına taşındı:
 * günlük işini yapmak için ekranı açan personelin önünde duran her
 * geçmiş dönem rakamı, bugün yapılacak işi aşağı itiyordu.
 */
export default function Dashboard() {
  const { user } = useAuth();
  const { reservations, payments, colors, balance, isLoading, error } = useReservationsWithBalances();
  const { data: adaylar = [] } = useLeads();
  const { data: adayDurumlari = [] } = useLeadStatuses();
  const cashQuery = useCashFlow();
  const today = todayIso();
  const currency = user?.currency ?? 'TL';

  const ayOneki = today.slice(0, 7);
  const ayAdi = MONTH_NAMES[new Date().getMonth()];

  const active = useMemo(() => reservations.filter((r) => r.status !== 'İptal'), [reservations]);

  /** Bu ay GERÇEKLEŞEN organizasyonlar. */
  const ayinKayitlari = useMemo(
    () => active.filter((r) => r.date.startsWith(ayOneki)),
    [active, ayOneki],
  );

  /*
    Bu ay AÇILAN kayıtlar ayrı bir soru: "bu ay kaç düğün sattık" ile
    "bu ay kaç düğün var" aynı şey değil. İkisi tek sayıda toplanınca
    satış performansı, takvim yoğunluğunun içinde kaybolur.
  */
  const aySatilan = useMemo(
    () => active.filter((r) => (r.createdAt || '').slice(0, 7) === ayOneki),
    [active, ayOneki],
  );

  /** Bu ayın YAKLAŞAN organizasyonları: bugün ve sonrası. */
  const yaklasan = useMemo(
    () => ayinKayitlari.filter((r) => r.date >= today).sort((a, b) => a.date.localeCompare(b.date)),
    [ayinKayitlari, today],
  );
  const yaklasanKisi = useMemo(
    () => yaklasan.reduce((s, r) => s + (r.guestCount || 0), 0),
    [yaklasan],
  );

  const ayToplam = useMemo(() => summarize(ayinKayitlari, balance), [ayinKayitlari, balance]);

  const cash = useMemo(() => cashQuery.data ?? [], [cashQuery.data]);
  const rezervasyonGelirleri = useMemo(
    () => reservationIncome(reservations, payments),
    [reservations, payments],
  );
  /*
    Kasa durumu TÜM zamanları kapsıyor, ayı değil: kasada duran para,
    hangi ay girdiğine bakmaksızın oradadır. Aylık kesit gösterilseydi
    ayın ilk günü kasa sıfır görünürdü.
  */
  const dagilim = useMemo(
    () => kasaDagilimi(kasaHareketleri(cash, rezervasyonGelirleri)),
    [cash, rezervasyonGelirleri],
  );

  const opsiyonlular = useMemo(
    () => opsiyonuYaklasanlar(adaylar, adayDurumlari),
    [adaylar, adayDurumlari],
  );

  const ayinProgramlari = useMemo(
    () => programReport(ayinKayitlari, balance),
    [ayinKayitlari, balance],
  );

  return (
    <QueryBoundary isLoading={isLoading} error={error}>
      <Seo title="Özet - Sahra Takip Panel" noindex />

      {/*
        Döviz/altın şeridi sayfanın EN ÜSTÜNDE (madde 28). Aşağı
        konsaydı, günlük işi yapmak için ekranı açan kimse kaydırmadan
        görmezdi ve ayrı bir siteye bakmaya devam ederdi.
      */}
      <KurSeridi />

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold text-brand">Hoş geldiniz, {user?.fullName}</h1>
          <p className="text-sm text-brand-muted">
            {ayAdi} {new Date().getFullYear()} özeti · geçmiş dönemler{' '}
            <Link to="/panel/raporlar">Raporlar</Link> bölümünde
          </p>
          {/* Güncel hava durumu (madde 29); veri yoksa satır hiç çıkmıyor. */}
          <HavaDurumu className="mt-1" />
        </div>
        <Link to="/panel/rezervasyonlar/yeni" className="btn-primary text-white hover:text-white">
          <IconPlus size={18} /> Yeni Rezervasyon
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="grid gap-4 sm:grid-cols-2">
          <StatCard
            label={`${ayAdi} ayı toplam program`}
            value={`${formatNumber(ayinKayitlari.length)} kayıt`}
            hint={`${formatNumber(yaklasan.length)} tanesi bugün ve sonrasında`}
            icon={IconCalendar}
            tone="accent"
          />
          <StatCard
            label="Bu ay satılan düğün"
            value={formatNumber(aySatilan.length)}
            hint={`${ayAdi} ayında açılan sözleşme sayısı`}
            icon={IconPlus}
            tone="brand"
          />
          <StatCard
            label={`${ayAdi} ayı cirosu`}
            value={formatMoney(ayToplam.total, currency)}
            hint={`Tahsil edilen ${formatMoney(ayToplam.collected, currency)}`}
            icon={IconWallet}
            tone="brand"
          />
          <StatCard
            label="Bu ayın kalan alacağı"
            value={formatMoney(ayToplam.remaining, currency)}
            hint={`${ayAdi} ayı organizasyonlarından`}
            icon={IconWallet}
            tone={ayToplam.remaining > 0 ? 'danger' : 'success'}
          />
        </div>

        {/*
          Kasa durumu sağ üstte ve dağılımı şifreyle açılıyor: salonun
          kasasında ne kadar nakit olduğu, ekranın yanından geçen herkesin
          göreceği bir bilgi olmamalı.
        */}
        <KasaDagilimKarti dagilim={dagilim} currency={currency} email={user?.email} />
      </div>

      {/*
        Müşteri takip özeti. Geciken takip ile bugün aranacak ayrı duruyor:
        ikisi tek sayıda toplanınca gecikmiş iş, günlük işin içinde kaybolur.
      */}
      <section className="card mt-6 p-5" aria-labelledby="lead-title">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="lead-title" className="font-heading text-lg font-bold text-brand">Müşteri takip</h2>
          <Link to="/panel/musteri-adaylari" className="text-sm">Tümü →</Link>
        </div>

        {/*
          Opsiyon uyarısı (madde 18). Modal yerine bu bandın seçilmesi
          bilinçli: her açılışta pencere kapatan personel birkaç günde
          okumadan kapatır hâle gelir. Uyarı işin yapıldığı ekranda ve
          tıklanabilir duruyor.
        */}
        {opsiyonlular.length > 0 && (
          <div className="mb-4 rounded-md bg-[#fef3c7] px-4 py-3 text-sm text-[#92400e]" role="status">
            <p className="mb-1 font-medium">
              {opsiyonlular.length} müşterinin opsiyon tarihi yaklaşıyor.
              Müşterilerle tekrar iletişime geçilmesi gerekiyor.
            </p>
            <ul className="flex flex-wrap gap-x-4 gap-y-1">
              {opsiyonlular.slice(0, 6).map((l) => (
                <li key={l.id}>
                  <Link to={`/panel/musteri-adaylari/${l.id}`} className="underline">
                    {l.name}
                  </Link>
                  {' · '}
                  {formatDate(l.optionDate as string)}
                </li>
              ))}
            </ul>
          </div>
        )}

        <LeadOzetKutulari adaylar={adaylar} durumlar={adayDurumlari} />
      </section>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <section className="card p-5 lg:col-span-2" aria-labelledby="upcoming-title">
          <div className="mb-4 flex items-center justify-between">
            <h2 id="upcoming-title" className="font-heading text-lg font-bold text-brand">
              {ayAdi} ayı yaklaşan organizasyonları
            </h2>
            <Link to="/panel/rezervasyonlar" className="text-sm">Tümü →</Link>
          </div>

          {yaklasan.length === 0 ? (
            <p className="py-8 text-center text-sm text-brand-muted">
              {ayAdi} ayında kalan organizasyon bulunmuyor.{' '}
              <Link to="/panel/rezervasyonlar/yeni">Yeni rezervasyon ekleyin</Link>.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <caption className="sr-only">{ayAdi} ayı yaklaşan organizasyonları</caption>
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase text-brand-muted">
                    <th className="pb-2 font-medium">Tarih</th>
                    <th className="pb-2 font-medium">Müşteri</th>
                    <th className="pb-2 font-medium">Organizasyon</th>
                    <th className="pb-2 text-right font-medium">Kişi</th>
                    <th className="pb-2 text-right font-medium">Kalan</th>
                  </tr>
                </thead>
                <tbody>
                  {yaklasan.map((r) => {
                    const color = colors.find((c) => c.key === r.colorKey)?.color ?? '#47b2e4';
                    return (
                      <tr key={r.id} className="border-b border-line/60 last:border-0">
                        <td className="whitespace-nowrap py-2.5 text-brand">
                          {formatDate(r.date)}
                          <span className="ml-1 text-xs text-brand-muted">{r.slot}</span>
                        </td>
                        <td className="py-2.5">
                          <Link to={`/panel/rezervasyonlar/${r.id}`}>{r.customerName}</Link>
                        </td>
                        <td className="py-2.5">
                          <span className="inline-flex items-center gap-1.5 text-brand">
                            <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
                            {r.organizationType}
                          </span>
                        </td>
                        <td className="py-2.5 text-right text-brand">{formatNumber(r.guestCount)}</td>
                        <td className="py-2.5 text-right font-medium text-brand">
                          {formatMoney(balance.remaining(r), r.currency)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {/*
                  Toplam kişi sayısı tablonun altında: mutfak ve servis
                  planlaması bu sayıya bakıyor, satır satır toplamak
                  gerekmemeli.
                */}
                <tfoot>
                  <tr className="border-t-2 border-line font-medium text-brand">
                    <td className="pt-2.5" colSpan={3}>Toplam kişi sayısı</td>
                    <td className="pt-2.5 text-right">{formatNumber(yaklasanKisi)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </section>

        {/*
          Stok, yaklaşan organizasyonların hemen altında (madde 6):
          o organizasyonlara yetecek malzeme var mı sorusu aynı ekranda
          sorulup cevaplanıyor.
        */}
        <section className="card p-5" aria-labelledby="program-title">
          <h2 id="program-title" className="mb-4 font-heading text-lg font-bold text-brand">
            {ayAdi} ayı program dağılımı
          </h2>
          {ayinProgramlari.length === 0 ? (
            <p className="py-6 text-center text-sm text-brand-muted">Bu ay kayıt bulunmuyor.</p>
          ) : (
            <ul className="space-y-3">
              {ayinProgramlari.map((p) => {
                const max = Math.max(...ayinProgramlari.map((x) => x.count));
                const color = colors.find((c) => c.label === p.organizationType)?.color ?? '#47b2e4';
                return (
                  <li key={p.organizationType}>
                    <div className="mb-1 flex justify-between text-xs text-brand">
                      <span>{p.organizationType}</span>
                      <span>{p.count} kayıt</span>
                    </div>
                    <div
                      className="h-2 rounded bg-surface"
                      title={`${p.organizationType}: ${p.count} kayıt · ${formatMoney(p.total, currency)}`}
                    >
                      <div className="h-full rounded" style={{ width: `${(p.count / max) * 100}%`, background: color }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <div className="lg:col-span-2">
          <StokDurumu />
        </div>
      </div>
    </QueryBoundary>
  );
}

/**
 * Dashboard'daki müşteri takip sayıları; her biri listedeki bir süzgece gider.
 *
 * Kutular sabit değil, işletmenin tanımladığı durumlardan üretiliyor.
 * Sabit liste, sahibi yeni bir durum eklediğinde o durumu dashboard'da
 * görünmez bırakırdı.
 */
function LeadOzetKutulari(
  { adaylar, durumlar }: { adaylar: CustomerLead[]; durumlar: LeadStatusDef[] },
) {
  const kutular = leadOzeti(adaylar, durumlar);

  return (
    <>
      <p className="mb-3 text-sm text-brand-muted">
        Toplam <strong className="text-brand">{toplamAday(adaylar)}</strong> müşteri adayı
      </p>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {kutular.map((k) => (
          <li key={k.anahtar}>
            <Link
              to={k.durumKodu
                ? `/panel/musteri-adaylari?durum=${encodeURIComponent(k.durumKodu)}`
                : `/panel/musteri-adaylari?suzgec=${k.anahtar}`}
              className="block rounded-lg border border-line px-3 py-2.5 hover:border-brand"
              title={`${k.etiket}: ${k.deger} aday`}
            >
              <span className="block text-xs text-brand-muted">{k.etiket}</span>
              <span className={`mt-0.5 block font-heading text-xl font-bold ${VURGU[k.ton]}`}>
                {k.deger}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

/** Sayının rengi. Tonun kendisi veritabanından, karşılığı buradan. */
const VURGU: Record<LeadStatusDef['tone'], string> = {
  bekleyen: 'text-[#92600e]',
  ilerleyen: 'text-brand',
  olumlu: 'text-[#15803d]',
  teklif: 'text-[#5b21b6]',
  dikkat: 'text-[#b91c1c]',
  kapali: 'text-brand-muted',
  notr: 'text-brand',
};
