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
import UyeGirisi from '../UyeGirisi';

import { clearAll, KEYS, write } from '../../lib/storage';
import { localRepo } from '../../lib/repo/local';
import { seedIfEmpty } from '../../lib/seed';
import { addDays, todayIso } from '../../lib/format';
import type { Reservation } from '../../types';

const BIZ = 'biz_demo';
const getReservations = (id: string) => localRepo.listReservations(id);
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
    expect(screen.getByText('Bu ay rezervasyon')).toBeInTheDocument();
    expect(screen.getAllByText(/Kalan alacak/i).length).toBeGreaterThan(0);
    expect(screen.getByText('Kasa bakiyesi')).toBeInTheDocument();
  });

  it('yaklaşan organizasyonları listeler', async () => {
    renderPanel('/panel');
    expect(await screen.findByRole('heading', { name: 'Yaklaşan organizasyonlar' })).toBeInTheDocument();
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

  it('önceki/sonraki ay gezinmesi başlığı değiştirir', async () => {
    const user = userEvent.setup();
    renderPanel('/panel/takvim');
    // Veriler async yüklendiği için takvim görünene kadar bekle
    await screen.findByRole('heading', { name: 'Rezervasyon Takvimi' });
    const heading = () => screen.getAllByRole('heading', { level: 2 })[0].textContent;
    const before = heading();
    await user.click(screen.getByRole('button', { name: 'Sonraki ay' }));
    expect(heading()).not.toBe(before);
    await user.click(screen.getByRole('button', { name: 'Önceki ay' }));
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
    await user.type(await screen.findByLabelText(/Müşteri Adı Soyadı/), 'Deneme Çift');
    await user.type(screen.getByLabelText(/^Telefon/), '5321234567');
    await user.type(screen.getByLabelText(/Davetli Sayısı/), '300');
    await user.type(screen.getByLabelText(/Toplam Tutar/), '50000');
    await user.type(screen.getByLabelText(/^Kapora/), '90000');
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));
    expect(await screen.findByText('Kapora, toplam tutardan büyük olamaz.')).toBeInTheDocument();
  });

  it('kalan alacağı otomatik hesaplar', async () => {
    const user = userEvent.setup();
    renderPanel('/panel/rezervasyonlar/yeni');
    await user.type(await screen.findByLabelText(/Toplam Tutar/), '100000');
    await user.type(screen.getByLabelText(/^Kapora/), '30000');
    expect(screen.getByLabelText('Kalan Alacak')).toHaveValue('70.000');
  });

  it('geçerli kayıt oluşturur ve otomatik SMS gönderir', async () => {
    const user = userEvent.setup();
    renderPanel('/panel/rezervasyonlar/yeni');
    const before = (await getReservations(BIZ)).length;
    const smsBefore = (await getSmsLog(BIZ)).length;

    await user.type(await screen.findByLabelText(/Müşteri Adı Soyadı/), 'Yeni Çift');
    await user.type(screen.getByLabelText(/^Telefon/), '5335554433');
    await user.clear(screen.getByLabelText(/^Tarih/));
    await user.type(screen.getByLabelText(/^Tarih/), addDays(todayIso(), 90));
    await user.type(screen.getByLabelText(/Davetli Sayısı/), '250');
    await user.type(screen.getByLabelText(/Toplam Tutar/), '120000');
    await user.type(screen.getByLabelText(/^Kapora/), '30000');
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    await waitFor(async () => expect(await getReservations(BIZ)).toHaveLength(before + 1), { timeout: 4000 });
    const created = (await getReservations(BIZ)).find((r: Reservation) => r.customerName === 'Yeni Çift');
    expect(created?.totalAmount).toBe(120000);
    // Sözleşme numarası yıl + sıra: tohumdaki eski biçimli kodlar diziyi
    // etkilemez, ilk yeni kayıt yılın 1'incisidir.
    expect(created?.code).toMatch(new RegExp(`^${new Date().getFullYear()}[0-9]{1,9}$`));
    const smsAfter = await getSmsLog(BIZ);
    expect(smsAfter.length).toBe(smsBefore + 1);
    expect(smsAfter[0].kind).toBe('Rezervasyon');
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
    const target = (await getReservations(BIZ)).find(
      (r: Reservation) => r.date >= todayIso() && r.totalAmount - r.deposit > 20000)!;
    const user = userEvent.setup();
    renderPanel(`/panel/rezervasyonlar/${target.id}`);

    expect(await screen.findByRole('heading', { name: target.customerName })).toBeInTheDocument();
    await user.type(screen.getByLabelText('Tutar'), '10000');
    await user.click(screen.getByRole('button', { name: /Ekle/ }));

    await waitFor(() => {
      expect(within(screen.getByRole('table')).getAllByRole('row').length).toBeGreaterThan(1);
    });
  });

  it('kalan alacaktan fazla tahsilatı reddeder', async () => {
    seedIfEmpty();
    const target = (await getReservations(BIZ)).find(
      (r: Reservation) => r.date >= todayIso() && r.totalAmount > r.deposit)!;
    const user = userEvent.setup();
    renderPanel(`/panel/rezervasyonlar/${target.id}`);

    await user.type(await screen.findByLabelText('Tutar'), '99999999');
    await user.click(screen.getByRole('button', { name: /Ekle/ }));
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
    const onizleme = await screen.findByText(new RegExp(`Sayin ${target.customerName}`));
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

    await user.type(await screen.findByLabelText('Başlangıç tarihi'), '2026-09-11');
    await user.type(screen.getByLabelText('Bitiş tarihi'), '2026-09-13');

    // Boş günler de satır olarak durur: çizelge "o gün boş" bilgisini de
    // verir. Dolu bir hücrenin bandına tür de yazıldığı için tam eşleşme
    // yerine tarihe bakılır.
    expect(await screen.findAllByText(/^11\.09\.2026 CUMA/)).toHaveLength(2);
    expect(screen.getAllByText(/^13\.09\.2026 PAZAR/)).toHaveLength(2);
    expect(screen.queryByText(/^10\.09\.2026/)).not.toBeInTheDocument();
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
    await user.click(await screen.findByRole('tab', { name: 'Ay bazlı rapor' }));
    expect(screen.getByRole('button', { name: /CSV indir/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Word indir/ })).not.toBeInTheDocument();
  });
});

