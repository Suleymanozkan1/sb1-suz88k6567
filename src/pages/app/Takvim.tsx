import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Seo from '../../components/Seo';
import { useReservationsWithBalances, useSpecialDays } from '../../lib/queries';
import { gunlereGore } from '../../lib/ozelGun';
import { QueryBoundary } from '../../components/QueryState';
import { DAY_NAMES_SHORT, MONTH_NAMES } from '../../data/constants';
import { formatMoney, okunakliMetinRengi, toIso, todayIso } from '../../lib/format';
import { IconPlus } from '../../components/Icons';
import type { Reservation } from '../../types';
import { OZEL_GUN_ADI, OZEL_GUN_RENGI } from '../../types';

/** yyyy-mm-dd -> "01.07.2026"; hücrede ayın adı yazmadığı için tam tarih. */
function gunMetni(iso: string): string {
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
}

/**
 * Etiketin ikinci satırı: "14:00 - 18:00 (Düğün)". Saat girilmemiş eski
 * kayıtlarda saat yerine seans adı yazılıyor, satır hiç boş kalmıyor.
 */
function saatMetni(r: Reservation): string {
  const saat = r.startTime && r.endTime ? `${r.startTime} - ${r.endTime}` : (r.startTime ?? r.slot);
  return `${saat} (${r.organizationType})`;
}

