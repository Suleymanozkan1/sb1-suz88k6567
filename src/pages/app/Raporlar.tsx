import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Seo from '../../components/Seo';
import Alert from '../../components/Alert';
import { useAuth } from '../../context/AuthContext';
import {
  useBusinesses, useHalls, useLeadStatuses, useLeads, useMenus, useReservationsWithBalances,
} from '../../lib/queries';
import { donusumRaporu } from '../../lib/lead';
import { QueryBoundary } from '../../components/QueryState';
import {
  balanceReport, channelReport, downloadCsv, monthReport, programReport,
  slotReport, summarize, toCsv, withinRange, type BalanceRow,
} from '../../lib/reports';
import { addDays, formatDate, formatMoney, formatNumber, formatPhone, todayIso } from '../../lib/format';
import { buildProgram, programIsEmpty } from '../../lib/program';
import { downloadProgramDocx } from '../../lib/programDocx';
import ProgramCizelgesi from '../../components/ProgramCizelgesi';
import { KEYS, read, write } from '../../lib/storage';
import { IconDownload, IconPrint } from '../../components/Icons';

type Tab = 'cizelge' | 'program' | 'ay' | 'bakiye' | 'seans' | 'kanal' | 'donusum';

const TABS: { key: Tab; label: string }[] = [
  { key: 'cizelge', label: 'Program raporu' },
  // Eski adı "Program bazlı rapor" idi; çizelge eklenince aynı sözcük iki
  // ayrı raporu anlatır olmuştu.
  { key: 'program', label: 'Organizasyon bazlı rapor' },
  { key: 'ay', label: 'Ay bazlı rapor' },
  // Şartnamedeki adı: sözleşme yapıldıktan sonra hangi paranın ne zaman
  // geleceğini gösteren ekran.
  { key: 'bakiye', label: 'Gelecek Kaporalar ve Ödemeler' },
  { key: 'seans', label: 'Gündüz / Gece' },
  { key: 'kanal', label: 'Ulaşım kanalı' },
  { key: 'donusum', label: 'Görüşme ve dönüşüm' },
];

const TAB_KEYS = TABS.map((t) => t.key);

