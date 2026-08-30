import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

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
import TavsiyeEt from '../app/TavsiyeEt';
import SmsKayitlari from '../app/SmsKayitlari';
import UyeGirisi from '../UyeGirisi';

import { clearAll, KEYS, write } from '../../lib/storage';
import { getColorSettings, getReservations, getSmsLog, seedIfEmpty } from '../../lib/db';
import { addDays, todayIso } from '../../lib/format';

/** Oturumu doğrudan açarak panel rotalarını render eder. */
function renderPanel(path: string) {
  seedIfEmpty();
  write(KEYS.session, 'user_demo');
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/uye-girisi" element={<p>Giriş sayfası</p>} />
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
            <Route path="tavsiye-et" element={<TavsiyeEt />} />
            <Route path="sms" element={<SmsKayitlari />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

beforeEach(() => clearAll());

describe('Panel erişim kontrolü', () => {
  it('oturum yokken üye girişine yönlendirir', async () => {
    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/panel']}>
          <Routes>
            <Route path="/uye-girisi" element={<UyeGirisi />} />
            <Route path="/panel" element={<RequireAuth><Dashboard /></RequireAuth>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );
    expect(await screen.findByRole('heading', { name: 'Üye Girişi' })).toBeInTheDocument();
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
    await user.selectOptions(await screen.findByLabelText('Organizasyon'), 'Kına');
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    rows.forEach((row) => expect(row.textContent).toMatch(/Kına/));
  });
});

describe('Yeni rezervasyon formu', () => {
  it('zorunlu alanlar boşken kaydetmez', async () => {
    const user = userEvent.setup();
    renderPanel('/panel/rezervasyonlar/yeni');
    const before = getReservations().length;
    await user.click(await screen.findByRole('button', { name: 'Kaydet' }));
    expect(await screen.findByText('Müşteri adını giriniz.')).toBeInTheDocument();
    expect(getReservations()).toHaveLength(before);
  });

  it('kaparo toplam tutardan büyük olamaz', async () => {
    const user = userEvent.setup();
    renderPanel('/panel/rezervasyonlar/yeni');
    await user.type(await screen.findByLabelText(/Müşteri Adı Soyadı/), 'Deneme Çift');
    await user.type(screen.getByLabelText(/^Telefon/), '5321234567');
    await user.type(screen.getByLabelText(/Davetli Sayısı/), '300');
    await user.type(screen.getByLabelText(/Toplam Tutar/), '50000');
    await user.type(screen.getByLabelText(/^Kaparo/), '90000');
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));
    expect(await screen.findByText('Kaparo, toplam tutardan büyük olamaz.')).toBeInTheDocument();
  });

  it('kalan alacağı otomatik hesaplar', async () => {
    const user = userEvent.setup();
    renderPanel('/panel/rezervasyonlar/yeni');
    await user.type(await screen.findByLabelText(/Toplam Tutar/), '100000');
    await user.type(screen.getByLabelText(/^Kaparo/), '30000');
    expect(screen.getByLabelText('Kalan Alacak')).toHaveValue('70.000');
  });

  it('geçerli kayıt oluşturur ve otomatik SMS gönderir', async () => {
    const user = userEvent.setup();
    renderPanel('/panel/rezervasyonlar/yeni');
    const before = getReservations().length;
    const smsBefore = getSmsLog('biz_demo').length;

    await user.type(await screen.findByLabelText(/Müşteri Adı Soyadı/), 'Yeni Çift');
    await user.type(screen.getByLabelText(/^Telefon/), '5335554433');
    await user.clear(screen.getByLabelText(/^Tarih/));
    await user.type(screen.getByLabelText(/^Tarih/), addDays(todayIso(), 90));
    await user.type(screen.getByLabelText(/Davetli Sayısı/), '250');
    await user.type(screen.getByLabelText(/Toplam Tutar/), '120000');
    await user.type(screen.getByLabelText(/^Kaparo/), '30000');
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    await waitFor(() => expect(getReservations()).toHaveLength(before + 1));
    const created = getReservations().find((r) => r.customerName === 'Yeni Çift');
    expect(created?.totalAmount).toBe(120000);
    expect(created?.code).toMatch(/^DT-\d{4}-\d{4}$/);
    expect(getSmsLog('biz_demo').length).toBe(smsBefore + 1);
    expect(getSmsLog('biz_demo')[0].kind).toBe('Rezervasyon');
  });

  it('aynı tarih ve seansta çakışma uyarısı verir', async () => {
    const existing = (() => {
      seedIfEmpty();
      return getReservations('biz_demo')[0];
    })();
    const user = userEvent.setup();
    renderPanel('/panel/rezervasyonlar/yeni');

    await user.clear(await screen.findByLabelText(/^Tarih/));
    await user.type(screen.getByLabelText(/^Tarih/), existing.date);
    await user.selectOptions(screen.getByLabelText(/^Seans/), existing.slot);
    expect(await screen.findByText(new RegExp(existing.customerName.slice(0, 8)))).toBeInTheDocument();
  });
});

