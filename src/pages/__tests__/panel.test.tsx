import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../../context/AuthContext';
import AppLayout from '../../layouts/AppLayout';
import RequireAuth from '../../components/RequireAuth';
import Dashboard from '../app/Dashboard';
import Takvim from '../app/Takvim';
import Rezervasyonlar from '../app/Rezervasyonlar';
import RezervasyonForm from '../app/RezervasyonForm';
import RezervasyonDetay from '../app/RezervasyonDetay';
import Sozlesme from '../app/Sozlesme';
import Kasa from '../app/Kasa';
import Raporlar from '../app/Raporlar';
import RenkAyarlari from '../app/RenkAyarlari';
import Musteriler from '../app/Musteriler';
import SmsKayitlari from '../app/SmsKayitlari';
import MusteriAdaylari from '../app/MusteriAdaylari';
import MusteriAdayiYeni from '../app/MusteriAdayiYeni';
import MusteriAdayiDetay from '../app/MusteriAdayiDetay';
import UrunHizmet from '../app/UrunHizmet';
import UyeGirisi from '../UyeGirisi';

import { clearAll, KEYS, read, write } from '../../lib/storage';
import { localRepo } from '../../lib/repo/local';
import { seedIfEmpty } from '../../lib/seed';
import { addDays, todayIso } from '../../lib/format';
import { sadelestir } from '../../lib/sablon';
import type { Reservation } from '../../types';

const BIZ = 'biz_demo';
const getReservations = (id: string) => localRepo.listReservations(id);
const getMenus = (id: string) => localRepo.listMenus(id);
const saveReservation = (r: Reservation) => localRepo.saveReservation(r);
const getSmsLog = (id: string) => localRepo.listSms(id);
const getColorSettings = (id: string) => localRepo.getColorSettings(id);