export default function Raporlar() {
  const { user, can } = useAuth();
  const { reservations, colors, balance, isLoading, error } = useReservationsWithBalances();
  const { data: halls = [] } = useHalls();
  const { data: businesses = [] } = useBusinesses();
  const { data: menus = [] } = useMenus();
  const { data: adaylar = [] } = useLeads();
  const { data: adayDurumlari = [] } = useLeadStatuses();
  const [params] = useSearchParams();
  const istenenTab = params.get('tab');
  const [tab, setTab] = useState<Tab>(
    istenenTab && (TAB_KEYS as string[]).includes(istenenTab) ? (istenenTab as Tab) : 'cizelge',
  );
  // Boş aralık "tüm kayıtlar" demektir ve diğer raporlar bunu bekliyor;
  // varsayılanı bu hafta yapmak onları sessizce daraltırdı. Çizelge kendi
  // içinde bu haftaya düşer.
  const [from, setFrom] = useState(() => params.get('from') ?? '');
  const [to, setTo] = useState(() => params.get('to') ?? '');
  const [notlar, setNotlar] = useState(() => read<string>(KEYS.programNotes, ''));
  const currency = user?.currency ?? 'TL';

  // Notlar bu tarayıcıda saklanır: rapor her açılışta yeniden yazılmasın.
  useEffect(() => { write(KEYS.programNotes, notlar); }, [notlar]);

  const scoped = useMemo(
    () => reservations.filter((r) => r.status !== 'İptal' && withinRange(r.date, { from, to })),
    [reservations, from, to],
  );

  const totals = useMemo(() => summarize(scoped, balance), [scoped, balance]);
  const programs = useMemo(() => programReport(scoped, balance), [scoped, balance]);
  const months = useMemo(() => monthReport(scoped, balance), [scoped, balance]);
  const balances = useMemo(() => balanceReport(scoped, balance), [scoped, balance]);
  const slots = useMemo(() => slotReport(scoped, balance), [scoped, balance]);
  const channels = useMemo(() => channelReport(scoped, balance), [scoped, balance]);

  /*
    Dönüşüm raporu rezervasyonlardan değil ADAYLARDAN çıkıyor: "kaç kişi
    geldi, kaçı rezervasyona döndü" sorusunun paydası satılmış düğünler
    değil, görüşülen müşterilerdir.
  */
  const donusum = useMemo(
    () => donusumRaporu(
      adaylar.filter((l) => withinRange(l.meetingDate || l.createdAt.slice(0, 10), { from, to })),
      adayDurumlari,
    ),
    [adaylar, adayDurumlari, from, to],
  );

  // Günü geçmiş alacaklar ayrıca sayılıyor: listenin başında durmaları
  // yetmez, kaç tane ve ne kadar olduğu tek bakışta görünmeli.
  const geciken = useMemo(() => balances.filter((b) => b.overdue), [balances]);
  const gecikenSayisi = geciken.length;
  const gecikenTutar = geciken.reduce((t, b) => t + b.remaining, 0);

  const aktifIsletmeAdi =
    businesses.find((b) => b.id === user?.activeBusinessId)?.name ?? businesses[0]?.name ?? 'Program';

  // Aralık seçilmediyse çizelge bu haftayı gösterir; boş bir çizelge
  // kullanıcıya hiçbir şey anlatmaz.
  const aralikSecilmedi = !from || !to;
  const cizelgeFrom = from || todayIso();
  const cizelgeTo = to || addDays(cizelgeFrom, 6);

  const cizelge = useMemo(
    () => buildProgram({ from: cizelgeFrom, to: cizelgeTo, halls, reservations, menus, colors }),
    [cizelgeFrom, cizelgeTo, halls, reservations, menus, colors],
  );

  if (!can('rapor.goruntule')) {
    return <Alert kind="error">Raporları görüntüleme yetkiniz bulunmuyor.</Alert>;
  }

  function exportCsv() {
    let csv = '';
    if (tab === 'program') {
      csv = toCsv(
        ['Organizasyon', 'Adet', 'Davetli', 'Toplam', 'Tahsilat', 'Kalan'],
        programs.map((p) => [p.organizationType, p.count, p.guests, p.total, p.collected, p.remaining]),
      );
    } else if (tab === 'ay') {
      csv = toCsv(
        ['Ay', 'Adet', 'Davetli', 'Toplam', 'Tahsilat', 'Kalan'],
        months.map((m) => [m.label, m.count, m.guests, m.total, m.collected, m.remaining]),
      );
    } else if (tab === 'bakiye') {
      csv = toCsv(
        ['Kod', 'Tarih', 'Durum', 'Müşteri', 'Telefon', 'Toplam', 'Ödenen',
          'Son tahsilat tarihi', 'Son tahsilat tutarı', 'Son tahsilat tipi', 'Kalan'],
        balances.map((b) => [
          b.reservation.code, formatDate(b.reservation.date), vadeMetni(b),
          b.reservation.customerName, formatPhone(b.reservation.customerPhone),
          b.reservation.totalAmount, b.paid,
          b.lastPayment ? formatDate(b.lastPayment.date) : '',
          b.lastPayment ? b.lastPayment.amount : '',
          b.lastPayment?.method ?? '',
          b.remaining,
        ]),
      );
    } else if (tab === 'donusum') {
      csv = toCsv(
        ['Ay', 'Kayıt', 'Salona gelen', 'Teklif', 'Rezervasyon', 'Olumsuz', 'Dönüşüm (%)'],
        donusum.map((d) => [
          d.ay, d.kayit, d.gelen, d.teklif, d.rezervasyon, d.olumsuz,
          d.donusumOrani.toFixed(1),
        ]),
      );
    } else if (tab === 'kanal') {
      csv = toCsv(
        ['Kanal', 'Adet', 'Pay (%)', 'Açıklama', 'Davetli', 'Toplam', 'Tahsilat', 'Kalan'],
        channels.map((k) => [
          k.channel, k.count, k.share.toFixed(1), k.detail,
          k.guests, k.total, k.collected, k.remaining,
        ]),
      );
    } else {
      csv = toCsv(
        ['Seans', 'Adet', 'Davetli', 'Toplam', 'Tahsilat', 'Kalan'],
        slots.map((s) => [s.slot, s.count, s.guests, s.total, s.collected, s.remaining]),
      );
    }
    downloadCsv(`rapor-${tab}-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }

  function indirWord() {
    downloadProgramDocx(cizelge, {
      businessName: aktifIsletmeAdi,
      from: cizelgeFrom, to: cizelgeTo, notes: notlar,
    });
  }

  const maxProgram = Math.max(1, ...programs.map((p) => p.total));
  const maxMonth = Math.max(1, ...months.map((m) => m.count));

  return (
    <QueryBoundary isLoading={isLoading} error={error}>
      <Seo title="Raporlar - Sahra Takip Panel" noindex />

      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-2xl font-bold text-brand">Raporlar</h1>
        <div className="flex gap-2">
          {tab === 'cizelge' ? (
            <button
              type="button"
              onClick={indirWord}
              disabled={programIsEmpty(cizelge)}
              className="btn-outline btn-sm disabled:cursor-not-allowed disabled:opacity-50"
            >
              <IconDownload size={16} /> Word indir
            </button>
          ) : (
            <button type="button" onClick={exportCsv} className="btn-outline btn-sm">
              <IconDownload size={16} /> CSV indir
            </button>
          )}
          <button type="button" onClick={() => window.print()} className="btn-outline btn-sm">
            <IconPrint size={16} /> Yazdır
          </button>
        </div>
      </div>

      <form className="no-print card mb-5 grid gap-3 p-4 sm:grid-cols-3" onSubmit={(e) => e.preventDefault()}>
        <div>
          <label htmlFor="rp-from" className="field-label">Başlangıç tarihi</label>
          <input id="rp-from" type="date" className="field-input" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label htmlFor="rp-to" className="field-label">Bitiş tarihi</label>
          <input id="rp-to" type="date" className="field-input" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="flex items-end">
          {tab === 'cizelge' ? (
            // Çizelge tarih aralığı olmadan çizilemez; temizlemek yerine
            // bu haftaya döner.
            <button
              type="button"
              className="btn-outline w-full"
              onClick={() => { setFrom(cizelgeFrom); setTo(cizelgeTo); }}
            >
              Bu hafta
            </button>
          ) : (
            <button type="button" className="btn-outline w-full" onClick={() => { setFrom(''); setTo(''); }}>
              Tarih aralığını temizle
            </button>
          )}
        </div>
      </form>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Mini label="Rezervasyon" value={formatNumber(totals.count)} />
        <Mini label="Davetli" value={formatNumber(totals.guests)} />
        <Mini label="Toplam ciro" value={formatMoney(totals.total, currency)} />
        <Mini label="Tahsil edilen" value={formatMoney(totals.collected, currency)} />
        <Mini label="Kalan alacak" value={formatMoney(totals.remaining, currency)} />
      </div>

      <div className="no-print mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Rapor türü">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`btn-sm rounded-full px-4 py-2 text-sm transition ${
              tab === t.key ? 'bg-accent-ink text-white' : 'border border-line bg-white text-brand hover:border-accent-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <section className="card p-5" role="tabpanel" aria-label={TABS.find((t) => t.key === tab)?.label}>
        {tab === 'cizelge' ? (
          <>
            {aralikSecilmedi && (
              <p className="no-print mb-3 text-sm text-brand-muted">
                Tarih aralığı seçilmedi; {formatDate(cizelgeFrom)} - {formatDate(cizelgeTo)} arası gösteriliyor.
              </p>
            )}
            <ProgramCizelgesi table={cizelge} />
            <div className="no-print mt-5">
              <label htmlFor="rp-notlar" className="field-label">Ek notlar</label>
              <textarea
                id="rp-notlar"
                rows={4}
                className="field-input"
                placeholder="Örn. Cumartesi gündüz düğününde sahne 12:00'de kurulacak."
                value={notlar}
                onChange={(e) => setNotlar(e.target.value)}
                aria-describedby="rp-notlar-hint"
              />
              <p id="rp-notlar-hint" className="mt-1 text-xs text-brand-muted">
                Bu notlar çizelgenin altında ve Word çıktısında görünür.
              </p>
            </div>
            {/* Ekranda yukarıdaki alanın kopyası olmasın diye yalnızca çıktıda. */}
            {notlar.trim() && (
              <div className="print-only mt-5 border-t border-line pt-4">
                <h2 className="mb-1 font-heading text-sm font-bold uppercase text-brand">Ek Notlar</h2>
                <p className="whitespace-pre-line text-sm text-brand">{notlar}</p>
              </div>
            )}
          </>
        ) : scoped.length === 0 ? (
          <p className="py-10 text-center text-sm text-brand-muted">Seçilen tarih aralığında kayıt bulunmuyor.</p>
        ) : tab === 'program' ? (
          <>
            <div className="mb-6 space-y-3">
              {programs.map((p) => {
                const color = colors.find((c) => c.label === p.organizationType)?.color ?? '#47b2e4';
                return (
                  <div key={p.organizationType}>
                    <div className="mb-1 flex justify-between text-sm text-brand">
                      <span>{p.organizationType} ({p.count})</span>
                      <span>{formatMoney(p.total, currency)}</span>
                    </div>
                    <div className="h-2.5 rounded bg-surface">
                      <div className="h-full rounded" style={{ width: `${(p.total / maxProgram) * 100}%`, background: color }} />
                    </div>
                  </div>
                );
              })}
            </div>
            <Table
              headers={['Organizasyon', 'Adet', 'Davetli', 'Toplam', 'Tahsilat', 'Kalan']}
              rows={programs.map((p) => [
                p.organizationType, formatNumber(p.count), formatNumber(p.guests),
                formatMoney(p.total, currency), formatMoney(p.collected, currency), formatMoney(p.remaining, currency),
              ])}
            />
          </>
        ) : tab === 'ay' ? (
          <>
            <div className="mb-6 flex h-56 items-end gap-2 overflow-x-auto">
              {months.map((m) => (
                <div key={m.label} className="flex min-w-[52px] flex-1 flex-col items-center gap-1.5">
                  <span className="text-xs font-medium text-brand">{m.count}</span>
                  <div className="w-full rounded-t bg-accent-ink" style={{ height: `${Math.max(4, (m.count / maxMonth) * 150)}px` }} title={`${m.label}: ${m.count}`} />
                  <span className="text-center text-[10px] leading-tight text-brand-muted">{m.label}</span>
                </div>
              ))}
            </div>
            <Table
              headers={['Ay', 'Adet', 'Davetli', 'Toplam', 'Tahsilat', 'Kalan']}
              rows={months.map((m) => [
                m.label, formatNumber(m.count), formatNumber(m.guests),
                formatMoney(m.total, currency), formatMoney(m.collected, currency), formatMoney(m.remaining, currency),
              ])}
            />
          </>
        ) : tab === 'bakiye' ? (
          balances.length === 0 ? (
            <p className="py-10 text-center text-sm text-brand-muted">Kalan alacağı olan kayıt bulunmuyor.</p>
          ) : (
            <>
              {gecikenSayisi > 0 && (
                <Alert kind="warning" className="mb-4">
                  {gecikenSayisi} kaydın organizasyon günü geçtiği hâlde bakiyesi kapanmadı.
                  Toplam {formatMoney(gecikenTutar, currency)} tahsil edilmedi.
                </Alert>
              )}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-sm">
                  <thead>
                    <tr className="border-b border-line bg-surface text-left text-xs uppercase text-brand-muted">
                      <th className="px-3 py-2.5 font-medium">Kod</th>
                      <th className="px-3 py-2.5 font-medium">Tarih</th>
                      <th className="px-3 py-2.5 font-medium">Durum</th>
                      <th className="px-3 py-2.5 font-medium">Müşteri</th>
                      <th className="px-3 py-2.5 font-medium">Telefon</th>
                      <th className="px-3 py-2.5 text-right font-medium">Toplam</th>
                      <th className="px-3 py-2.5 text-right font-medium">Ödenen</th>
                      <th className="px-3 py-2.5 font-medium">Son tahsilat</th>
                      <th className="px-3 py-2.5 text-right font-medium">Kalan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {balances.map((b) => (
                      <tr key={b.reservation.id} className="border-b border-line/60 last:border-0">
                        <td className="px-3 py-2.5 font-mono text-xs text-brand-muted">{b.reservation.code}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-brand">{formatDate(b.reservation.date)}</td>
                        <td className={`px-3 py-2.5 whitespace-nowrap text-xs ${b.overdue ? 'font-medium text-[#b91c1c]' : 'text-brand-muted'}`}>
                          {vadeMetni(b)}
                        </td>
                        <td className="px-3 py-2.5">
                          <Link to={`/panel/rezervasyonlar/${b.reservation.id}`}>{b.reservation.customerName}</Link>
                        </td>
                        <td className="px-3 py-2.5 text-brand-muted">{formatPhone(b.reservation.customerPhone)}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right text-brand">{formatMoney(b.reservation.totalAmount, currency)}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right text-[#15803d]">{formatMoney(b.paid, currency)}</td>
                        {/*
                          Hesabın tabanı: "en son ne zaman, ne kadar aldık".
                          Tutar tek başına yeterli değil; tarihi olmadan
                          alacağın ne kadar beklediği görünmüyordu.
                        */}
                        <td className="whitespace-nowrap px-3 py-2.5 text-xs text-brand-muted">
                          {b.lastPayment ? (
                            <>
                              <span className="block text-brand">{formatMoney(b.lastPayment.amount, currency)}</span>
                              {formatDate(b.lastPayment.date)} · {b.lastPayment.method ?? b.lastPayment.source}
                            </>
                          ) : 'Tahsilat yok'}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right font-medium text-[#b91c1c]">{formatMoney(b.remaining, currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-line font-semibold">
                      <td className="px-3 py-2.5 text-brand" colSpan={8}>Toplam kalan alacak</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right text-[#b91c1c]">
                        {formatMoney(balances.reduce((s, b) => s + b.remaining, 0), currency)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )
        ) : tab === 'donusum' ? (
          donusum.length === 0 ? (
            <p className="py-10 text-center text-sm text-brand-muted">
              Seçilen tarih aralığında görüşme kaydı bulunmuyor.
            </p>
          ) : (
            <>
              {/*
                "Kayıt" ile "salona gelen" ayrı sütunlar: her kayıt bir
                görüşmedir, ama gelen kişi yüz yüze görüşülendir. İkisi
                tek sayıda toplanınca dönüşüm oranı anlamsız çıkıyordu.
              */}
              <Table
                headers={['Ay', 'Kayıt', 'Salona gelen', 'Teklif', 'Rezervasyon', 'Olumsuz', 'Dönüşüm']}
                rows={donusum.map((d) => [
                  d.ay, formatNumber(d.kayit), formatNumber(d.gelen), formatNumber(d.teklif),
                  formatNumber(d.rezervasyon), formatNumber(d.olumsuz),
                  `%${d.donusumOrani.toFixed(1)}`,
                ])}
              />
              <p className="mt-3 text-xs text-brand-muted">
                Dönüşüm oranı: rezervasyona dönen müşteri / salona gelen kişi. Teklif sayısı
                yalnızca fiyat girilmiş kayıtları sayar; rakam konuşulmamış bir görüşme teklif
                sayılsaydı oran olduğundan iyi görünürdü.
              </p>
            </>
          )
        ) : tab === 'seans' ? (
          <Table
            headers={['Seans', 'Adet', 'Davetli', 'Toplam', 'Tahsilat', 'Kalan']}
            rows={slots.map((s) => [
              s.slot, formatNumber(s.count), formatNumber(s.guests),
              formatMoney(s.total, currency), formatMoney(s.collected, currency), formatMoney(s.remaining, currency),
            ])}
          />
        ) : (
          <>
            <Table
              headers={['Kanal', 'Adet', 'Pay', 'Açıklama', 'Davetli', 'Toplam', 'Tahsilat']}
              rows={channels.map((k) => [
                k.channel, formatNumber(k.count), `%${k.share.toFixed(1)}`,
                k.detail || '-', formatNumber(k.guests),
                formatMoney(k.total, currency), formatMoney(k.collected, currency),
              ])}
            />
            {/*
              Kanalı boş bırakılmış kayıtlar gizlenmiyor. Gizlenselerdi
              yüzdeler yalnızca doldurulmuş kayıtlar üzerinden hesaplanır ve
              Instagram gerçekte olduğundan güçlü görünürdü.
            */}
            <p className="mt-3 text-xs text-brand-muted">
              Kanalı kaydedilmemiş rezervasyonlar &quot;Belirtilmemiş&quot; satırında sayılır.
              Bu satırın büyüklüğü, alanın ne kadar doldurulduğunu gösterir.
            </p>
          </>
        )}
      </section>
    </QueryBoundary>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="card px-4 py-3">
      <p className="text-xs text-brand-muted">{label}</p>
      <p className="mt-0.5 font-heading font-bold text-brand">{value}</p>
    </div>
  );
}

function Table({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-line bg-surface text-left text-xs uppercase text-brand-muted">
            {headers.map((h, i) => (
              <th key={h} className={`px-3 py-2.5 font-medium ${i > 0 ? 'text-right' : ''}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row[0]} className="border-b border-line/60 last:border-0">
              {row.map((cell, i) => (
                <td key={i} className={`px-3 py-2.5 ${i > 0 ? 'text-right' : ''} text-brand`}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Alacağın vadesi organizasyon günüdür: o güne kadar tahsil edilmesi
 * beklenir. Gün sayısı ham olarak değil, okunacak biçimde yazılıyor.
 */
function vadeMetni(b: BalanceRow): string {
  if (b.daysLeft < 0) return `${Math.abs(b.daysLeft)} gün gecikti`;
  if (b.daysLeft === 0) return 'Bugün';
  return `${b.daysLeft} gün kaldı`;
}