describe('Rezervasyon detayı', () => {
  it('tahsilat ekler ve kalan bakiyeyi düşürür', async () => {
    seedIfEmpty();
    const target = getReservations('biz_demo').find((r) => r.date >= todayIso() && r.totalAmount - r.deposit > 20000)!;
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
    const target = getReservations('biz_demo').find((r) => r.date >= todayIso() && r.totalAmount > r.deposit)!;
    const user = userEvent.setup();
    renderPanel(`/panel/rezervasyonlar/${target.id}`);

    await user.type(await screen.findByLabelText('Tutar'), '99999999');
    await user.click(screen.getByRole('button', { name: /Ekle/ }));
    expect(await screen.findByText(/kalan alacaktan .* fazla olamaz/)).toBeInTheDocument();
  });

  it('geçmiş tarihli kayıtta silme düğmesi devre dışıdır', async () => {
    seedIfEmpty();
    const past = getReservations('biz_demo').find((r) => r.date < todayIso())!;
    renderPanel(`/panel/rezervasyonlar/${past.id}`);
    expect(await screen.findByRole('button', { name: /Sil/ })).toBeDisabled();
    expect(screen.getByText(/Geçmiş tarihli düğünü silemezsiniz/)).toBeInTheDocument();
  });

  it('SMS gönder düğmesi kayıt oluşturur', async () => {
    seedIfEmpty();
    const target = getReservations('biz_demo')[0];
    const before = getSmsLog(target.businessId).length;
    const user = userEvent.setup();
    renderPanel(`/panel/rezervasyonlar/${target.id}`);

    await user.click(await screen.findByRole('button', { name: /SMS Gönder/ }));
    expect(await screen.findByText(/SMS gönderildi/)).toBeInTheDocument();
    expect(getSmsLog(target.businessId).length).toBe(before + 1);
  });
});

describe('Salon kiralama sözleşmesi', () => {
  it('sözleşme çıktısını taraflarla birlikte oluşturur', async () => {
    seedIfEmpty();
    const target = getReservations('biz_demo')[0];
    renderPanel(`/panel/rezervasyonlar/${target.id}/sozlesme`);

    expect(await screen.findByRole('heading', { name: 'SALON KİRALAMA SÖZLEŞMESİ' })).toBeInTheDocument();
    expect(screen.getAllByText('KİRAYA VEREN').length).toBeGreaterThan(0);
    expect(screen.getAllByText('KİRACI').length).toBeGreaterThan(0);
    expect(screen.getAllByText(target.customerName).length).toBeGreaterThan(0);
  });
});

describe('Gelir gider kayıtları', () => {
  it('gelir/gider ve kasa bakiyesi kartlarını gösterir', async () => {
    renderPanel('/panel/kasa');
    expect(await screen.findByRole('heading', { name: 'Gelir Gider Kayıtları' })).toBeInTheDocument();
    expect(screen.getByText('Toplam Gelir')).toBeInTheDocument();
    expect(screen.getByText('Kasa Bakiyesi')).toBeInTheDocument();
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
  it('program bazlı rapor sekmesi varsayılan açıktır', async () => {
    renderPanel('/panel/raporlar');
    expect(await screen.findByRole('tab', { name: 'Program bazlı rapor' })).toHaveAttribute('aria-selected', 'true');
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
    expect(getColorSettings('biz_demo').find((c) => c.key === 'dugun')?.color).toBe('#ff0000');
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

describe('Tavsiye Et Kazan', () => {
  it('tavsiye kodunu ve davet linkini gösterir', async () => {
    renderPanel('/panel/tavsiye-et');
    expect(await screen.findByRole('heading', { name: 'Tavsiye Et Kazan' })).toBeInTheDocument();
    expect(screen.getByLabelText('Kodunuz')).toHaveValue('GRAN482');
    expect((screen.getByLabelText('Davet linkiniz') as HTMLInputElement).value).toContain('ref=GRAN482');
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