/** Oturumu doğrudan açarak panel rotalarını render eder. */
function renderPanel(path: string) {
  seedIfEmpty();
  write(KEYS.session, 'user_demo');
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/" element={<p>Giriş sayfası</p>} />
          <Route path="/panel" element={<RequireAuth><AppLayout /></RequireAuth>}>
            <Route index element={<Dashboard />} />
            <Route path="takvim" element={<Takvim />} />
            <Route path="rezervasyonlar" element={<Rezervasyonlar />} />
            <Route path="rezervasyonlar/yeni" element={<RezervasyonForm />} />
            <Route path="rezervasyonlar/:id" element={<RezervasyonDetay />} />
            <Route path="rezervasyonlar/:id/duzenle" element={<RezervasyonForm />} />
            <Route path="rezervasyonlar/:id/sozlesme" element={<Sozlesme />} />
            <Route path="kasa" element={<Kasa />} />
            <Route path="raporlar" element={<Raporlar />} />
            <Route path="renk-ayarlari" element={<RenkAyarlari />} />
            <Route path="musteriler" element={<Musteriler />} />
            <Route path="sms" element={<SmsKayitlari />} />
            <Route path="musteri-adaylari" element={<MusteriAdaylari />} />
            <Route path="musteri-adaylari/yeni" element={<MusteriAdayiYeni />} />
            <Route path="musteri-adaylari/:id" element={<MusteriAdayiDetay />} />
            <Route path="urun-hizmet" element={<UrunHizmet />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => clearAll());

describe('Panel erişim kontrolü', () => {
  it('oturum yokken üye girişine yönlendirir', async () => {
    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/panel']}>
          <Routes>
            <Route path="/" element={<UyeGirisi />} />
            <Route path="/panel" element={<RequireAuth><Dashboard /></RequireAuth>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );
    expect(await screen.findByRole('heading', { name: 'Giriş' })).toBeInTheDocument();
  });
});

describe('Özet ekranı', () => {
  it('karşılama başlığını ve istatistik kartlarını gösterir', async () => {
    renderPanel('/panel');
    expect(await screen.findByRole('heading', { name: /Hoş geldiniz/ })).toBeInTheDocument();
    // Özet yalnızca içinde bulunulan ayı gösteriyor; başlıklar ay adını taşır.
    expect(screen.getByText(/ayı toplam program/)).toBeInTheDocument();
    expect(screen.getByText('Bu ay satılan düğün')).toBeInTheDocument();
    expect(screen.getAllByText(/Kalan alacağı/i).length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: 'Kasa Durumu' })).toBeInTheDocument();
  });

  /*
    Özet gün boyu açık duruyor. Ciro, tahsilat ve kalan alacak orada
    sürekli okunur hâlde beklerse ekranın yanından geçen herkes salonun
    cirosunu görüyor; tutarlar perdeli geliyor.
  */
  it('tutarlar varsayılan olarak perdeli geliyor', async () => {
    renderPanel('/panel');
    await screen.findByRole('heading', { name: /Hoş geldiniz/ });

    const perdeli = screen.getAllByRole('button', { name: /^Gizli tutar:/ });
    expect(perdeli.length).toBeGreaterThan(0);
    // Rakamın kendisi ekranda YAZMAMALI; yalnızca erişilebilir adda.
    expect(perdeli[0].textContent).toMatch(/^•+$/);
  });

  it('imleç üstüne gelince o tutar açılıyor', async () => {
    const user = userEvent.setup();
    renderPanel('/panel');
    await screen.findByRole('heading', { name: /Hoş geldiniz/ });

    const perdeli = screen.getAllByRole('button', { name: /^Gizli tutar:/ })[0];
    const tutar = perdeli.getAttribute('aria-label')!.replace('Gizli tutar: ', '');
    await user.hover(perdeli);
    expect(perdeli.textContent).toBe(tutar);
  });

  it('üstteki düğme tutarları sürekli açık bırakıyor ve tercih saklanıyor', async () => {
    const user = userEvent.setup();
    renderPanel('/panel');
    await screen.findByRole('heading', { name: /Hoş geldiniz/ });

    /*
      Açma düğmesi artık birden fazla: biri başlıkta, biri de perdelenen
      her rakamın yanında. `getByRole` hepsini görüp "birden çok eşleşme"
      diye düşüyordu; buradaki, metni de olan üstteki düğme.
    */
    await user.click(screen.getByRole('button', { name: 'Tutarları göster' }));
    expect(screen.queryAllByRole('button', { name: /^Gizli tutar:/ })).toHaveLength(0);
    expect(screen.getAllByRole('button', { name: 'Tutarları gizle' }).length)
      .toBeGreaterThan(0);

    // Tercih tarayıcıda kalıyor: ertesi açılışta yeniden gizlenmemeli.
    expect(read<boolean>(KEYS.amountsVisible, false)).toBe(true);
  });

  /*
    Perdeyi kaldıran tek düğme sayfanın en üstündeydi ve yıldızlara bakan
    kullanıcı onu görmüyordu: rakamın yanında bir açma yolu arıyordu.
    Rakamın yanındaki düğme aynı genel tercihi çeviriyor -- birinden
    açılınca ekrandaki bütün tutarlar açılıyor ve kapatılana kadar açık
    kalıyor.
  */
  it('rakamın yanındaki düğme de hepsini açıyor ve açık bırakıyor', async () => {
    const user = userEvent.setup();
    renderPanel('/panel');
    await screen.findByRole('heading', { name: /Hoş geldiniz/ });

    const yanindaki = screen.getAllByRole('button', { name: 'Tutarları sürekli göster' });
    expect(yanindaki.length).toBeGreaterThan(0);

    await user.click(yanindaki[0]);
    expect(screen.queryAllByRole('button', { name: /^Gizli tutar:/ })).toHaveLength(0);
    expect(read<boolean>(KEYS.amountsVisible, false)).toBe(true);
  });

  /*
    ÖZETTEKİ SAYILAR DA PERDELİ, yalnızca para değil: "bu ay kaç düğün
    sattık" da omzun üstünden okunmaması gereken bir bilgi. Birim
    (kayıt) perdenin dışında kalıyor, yoksa kart neyi saydığını
    söylemezdi.
  */
  it('program ve satış sayıları da perdeli, birimleri açıkta', async () => {
    renderPanel('/panel');
    await screen.findByRole('heading', { name: /Hoş geldiniz/ });

    const perdeli = screen.getAllByRole('button', { name: /^Gizli tutar:/ });
    // Para birimi taşımayan, yani sayı olan en az bir perde olmalı.
    expect(perdeli.some((d) => !/₺|TL/.test(d.getAttribute('aria-label') ?? ''))).toBe(true);
    expect(screen.getAllByText(/kayıt/).length).toBeGreaterThan(0);
  });

  it('yaklaşan organizasyonları bu ayla sınırlı listeler', async () => {
    renderPanel('/panel');
    expect(await screen.findByRole('heading', { name: /ayı yaklaşan organizasyonları/ }))
      .toBeInTheDocument();
  });

  it('yaklaşan organizasyonlar toplam kişi sayısını gösterir', async () => {
    renderPanel('/panel');
    await screen.findByRole('heading', { name: /ayı yaklaşan organizasyonları/ });
    // Mutfak ve servis planlaması bu sayıya bakıyor.
    expect(screen.queryByText('Toplam kişi sayısı')).toBeTruthy();
  });

  it('geçmiş dönem bölümleri özette YOKTUR', async () => {
    /*
      Son 6 ay grafiği ve tahsilat özeti bilerek kaldırıldı: günlük işini
      yapmak için ekranı açan personelin önünde duran geçmiş dönem
      rakamları, bugün yapılacak işi aşağı itiyordu.
    */
    renderPanel('/panel');
    await screen.findByRole('heading', { name: /Hoş geldiniz/ });
    expect(screen.queryByRole('heading', { name: 'Son 6 ay' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Tahsilat özeti' })).toBeNull();
  });
});

describe('Rezervasyon takvimi', () => {
  it('içinde bulunulan ayı gösterir ve gün seçilebilir', async () => {
    const user = userEvent.setup();
    renderPanel('/panel/takvim');
    expect(await screen.findByRole('heading', { name: 'Rezervasyon Takvimi' })).toBeInTheDocument();

    const dayButtons = screen.getAllByRole('button', { name: /rezervasyon$/ });
    await user.click(dayButtons[0]);
    expect(dayButtons[0]).toHaveAttribute('aria-pressed', 'true');
  });

  it('ay şeridi başlığı değiştirir, Bugün geri getirir', async () => {
    const user = userEvent.setup();
    renderPanel('/panel/takvim');
    // Veriler async yüklendiği için takvim görünene kadar bekle
    await screen.findByRole('heading', { name: 'Rezervasyon Takvimi' });
    const heading = () => screen.getAllByRole('heading', { level: 2 })[0].textContent;
    const before = heading();
    // Ok tuşları yerine on iki ayın tamamı şeritte duruyor.
    const hedef = before?.startsWith('Ocak') ? 'Temmuz' : 'Ocak';
    await user.click(screen.getByRole('button', { name: hedef }));
    expect(heading()).toContain(hedef);
    await user.click(screen.getByRole('button', { name: 'Bugün' }));
    expect(heading()).toBe(before);
  });
});

describe('Rezervasyon listesi', () => {
  it('kayıtları tabloda gösterir', async () => {
    renderPanel('/panel/rezervasyonlar');
    expect(await screen.findByRole('heading', { name: 'Rezervasyonlar' })).toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('isim araması listeyi daraltır', async () => {
    const user = userEvent.setup();
    renderPanel('/panel/rezervasyonlar');
    await user.type(await screen.findByLabelText('İsim / telefon / kod'), 'Ahmet');
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    rows.forEach((row) => expect(row.textContent).toMatch(/Ahmet/i));
  });

  it('bulunamayan aramada bilgilendirme gösterir', async () => {
    const user = userEvent.setup();
    renderPanel('/panel/rezervasyonlar');
    await user.type(await screen.findByLabelText('İsim / telefon / kod'), 'zzzzyokk');
    expect(await screen.findByText('Kriterlere uygun rezervasyon kaydı bulunamadı.')).toBeInTheDocument();
  });

  it('organizasyon filtresi yalnızca o türü bırakır', async () => {
    const user = userEvent.setup();
    renderPanel('/panel/rezervasyonlar');
    await screen.findByRole('table');
    // 'Düğün' aktif işletmede bulunan bir tür (Kına diğer işletmede)
    await user.selectOptions(screen.getByLabelText('Organizasyon'), 'Düğün');
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    expect(rows.length).toBeGreaterThan(0);
    rows.forEach((row) => expect(row.textContent).toMatch(/Düğün/));
  });
});

describe('Yeni rezervasyon formu', () => {
  it('zorunlu alanlar boşken kaydetmez', async () => {
    const user = userEvent.setup();
    renderPanel('/panel/rezervasyonlar/yeni');
    const before = (await getReservations(BIZ)).length;
    await user.click(await screen.findByRole('button', { name: 'Kaydet' }));
    expect(await screen.findByText('Müşteri adını giriniz.')).toBeInTheDocument();
    expect(await getReservations(BIZ)).toHaveLength(before);
  });

  it('kapora toplam tutardan büyük olamaz', async () => {
    const user = userEvent.setup();
    renderPanel('/panel/rezervasyonlar/yeni');
    await user.type(await screen.findByLabelText(/Ad Soyad \(sözleşmeyi imzalayan\)/), 'Deneme Çift');
    await user.type(screen.getByLabelText(/^Cep Telefonu/), '5321234567');
    await user.type(screen.getByLabelText(/Davetli Sayısı/), '300');
    await user.type(screen.getByLabelText(/Toplam Tutar/), '50000');
    await user.type(screen.getByLabelText('Kapora'), '90000');
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));
    expect(await screen.findByText('Kapora, toplam tutardan büyük olamaz.')).toBeInTheDocument();
  });

  it('kalan alacağı otomatik hesaplar', async () => {
    const user = userEvent.setup();
    renderPanel('/panel/rezervasyonlar/yeni');
    await user.type(await screen.findByLabelText(/Toplam Tutar/), '100000');
    await user.type(screen.getByLabelText('Kapora'), '30000');
    expect(screen.getByLabelText('Kalan Alacak')).toHaveValue('70.000');
  });

  it('geçerli kayıt oluşturur ve otomatik SMS gönderir', async () => {
    const user = userEvent.setup();
    renderPanel('/panel/rezervasyonlar/yeni');
    const before = (await getReservations(BIZ)).length;
    const smsBefore = (await getSmsLog(BIZ)).length;

    await user.type(await screen.findByLabelText(/Ad Soyad \(sözleşmeyi imzalayan\)/), 'Yeni Çift');
    await user.type(screen.getByLabelText(/^Cep Telefonu/), '5335554433');
    await user.clear(screen.getByLabelText(/^Tarih/));
    await user.type(screen.getByLabelText(/^Tarih/), addDays(todayIso(), 90));
    await user.type(screen.getByLabelText(/Davetli Sayısı/), '250');
    await user.type(screen.getByLabelText(/Toplam Tutar/), '120000');
    await user.type(screen.getByLabelText('Kapora'), '30000');
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    await waitFor(async () => expect(await getReservations(BIZ)).toHaveLength(before + 1), { timeout: 4000 });
    const created = (await getReservations(BIZ)).find((r: Reservation) => r.customerName === 'Yeni Çift');
    expect(created?.totalAmount).toBe(120000);
    // Sözleşme numarası yıl-sıra: tohumdaki eski biçimli kodlar diziyi
    // etkilemez, ilk yeni kayıt yılın 1'incisidir.
    expect(created?.code).toMatch(new RegExp(`^${new Date().getFullYear()}-[0-9]{1,9}$`));
    const smsAfter = await getSmsLog(BIZ);
    expect(smsAfter.length).toBe(smsBefore + 1);
    expect(smsAfter[0].kind).toBe('Rezervasyon');
  });

  /*
    Raporların istediği alanlar formda SORULMALI. Kapora ödeme tipi
    sorulmuyordu: "Gelecek Kaporalar ve Ödemeler" raporunun ödeme tipi
    sütunu boş kalıyor, kasa dağılımında da sözleşmenin en büyük ilk
    tahsilatı "Belirtilmemiş" satırında birikiyordu.
  */
  it('kapora ödeme tipi sorulur ve kayda geçer', async () => {
    seedIfEmpty();
    const user = userEvent.setup();
    renderPanel('/panel/rezervasyonlar/yeni');

    await user.type(await screen.findByLabelText(/Ad Soyad \(sözleşmeyi imzalayan\)/), 'Ödeme Tipi Testi');
    await user.type(screen.getByLabelText(/^Cep Telefonu/), '5321119988');
    /*
      TARİH TOHUMUN ARALIĞININ DIŞINDA.

      Önce +400/+401 gün yazılıyordu. Tanıtım verisi 2025-03 ile 2028-03
      arasına rezervasyon üretiyor ve üretim rastgele; o aralıktaki bir
      güne aynı salon ve seansla düşen bir kayıt çıktığında form
      "çakışma" diyerek kaydetmiyor, test de sebebi görünmeden düşüyordu.
      Üretim aralığının ötesinde bir gün seçmek çakışmayı imkânsız
      kılıyor.
    */
    await user.clear(screen.getByLabelText(/^Tarih/));
    await user.type(screen.getByLabelText(/^Tarih/), addDays(todayIso(), 1200));
    await user.type(screen.getByLabelText(/Davetli Sayısı/), '250');
    await user.type(screen.getByLabelText(/Toplam Tutar/), '200000');
    await user.type(screen.getByLabelText('Kapora'), '50000');
    await user.selectOptions(screen.getByLabelText('Kapora ödeme tipi'), 'Havale/EFT');
    await user.click(screen.getByRole('button', { name: /Kaydet/ }));

    await waitFor(async () => {
      const kayit = (await getReservations(BIZ)).find((r) => r.customerName === 'Ödeme Tipi Testi');
      expect(kayit?.depositMethod).toBe('Havale/EFT');
    });
  });

  it('kapora yoksa ödeme tipi yazılmaz', async () => {
    seedIfEmpty();
    const user = userEvent.setup();
    renderPanel('/panel/rezervasyonlar/yeni');

    await user.type(await screen.findByLabelText(/Ad Soyad \(sözleşmeyi imzalayan\)/), 'Kaporasız Kayıt');
    await user.type(screen.getByLabelText(/^Cep Telefonu/), '5321119977');
    // Tohumun ürettiği aralığın dışında; gerekçe yukarıdaki testte.
    await user.clear(screen.getByLabelText(/^Tarih/));
    await user.type(screen.getByLabelText(/^Tarih/), addDays(todayIso(), 1201));
    await user.type(screen.getByLabelText(/Davetli Sayısı/), '100');
    await user.type(screen.getByLabelText(/Toplam Tutar/), '80000');
    await user.click(screen.getByRole('button', { name: /Kaydet/ }));

    // Alınmamış parayı kasada "Nakit" göstermemeli.
    await waitFor(async () => {
      const kayit = (await getReservations(BIZ)).find((r) => r.customerName === 'Kaporasız Kayıt');
      expect(kayit).toBeTruthy();
      expect(kayit?.depositMethod).toBeUndefined();
    });
  });

  it('aynı tarih ve seansta çakışma uyarısı verir', async () => {
    seedIfEmpty();
    const existing = (await getReservations(BIZ))[0];
    const user = userEvent.setup();
    renderPanel('/panel/rezervasyonlar/yeni');

    // Çakışma kuralı salon bazındadır: aynı salon seçilmeden uyarı çıkmamalı.
    const hallSelect = await screen.findByLabelText(/^Salon/);
    // Salon listesi eşzamansız yüklenir; seçenek gelmeden seçim yapılamaz.
    await waitFor(() => {
      expect(hallSelect.querySelector(`option[value="${existing.hallId}"]`)).toBeTruthy();
    });
    await user.selectOptions(hallSelect, existing.hallId);
    await user.clear(screen.getByLabelText(/^Tarih/));
    await user.type(screen.getByLabelText(/^Tarih/), existing.date);
    await user.selectOptions(screen.getByLabelText(/^Seans/), existing.slot);
    expect(await screen.findByText(new RegExp(existing.customerName.slice(0, 8)))).toBeInTheDocument();
  });
});

describe('Rezervasyon detayı', () => {
  it('tahsilat ekler ve kalan bakiyeyi düşürür', async () => {
    seedIfEmpty();
    /*
      Ölçüt KALAN BAKİYE: kapora düşülmüş toplam yetmez, kaydın üzerinde
      daha önce girilmiş tahsilatlar da olabilir. Demo veride taksitle
      kapatılmış sözleşmeler var ve onlarda 10.000 TL'lik ek tahsilat
      "kalan alacaktan fazla" diye reddedilirdi.
    */
    const odemeler = await localRepo.listPayments(BIZ);
    const odenen = new Map<string, number>();
    for (const p of odemeler) odenen.set(p.reservationId, (odenen.get(p.reservationId) ?? 0) + p.amount);
    const target = (await getReservations(BIZ)).find(
      (r: Reservation) => r.date >= todayIso() && r.status !== 'İptal'
        && r.totalAmount - r.deposit - (odenen.get(r.id) ?? 0) > 20000)!;
    const user = userEvent.setup();
    renderPanel(`/panel/rezervasyonlar/${target.id}`);

    expect(await screen.findByRole('heading', { name: target.customerName })).toBeInTheDocument();
    await user.type(screen.getByLabelText('Tutar'), '10000');
    await user.click(screen.getByRole('button', { name: 'Ekle' }));

    await waitFor(() => {
      // Sayfada düğün gideri, tedarikçi ve masa düzeni tabloları da var;
      // tahsilat tablosu adıyla seçiliyor.
      const tablo = screen.getByRole('table', { name: 'Tahsilatlar' });
      expect(within(tablo).getAllByRole('row').length).toBeGreaterThan(1);
    });
  });

  it('kalan alacaktan fazla tahsilatı reddeder', async () => {
    seedIfEmpty();
    const target = (await getReservations(BIZ)).find(
      (r: Reservation) => r.date >= todayIso() && r.totalAmount > r.deposit)!;
    const user = userEvent.setup();
    renderPanel(`/panel/rezervasyonlar/${target.id}`);

    await user.type(await screen.findByLabelText('Tutar'), '99999999');
    await user.click(screen.getByRole('button', { name: 'Ekle' }));
    expect(await screen.findByText(/kalan alacaktan .* fazla olamaz/)).toBeInTheDocument();
  });

  it('geçmiş tarihli kayıtta silme düğmesi devre dışıdır', async () => {
    seedIfEmpty();
    const past = (await getReservations(BIZ)).find((r: Reservation) => r.date < todayIso())!;
    renderPanel(`/panel/rezervasyonlar/${past.id}`);
    expect(await screen.findByRole('button', { name: /Sil/ })).toBeDisabled();
    expect(screen.getByText(/Geçmiş tarihli düğünü silemezsiniz/)).toBeInTheDocument();
  });

  it('hatırlatma taslağı seçilince metin rezervasyonun bilgisiyle doldurulur', async () => {
    seedIfEmpty();
    const target = (await getReservations(BIZ))[0];
    const user = userEvent.setup();
    renderPanel(`/panel/rezervasyonlar/${target.id}`);

    await user.click(await screen.findByRole('button', { name: 'Tarih hatırlatması' }));

    // Önizleme zorunlu: taslakta yanlış yazılmış bir yer tutucu ancak
    // müşteriye giden mesajda fark ediliyordu.
    //
    // Metin sadeleştirilmiş hâliyle geliyor ("Sayın" değil "Sayin"):
    // ş, ğ, ı, İ, ç harfleri GSM-7'de olmadığı için biri bile geçtiğinde
    // mesaj 160 yerine 70 karaktere düşüyor ve tek SMS'e sığmıyor.
    const onizleme = await screen.findByText(
      new RegExp(`Sayin ${sadelestir(target.customerName)}`));
    expect(onizleme).toBeInTheDocument();
    expect(onizleme.textContent).not.toContain('{musteri}');
    expect(onizleme.textContent).not.toMatch(/[şŞğĞıİç]/);

    // Hatırlatmanın tek SMS'e sığması bu ekranın vaadi.
    expect(await screen.findByText(/· 1 SMS/)).toBeInTheDocument();
  });

  it('hatırlatma gönderimi kaydı işler ve gönderilemediğinde yanlış bilgi vermez', async () => {
    seedIfEmpty();
    const target = (await getReservations(BIZ))[0];
    const before = (await getSmsLog(target.businessId)).length;
    const user = userEvent.setup();
    renderPanel(`/panel/rezervasyonlar/${target.id}`);

    await user.click(await screen.findByRole('button', { name: 'Tarih hatırlatması' }));
    await user.click(await screen.findByRole('button', { name: /Bu mesajı gönder/ }));

    // Test ortamında SMS sağlayıcısı yok: mesaj kayda geçer, ancak
    // kullanıcıya "gönderildi" denmez, durum açıkça bildirilir.
    await waitFor(async () => expect((await getSmsLog(target.businessId)).length).toBe(before + 1), { timeout: 4000 });
    expect(await screen.findByText(/gönderilemedi|ulaşılamadı/)).toBeInTheDocument();
    expect(screen.queryByText(/Mesaj kuyruğa alındı ve kayıtlara işlendi/)).not.toBeInTheDocument();
  });
});

describe('Salon kiralama sözleşmesi', () => {
  it('sözleşme çıktısını taraflarla birlikte oluşturur', async () => {
    seedIfEmpty();
    const target = (await getReservations(BIZ))[0];
    renderPanel(`/panel/rezervasyonlar/${target.id}/sozlesme`);

    // Başlık, işletmenin basılı sözleşmesindeki gibi salon adıdır.
    expect(await screen.findByRole('heading', { name: 'Grand Sahra Düğün ve Davet Salonu' })).toBeInTheDocument();
    expect(screen.getByText('Kiraya Veren İmza')).toBeInTheDocument();
    expect(screen.getByText('Kiralayan İmza')).toBeInTheDocument();
    expect(screen.getAllByText(target.customerName).length).toBeGreaterThan(0);
    expect(screen.getByText('Sözleşme No :')).toBeInTheDocument();
    expect(screen.getByText(target.code)).toBeInTheDocument();
  });

  it('seçilen menülerin HEPSİNİ sözleşmeye basar', async () => {
    /*
      Yalnızca ilki basılsaydı kınası ayrı, düğünü ayrı paketli bir
      sözleşmenin yarısı kâğıda hiç girmezdi -- ve imzalanan kâğıt
      eksik olurdu. Bu PR'ın tamamı çoklu menü için; sözleşme çıktısı
      da onu izlemek zorunda.
    */
    seedIfEmpty();
    const menuler = await getMenus(BIZ);
    const ikisi = menuler.slice(0, 2);
    expect(ikisi).toHaveLength(2);

    const target = (await getReservations(BIZ))[0];
    await saveReservation({ ...target, menuIds: ikisi.map((m) => m.id) });

    renderPanel(`/panel/rezervasyonlar/${target.id}/sozlesme`);

    await screen.findByRole('heading', { name: 'Grand Sahra Düğün ve Davet Salonu' });
    for (const m of ikisi) {
      expect(screen.getAllByText(m.name).length).toBeGreaterThan(0);
    }
  });

  it('sözleşme şartlarının on altı maddesi çıktıda yer alır', async () => {
    seedIfEmpty();
    const target = (await getReservations(BIZ))[0];
    renderPanel(`/panel/rezervasyonlar/${target.id}/sozlesme`);

    // Başlık CSS ile büyük harfe çevrilir; DOM'daki metin karışık yazımdır.
    const bolum = await screen.findByRole('heading', { name: 'Sözleşme Şartları' });
    const metin = bolum.parentElement?.textContent ?? '';
    expect(metin).toContain('CAYMA TAZMİNATI');
    expect(metin).toContain('16. )');
    expect(metin).toContain('Kredi kartı ödemelerinde');
    // Yetkili mahkeme işletmenin şehrinden gelir, metne gömülü değildir.
    expect(metin).toContain('İstanbul Mahkemeleri');
  });

  it('boş kalan alanlar sözleşmeye hiç basılmaz', async () => {
    seedIfEmpty();
    // Tohumdaki ilk kayıtta TC kimlik numarası yoktur; "TC : -" yazan bir
    // sözleşme doldurulmamış bir form gibi görünürdü.
    const target = (await getReservations(BIZ)).find((r) => !r.identityNo);
    expect(target).toBeTruthy();
    renderPanel(`/panel/rezervasyonlar/${target!.id}/sozlesme`);

    await screen.findByText('Sözleşme No :');
    expect(screen.queryByText('TC :')).not.toBeInTheDocument();
  });
});

describe('Program raporu', () => {
  it('salon sütunlarıyla çizelgeyi çizer', async () => {
    seedIfEmpty();
    renderPanel('/panel/raporlar?tab=cizelge');

    expect(await screen.findByRole('tab', { name: 'Program raporu' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByRole('columnheader', { name: 'Kristal Salon' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Zümrüt Salon' })).toBeInTheDocument();
  });

  it('tarih aralığı seçilince o günleri gösterir', async () => {
    const user = userEvent.setup();
    seedIfEmpty();
    renderPanel('/panel/raporlar?tab=cizelge');

    /*
      Tarihler BUGÜNE GÖRE hesaplanıyor, sabit yazılmıyor. Tohum
      çizelgenin gösterdiği haftayı (bugün + 6 gün) dolduruyor; sabit bir
      eylül tarihi yazılsaydı test takvim ilerledikçe bir gün düşerdi --
      nitekim düştü.
    */
    const gun = (n: number) => {
      const t = new Date();
      t.setDate(t.getDate() + n);
      return t;
    };
    const iso = (t: Date) => `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
    const bant = (t: Date) => new RegExp(
      `^${String(t.getDate()).padStart(2, '0')}\\.${String(t.getMonth() + 1).padStart(2, '0')}\\.${t.getFullYear()}`,
    );

    await user.type(await screen.findByLabelText('Başlangıç tarihi'), iso(gun(1)));
    await user.type(screen.getByLabelText('Bitiş tarihi'), iso(gun(3)));

    // Boş günler de satır olarak durur: çizelge "o gün boş" bilgisini de
    // verir. Dolu bir hücrenin bandına tür de yazıldığı için tam eşleşme
    // yerine tarihe bakılır.
    expect(await screen.findAllByText(bant(gun(1)))).toHaveLength(2);
    expect(screen.getAllByText(bant(gun(3)))).toHaveLength(2);
    expect(screen.queryByText(bant(gun(0)))).not.toBeInTheDocument();
  });

  it('ek notlar çizelgenin altına yazılır', async () => {
    const user = userEvent.setup();
    seedIfEmpty();
    renderPanel('/panel/raporlar?tab=cizelge');

    await user.type(await screen.findByLabelText('Ek notlar'), 'Sahne 12:00 kurulacak.');
    expect(screen.getAllByText(/Sahne 12:00 kurulacak\./).length).toBeGreaterThan(0);
  });

  it('çizelge sekmesinde Word indirme sunulur', async () => {
    seedIfEmpty();
    renderPanel('/panel/raporlar?tab=cizelge');
    expect(await screen.findByRole('button', { name: /Word indir/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /CSV indir/ })).not.toBeInTheDocument();
  });

  it('diğer sekmelerde CSV indirmeye döner', async () => {
    const user = userEvent.setup();
    seedIfEmpty();
    renderPanel('/panel/raporlar?tab=cizelge');
    await user.click(await screen.findByRole('tab', { name: 'Aylık rezervasyon raporu' }));
    expect(screen.getByRole('button', { name: /CSV indir/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Word indir/ })).not.toBeInTheDocument();
  });
});

describe('Gelir gider kayıtları', () => {
  it('gelir/gider ve kasa bakiyesi kartlarını gösterir', async () => {
    renderPanel('/panel/kasa');
    expect(await screen.findByRole('heading', { name: 'Gelir Gider Kayıtları' })).toBeInTheDocument();
    expect(screen.getByText('Toplam Gelir')).toBeInTheDocument();
    expect(screen.getByText('Süzgeçteki Bakiye')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Kasa Durumu' })).toBeInTheDocument();
    /*
      Çelik kasa güncel kasanın ALTINDA, küçük: her ödeme tipi ayrı bakiye.
      Ayrı bir hareket defteri yok; o defter elle işaretleme istiyordu ve
      unutulan her işaret kasayı olduğundan farklı gösteriyordu.
    */
    expect(screen.getByRole('heading', { name: 'Çelik Kasa' })).toBeInTheDocument();
    expect(screen.queryByText('Çelik Kasa Hareketleri')).toBeNull();
  });

  /**
   * Kasa listesini yalnızca GELİR satırlarına indirir.
   *
   * Defter tarihe göre tersten sıralı ve düğün içi giderler (tedarikçi
   * ücretleri dahil) organizasyonun GÜNÜYLE yazılıyor; ileri tarihli
   * düğünlerin giderleri listenin başında duruyor ve tahsilat satırları
   * ilk sayfaya düşmüyor. Süzgeç, testin bakmak istediği satırı ekrana
   * getiriyor -- sayfa boyutunu büyütmek veri arttıkça yine yetmezdi.
   */
  async function yalnizcaGelir(user: ReturnType<typeof userEvent.setup>) {
    await user.selectOptions(screen.getByLabelText('Tür filtresi'), 'Gelir');
  }

  it('rezervasyon tahsilatlarını sözleşme numarası ve taraflarla listeler', async () => {
    const user = userEvent.setup();
    seedIfEmpty();
    const kayitlar = new Map((await getReservations(BIZ)).map((r) => [r.code, r]));
    renderPanel('/panel/kasa');

    await screen.findByRole('heading', { name: 'Gelir Gider Kayıtları' });
    await yalnizcaGelir(user);

    /*
      Kasa sayfalandığı için önceden seçilmiş bir sözleşme ilk sayfada
      olmayabilir. Ölçüt zaten kaydın kendisi değil: EKRANDAKİ kapora
      satırı, hangi sözleşmeye ait olduğunu kendi başına anlatmalı.
    */
    const tablo = screen.getByRole('table', { name: 'Gelir ve gider kayıtları' });
    const kaporaSatiri = within(tablo).getAllByRole('row').slice(1)
      .find((satir) => within(satir).queryByText('Kapora'));
    expect(kaporaSatiri).toBeTruthy();

    const kod = within(kaporaSatiri!).getByText(/^\d{4}-\d+$/).textContent!;
    const kayit = kayitlar.get(kod)!;
    expect(kayit).toBeTruthy();
    // Satırdaki bağlantı o sözleşmenin kendi sayfasına gitmeli.
    expect(within(kaporaSatiri!).getByRole('link')).toHaveAttribute(
      'href', `/panel/rezervasyonlar/${kayit.id}`);
  });

  it('rezervasyondan gelen satır silinemez', async () => {
    const user = userEvent.setup();
    seedIfEmpty();
    renderPanel('/panel/kasa');

    await screen.findByRole('heading', { name: 'Gelir Gider Kayıtları' });
    await yalnizcaGelir(user);
    // Türetilmiş satırın silme düğmesi yerine kaynağını söyleyen bir etiket
    // durur; düzeltme rezervasyon ekranından yapılır.
    expect(screen.getAllByText('Rezervasyon').length).toBeGreaterThan(0);
  });








  it('geçersiz tutarı reddeder', async () => {
    const user = userEvent.setup();
    renderPanel('/panel/kasa');
    await user.type(await screen.findByLabelText('Tutar'), '-5');
    await user.click(screen.getByRole('button', { name: /Kaydet/ }));
    expect(await screen.findByText('Geçerli bir tutar giriniz.')).toBeInTheDocument();
  });

  it('yeni gider kaydı ekler', async () => {
    const user = userEvent.setup();
    renderPanel('/panel/kasa');
    await user.selectOptions(await screen.findByLabelText('Tür'), 'Gider');
    await user.type(screen.getByLabelText('Tutar'), '5000');
    await user.type(screen.getByLabelText('Açıklama'), 'Test gideri');
    await user.click(screen.getByRole('button', { name: /Kaydet/ }));
    expect(await screen.findByText('Test gideri')).toBeInTheDocument();
  });

  it('tür filtresi yalnızca seçileni bırakır', async () => {
    const user = userEvent.setup();
    renderPanel('/panel/kasa');
    await user.selectOptions(await screen.findByLabelText('Tür filtresi'), 'Gider');
    const tablo = screen.getByRole('table', { name: 'Gelir ve gider kayıtları' });
    const rows = within(tablo).getAllByRole('row').slice(1);
    rows.forEach((row) => expect(row.textContent).toContain('Gider'));
  });
});

describe('Raporlar', () => {
  /*
    Birden çok salon işleten sahibin "toplam ne kadar iş yaptım" sorusu.
    Rapor eskiden yalnızca etkin işletmeye bakıyordu ve cevap için iki
    raporu elle toplamak gerekiyordu.
  */
  it('birden çok işletmede kapsam seçimi çıkıyor', async () => {
    renderPanel('/panel/raporlar');
    const kapsam = await screen.findByRole('group', { name: 'Rapor kapsamı' });
    expect(within(kapsam).getByText('Grand Sahra Düğün ve Davet Salonu')).toBeInTheDocument();
    expect(within(kapsam).getByText('Yıldız Kır Bahçesi')).toBeInTheDocument();
    // Seçim yapılmadan önce yalnızca etkin işletme raporlanıyor.
    expect(within(kapsam).getByText('Tek işletme raporlanıyor.')).toBeInTheDocument();
  });

  it('tümünü seç bütün işletmeleri kapsama alıyor', async () => {
    const user = userEvent.setup();
    renderPanel('/panel/raporlar');
    const kapsam = await screen.findByRole('group', { name: 'Rapor kapsamı' });

    /*
      Kapsam değişince veri yeniden yükleniyor ve bölüm yeniden
      çiziliyor; düğüm her adımda yeniden sorgulanıyor. Bir kez yakalanan
      düğüm tutulsaydı test, ekranda olmayan eski metni okurdu.
    */
    await user.click(within(kapsam).getByRole('button', { name: 'Tümünü seç' }));
    await waitFor(() => {
      expect(screen.getByText('2 işletmenin kayıtları birlikte raporlanıyor.')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Yalnızca etkin işletme' }));
    await waitFor(() => {
      expect(screen.getByText('Tek işletme raporlanıyor.')).toBeInTheDocument();
    });
  });

  it('program raporu sekmesi varsayılan açıktır', async () => {
    renderPanel('/panel/raporlar');
    expect(await screen.findByRole('tab', { name: 'Program raporu' })).toHaveAttribute('aria-selected', 'true');
  });

  it('organizasyon bazlı rapora geçiş yapar', async () => {
    const user = userEvent.setup();
    renderPanel('/panel/raporlar');
    await user.click(await screen.findByRole('tab', { name: 'Organizasyon bazlı rapor' }));
    expect(screen.getByRole('tab', { name: 'Organizasyon bazlı rapor' })).toHaveAttribute('aria-selected', 'true');
  });

  it('ay bazlı rapora geçiş yapar', async () => {
    const user = userEvent.setup();
    renderPanel('/panel/raporlar');
    await user.click(await screen.findByRole('tab', { name: 'Aylık rezervasyon raporu' }));
    expect(screen.getByRole('tab', { name: 'Aylık rezervasyon raporu' })).toHaveAttribute('aria-selected', 'true');
  });

  it('gelecek kaporalar sekmesi toplam satırı içerir', async () => {
    const user = userEvent.setup();
    renderPanel('/panel/raporlar');
    await user.click(await screen.findByRole('tab', { name: 'Gelecek Kaporalar ve Ödemeler' }));
    expect(await screen.findByText('Toplam kalan alacak')).toBeInTheDocument();
  });

  it('gelecekteki tarih aralığında boş sonuç bildirir', async () => {
    const user = userEvent.setup();
    renderPanel('/panel/raporlar');
    // Çizelge boş günleri de çizer; "kayıt yok" iletisi diğer raporlarda.
    await user.click(await screen.findByRole('tab', { name: 'Aylık rezervasyon raporu' }));
    await user.type(await screen.findByLabelText('Başlangıç tarihi'), '2099-01-01');
    expect(await screen.findByText('Seçilen tarih aralığında kayıt bulunmuyor.')).toBeInTheDocument();
  });
});

describe('Renk ayarları', () => {
  it('rengi değiştirip kaydeder', async () => {
    const user = userEvent.setup();
    renderPanel('/panel/renk-ayarlari');

    // <input type="color"> klavye ile yazılamadığı için değer doğrudan değiştirilir
    const colorInput = (await screen.findByLabelText('Düğün rengi')) as HTMLInputElement;
    fireEvent.input(colorInput, { target: { value: '#ff0000' } });

    await user.click(screen.getByRole('button', { name: 'Kaydet' }));
    expect(await screen.findByText('Renk ayarlarınız kaydedildi.')).toBeInTheDocument();
    await waitFor(async () =>
      expect((await getColorSettings(BIZ)).find((c) => c.key === 'dugun')?.color).toBe('#ff0000'),
      { timeout: 4000 });
  });
});

describe('Müşteriler', () => {
  it('rezervasyonlardan müşteri listesi türetir', async () => {
    renderPanel('/panel/musteriler');
    expect(await screen.findByRole('heading', { name: 'Müşteriler' })).toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('arama listeyi daraltır', async () => {
    const user = userEvent.setup();
    renderPanel('/panel/musteriler');
    await user.type(await screen.findByLabelText('İsim veya telefon ile ara'), 'zzzzyok');
    expect(await screen.findByText('Müşteri kaydı bulunamadı.')).toBeInTheDocument();
  });
});

describe('SMS kayıtları', () => {
  it('gönderilmiş mesajları listeler', async () => {
    renderPanel('/panel/sms');
    expect(await screen.findByRole('heading', { name: 'SMS Kayıtları' })).toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('tür filtresi uygulanabilir', async () => {
    const user = userEvent.setup();
    renderPanel('/panel/sms');
    await user.selectOptions(await screen.findByLabelText('Mesaj türü'), 'Doğrulama');
    expect(await screen.findByText('SMS kaydı bulunamadı.')).toBeInTheDocument();
  });
});

describe('Ulaşım kanalı ve WhatsApp talepleri', () => {
  it('kanal raporu sekmesi kanalları ve payları gösterir', async () => {
    seedIfEmpty();
    renderPanel('/panel/raporlar?tab=kanal');

    // Ad hem sol listedeki sekmede hem panel başlığında geçiyor.
    expect(await screen.findByRole('tab', { name: 'Ulaşım kanalı' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByText('Instagram')).toBeInTheDocument();
    // Kanalı boş bırakılan kayıtlar gizlenmiyor; payları bozmasın diye sayılıyor.
    expect(screen.getByText('Belirtilmemiş')).toBeInTheDocument();
    expect(screen.getAllByText(/^%\d/).length).toBeGreaterThan(0);
  });

  it('yeni rezervasyon formunda kanal seçilebilir', async () => {
    renderPanel('/panel/rezervasyonlar/yeni');
    const secim = await screen.findByLabelText('Bize nereden ulaştı?');
    expect(secim).toBeInTheDocument();
    // Şartnamedeki kanal listesi (madde 8).
    for (const kanal of ['Instagram', 'Facebook', 'WhatsApp', 'Web Sitesi',
      'Google', 'Tavsiye', 'Telefon', 'Diğer']) {
      expect(within(secim as HTMLSelectElement).getByRole('option', { name: kanal }))
        .toBeInTheDocument();
    }
    // Listeden çıkarılan eski kanal yeni kayıtta seçilemez.
    expect(within(secim as HTMLSelectElement).queryByRole('option', { name: 'Düğün.com' }))
      .toBeNull();
  });

  it('Diğer seçilip açıklama yazılmazsa kayıt reddedilir', async () => {
    const user = userEvent.setup();
    seedIfEmpty();
    renderPanel('/panel/rezervasyonlar/yeni');

    await screen.findByLabelText('Bize nereden ulaştı?');
    // Kanal dışındaki alanlar doğru doldurulmuş olmalı ki düşen tek kural
    // kanal açıklaması olsun.
    await user.type(document.getElementById('customerName')!, 'Kanal Denemesi');
    await user.type(document.getElementById('customerPhone')!, '5321112233');
    await user.clear(document.getElementById('guestCount')!);
    await user.type(document.getElementById('guestCount')!, '200');
    await user.clear(document.getElementById('totalAmount')!);
    await user.type(document.getElementById('totalAmount')!, '100000');
    await user.selectOptions(screen.getByLabelText('Bize nereden ulaştı?'), 'Diğer');
    await user.click(screen.getByRole('button', { name: /Kaydet/ }));

    expect(await screen.findByText('Diğer seçildiğinde nereden ulaştığını yazınız.'))
      .toBeInTheDocument();
  });

  it('müşteri adayları ekranı adayları ve durumlarını gösterir', async () => {
    seedIfEmpty();
    renderPanel('/panel/musteri-adaylari');

    expect(await screen.findByRole('heading', { name: 'Müşteri Adayları' })).toBeInTheDocument();
    expect(screen.getByText('Ömer Ay')).toBeInTheDocument();
    // Ekranda durum KODU değil, işletmenin verdiği ad görünüyor.
    expect(screen.getAllByText('Yeni').length).toBeGreaterThan(0);
  });

  it('geciken takip listede vurgulanır', async () => {
    // Gecikmiş iş, günlük işin içinde kaybolmamalı.
    seedIfEmpty();
    renderPanel('/panel/musteri-adaylari');
    await screen.findByRole('heading', { name: 'Müşteri Adayları' });
    expect(screen.getByText('Takip tarihi geçti.')).toBeInTheDocument();
  });

  it('durum süzgeci listeyi daraltır', async () => {
    const user = userEvent.setup();
    seedIfEmpty();
    renderPanel('/panel/musteri-adaylari');
    await screen.findByRole('heading', { name: 'Müşteri Adayları' });

    await user.selectOptions(screen.getByLabelText('Durum filtresi'), 'Ulaşılamadı');
    await waitFor(() => expect(screen.queryByText('Ömer Ay')).not.toBeInTheDocument());
    expect(screen.getByText('Elif Kara')).toBeInTheDocument();
  });

  it('aday kartında durum değiştirilince geçmişe işlenir', async () => {
    const user = userEvent.setup();
    clearAll();
    seedIfEmpty();
    renderPanel('/panel/musteri-adaylari/lead_seed_1');

    await screen.findByRole('heading', { name: 'Ömer Ay' });
    // Seçenek değeri kod, görünen metin ad.
    await user.selectOptions(screen.getByLabelText('Durum'), 'arandi');

    // Kim, ne zaman, neyden neye: geçmiş tetikleyiciyle yazılıyor.
    expect(await screen.findByText(/Durum "Yeni" → "Arandı"/)).toBeInTheDocument();
  });

  it('yeni aday düğmesi elle kayıt formunu açar', async () => {
    // Rota eksikken bu düğme ":id" kalıbına düşüp "aday bulunamadı" diyordu.
    const user = userEvent.setup();
    clearAll();
    seedIfEmpty();
    renderPanel('/panel/musteri-adaylari');
    await screen.findByRole('heading', { name: 'Müşteri Adayları' });

    await user.click(screen.getByRole('link', { name: /Yeni aday/ }));
    expect(await screen.findByRole('heading', { name: 'Yeni Müşteri Adayı' })).toBeInTheDocument();
  });

  it('elle açılan aday kaydedilir ve geçmişi ilk satırıyla başlar', async () => {
    const user = userEvent.setup();
    clearAll();
    seedIfEmpty();
    renderPanel('/panel/musteri-adaylari/yeni');
    await screen.findByRole('heading', { name: 'Yeni Müşteri Adayı' });

    await user.type(screen.getByLabelText(/Ad Soyad/), 'Nazlı Demir');
    await user.type(screen.getByLabelText(/^Telefon/), '0533 111 22 33');
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    // Kayıt sonrası doğrudan detay ekranına geçer.
    expect(await screen.findByRole('heading', { name: 'Nazlı Demir' })).toBeInTheDocument();
    expect(screen.getByText(/Müşteri adayı elle oluşturuldu/)).toBeInTheDocument();
  });

  it('elle aday formu geçersiz telefonu reddeder', async () => {
    const user = userEvent.setup();
    clearAll();
    seedIfEmpty();
    renderPanel('/panel/musteri-adaylari/yeni');
    await screen.findByRole('heading', { name: 'Yeni Müşteri Adayı' });

    await user.type(screen.getByLabelText(/Ad Soyad/), 'Hatalı Kayıt');
    await user.type(screen.getByLabelText(/^Telefon/), '123');
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    expect(await screen.findByText(/Geçerli bir cep telefonu giriniz/)).toBeInTheDocument();
  });

  it('WhatsApp\'ta Aç bağlantısı wa.me adresine gider', async () => {
    // Bu Cloud API değil: tarayıcıda konuşmayı açar, mesajı personel yazar.
    seedIfEmpty();
    renderPanel('/panel/musteri-adaylari/lead_seed_1');

    const bag = await screen.findByRole('link', { name: /WhatsApp'ta Aç/ });
    expect(bag).toHaveAttribute('href', 'https://wa.me/905332642537');
  });

  it('dashboard müşteri takip özetini gösterir', async () => {
    seedIfEmpty();
    renderPanel('/panel');

    expect(await screen.findByRole('heading', { name: 'Müşteri takip' })).toBeInTheDocument();
    expect(screen.getByText('Bugün aranacak')).toBeInTheDocument();
    expect(screen.getByText('Geciken takip')).toBeInTheDocument();
  });
});

/*
  ÜRÜN VE HİZMET: SAYIM ÇIKTISI.

  Ekran en çok stok saymak için açılıyor. Sayım kâğıdı depoya
  götürülüp elle dolduruluyor; belirli bir grubu sayarken tüm listeyi
  bastırmak gerekmesin diye satırlar tek tek seçilebiliyor.
*/
describe('Ürün ve Hizmet ekranı', () => {
  it('doğrudan stok sekmesiyle açılır', async () => {
    /*
      Hizmet tanımı bir kez girilip nadiren değişiyor; stok her hafta
      sayılıyor. Hizmetle açıldığında kullanıcı her gelişinde fazladan
      bir tık yapıyordu.
    */
    renderPanel('/panel/urun-hizmet');

    const urunSekmesi = await screen.findByRole('tab', { name: 'Ürünler ve Stok' });
    expect(urunSekmesi).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Hizmetler' })).toHaveAttribute('aria-selected', 'false');
  });

  it('stoğun TL karşılığını toplam satırında gösterir', async () => {
    renderPanel('/panel/urun-hizmet');

    // "Elimizdeki stoğun TL karşılığı": her ürünün toplam adedi x birim fiyatı.
    expect(await screen.findByText('Stok Değeri')).toBeInTheDocument();
  });

  it('seçim yapılınca toplam yalnızca seçileni sayar', async () => {
    const user = userEvent.setup();
    renderPanel('/panel/urun-hizmet');

    expect(await screen.findByText(/Seçim yapılmadı/)).toBeInTheDocument();

    // Su (0,5 lt): 10 koli x 24 + 6 = 246 adet, adedi 4 TL -> 984,00 ₺
    await user.click(screen.getByLabelText('Su (0,5 lt) ürününü çıktıya ekle'));

    expect(await screen.findByText(/1 ürün seçili/)).toBeInTheDocument();

    const ekranTablosu = screen.getByRole('table', { name: 'Ürün stokları' });
    expect(within(ekranTablosu).getByText('984,00 ₺')).toBeInTheDocument();

    /*
      Kâğıt da aynı rakamı vermeli. İkisi ayrı hesaplansaydı ekranda
      doğru görünen toplam kâğıda yanlış basılabilirdi -- sayım biteli
      çok sonra, kimse fark etmeden.
    */
    const kagit = screen.getByRole('table', { name: 'Stok sayım listesi' });
    /*
      Kâğıtta iki kez geçiyor ve geçmeli: satırın kendi tutarı ve alttaki
      toplam. Tek ürün seçiliyken bu ikisi zaten eşit -- eşit değillerse
      toplam satırı yanlış hesaplıyor demektir.
    */
    expect(within(kagit).getAllByText('984,00 ₺')).toHaveLength(2);
    // Seçilmeyen ürün kâğıtta hiç yer almamalı.
    expect(within(kagit).queryByText('Kola (330 ml)')).not.toBeInTheDocument();
  });

  it('seçim temizlenince liste tamamına döner', async () => {
    const user = userEvent.setup();
    renderPanel('/panel/urun-hizmet');

    await user.click(await screen.findByLabelText('Su (0,5 lt) ürününü çıktıya ekle'));
    await user.click(screen.getByRole('button', { name: 'Seçimi temizle' }));

    expect(await screen.findByText(/Seçim yapılmadı/)).toBeInTheDocument();
  });

  it('sekme değişince seçim taşınmaz', async () => {
    /*
      Kalsaydı hizmet sekmesinde yapılan seçim ürün sekmesine taşınır,
      kullanıcının görmediği satırlar çıktıya girerdi.
    */
    const user = userEvent.setup();
    renderPanel('/panel/urun-hizmet');

    await user.click(await screen.findByLabelText('Su (0,5 lt) ürününü çıktıya ekle'));
    expect(await screen.findByText(/1 ürün seçili/)).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Hizmetler' }));
    await user.click(screen.getByRole('tab', { name: 'Ürünler ve Stok' }));

    expect(await screen.findByText(/Seçim yapılmadı/)).toBeInTheDocument();
  });

  it('Excel ve A4 çıktısı düğmeleri stok sekmesinde durur', async () => {
    const user = userEvent.setup();
    renderPanel('/panel/urun-hizmet');

    expect(await screen.findByRole('button', { name: /Excel'e Aktar/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sayım Çıktısı/ })).toBeInTheDocument();

    // Hizmetin sayılacak adedi yok; kâğıt orada anlamsız.
    await user.click(screen.getByRole('tab', { name: 'Hizmetler' }));
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /Sayım Çıktısı/ })).not.toBeInTheDocument();
    });
  });

  it('A4 sayım kâğıdında elle doldurulacak boş sütun bulunur', async () => {
    renderPanel('/panel/urun-hizmet');

    const kagit = await screen.findByRole('table', { name: 'Stok sayım listesi' });
    expect(within(kagit).getByRole('columnheader', { name: 'Sayım' })).toBeInTheDocument();
    // Sistemdeki adet yanında dursun ki fark depoda görülebilsin.
    expect(within(kagit).getByRole('columnheader', { name: 'Toplam Adet' })).toBeInTheDocument();
  });
});

/*
  DÜĞÜN İÇİ GİDER: TÜR SEÇİMİ.

  Alan serbest metin olarak kalıyor -- her salonun kalemi farklı ve
  buraya bir kerelik kalemler de yazılıyor. Tanımlı ürün ve hizmetler
  ÖNERİ olarak sunuluyor: garson, konfeti gibi kalemler tek tıkla
  seçiliyor, gerisi elle yazılabiliyor.
*/
describe('Düğün içi gider türü', () => {
  async function gelecekRezervasyon() {
    seedIfEmpty();
    return (await getReservations(BIZ)).find(
      (r: Reservation) => r.date >= todayIso() && r.status !== 'İptal',
    )!;
  }

  it('ürün ve hizmet kayıtlarını öneri olarak sunar', async () => {
    const target = await gelecekRezervasyon();
    renderPanel(`/panel/rezervasyonlar/${target.id}`);

    const tur = await screen.findByLabelText('Tür');
    const listeId = tur.getAttribute('list');
    expect(listeId).toBeTruthy();

    const liste = document.getElementById(listeId!)!;
    const secenekleriOku = () =>
      Array.from(liste.querySelectorAll('option')).map((o) => o.getAttribute('value'));

    // Hizmet de ürün de önerilmeli: gider ikisinden de olabiliyor.
    await waitFor(() => expect(secenekleriOku()).toContain('Garson'));
    expect(secenekleriOku()).toContain('Su (0,5 lt)');
  });

  it('alan serbest metin olarak kalır', async () => {
    /*
      Açılır listeye çevrilseydi "Jeneratör kirası" gibi bir kerelik bir
      kalem için önce Ürün/Hizmet ekranında kayıt açmak gerekirdi.
      Ayrıca eski kayıtların türü listede olmayan metinler.
    */
    const user = userEvent.setup();
    const target = await gelecekRezervasyon();
    renderPanel(`/panel/rezervasyonlar/${target.id}`);

    const tur = await screen.findByLabelText('Tür');
    expect(tur.tagName).toBe('INPUT');

    await user.type(tur, 'Jeneratör kirası');
    expect(tur).toHaveValue('Jeneratör kirası');
  });

  it('tanımlı kalem seçilince birim fiyatı doldurur', async () => {
    const user = userEvent.setup();
    const target = await gelecekRezervasyon();
    renderPanel(`/panel/rezervasyonlar/${target.id}`);

    // Garson kişi başı 2000 TL olarak tanımlı.
    await user.type(await screen.findByLabelText('Tür'), 'Garson');
    await waitFor(() => expect(screen.getByLabelText('Birim fiyat')).toHaveValue('2000'));
  });

  it('kullanıcının yazdığı fiyatın üzerine yazmaz', async () => {
    /*
      Yazsaydı, anlaşılan farklı bir ücret kullanıcı türe dokunduğu an
      sessizce tanımlı fiyata dönerdi.
    */
    const user = userEvent.setup();
    const target = await gelecekRezervasyon();
    renderPanel(`/panel/rezervasyonlar/${target.id}`);

    await user.type(await screen.findByLabelText('Birim fiyat'), '3500');
    await user.type(screen.getByLabelText('Tür'), 'Garson');

    expect(screen.getByLabelText('Birim fiyat')).toHaveValue('3500');
  });
});

/*
  DAMAT, GELİN VE MEMLEKET.

  Kayıtta zaten iki taraf vardı (`customerName` / `brideName`);
  sözleşme bunları "Gelin ve Damat" diye basıyordu ama form genel
  isimlerle soruyordu. Yeni alan açılmadı -- aynı kişi iki yerde durur,
  biri güncellenip öteki unutulurdu. Değişen, verinin nasıl sorulduğu.

  Memleket ise gerçekten yoktu: `note` alanına serbest metin olarak
  yazılıyor, aranamıyor ve sözleşmeye basılamıyordu.
*/
describe('Rezervasyon tarafları', () => {
  it('düğünde alanları damat ve gelin diye sorar', async () => {
    renderPanel('/panel/rezervasyonlar/yeni');

    // Sözleşmeyi imzalayan, damat ve gelin AYRI üç kişi.
    expect(await screen.findByLabelText(/^Ad Soyad/)).toBeInTheDocument();
    expect(screen.getByLabelText('Damat Ad Soyad')).toBeInTheDocument();
    expect(screen.getByLabelText('Gelin Ad Soyad')).toBeInTheDocument();
    expect(screen.getByLabelText(/^Cep Telefonu/)).toBeInTheDocument();
    expect(screen.getByLabelText('Damat Cep')).toBeInTheDocument();
    expect(screen.getByLabelText('Gelin Cep')).toBeInTheDocument();
    expect(screen.getByLabelText('Damat Memleket')).toBeInTheDocument();
    expect(screen.getByLabelText('Gelin Memleket')).toBeInTheDocument();
    expect(screen.getByLabelText('Damat Köy / İlçe')).toBeInTheDocument();
    expect(screen.getByLabelText('Gelin E-Posta')).toBeInTheDocument();
  });

  it('organizasyon türü değişince etiketler de değişir', async () => {
    /*
      Sabit "Damat" olsaydı bir şirket toplantısını giren kişi kendi
      müşterisini damat diye kaydetmek zorunda kalırdı.
    */
    const user = userEvent.setup();
    renderPanel('/panel/rezervasyonlar/yeni');

    await user.selectOptions(await screen.findByLabelText(/Organizasyon Türü/), 'Toplantı');

    expect(screen.getByLabelText('Müşteri Ad Soyad')).toBeInTheDocument();
    expect(screen.getByLabelText('Müşteri Memleket')).toBeInTheDocument();
    expect(screen.queryByLabelText('Damat Ad Soyad')).not.toBeInTheDocument();
  });

  it('memleketi kaydeder ve detayda gösterir', async () => {
    const user = userEvent.setup();
    seedIfEmpty();
    const before = (await getReservations(BIZ)).length;
    renderPanel('/panel/rezervasyonlar/yeni');

    await user.type(await screen.findByLabelText(/Ad Soyad \(sözleşmeyi imzalayan\)/), 'Memleket Testi');
    await user.type(screen.getByLabelText(/^Cep Telefonu/), '5321234599');
    await user.selectOptions(screen.getByLabelText('Damat Memleket'), 'Sivas');
    await user.selectOptions(screen.getByLabelText('Gelin Memleket'), 'Konya');
    await user.type(screen.getByLabelText(/Davetli Sayısı/), '150');
    await user.type(screen.getByLabelText(/Toplam Tutar/), '100000');
    await user.click(screen.getByRole('button', { name: /Kaydet/ }));

    await waitFor(
      async () => expect(await getReservations(BIZ)).toHaveLength(before + 1),
      { timeout: 4000 },
    );
    const kayit = (await getReservations(BIZ)).find(
      (r: Reservation) => r.customerName === 'Memleket Testi',
    )!;
    expect(kayit.groomHometown).toBe('Sivas');
    expect(kayit.brideHometown).toBe('Konya');
  });

  it('memleket boş bırakılabilir', async () => {
    /*
      Eski kayıtların hepsinde boş; o bilgi hiç sorulmamıştı. Zorunlu
      yapılsaydı mevcut bir kaydı düzenlemek isteyen kullanıcı,
      bilmediği bir alanı doldurmadan kaydedemezdi.
    */
    const user = userEvent.setup();
    seedIfEmpty();
    const before = (await getReservations(BIZ)).length;
    renderPanel('/panel/rezervasyonlar/yeni');

    await user.type(await screen.findByLabelText(/Ad Soyad \(sözleşmeyi imzalayan\)/), 'Memleketsiz Kayıt');
    await user.type(screen.getByLabelText(/^Cep Telefonu/), '5321234588');
    await user.type(screen.getByLabelText(/Davetli Sayısı/), '100');
    await user.type(screen.getByLabelText(/Toplam Tutar/), '50000');
    await user.click(screen.getByRole('button', { name: /Kaydet/ }));

    await waitFor(
      async () => expect(await getReservations(BIZ)).toHaveLength(before + 1),
      { timeout: 4000 },
    );
    const kayit = (await getReservations(BIZ)).find(
      (r: Reservation) => r.customerName === 'Memleketsiz Kayıt',
    )!;
    expect(kayit.groomHometown).toBeUndefined();
  });
});

describe('Rezervasyon menü ve ekler', () => {
  it('birden fazla menü seçilebilir ve hepsi kaydedilir', async () => {
    /*
      Sözleşmeye çoğu zaman tek paket girmiyor: kına ayrı, düğün ayrı
      anlaşılıyor. Tek seçim olduğunda ikincisi not alanına yazılıyor,
      oradan da fiyata, programa ve sözleşmeye hiç yansımıyordu.
    */
    const user = userEvent.setup();
    seedIfEmpty();
    const before = (await getReservations(BIZ)).length;
    renderPanel('/panel/rezervasyonlar/yeni');

    await user.type(await screen.findByLabelText(/Ad Soyad \(sözleşmeyi imzalayan\)/), 'Çift Menü');
    await user.type(screen.getByLabelText(/^Cep Telefonu/), '5321234577');
    await user.type(screen.getByLabelText(/Davetli Sayısı/), '150');
    await user.type(screen.getByLabelText(/Toplam Tutar/), '100000');

    const kutular = screen.getAllByRole('checkbox', { name: /·/ });
    expect(kutular.length).toBeGreaterThan(1);
    await user.click(kutular[0]);
    await user.click(kutular[1]);
    // İkincisi işaretlenince birincisi DÜŞMEMELİ.
    expect((kutular[0] as HTMLInputElement).checked).toBe(true);

    await user.click(screen.getByRole('button', { name: /Kaydet/ }));

    await waitFor(
      async () => expect(await getReservations(BIZ)).toHaveLength(before + 1),
      { timeout: 4000 },
    );
    const kayit = (await getReservations(BIZ)).find(
      (r: Reservation) => r.customerName === 'Çift Menü',
    )!;
    expect(kayit.menuIds).toHaveLength(2);
  });

  it('bir hizmet işaretlenince genel toplam artar', async () => {
    /*
      `fiyatHesapla` çağrısı `ekler: 0` ile sabitlenmişti: kullanıcı
      orkestrayı işaretliyor, genel toplam hiç değişmiyordu. Sözleşme
      fiyatı bu kalemi içerdiği için öneri sistematik olarak düşük
      çıkıyordu.
    */
    const user = userEvent.setup();
    seedIfEmpty();
    renderPanel('/panel/rezervasyonlar/yeni');

    await user.type(await screen.findByLabelText(/Davetli Sayısı/), '100');
    await user.type(screen.getByLabelText(/Fiyat Kişibaşı/), '1000');

    const ozet = await screen.findByText('Genel Toplam');
    const oncesi = ozet.parentElement?.textContent ?? '';

    const hizmetKutulari = screen.getAllByRole('checkbox', { name: /^\+?[^·]+$/ })
      .filter((k) => k.closest('fieldset')?.textContent?.includes('Pakete dahil hizmetler'));
    expect(hizmetKutulari.length).toBeGreaterThan(0);
    await user.click(hizmetKutulari[0]);

    await waitFor(() => {
      expect(screen.getByText('Genel Toplam').parentElement?.textContent).not.toBe(oncesi);
    });
  });
});

/*
  PASİF ÜRÜN ÇIKTIYA GİRMEMELİ.

  Formdaki tanım açık: "Aktif (organizasyonlara atanabilir, stok
  listesinde görünür)". Pasife alınan ürün artık stok listesinin
  parçası değil; sayım kâğıdına basılırsa depoda aranır, stok
  değerine katılırsa "elimizdeki stoğun TL karşılığı" fazla çıkar.
*/
describe('Ürün ve Hizmet, pasif kayıtlar', () => {
  async function pasifUrunEkle() {
    seedIfEmpty();
    await localRepo.saveVendor({
      id: 'urun_pasif', businessId: BIZ, name: 'Kaldırılmış Bardak',
      category: 'Sarf Malzeme', kind: 'urun', phone: '', note: '',
      unitPrice: 1000, boxCount: 1, unitsPerBox: 100, looseCount: 0, minCount: 0,
      isActive: false,
    });
  }

  it('listede görünür ama sayım kâğıdına girmez', async () => {
    await pasifUrunEkle();
    renderPanel('/panel/urun-hizmet');

    // Yönetim ekranı: kullanıcı pasif kaydı görüp tekrar açabilmeli.
    const ekran = await screen.findByRole('table', { name: 'Ürün stokları' });
    await waitFor(() => expect(within(ekran).getByText('Kaldırılmış Bardak')).toBeInTheDocument());

    // Çıktı sınırı: kâğıtta yok.
    const kagit = screen.getByRole('table', { name: 'Stok sayım listesi' });
    expect(within(kagit).queryByText('Kaldırılmış Bardak')).not.toBeInTheDocument();
  });

  it('pasif kayıt seçilemiyor', async () => {
    await pasifUrunEkle();
    renderPanel('/panel/urun-hizmet');

    const kutu = await screen.findByLabelText('Kaldırılmış Bardak pasif; çıktıya eklenemez');
    expect(kutu).toBeDisabled();
  });

  it('pasif ürünün değeri stok toplamına katılmaz', async () => {
    /*
      1 koli x 100 adet x 1000 TL = 100.000 TL. Toplama katılsaydı
      rakam gözle görülür şekilde şişerdi.
    */
    await pasifUrunEkle();
    renderPanel('/panel/urun-hizmet');

    const ekran = await screen.findByRole('table', { name: 'Ürün stokları' });
    await waitFor(() => expect(within(ekran).getByText('Kaldırılmış Bardak')).toBeInTheDocument());
    expect(within(ekran).queryByText('100.000,00 ₺')).not.toBeInTheDocument();
  });
});

/*
  İSTEĞE BAĞLI ALANLARIN DOĞRULANMASI.

  Form `noValidate` ile gönderiliyor: tarayıcının type="email" denetimi
  devrede değil, type="tel" zaten hiç denetlemiyor. Bozuk değer sessizce
  kaydediliyordu ve sonucu ancak günler sonra, o numaraya hatırlatma
  gönderilmeye çalışıldığında görülüyordu.
*/
describe('Rezervasyon formu, isteğe bağlı alan doğrulaması', () => {
  async function formAc() {
    seedIfEmpty();
    renderPanel('/panel/rezervasyonlar/yeni');
    await screen.findByLabelText(/^Ad Soyad/);
  }

  async function zorunlulariDoldur(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByLabelText(/^Ad Soyad/), 'Doğrulama Testi');
    await user.type(screen.getByLabelText(/^Cep Telefonu/), '5321234577');
    await user.type(screen.getByLabelText(/Davetli Sayısı/), '100');
    await user.type(screen.getByLabelText(/Toplam Tutar/), '50000');
  }

  it('bozuk damat telefonunu reddeder', async () => {
    const user = userEvent.setup();
    await formAc();
    const before = (await getReservations(BIZ)).length;

    await zorunlulariDoldur(user);
    await user.type(screen.getByLabelText('Damat Cep'), '123');
    await user.click(screen.getByRole('button', { name: /Kaydet/ }));

    expect(await screen.findByText(/en az 10 haneli/)).toBeInTheDocument();
    expect(await getReservations(BIZ)).toHaveLength(before);
  });

  it('bozuk e-postayı reddeder', async () => {
    const user = userEvent.setup();
    await formAc();
    const before = (await getReservations(BIZ)).length;

    await zorunlulariDoldur(user);
    await user.type(screen.getByLabelText('Gelin E-Posta'), 'zeynep-at-ornek');
    await user.click(screen.getByRole('button', { name: /Kaydet/ }));

    expect(await screen.findByText(/Geçerli bir e-posta/)).toBeInTheDocument();
    expect(await getReservations(BIZ)).toHaveLength(before);
  });

  it('sayı olmayan kişi başı fiyatı reddeder', async () => {
    /*
      Önceden `Number('abc')` NaN veriyor, `|| undefined` onu kayıttan
      düşürüyor ve depo katmanı 0 yazıyordu: kullanıcı bir şey yazdı,
      sistem sessizce sıfır kaydetti.
    */
    const user = userEvent.setup();
    await formAc();
    const before = (await getReservations(BIZ)).length;

    await zorunlulariDoldur(user);
    await user.type(screen.getByLabelText('Fiyat Kişibaşı'), 'abc');
    await user.click(screen.getByRole('button', { name: /Kaydet/ }));

    expect(await screen.findByText(/Geçerli bir kişi başı fiyat/)).toBeInTheDocument();
    expect(await getReservations(BIZ)).toHaveLength(before);
  });

  it('sıfır iskontoyu geçerli sayar ve olduğu gibi kaydeder', async () => {
    // Eski `|| undefined` geçerli bir sıfırı da düşürüyordu.
    const user = userEvent.setup();
    await formAc();
    const before = (await getReservations(BIZ)).length;

    await zorunlulariDoldur(user);
    await user.type(screen.getByLabelText('İskonto'), '0');
    await user.click(screen.getByRole('button', { name: /Kaydet/ }));

    await waitFor(
      async () => expect(await getReservations(BIZ)).toHaveLength(before + 1),
      { timeout: 4000 },
    );
    const kayit = (await getReservations(BIZ)).find(
      (r: Reservation) => r.customerName === 'Doğrulama Testi',
    )!;
    expect(kayit.discount).toBe(0);
  });

  it('boş bırakılan isteğe bağlı alanlar kaydı engellemez', async () => {
    const user = userEvent.setup();
    await formAc();
    const before = (await getReservations(BIZ)).length;

    await zorunlulariDoldur(user);
    await user.click(screen.getByRole('button', { name: /Kaydet/ }));

    await waitFor(
      async () => expect(await getReservations(BIZ)).toHaveLength(before + 1),
      { timeout: 4000 },
    );
  });
});