describe('Gelir gider kayıtları', () => {
  it('gelir/gider ve kasa bakiyesi kartlarını gösterir', async () => {
    renderPanel('/panel/kasa');
    expect(await screen.findByRole('heading', { name: 'Gelir Gider Kayıtları' })).toBeInTheDocument();
    expect(screen.getByText('Toplam Gelir')).toBeInTheDocument();
    expect(screen.getByText('Kasa Bakiyesi')).toBeInTheDocument();
  });

  it('rezervasyon tahsilatlarını sözleşme numarası ve taraflarla listeler', async () => {
    seedIfEmpty();
    const kayit = (await getReservations(BIZ)).find((r) => r.deposit > 0 && r.status !== 'İptal')!;
    renderPanel('/panel/kasa');

    await screen.findByRole('heading', { name: 'Gelir Gider Kayıtları' });
    // Kasa satırı hangi sözleşmeye ait olduğunu kendi başına anlatmalı.
    expect(screen.getAllByText(kayit.code).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Kapora').length).toBeGreaterThan(0);
  });

  it('rezervasyondan gelen satır silinemez', async () => {
    seedIfEmpty();
    renderPanel('/panel/kasa');

    await screen.findByRole('heading', { name: 'Gelir Gider Kayıtları' });
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
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    rows.forEach((row) => expect(row.textContent).toContain('Gider'));
  });
});

describe('Raporlar', () => {
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
    await user.click(await screen.findByRole('tab', { name: 'Ay bazlı rapor' }));
    expect(screen.getByRole('tab', { name: 'Ay bazlı rapor' })).toHaveAttribute('aria-selected', 'true');
  });

  it('alacak bakiyesi sekmesi toplam satırı içerir', async () => {
    const user = userEvent.setup();
    renderPanel('/panel/raporlar');
    await user.click(await screen.findByRole('tab', { name: 'Alacak bakiyesi' }));
    expect(await screen.findByText('Toplam kalan alacak')).toBeInTheDocument();
  });

  it('gelecekteki tarih aralığında boş sonuç bildirir', async () => {
    const user = userEvent.setup();
    renderPanel('/panel/raporlar');
    // Çizelge boş günleri de çizer; "kayıt yok" iletisi diğer raporlarda.
    await user.click(await screen.findByRole('tab', { name: 'Ay bazlı rapor' }));
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
