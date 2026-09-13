import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Seo from '../../components/Seo';
import Alert from '../../components/Alert';
import { useAuth } from '../../context/AuthContext';
import {
  useAuditLog, useBusinesses, useHalls, useCashFlow, useLeadStatuses, usePaymentEvents,
  usePayments, useReservationExpenses, useSmsLog, useStaff, useSurveys, useLeads, useMenus,
  useReservationsForBusinesses,
  useReservationsWithBalances,
} from '../../lib/queries';
import { donusumRaporu } from '../../lib/lead';
import { anketOzeti } from '../../lib/anket';
import { giderKasaSatirlari } from '../../lib/dugunGideri';
import { QueryBoundary } from '../../components/QueryState';
import {
  balanceReport, channelReport, downloadCsv, ekGiderRaporu, haftalikRapor, ilRaporu,
  islemAyRaporu, isletmeRaporu, monthReport, programReport, slotReport, summarize,
  surecRaporu, tahsilatAyRaporu, tavsiyeRaporu, toCsv, withinRange, yilAyRaporu,
  type BalanceRow, karRaporu,
} from '../../lib/reports';
import { addDays, formatDate, formatMoney, formatNumber, formatPhone, todayIso } from '../../lib/format';
import { buildProgram, programIsEmpty } from '../../lib/program';
import { downloadProgramDocx } from '../../lib/programDocx';
import ProgramCizelgesi from '../../components/ProgramCizelgesi';
import { KEYS, read, write } from '../../lib/storage';
import { MONTH_NAMES } from '../../data/constants';
import { ALL_PERMISSIONS } from '../../types';
import { IconDownload, IconPrint } from '../../components/Icons';

type Tab =
  | 'cizelge' | 'program' | 'ay' | 'kar' | 'bakiye' | 'seans' | 'kanal'
  | 'salon' | 'donusum' | 'anket'
  // Rakip programın listesinden gelen raporlar
  | 'gunluk' | 'hafta' | 'yilay' | 'davetli' | 'tahsilat' | 'islem'
  | 'isletme' | 'il' | 'tavsiye' | 'surec' | 'ekgider' | 'yetkili'
  | 'islemlog' | 'smslog';

type RaporGrubu = 'Günlük işler' | 'Rezervasyon' | 'Gelir ve tahsilat' | 'Müşteri' | 'Kayıtlar';

const TABS: { key: Tab; label: string; grup: RaporGrubu }[] = [
  // --- Günlük işler
  { key: 'gunluk', label: 'Günlük rezervasyonlar', grup: 'Günlük işler' },
  { key: 'cizelge', label: 'Program raporu', grup: 'Günlük işler' },
  { key: 'hafta', label: 'Haftalık rapor', grup: 'Günlük işler' },
  { key: 'surec', label: 'Rezervasyon süreçleri', grup: 'Günlük işler' },

  // --- Rezervasyon
  { key: 'salon', label: 'Salon bazlı rapor', grup: 'Rezervasyon' },
  { key: 'ay', label: 'Aylık rezervasyon raporu', grup: 'Rezervasyon' },
  { key: 'yilay', label: 'Yıllık / aylık rezervasyon', grup: 'Rezervasyon' },
  { key: 'davetli', label: 'Aylık davetli sayısı', grup: 'Rezervasyon' },
  { key: 'isletme', label: 'İşletme bazlı rezervasyon', grup: 'Rezervasyon' },
  // Eski adı "Program bazlı rapor" idi; çizelge eklenince aynı sözcük iki
  // ayrı raporu anlatır olmuştu.
  { key: 'program', label: 'Organizasyon bazlı rapor', grup: 'Rezervasyon' },
  { key: 'seans', label: 'Gündüz / Gece', grup: 'Rezervasyon' },
  { key: 'il', label: 'İl bazlı rezervasyon', grup: 'Rezervasyon' },

  // --- Gelir ve tahsilat
  // Şartnamenin 20. ve 23. maddeleri: ciro, gider ve kâr Raporlama'da.
  { key: 'kar', label: 'Ciro, gider ve kâr', grup: 'Gelir ve tahsilat' },
  { key: 'tahsilat', label: 'Aylık tahsilat (gelir)', grup: 'Gelir ve tahsilat' },
  // Şartnamedeki adı: sözleşme yapıldıktan sonra hangi paranın ne zaman
  // geleceğini gösteren ekran.
  { key: 'bakiye', label: 'Gelecek Kaporalar ve Ödemeler', grup: 'Gelir ve tahsilat' },
  { key: 'ekgider', label: 'Rezervasyon ek kalemleri', grup: 'Gelir ve tahsilat' },

  // --- Müşteri
  { key: 'kanal', label: 'Ulaşım kanalı', grup: 'Müşteri' },
  { key: 'tavsiye', label: 'Öneren / tavsiye eden', grup: 'Müşteri' },
  { key: 'donusum', label: 'Görüşme ve dönüşüm', grup: 'Müşteri' },
  { key: 'anket', label: 'Deneyim anketi', grup: 'Müşteri' },

  // --- Kayıtlar
  { key: 'islem', label: 'Aylık rezervasyon işlemleri', grup: 'Kayıtlar' },
  { key: 'islemlog', label: 'İşlem logları', grup: 'Kayıtlar' },
  { key: 'smslog', label: 'SMS logları', grup: 'Kayıtlar' },
  { key: 'yetkili', label: 'Yetkililer raporu', grup: 'Kayıtlar' },
];

const RAPOR_GRUPLARI: RaporGrubu[] = [
  'Günlük işler', 'Rezervasyon', 'Gelir ve tahsilat', 'Müşteri', 'Kayıtlar',
];

const TAB_KEYS = TABS.map((t) => t.key);