export default function Takvim() {
  const { reservations, colors, balance, isLoading, error } = useReservationsWithBalances();
  const { data: ozelGunler = [] } = useSpecialDays();
  /*
    Bugün metin olarak tutuluyor (yyyy-mm-dd). `new Date()` her render'da
    yeni bir nesne üretip useMemo bağımlılıklarını boşuna bozuyordu.
  */
  const today = todayIso();
  const buYil = Number(today.slice(0, 4));
  const buAy = Number(today.slice(5, 7)) - 1;
  const [year, setYear] = useState(buYil);
  const [month, setMonth] = useState(buAy);
  const [selected, setSelected] = useState<string | null>(null);

  const byDate = useMemo(() => {
    const map = new Map<string, Reservation[]>();
    reservations
      .filter((r) => r.status !== 'İptal')
      .forEach((r) => {
        const list = map.get(r.date) ?? [];
        list.push(r);
        map.set(r.date, list);
      });
    return map;
  }, [reservations]);

  /*
    Özel günler (madde 30) güne göre haritalanıyor: her hücrede listeyi
    baştan taramak, 42 hücrede 42 tarama demek olurdu.
  */
  const ozelGunHaritasi = useMemo(() => gunlereGore(ozelGunler), [ozelGunler]);

  const cells = useMemo(() => buildMonthGrid(year, month), [year, month]);

  /*
    Yıl listesi elle yazılmıyor: salonlar 3-4 yıl sonrasına rezervasyon
    alıyor. Listede hem bugünün yılı hem de kayıtlı en uzak düğün yılı
    bulunsun ki ileri tarihli bir rezervasyona ok tuşuyla yol almadan
    gidilebilsin.
  */
  const yillar = useMemo(() => {
    let enAz = buYil - 2;
    let enCok = buYil + 3;
    reservations.forEach((r) => {
      const y = Number(r.date.slice(0, 4));
      if (Number.isFinite(y)) {
        if (y < enAz) enAz = y;
        if (y > enCok) enCok = y;
      }
    });
    if (year < enAz) enAz = year;
    if (year > enCok) enCok = year;
    return Array.from({ length: enCok - enAz + 1 }, (_, i) => enAz + i);
  }, [reservations, year, buYil]);

  const selectedItems = selected ? byDate.get(selected) ?? [] : [];

  return (
    <QueryBoundary isLoading={isLoading} error={error}>
      <Seo title="Rezervasyon Takvimi - Sahra Takip Panel" noindex />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-2xl font-bold text-brand">Rezervasyon Takvimi</h1>
        <div className="flex flex-wrap gap-2">
          <Link to="/panel/ozel-gunler" className="btn-outline">Özel Günler</Link>
          <Link to="/panel/rezervasyonlar/yeni" className="btn-primary text-white hover:text-white">
            <IconPlus size={18} /> Yeni Rezervasyon
          </Link>
        </div>
      </div>

      {/*
        Sağdaki "ayın kayıtları" listesi kaldırıldı (madde 7): takvimin
        kendisi zaten ayın tamamını gösteriyordu ve aynı kayıtlar yan
        yana iki kez duruyordu. Panel yalnızca BİR GÜN seçiliyken
        açılıyor; seçim yokken takvim tam genişlikte.
      */}
      <div className={`grid gap-6 ${selected ? 'lg:grid-cols-3' : ''}`}>
        <section className={`card p-4 ${selected ? 'lg:col-span-2' : ''}`}>
          {/*
            Ay ileri/geri okları yerine on iki ayın tamamı şerit hâlinde.
            Eylülden Marta gitmek altı tıklama sürüyordu; artık bir tane.
            Düğmeler ayrıca ok tuşundan çok daha büyük bir hedef.
          */}
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            {MONTH_NAMES.map((ad, i) => (
              <button
                key={ad}
                type="button"
                onClick={() => { setMonth(i); setSelected(null); }}
                aria-pressed={i === month}
                className={`rounded border px-3 py-1.5 text-sm font-semibold transition ${
                  i === month
                    ? 'border-accent-ink bg-accent-ink text-white'
                    : 'border-line bg-white text-brand hover:border-accent-ink hover:text-accent-ink'
                }`}
              >
                {ad}
              </button>
            ))}
            <label className="ml-auto flex items-center gap-2 text-sm text-brand-muted">
              <span className="sr-only">Yıl</span>
              <select
                value={year}
                onChange={(e) => { setYear(Number(e.target.value)); setSelected(null); }}
                aria-label="Yıl"
                className="rounded border border-line bg-white px-2 py-1.5 text-sm font-semibold text-brand"
              >
                {yillar.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </label>
            <button
              type="button"
              className="rounded border border-line px-3 py-1.5 text-sm font-semibold text-accent-ink hover:border-accent-ink"
              onClick={() => {
                setYear(buYil);
                setMonth(buAy);
                setSelected(null);
              }}
            >
              Bugün
            </button>
          </div>

          <h2 className="mb-3 rounded bg-brand py-2 text-center font-heading text-xl font-bold text-white">
            {MONTH_NAMES[month]} {year}
          </h2>

          {/*
            Punto büyüdüğü için hücreye tam tarih ve iki satırlık etiket
            sığması gerekiyor; dar ekranda hücreleri ezmek yerine ızgara
            yatay kaydırılıyor.
          */}
          <div className="overflow-x-auto">
            <div className="min-w-[840px]">
              <div className="grid grid-cols-7 gap-1 text-center text-sm font-semibold text-brand-muted">
                {DAY_NAMES_SHORT.map((d, i) => (
                  <span key={d} className={`rounded py-1.5 ${i >= 5 ? 'bg-[#fdf3d8] text-brand' : ''}`}>{d}</span>
                ))}
              </div>

              <div className="mt-1 grid grid-cols-7 gap-1">
                {cells.map(({ iso, ayIcinde, haftaSonu }) => {
                  const items = byDate.get(iso) ?? [];
                  const ozel = ozelGunHaritasi.get(iso) ?? [];
                  const isToday = iso === today;
                  const isSelected = iso === selected;
                  const ay = Number(iso.slice(5, 7)) - 1;
                  /*
                    Özel gün ARIA etiketine de giriyor: renkli etiket
                    yalnızca gören kullanıcıya bilgi verir, ekran
                    okuyucuda bayram günü sıradan bir gün gibi duyulurdu.
                  */
                  const etiket = [
                    `${Number(iso.slice(8, 10))} ${MONTH_NAMES[ay]} ${iso.slice(0, 4)}`,
                    `${items.length} rezervasyon`,
                    ...ozel.map((g) => g.label),
                  ].join(', ');

                  return (
                    /*
                      Hücre tek bir düğme DEĞİL. Rezervasyon etiketleri
                      kendi bağlantıları: üstüne basınca kayıt doğrudan
                      açılıyor. Önce günü seçip sağdaki panelden kaydı
                      bulmak gerekiyordu -- aynı şeye iki tıklama.

                      Günü seçen düğme hücrenin ARKASINDA, tam boy
                      (`absolute inset-0`): boş bir yere basmak da günü
                      seçiyor. İçerik `pointer-events-none`, etiketler
                      yeniden açıyor; böylece düğme içine düğme girmiyor.
                    */
                    <div
                      key={iso}
                      className={`relative min-h-[150px] rounded border transition ${
                        isSelected
                          ? 'border-accent-ink bg-accent-ink/5'
                          : isToday
                            ? 'border-accent-ink bg-[#fffdf4]'
                            : /*
                                Hafta sonu sütunları ayrı zeminde: salonun
                                dolu günleri bunlar, boş bir Cumartesi bir
                                bakışta görülebilmeli. Rakip programın sarı
                                sütunu okunaklı olsun diye açık tonda.
                              */
                              `border-line hover:border-accent-ink/50 ${
                                !ayIcinde ? 'bg-surface/70' : haftaSonu ? 'bg-[#fdf3d8]' : 'bg-white'
                              }`
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setSelected(isSelected ? null : iso)}
                        aria-pressed={isSelected}
                        aria-label={etiket}
                        className="absolute inset-0 h-full w-full rounded"
                      />

                      <div className="pointer-events-none relative p-2">
                        {/*
                          Tam tarih yazılıyor, yalnızca gün rakamı değil:
                          komşu ayların günleri de ızgarada durduğu için
                          "31" tek başına hangi aya ait belli olmuyordu.
                        */}
                        <span
                          className={`block text-center text-lg font-bold leading-none ${
                            isToday ? 'text-accent-ink' : ayIcinde ? 'text-brand' : 'text-brand-muted'
                          }`}
                        >
                          {gunMetni(iso)}
                        </span>

                        {/*
                          Özel gün, rezervasyonla aynı biçimde etiket:
                          önceki küçük nokta + minik yazı, ekrana uzaktan
                          bakan birine bayramı fark ettirmiyordu.
                        */}
                        {ozel.length > 0 && (
                          <div className="mt-1.5 space-y-1">
                            {ozel.slice(0, 2).map((g) => (
                              <span
                                key={g.id}
                                title={g.label}
                                className="block rounded px-1.5 py-1 text-center text-sm font-semibold leading-snug [overflow-wrap:anywhere] line-clamp-2"
                                style={{
                                  background: OZEL_GUN_RENGI[g.kind],
                                  color: okunakliMetinRengi(OZEL_GUN_RENGI[g.kind]),
                                }}
                              >
                                {g.label}
                              </span>
                            ))}
                          </div>
                        )}

                        <div className="pointer-events-auto mt-1.5 space-y-1">
                          {items.slice(0, 3).map((r) => {
                            const color = colors.find((c) => c.key === r.colorKey)?.color ?? '#47b2e4';
                            return (
                              <Link
                                key={r.id}
                                to={`/panel/rezervasyonlar/${r.id}`}
                                title={`${r.customerName} · ${saatMetni(r)}`}
                                /*
                                  İsim KIRPILMIYOR, alt satıra sarıyor.
                                  Punto büyüyünce hücreye sığan harf sayısı
                                  azaldı ve "Zuhal…" gibi yarım isimler
                                  kaldı; yarım bir isim, küçük puntolu tam
                                  isimden daha az işe yarıyor. İki satır
                                  sınırı var ki tek bir uzun isim hücreyi
                                  sayfa boyu uzatmasın; tamamı `title`'da.
                                */
                                className="block rounded px-1.5 py-1 text-center leading-snug no-underline hover:opacity-90"
                                style={{ background: color, color: okunakliMetinRengi(color) }}
                              >
                                <span className="block text-sm font-semibold [overflow-wrap:anywhere] line-clamp-2">
                                  {r.customerName}
                                </span>
                                {/*
                                  Saat ve organizasyon türü etiketin
                                  kendisinde: hangi gün kaçta hangi tören
                                  var sorusu, kaydı açmadan yanıtlanıyor.
                                */}
                                <span className="block text-xs font-medium leading-snug [overflow-wrap:anywhere] line-clamp-2">
                                  {saatMetni(r)}
                                </span>
                              </Link>
                            );
                          })}
                          {items.length > 3 && (
                            /*
                              Kalanları göstermek de bir eylem: günü seçip
                              sağdaki panele bakmak. Yazı olarak kalsaydı
                              tıklanabilir olduğu anlaşılmazdı.
                            */
                            <button
                              type="button"
                              onClick={() => setSelected(iso)}
                              className="block w-full rounded px-1.5 py-0.5 text-center text-sm text-brand-muted underline hover:text-brand"
                            >
                              +{items.length - 3} daha
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 border-t border-line pt-4 text-sm">
            {colors.map((c) => (
              <span key={c.key} className="flex items-center gap-1.5 text-brand-muted">
                <span className="h-3.5 w-3.5 rounded" style={{ background: c.color }} />
                {c.label}
              </span>
            ))}
            {/*
              Özel gün renkleri yalnızca o ay GERÇEKTEN varsa listeleniyor:
              altı türün tamamı her ay yazılsaydı açıklama satırı, asıl
              bilgi olan rezervasyon renklerini aşağı iterdi.
            */}
            {[...new Set(
              cells.flatMap((c) => ozelGunHaritasi.get(c.iso) ?? []).map((g) => g.kind),
            )].map((kind) => (
              <span key={kind} className="flex items-center gap-1.5 text-brand-muted">
                <span className="h-3.5 w-3.5 rounded" style={{ background: OZEL_GUN_RENGI[kind] }} />
                {OZEL_GUN_ADI[kind]}
              </span>
            ))}
          </div>
        </section>

        {selected && (
        <section className="card p-5">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="font-heading text-lg font-bold text-brand">
              {Number(selected.slice(8, 10))} {MONTH_NAMES[Number(selected.slice(5, 7)) - 1]} kayıtları
            </h2>
            <button type="button" className="text-sm text-brand-muted underline hover:text-brand"
              onClick={() => setSelected(null)}>
              Kapat
            </button>
          </div>
          {/*
            Seçilen günün özel günleri listenin ÜSTÜNDE: "o gün bayram
            mıydı" sorusu rezervasyonlara bakmadan önce sorulan soru.
          */}
          {(ozelGunHaritasi.get(selected) ?? []).length > 0 && (
            <ul className="mb-4 space-y-1">
              {(ozelGunHaritasi.get(selected) ?? []).map((g) => (
                <li key={g.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: OZEL_GUN_RENGI[g.kind] }} />
                  <span className="text-brand">{g.label}</span>
                  <span className="text-sm text-brand-muted">{OZEL_GUN_ADI[g.kind]}</span>
                  {/*
                    Kandiller hesaplanıyor, uzak yılların bayramları da
                    henüz ilan edilmedi. Takvimde de belirtiliyor: bu
                    ekran rezervasyon açarken bakılan ekran.
                  */}
                  {g.tentative && (
                    <span className="rounded bg-[#fef6e7] px-1.5 py-0.5 text-xs text-[#92600e]">
                      kesinleşmedi
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}

          {selectedItems.length === 0 ? (
            <p className="py-6 text-center text-base text-brand-muted">
              Bu güne ait rezervasyon bulunmuyor.
            </p>
          ) : (
            <ul className="space-y-3">
              {selectedItems.map((r) => {
                const color = colors.find((c) => c.key === r.colorKey)?.color ?? '#47b2e4';
                return (
                  <li key={r.id}>
                    {/*
                      Kartın TAMAMI bağlantı, yalnızca isim değil. Küçük
                      bir metnin üstünü tutturmaya çalışmak, elinin titrek
                      olduğu bir kullanıcı için gereksiz bir engel.
                    */}
                    <Link
                      to={`/panel/rezervasyonlar/${r.id}`}
                      className="block rounded-md border border-line p-3 text-brand no-underline transition hover:border-accent-ink hover:bg-surface"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <span className="block truncate text-base font-semibold">{r.customerName}</span>
                          <span className="mt-0.5 block text-sm text-brand-muted">
                            {Number(r.date.slice(-2))} {MONTH_NAMES[Number(r.date.slice(5, 7)) - 1]} · {saatMetni(r)} · {r.guestCount} kişi
                          </span>
                        </div>
                        <span className="shrink-0 rounded px-2 py-1 text-xs font-medium" style={{ background: color, color: okunakliMetinRengi(color) }}>
                          {r.organizationType}
                        </span>
                      </div>
                      <span className="mt-2 block text-sm text-brand-muted">
                        Kalan: <strong className="text-brand">{formatMoney(balance.remaining(r), r.currency)}</strong>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        )}
      </div>
    </QueryBoundary>
  );
}

interface IzgaraGunu {
  iso: string;
  /** Gösterilen aya mi ait, yoksa komşu ayın taşma günü mü. */
  ayIcinde: boolean;
  haftaSonu: boolean;
}

/**
 * Pazartesi başlangıçlı ay ızgarası. Baştaki ve sondaki boşluklar komşu
 * ayların gerçek günleriyle dolduruluyor: ayın son gününe denk gelen bir
 * düğün, sonraki aya bakarken de görünsün.
 */
function buildMonthGrid(year: number, month: number): IzgaraGunu[] {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7; // Pazartesi = 0
  const gunler: IzgaraGunu[] = [];
  const baslangic = new Date(year, month, 1 - offset);
  const toplam = Math.ceil((offset + new Date(year, month + 1, 0).getDate()) / 7) * 7;
  for (let i = 0; i < toplam; i += 1) {
    const g = new Date(baslangic.getFullYear(), baslangic.getMonth(), baslangic.getDate() + i);
    gunler.push({
      iso: toIso(g),
      ayIcinde: g.getMonth() === month && g.getFullYear() === year,
      haftaSonu: g.getDay() === 0 || g.getDay() === 6,
    });
  }
  return gunler;
}