export default function Raporlar() {
  const { user, can } = useAuth();
  const { colors } = useReservationsWithBalances();
  const { data: halls = [] } = useHalls();
  const { data: businesses = [] } = useBusinesses();

  /*
    RAPOR KAPSAMI. Varsayılan etkin işletme; sahibi birden çok salon
    işletiyorsa buradan hepsini birden seçebiliyor. Eskiden rapor yalnızca
    etkin işletmeye bakıyordu ve "toplam ne kadar iş yaptım" sorusunun
    cevabı için iki raporu elle toplamak gerekiyordu.
  */
  const [secilenIsletmeler, setSecilenIsletmeler] = useState<string[]>([]);
  const kapsam = useMemo(() => {
    const gecerli = secilenIsletmeler.filter((id) => businesses.some((b) => b.id === id));
    if (gecerli.length > 0) return gecerli;
    return user?.activeBusinessId ? [user.activeBusinessId] : [];
  }, [secilenIsletmeler, businesses, user?.activeBusinessId]);

  const { reservations, balance, isLoading, error } = useReservationsForBusinesses(kapsam);
  const { data: menus = [] } = useMenus();
  const { data: adaylar = [] } = useLeads();
  const { data: adayDurumlari = [] } = useLeadStatuses();
  const { data: anketler = [] } = useSurveys();
  const { data: kasaKayitlari = [] } = useCashFlow();
  const { data: dugunGiderleri = [] } = useReservationExpenses();
  const { data: tahsilatlar = [] } = usePayments();
  const { data: odemeOlaylari = [] } = usePaymentEvents();
  const { data: smsKayitlari = [] } = useSmsLog();
  const { data: denetimKayitlari = [] } = useAuditLog(200);
  const { data: personel = [] } = useStaff();
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
  /*
    Anket özeti TARİH SÜZGECİNDEN GEÇMİYOR: anket organizasyondan bir
    hafta sonra gidiyor ve rezervasyon tarihine göre süzülürse, geçen
    ayın düğünü için bu ay gelen cevap hiçbir aralıkta görünmezdi.
  */
  const anket = useMemo(() => anketOzeti(anketler), [anketler]);
  const currency = user?.currency ?? 'TL';

  // Notlar bu tarayıcıda saklanır: rapor her açılışta yeniden yazılmasın.
  useEffect(() => { write(KEYS.programNotes, notlar); }, [notlar]);

  /*
    Salon süzgeci (madde 23). Boş küme "hepsi" demek: kullanıcı bütün
    kutucukları kaldırdığında rapor boşalmıyor, tümüne dönüyor -- boş bir
    rapor ekranı kullanıcıya hiçbir şey anlatmıyordu.
  */
  const [seciliSalonlar, setSeciliSalonlar] = useState<string[]>([]);

  const scoped = useMemo(
    () => reservations.filter((r) => r.status !== 'İptal'
      && withinRange(r.date, { from, to })
      && (seciliSalonlar.length === 0 || seciliSalonlar.includes(r.hallId))),
    [reservations, from, to, seciliSalonlar],
  );

  /**
   * Salon bazlı kırılım (madde 23): seçilen salonlar AYRI AYRI, altında
   * toplam. Yalnızca toplam gösterilseydi "hangi salon kazandırıyor"
   * sorusu cevapsız kalırdı.
   */
  const salonKirilimi = useMemo(() => {
    const kapsam = seciliSalonlar.length > 0
      ? halls.filter((h) => seciliSalonlar.includes(h.id))
      : halls;
    return kapsam
      .map((h) => ({ hall: h, ...summarize(scoped.filter((r) => r.hallId === h.id), balance) }))
      .filter((s) => s.count > 0);
  }, [halls, seciliSalonlar, scoped, balance]);

  const salonSecili = seciliSalonlar.length > 0;
  const totals = useMemo(() => summarize(scoped, balance), [scoped, balance]);
  const programs = useMemo(() => programReport(scoped, balance), [scoped, balance]);
  const months = useMemo(() => monthReport(scoped, balance), [scoped, balance]);
  const balances = useMemo(() => balanceReport(scoped, balance), [scoped, balance]);
  const slots = useMemo(() => slotReport(scoped, balance), [scoped, balance]);
  const channels = useMemo(() => channelReport(scoped, balance), [scoped, balance]);
  const haftalar = useMemo(() => haftalikRapor(scoped, balance), [scoped, balance]);
  const yilAy = useMemo(() => yilAyRaporu(scoped), [scoped]);
  const iller = useMemo(() => ilRaporu(scoped, balance), [scoped, balance]);
  const tavsiyeler = useMemo(() => tavsiyeRaporu(scoped, balance), [scoped, balance]);
  const surecler = useMemo(() => surecRaporu(scoped, balance), [scoped, balance]);
  const isletmeler = useMemo(
    () => isletmeRaporu(scoped, balance, (id) => businesses.find((b) => b.id === id)?.name ?? ''),
    [scoped, balance, businesses],
  );

  /*
    Tahsilat ve ek kalem raporları TARİH SÜZGECİNİ kendi tarihlerine
    uyguluyor: tahsilat kasaya girdiği güne, ek kalem harcandığı güne
    yazılır. Rezervasyonun düğün tarihine göre süzülselerdi "bu ay elime
    ne geçti" sorusu, gelecek yılın düğünü için bugün alınan kaporayı
    göstermezdi.
  */
  const scopedIdler = useMemo(() => new Set(scoped.map((r) => r.id)), [scoped]);
  const tahsilatSatirlari = useMemo(
    () => tahsilatAyRaporu(tahsilatlar.filter(
      (t) => withinRange(t.date, { from, to }) && (!salonSecili || scopedIdler.has(t.reservationId)),
    )),
    [tahsilatlar, from, to, salonSecili, scopedIdler],
  );
  const islemSatirlari = useMemo(
    () => islemAyRaporu(odemeOlaylari.filter(
      (o) => withinRange((o.createdAt || '').slice(0, 10), { from, to }),
    )),
    [odemeOlaylari, from, to],
  );
  const ekKalemler = useMemo(
    () => ekGiderRaporu(dugunGiderleri.filter((g) => !salonSecili || scopedIdler.has(g.reservationId))),
    [dugunGiderleri, salonSecili, scopedIdler],
  );

  /*
    Günlük rezervasyonlar aralığın BAŞLANGICINI gün olarak alıyor;
    aralık seçilmemişse bugünü. Aralığın tamamını listelemek, bu raporu
    rezervasyon listesinin kopyası yapardı.
  */
  const gunlukGun = from || todayIso();
  const gunlukKayitlar = useMemo(
    () => reservations
      .filter((r) => r.date === gunlukGun && r.status !== 'İptal'
        && (seciliSalonlar.length === 0 || seciliSalonlar.includes(r.hallId)))
      .sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? '')),
    [reservations, gunlukGun, seciliSalonlar],
  );

  /*
    Ciro, gider ve kâr (maddeler 20 ve 23). Yıl/ay seçimi kullanıcıda:
    "bu yıl ne kazandık" ile "hangi ay zarar ettik" ayrı sorular ve
    ikisini tek bir tabloda göstermek ikisini de okunmaz yapardı.
  */
  const [karYillik, setKarYillik] = useState(true);

  const giderSatirlari = useMemo(
    () => giderKasaSatirlari(dugunGiderleri, reservations, (r) => r.customerName),
    [dugunGiderleri, reservations],
  );

  /*
    Gelir/gider satırları da tarih aralığına ve SALON SEÇİMİNE göre
    süzülüyor. Salon seçiliyken serbest gelir/gider satırları dışarıda
    kalıyor: o satırların salonu yok, hepsini her salona saymak kârı
    olduğundan farklı gösterirdi.
  */
  const karSatirlari = useMemo(() => karRaporu(
    scoped,
    balance,
    salonSecili ? [] : kasaKayitlari.filter((e) => withinRange(e.date, { from, to })),
    giderSatirlari.filter((g) => withinRange(g.date, { from, to })
      && (!salonSecili || scoped.some((r) => r.id === g.reservationId))),
    karYillik,
  ), [scoped, balance, kasaKayitlari, giderSatirlari, from, to, salonSecili, karYillik]);

  const karToplam = useMemo(() => karSatirlari.reduce((acc, s) => ({
    ciro: acc.ciro + s.ciro,
    otherIncome: acc.otherIncome + s.otherIncome,
    expense: acc.expense + s.expense,
    kar: acc.kar + s.kar,
  }), { ciro: 0, otherIncome: 0, expense: 0, kar: 0 }), [karSatirlari]);

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
    } else if (tab === 'salon') {
      csv = toCsv(
        ['Salon', 'Adet', 'Davetli', 'Toplam', 'Tahsilat', 'Kalan'],
        salonKirilimi.map((s) => [
          s.hall.name, s.count, s.guests, s.total, s.collected, s.remaining,
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
    } else if (tab === 'gunluk') {
      csv = toCsv(
        ['Saat', 'Müşteri', 'Salon', 'Tür', 'Davetli', 'Toplam', 'Kalan'],
        gunlukKayitlar.map((r) => [
          r.startTime && r.endTime ? `${r.startTime} - ${r.endTime}` : r.slot,
          r.customerName, halls.find((h) => h.id === r.hallId)?.name ?? '',
          r.organizationType, r.guestCount, r.totalAmount, balance.remaining(r),
        ]),
      );
    } else if (tab === 'hafta') {
      csv = toCsv(
        ['Hafta', 'Adet', 'Davetli', 'Toplam', 'Tahsilat', 'Kalan'],
        haftalar.map((h) => [h.etiket, h.count, h.guests, h.total, h.collected, h.remaining]),
      );
    } else if (tab === 'yilay') {
      csv = toCsv(
        ['Yıl', ...MONTH_NAMES, 'Toplam'],
        yilAy.map((y) => [y.yil, ...y.aylar.map((a) => a.count), y.toplam.count]),
      );
    } else if (tab === 'davetli') {
      csv = toCsv(
        ['Ay', 'Organizasyon', 'Davetli', 'Ortalama davetli'],
        months.map((m) => [
          m.label, m.count, m.guests, m.count ? Math.round(m.guests / m.count) : 0,
        ]),
      );
    } else if (tab === 'isletme' || tab === 'il' || tab === 'tavsiye') {
      // Üç rapor da aynı kırılım şeklinde; başlık satırı raporun adını taşıyor.
      const kaynak = tab === 'isletme' ? isletmeler : tab === 'il' ? iller : tavsiyeler;
      const basSutun = tab === 'isletme' ? 'İşletme' : tab === 'il' ? 'İl' : 'Tavsiye eden';
      csv = toCsv(
        [basSutun, 'Adet', 'Davetli', 'Toplam', 'Tahsilat', 'Kalan'],
        kaynak.map((k) => [k.etiket, k.count, k.guests, k.total, k.collected, k.remaining]),
      );
    } else if (tab === 'surec') {
      csv = toCsv(
        ['Müşteri', 'Tarih', 'Sözleşme', 'Kapora', 'Tahsilat (%)', 'Kalan', 'Sıradaki iş'],
        surecler.map((sr) => [
          sr.reservation.customerName, formatDate(sr.reservation.date),
          sr.sozlesme ? 'Var' : 'Yok', sr.kapora ? 'Var' : 'Yok',
          sr.yuzde, sr.kalan, sr.sonraki || 'Tamam',
        ]),
      );
    } else if (tab === 'tahsilat') {
      csv = toCsv(
        ['Ay', 'Tahsilat adedi', 'Toplam', 'Nakit', 'Kredi Kartı', 'Havale/EFT'],
        tahsilatSatirlari.map((t) => [
          t.etiket, t.adet, t.tutar,
          t.tipler.Nakit ?? 0, t.tipler['Kredi Kartı'] ?? 0, t.tipler['Havale/EFT'] ?? 0,
        ]),
      );
    } else if (tab === 'islem') {
      csv = toCsv(
        ['Ay', 'Toplam işlem', 'Eklendi', 'Güncellendi', 'Silindi'],
        islemSatirlari.map((i) => [
          i.etiket, i.toplam,
          i.olaylar.eklendi ?? 0, i.olaylar.guncellendi ?? 0, i.olaylar.silindi ?? 0,
        ]),
      );
    } else if (tab === 'ekgider') {
      csv = toCsv(
        ['Kalem', 'Kaç organizasyonda', 'Adet', 'Toplam tutar'],
        ekKalemler.map((e) => [e.kind, e.organizasyon, e.adet, e.tutar]),
      );
    } else if (tab === 'yetkili') {
      csv = toCsv(
        ['Kullanıcı', 'E-posta', 'Telefon', 'Yetki sayısı', 'Aylık rapor', 'Yetkiler'],
        personel.map((u) => [
          u.fullName, u.email, u.mobile, u.permissions.length,
          u.monthlyReport ? 'Açık' : 'Kapalı', u.permissions.join(' | '),
        ]),
      );
    } else if (tab === 'islemlog') {
      csv = toCsv(
        ['Tarih', 'Kullanıcı', 'İşlem', 'Tablo', 'Özet'],
        denetimKayitlari.map((k) => [
          k.createdAt, k.actorEmail, k.action, k.tableName, k.summary ?? '',
        ]),
      );
    } else if (tab === 'smslog') {
      csv = toCsv(
        ['Tarih', 'Alıcı', 'Tür', 'Mesaj'],
        smsKayitlari.map((m) => [m.sentAt, m.to, m.kind, m.body]),
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

      {/*
        RAPOR KAPSAMI. Yalnızca birden çok işletmesi olan sahibe
        gösteriliyor: tek salonlu kurulumda seçilecek bir şey yok ve kutu
        ekranı kalabalıklaştırırdı. Seçim yapılmadığında etkin işletme
        geçerli -- rapor açan herkes bugüne kadarki davranışı görüyor.
      */}
      {businesses.length > 1 && (
        <fieldset className="no-print card mb-5 p-4">
          <legend className="field-label">Rapor kapsamı</legend>
          <div className="flex flex-wrap items-center gap-2">
            {businesses.map((b) => {
              const secili = kapsam.includes(b.id);
              return (
                <label
                  key={b.id}
                  className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm ${
                    secili ? 'border-accent-ink bg-accent/10 text-accent-ink' : 'border-line text-brand'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={secili}
                    onChange={() => setSecilenIsletmeler(
                      secili ? kapsam.filter((x) => x !== b.id) : [...kapsam, b.id],
                    )}
                  />
                  {b.name}
                </label>
              );
            })}
            <button
              type="button"
              className="btn-outline btn-sm"
              onClick={() => setSecilenIsletmeler(businesses.map((b) => b.id))}
            >
              Tümünü seç
            </button>
            <button
              type="button"
              className="btn-ghost btn-sm"
              onClick={() => setSecilenIsletmeler([])}
            >
              Yalnızca etkin işletme
            </button>
          </div>
          <p className="mt-2 text-xs text-brand-muted">
            {kapsam.length > 1
              ? `${kapsam.length} işletmenin kayıtları birlikte raporlanıyor.`
              : 'Tek işletme raporlanıyor.'}
          </p>
        </fieldset>
      )}

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

      {/*
        Salon seçimi (madde 23). Bütün raporları birden süzüyor: tek bir
        sekmeye bağlansaydı kullanıcı ay raporunda salon 1'i, ciro
        raporunda hepsini görür ve iki rakamı yan yana koyduğunda
        birbirini tutmadığını sanırdı.
      */}
      {halls.length > 1 && (
        <fieldset className="no-print mb-4">
          <legend className="field-label">Salonlar</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {halls.map((h) => (
              <label key={h.id} className="flex items-center gap-2 text-sm text-brand">
                <input
                  type="checkbox"
                  checked={seciliSalonlar.length === 0 || seciliSalonlar.includes(h.id)}
                  onChange={(e) => setSeciliSalonlar((onceki) => {
                    // Boş küme "hepsi" demek; ilk kaldırmada diğerleri
                    // seçili kalsın diye tam listeden düşülüyor.
                    const temel = onceki.length === 0 ? halls.map((x) => x.id) : onceki;
                    const yeni = e.target.checked
                      ? [...new Set([...temel, h.id])]
                      : temel.filter((id) => id !== h.id);
                    return yeni.length === halls.length ? [] : yeni;
                  })}
                />
                {h.name}
              </label>
            ))}
            {seciliSalonlar.length > 0 && (
              <button type="button" className="text-xs text-brand-muted underline hover:text-brand"
                onClick={() => setSeciliSalonlar([])}>
                Tüm salonlar
              </button>
            )}
          </div>
        </fieldset>
      )}

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Mini label="Rezervasyon" value={formatNumber(totals.count)} />
        <Mini label="Davetli" value={formatNumber(totals.guests)} />
        <Mini label="Toplam ciro" value={formatMoney(totals.total, currency)} />
        <Mini label="Tahsil edilen" value={formatMoney(totals.collected, currency)} />
        <Mini label="Kalan alacak" value={formatMoney(totals.remaining, currency)} />
      </div>

      {/*
        Yirmi dört rapor tek sıra halinde yan yana dizilseydi ekranın
        yarısını kaplar ve aradığını bulmak listeyi baştan sona okumayı
        gerektirirdi. Rakip programdaki gibi başlıklı DİKEY liste:
        aranan rapor önce grubuyla, sonra adıyla bulunuyor.
      */}
      <div className="grid gap-5 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <nav className="no-print lg:sticky lg:top-4 lg:self-start" aria-label="Rapor listesi">
          <div className="card p-3 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
            {RAPOR_GRUPLARI.map((grup) => (
              <div key={grup} className="mb-3 last:mb-0">
                <h2 className="mb-1.5 px-2 text-xs font-bold uppercase tracking-wide text-brand-muted">
                  {grup}
                </h2>
                {/*
                  Düğmeler tablist'in DOĞRUDAN çocuğu. Araya <ul>/<li>
                  girdiğinde ARIA ebeveyn zinciri kırılıyor ve ekran
                  okuyucu sekmeleri bir liste gibi okuyor.
                */}
                <div
                  className="space-y-0.5"
                  role="tablist"
                  aria-orientation="vertical"
                  aria-label={grup}
                >
                  {TABS.filter((t) => t.grup === grup).map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      role="tab"
                      aria-selected={tab === t.key}
                      onClick={() => setTab(t.key)}
                      className={`block w-full rounded px-2.5 py-2 text-left text-sm transition ${
                        tab === t.key
                          ? 'bg-accent-ink font-semibold text-white'
                          : 'text-brand hover:bg-surface'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </nav>

        <section className="card min-w-0 p-5" role="tabpanel" aria-label={TABS.find((t) => t.key === tab)?.label}>
        <h2 className="mb-4 font-heading text-lg font-bold text-brand">
          {TABS.find((t) => t.key === tab)?.label}
        </h2>
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
        ) : tab === 'kar' ? (
          karSatirlari.length === 0 ? (
            <p className="py-10 text-center text-sm text-brand-muted">
              Seçilen tarih aralığında kayıt bulunmuyor.
            </p>
          ) : (
            <>
              <div className="no-print mb-4 flex flex-wrap items-center gap-2">
                <span className="text-sm text-brand-muted">Dönem:</span>
                {[{ deger: true, etiket: 'Yıllık' }, { deger: false, etiket: 'Aylık' }].map((s) => (
                  <button
                    key={s.etiket}
                    type="button"
                    aria-pressed={karYillik === s.deger}
                    onClick={() => setKarYillik(s.deger)}
                    className={`btn-sm rounded-full px-4 py-1.5 text-sm transition ${
                      karYillik === s.deger
                        ? 'bg-accent-ink text-white'
                        : 'border border-line bg-white text-brand hover:border-accent-ink'
                    }`}
                  >
                    {s.etiket}
                  </button>
                ))}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <caption className="sr-only">Dönem başına ciro, gider ve kâr</caption>
                  <thead>
                    <tr className="border-b border-line bg-surface text-left text-xs uppercase text-brand-muted">
                      <th className="px-3 py-2.5 font-medium">Dönem</th>
                      <th className="px-3 py-2.5 text-right font-medium">Organizasyon</th>
                      <th className="px-3 py-2.5 text-right font-medium">Ciro</th>
                      <th className="px-3 py-2.5 text-right font-medium">Tahsil edilen</th>
                      <th className="px-3 py-2.5 text-right font-medium">Diğer gelir</th>
                      <th className="px-3 py-2.5 text-right font-medium">Gider</th>
                      <th className="px-3 py-2.5 text-right font-medium">Kâr</th>
                    </tr>
                  </thead>
                  <tbody>
                    {karSatirlari.map((k) => (
                      <tr key={k.donem} className="border-b border-line/60 last:border-0">
                        <td className="whitespace-nowrap px-3 py-2.5 text-brand">{donemAdi(k.donem)}</td>
                        <td className="px-3 py-2.5 text-right text-brand">{formatNumber(k.count)}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right text-brand">{formatMoney(k.ciro, currency)}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right text-[#15803d]">{formatMoney(k.collected, currency)}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right text-brand-muted">{formatMoney(k.otherIncome, currency)}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right text-[#b91c1c]">{formatMoney(k.expense, currency)}</td>
                        {/*
                          Kâr negatif olabilir ve rengi bunu söylüyor:
                          rakamı okumadan "bu dönem zarar" görünmeli.
                        */}
                        <td className={`whitespace-nowrap px-3 py-2.5 text-right font-medium ${
                          k.kar >= 0 ? 'text-brand' : 'text-[#b91c1c]'
                        }`}>
                          {formatMoney(k.kar, currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-line font-semibold">
                      <td className="px-3 py-2.5 text-brand" colSpan={2}>Toplam</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right text-brand">{formatMoney(karToplam.ciro, currency)}</td>
                      <td />
                      <td className="whitespace-nowrap px-3 py-2.5 text-right text-brand-muted">{formatMoney(karToplam.otherIncome, currency)}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right text-[#b91c1c]">{formatMoney(karToplam.expense, currency)}</td>
                      <td className={`whitespace-nowrap px-3 py-2.5 text-right ${
                        karToplam.kar >= 0 ? 'text-brand' : 'text-[#b91c1c]'
                      }`}>
                        {formatMoney(karToplam.kar, currency)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/*
                Ciro ile tahsilat AYRI sütunlar: sözleşme tutarı
                kazanılmış para değil, tahsil edilene kadar alacaktır.
                Tek sütunda gösterilseydi kâr, henüz gelmemiş parayla
                hesaplanmış olurdu.
              */}
              <p className="mt-3 text-xs text-brand-muted">
                Ciro, organizasyonun yapıldığı döneme yazılır; sözleşmenin açıldığı güne değil.
                Kâr = ciro + diğer gelir − gider. Düğün içi giderler bu hesaba dahildir.
                {salonSecili && ' Salon seçiliyken salona bağlı olmayan gelir/gider satırları sayılmaz.'}
              </p>
            </>
          )
        ) : tab === 'anket' ? (
          /*
            Deneyim anketi (madde 31). Tarih aralığından ÖNCE geliyor:
            anketin kendi takvimi var ve rezervasyon süzgecine bağlanırsa
            cevaplar kaybolurdu.
          */
          anket.gonderilen === 0 ? (
            <p className="py-10 text-center text-sm text-brand-muted">
              Henüz gönderilmiş anket bulunmuyor. Anketler organizasyondan bir hafta
              sonra, müşterinin e-posta adresi kayıtlıysa otomatik gönderilir.
            </p>
          ) : (
            <>
              <dl className="mb-6 grid gap-3 rounded-lg bg-surface p-4 sm:grid-cols-3">
                <Ozet etiket="Gönderilen anket" deger={formatNumber(anket.gonderilen)} />
                <Ozet
                  etiket="Cevaplanan"
                  deger={`${formatNumber(anket.cevaplanan)} (%${anket.cevapOrani.toFixed(1)})`}
                />
                <Ozet
                  etiket="Genel ortalama"
                  deger={anket.ortalama === null ? 'Cevap yok' : `${anket.ortalama.toFixed(2)} / 5`}
                />
              </dl>

              {anket.sorular.length === 0 ? (
                <p className="py-6 text-center text-sm text-brand-muted">
                  Gönderilen anketler henüz cevaplanmadı.
                </p>
              ) : (
                <Table
                  headers={['Soru', 'Cevap sayısı', 'Ortalama']}
                  rows={anket.sorular.map((soru) => [
                    soru.label, formatNumber(soru.cevap), `${soru.ortalama.toFixed(2)} / 5`,
                  ])}
                />
              )}

              {/*
                Cevaplanmayan anketler ortalamaya girmiyor ama gönderilen
                sayısında duruyor: "kaç kişi memnun" ile "kaç kişi cevap
                verdi" ayrı sorular ve ikisi birleştirilirse memnuniyet
                olduğundan farklı görünür.
              */}
              <p className="mt-3 text-xs text-brand-muted">
                Ortalamalar yalnızca cevaplanan anketlerden hesaplanır. Cevap oranı,
                gönderilen anketlerin ne kadarının yanıtlandığını gösterir.
              </p>
            </>
          )
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
        ) : tab === 'salon' ? (
          salonKirilimi.length === 0 ? (
            <p className="py-10 text-center text-sm text-brand-muted">
              Seçilen aralıkta kayıt bulunmuyor.
            </p>
          ) : (
            <>
              <Table
                headers={['Salon', 'Adet', 'Davetli', 'Toplam', 'Tahsilat', 'Kalan']}
                rows={salonKirilimi.map((s) => [
                  s.hall.name, formatNumber(s.count), formatNumber(s.guests),
                  formatMoney(s.total, currency), formatMoney(s.collected, currency),
                  formatMoney(s.remaining, currency),
                ])}
              />
              {/*
                Seçilen salonların toplamı ayrı satırda: madde 23 hem
                "ayrı ayrı" hem "toplam" istiyor ve iki sayı bir arada
                durmadan karşılaştırma yapılamıyor.
              */}
              <dl className="mt-4 grid gap-3 rounded-lg bg-surface p-4 sm:grid-cols-3">
                <Ozet etiket="Seçilen salonların toplamı" deger={formatMoney(totals.total, currency)} />
                <Ozet etiket="Tahsil edilen" deger={formatMoney(totals.collected, currency)} />
                <Ozet etiket="Kalan alacak" deger={formatMoney(totals.remaining, currency)} />
              </dl>
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

        ) : tab === 'gunluk' ? (
          <>
            <p className="no-print mb-3 text-sm text-brand-muted">
              {formatDate(gunlukGun)} günü. Başka bir gün için yukarıdaki
              &quot;Başlangıç tarihi&quot; alanını değiştirin.
            </p>
            {gunlukKayitlar.length === 0 ? (
              <p className="py-10 text-center text-base text-brand-muted">
                Bu güne ait organizasyon bulunmuyor.
              </p>
            ) : (
              <Table
                headers={['Saat', 'Müşteri', 'Salon', 'Tür', 'Davetli', 'Toplam', 'Kalan']}
                rows={gunlukKayitlar.map((r) => [
                  r.startTime && r.endTime ? `${r.startTime} - ${r.endTime}` : r.slot,
                  r.customerName,
                  halls.find((h) => h.id === r.hallId)?.name ?? '-',
                  r.organizationType,
                  formatNumber(r.guestCount),
                  formatMoney(r.totalAmount, currency),
                  formatMoney(balance.remaining(r), currency),
                ])}
              />
            )}
          </>

        ) : tab === 'hafta' ? (
          haftalar.length === 0 ? (
            <Bos />
          ) : (
            <Table
              headers={['Hafta', 'Adet', 'Davetli', 'Toplam', 'Tahsilat', 'Kalan']}
              rows={haftalar.map((h) => [
                h.etiket, formatNumber(h.count), formatNumber(h.guests),
                formatMoney(h.total, currency), formatMoney(h.collected, currency),
                formatMoney(h.remaining, currency),
              ])}
            />
          )

        ) : tab === 'yilay' ? (
          yilAy.length === 0 ? (
            <Bos />
          ) : (
            <>
              {/*
                Yıllar ALT ALTA, aylar yan yana: "geçen eylül ile bu
                eylül" ancak böyle karşılaştırılabiliyor. Ay bazlı rapor
                aynı veriyi tek sütunda diziyor, o başka bir soru.
              */}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-sm">
                  <thead>
                    <tr className="border-b border-line bg-surface text-xs uppercase text-brand-muted">
                      <th className="px-2 py-2.5 text-left font-medium">Yıl</th>
                      {MONTH_NAMES.map((ad) => (
                        <th key={ad} className="px-2 py-2.5 text-right font-medium">{ad.slice(0, 3)}</th>
                      ))}
                      <th className="px-2 py-2.5 text-right font-medium">Toplam</th>
                    </tr>
                  </thead>
                  <tbody>
                    {yilAy.map((y) => (
                      <tr key={y.yil} className="border-b border-line/60 last:border-0">
                        <td className="px-2 py-2.5 font-semibold text-brand">{y.yil}</td>
                        {y.aylar.map((h, i) => (
                          <td key={i} className={`px-2 py-2.5 text-right ${h.count ? 'text-brand' : 'text-brand-muted/60'}`}>
                            {h.count || '-'}
                          </td>
                        ))}
                        <td className="px-2 py-2.5 text-right font-semibold text-brand">{y.toplam.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-xs text-brand-muted">
                Hücreler organizasyon SAYISINI gösterir. Yıl toplamı sütunundaki ciro
                için Aylık rezervasyon raporuna bakın.
              </p>
            </>
          )

        ) : tab === 'davetli' ? (
          months.length === 0 ? (
            <Bos />
          ) : (
            <>
              <Table
                headers={['Ay', 'Organizasyon', 'Davetli', 'Ortalama davetli']}
                rows={months.map((m) => [
                  m.label, formatNumber(m.count), formatNumber(m.guests),
                  formatNumber(m.count ? Math.round(m.guests / m.count) : 0),
                ])}
              />
              <p className="mt-3 text-xs text-brand-muted">
                Ortalama davetli, menü ve personel planlaması için: sayı büyürken
                ortalama düşüyorsa salon küçük organizasyonlarla doluyor demektir.
              </p>
            </>
          )

        ) : tab === 'isletme' ? (
          isletmeler.length === 0 ? (
            <Bos />
          ) : (
            <Table
              headers={['İşletme', 'Adet', 'Davetli', 'Toplam', 'Tahsilat', 'Kalan']}
              rows={isletmeler.map((i) => [
                i.etiket, formatNumber(i.count), formatNumber(i.guests),
                formatMoney(i.total, currency), formatMoney(i.collected, currency),
                formatMoney(i.remaining, currency),
              ])}
            />
          )

        ) : tab === 'il' ? (
          iller.length === 0 ? (
            <Bos />
          ) : (
            <>
              <Table
                headers={['İl', 'Adet', 'Davetli', 'Toplam', 'Tahsilat', 'Kalan']}
                rows={iller.map((i) => [
                  i.etiket, formatNumber(i.count), formatNumber(i.guests),
                  formatMoney(i.total, currency), formatMoney(i.collected, currency),
                  formatMoney(i.remaining, currency),
                ])}
              />
              {/*
                Boş il doldurulmuyor. İşletmenin iliyle doldurulsaydı,
                gerçekte başka ilden gelen müşteriler yanlış ile yazılır ve
                rapor kendine göre tutarlı ama gerçekte yanlış olurdu.
              */}
              <p className="mt-3 text-xs text-brand-muted">
                İl, rezervasyon formundaki &quot;İl&quot; alanından gelir. Girilmemiş
                kayıtlar &quot;Belirtilmemiş&quot; satırında toplanır; o satırın büyüklüğü
                alanın ne kadar doldurulduğunu gösterir.
              </p>
            </>
          )

        ) : tab === 'tavsiye' ? (
          tavsiyeler.length === 0 ? (
            <p className="py-10 text-center text-base text-brand-muted">
              Seçilen aralıkta tavsiye ile gelen rezervasyon bulunmuyor.
            </p>
          ) : (
            <>
              <Table
                headers={['Tavsiye eden', 'Getirdiği kayıt', 'Davetli', 'Toplam ciro', 'Tahsilat']}
                rows={tavsiyeler.map((t) => [
                  t.etiket, formatNumber(t.count), formatNumber(t.guests),
                  formatMoney(t.total, currency), formatMoney(t.collected, currency),
                ])}
              />
              <p className="mt-3 text-xs text-brand-muted">
                Yalnızca ulaşım kanalı &quot;Tavsiye&quot; seçilmiş kayıtlar. Tavsiye edenin
                adı rezervasyon formundaki açıklama alanından gelir.
              </p>
            </>
          )

        ) : tab === 'surec' ? (
          surecler.length === 0 ? (
            <Bos />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-sm">
                  <thead>
                    <tr className="border-b border-line bg-surface text-left text-xs uppercase text-brand-muted">
                      <th className="px-3 py-2.5 font-medium">Müşteri</th>
                      <th className="px-3 py-2.5 font-medium">Tarih</th>
                      <th className="px-3 py-2.5 font-medium">Sözleşme</th>
                      <th className="px-3 py-2.5 font-medium">Kapora</th>
                      <th className="px-3 py-2.5 text-right font-medium">Tahsilat</th>
                      <th className="px-3 py-2.5 text-right font-medium">Kalan</th>
                      <th className="px-3 py-2.5 font-medium">Sıradaki iş</th>
                    </tr>
                  </thead>
                  <tbody>
                    {surecler.map((sr) => (
                      <tr key={sr.reservation.id} className="border-b border-line/60 last:border-0">
                        <td className="px-3 py-2.5">
                          <Link to={`/panel/rezervasyonlar/${sr.reservation.id}`}>
                            {sr.reservation.customerName}
                          </Link>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-brand-muted">
                          {formatDate(sr.reservation.date)}
                        </td>
                        <td className="px-3 py-2.5">{sr.sozlesme ? '✓' : '—'}</td>
                        <td className="px-3 py-2.5">{sr.kapora ? '✓' : '—'}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right text-brand">%{sr.yuzde}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right text-[#b91c1c]">
                          {formatMoney(sr.kalan, currency)}
                        </td>
                        <td className={`px-3 py-2.5 text-xs ${sr.sonraki ? 'font-medium text-[#b91c1c]' : 'text-[#15803d]'}`}>
                          {sr.sonraki || 'Tamam'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-xs text-brand-muted">
                İş bekleyen kayıtlar üstte. &quot;Tamam&quot;, sözleşmesi ve parası
                tamamlanmış organizasyon demektir.
              </p>
            </>
          )

        ) : tab === 'tahsilat' ? (
          tahsilatSatirlari.length === 0 ? (
            <Bos />
          ) : (
            <>
              <Table
                headers={['Ay', 'Tahsilat adedi', 'Toplam', 'Nakit', 'Kredi Kartı', 'Havale/EFT', 'Diğer']}
                rows={tahsilatSatirlari.map((t) => [
                  t.etiket, formatNumber(t.adet), formatMoney(t.tutar, currency),
                  formatMoney(t.tipler.Nakit ?? 0, currency),
                  formatMoney(t.tipler['Kredi Kartı'] ?? 0, currency),
                  formatMoney(t.tipler['Havale/EFT'] ?? 0, currency),
                  formatMoney(
                    t.tutar - (t.tipler.Nakit ?? 0) - (t.tipler['Kredi Kartı'] ?? 0)
                      - (t.tipler['Havale/EFT'] ?? 0),
                    currency,
                  ),
                ])}
              />
              {/*
                Bu tablo ile "Aylık rezervasyon raporu" birbirini tutmaz
                ve tutmamalıdır: orada ciro düğün gününe, burada para
                kasaya girdiği güne yazılır.
              */}
              <p className="mt-3 text-xs text-brand-muted">
                Para KASAYA GİRDİĞİ aya yazılır. Eylül düğününün martta alınan kaporası
                bu tabloda martta, aylık rezervasyon raporunda eylülde görünür; iki tablo
                bu yüzden birbirini tutmaz.
              </p>
            </>
          )

        ) : tab === 'islem' ? (
          islemSatirlari.length === 0 ? (
            <Bos />
          ) : (
            <>
              <Table
                headers={['Ay', 'Toplam işlem', 'Eklendi', 'Güncellendi', 'Silindi']}
                rows={islemSatirlari.map((i) => [
                  i.etiket, formatNumber(i.toplam),
                  formatNumber(i.olaylar.eklendi ?? 0),
                  formatNumber(i.olaylar.guncellendi ?? 0),
                  formatNumber(i.olaylar.silindi ?? 0),
                ])}
              />
              <p className="mt-3 text-xs text-brand-muted">
                &quot;Kaç rezervasyon var&quot; değil, o ay tahsilatlarda ne yapıldığı.
                Bir tutarsızlığın hangi ay doğduğunu bulmanın en kısa yolu.
              </p>
            </>
          )

        ) : tab === 'ekgider' ? (
          ekKalemler.length === 0 ? (
            <p className="py-10 text-center text-base text-brand-muted">
              Seçilen kapsamda düğün içi gider kalemi bulunmuyor.
            </p>
          ) : (
            <>
              <Table
                headers={['Kalem', 'Kaç organizasyonda', 'Adet', 'Toplam tutar']}
                rows={ekKalemler.map((e) => [
                  e.kind, formatNumber(e.organizasyon), formatNumber(e.adet),
                  formatMoney(e.tutar, currency),
                ])}
              />
              <p className="mt-3 text-xs text-brand-muted">
                Düğün içi gider kalemleri (garson, DJ, vale...). Rezervasyon kartındaki
                &quot;Düğün içi giderler&quot; bölümünden girilir.
              </p>
            </>
          )

        ) : tab === 'yetkili' ? (
          <>
            <Table
              headers={['Kullanıcı', 'E-posta', 'Telefon', 'Yetki sayısı', 'Aylık rapor']}
              rows={personel.map((u) => [
                u.fullName, u.email, u.mobile ? formatPhone(u.mobile) : '-',
                String(u.permissions.length), u.monthlyReport ? 'Açık' : 'Kapalı',
              ])}
            />
            {personel.length === 0 && (
              <p className="py-10 text-center text-base text-brand-muted">
                Henüz alt kullanıcı eklenmemiş.
              </p>
            )}
            {personel.map((u) => (
              <div key={u.id} className="mt-4 rounded-md border border-line p-3">
                <h3 className="font-heading text-sm font-bold text-brand">{u.fullName}</h3>
                <p className="mt-1 text-xs text-brand-muted">
                  {u.permissions.length === 0
                    ? 'Hiçbir yetkisi yok.'
                    : u.permissions
                      .map((k) => ALL_PERMISSIONS.find((a) => a.key === k)?.label ?? k)
                      .join(' · ')}
                </p>
              </div>
            ))}
          </>

        ) : tab === 'islemlog' ? (
          denetimKayitlari.length === 0 ? (
            <Bos />
          ) : (
            <>
              <Table
                headers={['Tarih', 'Kullanıcı', 'İşlem', 'Tablo', 'Özet']}
                rows={denetimKayitlari.slice(0, 200).map((k) => [
                  `${formatDate(k.createdAt.slice(0, 10))} ${k.createdAt.slice(11, 16)}`,
                  k.actorEmail || '-', k.action, k.tableName, k.summary ?? '-',
                ])}
              />
              <p className="mt-3 text-xs text-brand-muted">
                Son 200 kayıt. Tamamı ve süzgeçleri için{' '}
                <Link to="/panel/denetim">Denetim Kaydı</Link> ekranına bakın.
              </p>
            </>
          )

        ) : tab === 'smslog' ? (
          smsKayitlari.length === 0 ? (
            <Bos />
          ) : (
            <>
              <Table
                headers={['Tarih', 'Alıcı', 'Tür', 'Mesaj']}
                rows={smsKayitlari.slice(0, 200).map((m) => [
                  formatDate(m.sentAt.slice(0, 10)),
                  formatPhone(m.to), m.kind,
                  m.body.length > 60 ? `${m.body.slice(0, 60)}…` : m.body,
                ])}
              />
              <p className="mt-3 text-xs text-brand-muted">
                Son 200 kayıt. Tamamı için <Link to="/panel/sms">SMS Kayıtları</Link> ekranına bakın.
              </p>
            </>
          )

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
      </div>
    </QueryBoundary>
  );
}

/**
 * "2026" ya da "2026-09" -> okunur dönem adı.
 *
 * Ham anahtar tabloda bırakılsaydı "2026-09" satırı, ay adıyla yazılan
 * diğer raporlardan farklı görünürdü.
 */
function donemAdi(anahtar: string): string {
  if (!anahtar.includes('-')) return anahtar;
  const [yil, ay] = anahtar.split('-');
  return `${MONTH_NAMES[Number(ay) - 1] ?? ay} ${yil}`;
}

/** Seçilen kapsamda veri yoksa gösterilen ortak satır. */
function Bos() {
  return (
    <p className="py-10 text-center text-base text-brand-muted">
      Seçilen aralıkta kayıt bulunmuyor.
    </p>
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

/** Salon raporunun altındaki toplam kutucukları. */
function Ozet({ etiket, deger }: { etiket: string; deger: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-brand-muted">{etiket}</dt>
      <dd className="mt-0.5 font-heading text-lg font-bold text-brand">{deger}</dd>
    </div>
  );
}
