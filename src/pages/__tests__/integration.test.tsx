import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { ReactElement } from 'react';

import { AuthProvider } from '../../context/AuthContext';
import PublicLayout from '../../layouts/PublicLayout';
import Home from '../Home';
import Sss from '../Sss';
import KodDogrulama from '../KodDogrulama';
import Iletisim from '../Iletisim';
import UyeOl from '../UyeOl';
import UyeGirisi from '../UyeGirisi';
import Uyeler from '../Uyeler';
import NotFound from '../NotFound';
import SalonDetay from '../SalonDetay';
import { DIRECTORY } from '../../data/directory';
import { clearAll } from '../../lib/storage';
import { findUserByEmail, getMessages, makeReservationCode, seedIfEmpty, uid, upsertReservation } from '../../lib/db';

function renderAt(path: string, element: ReactElement, extra?: { path: string; element: ReactElement }[]) {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<PublicLayout />}>
            <Route path={path} element={element} />
            {extra?.map((r) => <Route key={r.path} path={r.path} element={r.element} />)}
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

/** "Şifreniz" ve "Şifreniz (Tekrar)" etiketleri aynı önekle başladığı için id ile seçiyoruz. */
function passwordField(): HTMLInputElement {
  return document.getElementById('password') as HTMLInputElement;
}
function passwordRepeatField(): HTMLInputElement {
  return document.getElementById('passwordRepeat') as HTMLInputElement;
}

beforeEach(() => clearAll());

describe('Anasayfa', () => {
  it('hero başlığını ve sloganı gösterir', () => {
    renderAt('/', <Home />);
    expect(screen.getByRole('heading', { level: 1, name: 'Düğün Takip' })).toBeInTheDocument();
    expect(screen.getByText("Türkiye’nin ilk online düğün takip sistemi!")).toBeInTheDocument();
  });

  it('dört hizmet kartını listeler', () => {
    renderAt('/', <Home />);
    ['Online', 'Raporlama', 'Zaman Kazanın', 'Kolay Kullanım'].forEach((t) => {
      expect(screen.getByRole('heading', { name: t })).toBeInTheDocument();
    });
  });

  it('sektör dağılımını erişilebilir ilerleme çubuğu olarak sunar', () => {
    renderAt('/', <Home />);
    const bar = screen.getByRole('progressbar', { name: 'Düğün Salonları' });
    expect(bar).toHaveAttribute('aria-valuenow', '100');
  });

  it('7 gün ücretsiz deneme bağlantısı üye ol sayfasına gider', () => {
    renderAt('/', <Home />);
    expect(screen.getAllByRole('link', { name: '7 gün ücretsiz deneyin' })[0]).toHaveAttribute('href', '/uye-ol');
  });

  it('tanıtım videosu lightbox olarak açılır ve kapanır', async () => {
    const user = userEvent.setup();
    renderAt('/', <Home />);
    await user.click(screen.getByRole('button', { name: /Tanıtım videosu/ }));
    const dialog = screen.getByRole('dialog', { name: 'Tanıtım videosu' });
    expect(dialog).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Videoyu kapat' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('Sık Sorulan Sorular', () => {
  it('akordeon başlangıçta ilk cevabı açık gösterir', () => {
    renderAt('/sss', <Sss />);
    expect(screen.getByRole('button', { name: /Tavsiye Et butonu hakkında/ })).toHaveAttribute('aria-expanded', 'true');
  });

  it('başka bir soruya tıklandığında o cevap açılır', async () => {
    const user = userEvent.setup();
    renderAt('/sss', <Sss />);
    const q = screen.getByRole('button', { name: /Rezervasyon Kaydı sınırı var mı\?/ });
    await user.click(q);
    expect(q).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/Sisteme istediğiniz kadar rezervasyon kaydı ekleyebilirsiniz/)).toBeVisible();
  });
});

describe('Kod Doğrulama', () => {
  it('boş kodda uyarı verir', async () => {
    const user = userEvent.setup();
    renderAt('/kod-dogrulama', <KodDogrulama />);
    await user.click(screen.getByRole('button', { name: 'Kodu Kontrol Et' }));
    expect(await screen.findByText('Lütfen rezervasyon kodunu giriniz.')).toBeInTheDocument();
  });

  it('bulunmayan kod için hata mesajı gösterir', async () => {
    const user = userEvent.setup();
    renderAt('/kod-dogrulama', <KodDogrulama />);
    await user.type(screen.getByLabelText('Rezervasyon Kodu'), 'DT-2000-0000');
    await user.click(screen.getByRole('button', { name: 'Kodu Kontrol Et' }));
    expect(await screen.findByText(/bir rezervasyon kaydı bulunamadı/, {}, { timeout: 3000 })).toBeInTheDocument();
  });

  it('geçerli kodda rezervasyon bilgilerini gösterir', async () => {
    seedIfEmpty();
    const code = makeReservationCode();
    upsertReservation({
      id: uid('res'), businessId: 'biz_demo', code, customerName: 'Test Çift',
      customerPhone: '5321112233', date: '2026-09-12', slot: 'Gece', organizationType: 'Düğün',
      guestCount: 250, totalAmount: 100000, deposit: 40000, currency: 'TL',
      status: 'Kesin Rezervasyon', colorKey: 'dugun', services: [], createdAt: '', updatedAt: '',
    });

    const user = userEvent.setup();
    renderAt('/kod-dogrulama', <KodDogrulama />);
    await user.type(screen.getByLabelText('Rezervasyon Kodu'), code);
    await user.click(screen.getByRole('button', { name: 'Kodu Kontrol Et' }));

    expect(await screen.findByText('Rezervasyon kaydı doğrulandı.', {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByText('Test Çift')).toBeInTheDocument();
    expect(screen.getByText('60.000,00 ₺')).toBeInTheDocument(); // kalan alacak
  });
});

describe('İletişim formu', () => {
  it('zorunlu alanlar boşken hata gösterir ve mesaj kaydetmez', async () => {
    const user = userEvent.setup();
    renderAt('/iletisim', <Iletisim />);
    await user.click(screen.getByRole('button', { name: 'Mesajımı gönder' }));
    expect(await screen.findByText('Adınızı soyadınızı giriniz.')).toBeInTheDocument();
    expect(getMessages()).toHaveLength(0);
  });

  it('hatalı e-posta biçimini reddeder', async () => {
    const user = userEvent.setup();
    renderAt('/iletisim', <Iletisim />);
    await user.type(screen.getByLabelText('Email'), 'gecersiz');
    await user.click(screen.getByRole('button', { name: 'Mesajımı gönder' }));
    expect(await screen.findByText('Geçerli bir e-posta adresi giriniz.')).toBeInTheDocument();
  });

  it('geçerli formu kaydeder ve teşekkür mesajı gösterir', async () => {
    const user = userEvent.setup();
    renderAt('/iletisim', <Iletisim />);
    await user.type(screen.getByLabelText('Adınız Soyadınız'), 'Ahmet Yaz');
    await user.type(screen.getByLabelText('Email'), 'ahmet@example.com');
    await user.type(screen.getByLabelText('Telefon'), '5321234567');
    await user.type(screen.getByLabelText('Mesajınız'), 'Bilgi almak istiyorum.');
    await user.click(screen.getByRole('button', { name: 'Mesajımı gönder' }));

    expect(await screen.findByText(/Mesajınız tarafımıza ulaştı/, {}, { timeout: 3000 })).toBeInTheDocument();
    await waitFor(() => expect(getMessages()).toHaveLength(1));
    expect(getMessages()[0].kind).toBe('iletisim');
  });

  it('demo varyantı talebi demo olarak kaydeder', async () => {
    const user = userEvent.setup();
    renderAt('/demo-talebi', <Iletisim variant="demo" />);
    await user.type(screen.getByLabelText('Adınız Soyadınız'), 'Sevil Karakuş');
    await user.type(screen.getByLabelText('Email'), 'sevil@example.com');
    await user.type(screen.getByLabelText('Telefon'), '5339876543');
    await user.type(screen.getByLabelText('Mesajınız'), 'Demo istiyorum.');
    await user.click(screen.getByRole('button', { name: 'Talepte bulun' }));
    await waitFor(() => expect(getMessages()[0]?.kind).toBe('demo'), { timeout: 3000 });
  });
});

describe('Üye Ol', () => {
  it('sözleşme onayları işaretlenmeden kayıt oluşturmaz', async () => {
    const user = userEvent.setup();
    renderAt('/uye-ol', <UyeOl />);
    await user.click(screen.getByRole('button', { name: 'Üye Ol' }));
    expect(await screen.findByText('Gizlilik politikasını onaylamanız gerekmektedir.')).toBeInTheDocument();
    expect(await screen.findByText('Üyelik sözleşmesini onaylamanız gerekmektedir.')).toBeInTheDocument();
  });

  it('hatalı cep telefonu biçimini reddeder', async () => {
    const user = userEvent.setup();
    renderAt('/uye-ol', <UyeOl />);
    await user.type(screen.getByLabelText(/Cep Telefonu/), '123');
    await user.click(screen.getByRole('button', { name: 'Üye Ol' }));
    expect(await screen.findByText('532xxxyyzz şeklinde, 10 haneli olarak yazınız.')).toBeInTheDocument();
  });

  it('şifre tekrarı uyuşmazsa uyarır', async () => {
    const user = userEvent.setup();
    renderAt('/uye-ol', <UyeOl />);
    await user.type(passwordField(), 'sifre123');
    await user.type(passwordRepeatField(), 'sifre999');
    await user.click(screen.getByRole('button', { name: 'Üye Ol' }));
    expect(await screen.findByText('Şifreler birbiriyle uyuşmuyor.')).toBeInTheDocument();
  });

  it('şehir seçilince ilgili ilçeler yüklenir', async () => {
    const user = userEvent.setup();
    renderAt('/uye-ol', <UyeOl />);
    await user.selectOptions(screen.getByLabelText(/Şehir/), 'İstanbul');
    const district = screen.getByLabelText(/İlçe/) as HTMLSelectElement;
    expect(within(district).getByRole('option', { name: 'Çekmeköy' })).toBeInTheDocument();
  });

  it('geçerli formda üyelik oluşturur', async () => {
    const user = userEvent.setup();
    renderAt('/uye-ol', <UyeOl />, [{ path: '/panel', element: <p>Panel açıldı</p> }]);

    await user.type(screen.getByLabelText(/Üye Firma Adı/), 'Test Düğün Salonu');
    await user.type(screen.getByLabelText(/Yetkili Ad Soyad/), 'Test Yetkili');
    await user.type(screen.getByLabelText(/Cep Telefonu/), '5321234567');
    await user.selectOptions(screen.getByLabelText(/Kategori/), 'Düğün Salonu');
    await user.selectOptions(screen.getByLabelText(/Şehir/), 'Ankara');
    await user.selectOptions(screen.getByLabelText(/İlçe/), 'Çankaya');
    await user.type(screen.getByLabelText(/Email Adresiniz/), 'yeni@example.com');
    await user.type(passwordField(), 'sifre123');
    await user.type(passwordRepeatField(), 'sifre123');
    await user.click(screen.getByLabelText(/Gizlilik Politikası/));
    await user.click(screen.getByLabelText(/Üyelik Sözleşmesi/));
    await user.click(screen.getByRole('button', { name: 'Üye Ol' }));

    await waitFor(() => expect(findUserByEmail('yeni@example.com')).toBeDefined(), { timeout: 3000 });
    const created = findUserByEmail('yeni@example.com')!;
    expect(created.companyName).toBe('Test Düğün Salonu');
    expect(created.referralCode).toMatch(/^TEST\d{3}$/);
  });

  it('aynı e-posta ile ikinci kez üye olunamaz', async () => {
    seedIfEmpty();
    const user = userEvent.setup();
    renderAt('/uye-ol', <UyeOl />);

    await user.type(screen.getByLabelText(/Üye Firma Adı/), 'Kopya Salon');
    await user.type(screen.getByLabelText(/Yetkili Ad Soyad/), 'Kopya Kişi');
    await user.type(screen.getByLabelText(/Cep Telefonu/), '5321234567');
    await user.selectOptions(screen.getByLabelText(/Kategori/), 'Düğün Salonu');
    await user.selectOptions(screen.getByLabelText(/Şehir/), 'Ankara');
    await user.selectOptions(screen.getByLabelText(/İlçe/), 'Çankaya');
    await user.type(screen.getByLabelText(/Email Adresiniz/), 'demo@duguntakip.com');
    await user.type(passwordField(), 'sifre123');
    await user.type(passwordRepeatField(), 'sifre123');
    await user.click(screen.getByLabelText(/Gizlilik Politikası/));
    await user.click(screen.getByLabelText(/Üyelik Sözleşmesi/));
    await user.click(screen.getByRole('button', { name: 'Üye Ol' }));

    expect(await screen.findByText(/daha önce üyelik oluşturulmuş/, {}, { timeout: 3000 })).toBeInTheDocument();
  });
});

describe('Üye Girişi', () => {
  it('hatalı şifrede uyarı gösterir', async () => {
    seedIfEmpty();
    const user = userEvent.setup();
    renderAt('/uye-girisi', <UyeGirisi />);
    await user.type(screen.getByLabelText('Email Adresiniz'), 'demo@duguntakip.com');
    await user.type(screen.getByLabelText('Şifreniz'), 'yanlis');
    await user.click(screen.getByRole('button', { name: 'Giriş Yap' }));
    expect(await screen.findByText('Şifreniz hatalı. Lütfen tekrar deneyiniz.', {}, { timeout: 3000 })).toBeInTheDocument();
  });

  it('kayıtlı olmayan e-postada uyarı gösterir', async () => {
    const user = userEvent.setup();
    renderAt('/uye-girisi', <UyeGirisi />);
    await user.type(screen.getByLabelText('Email Adresiniz'), 'yok@example.com');
    await user.type(screen.getByLabelText('Şifreniz'), 'sifre123');
    await user.click(screen.getByRole('button', { name: 'Giriş Yap' }));
    expect(await screen.findByText(/kayıtlı üyelik bulunamadı/, {}, { timeout: 3000 })).toBeInTheDocument();
  });

  it('doğru bilgilerde SMS doğrulama adımına geçer ve hatalı kodu reddeder', async () => {
    seedIfEmpty();
    const user = userEvent.setup();
    renderAt('/uye-girisi', <UyeGirisi />);
    await user.click(screen.getByRole('button', { name: 'Demo bilgilerini doldur' }));
    await user.click(screen.getByRole('button', { name: 'Giriş Yap' }));

    expect(await screen.findByRole('heading', { name: /SMS Doğrulama/ }, { timeout: 3000 })).toBeInTheDocument();
    await user.type(screen.getByLabelText('Sms Kodu'), '000000');
    await user.click(screen.getByRole('button', { name: 'Doğrula ve Giriş Yap' }));
    expect(await screen.findByText('Doğrulama kodu hatalı.', {}, { timeout: 3000 })).toBeInTheDocument();
  });
});

describe('Referanslarımız listesi', () => {
  it('kategori filtresi listeyi daraltır', async () => {
    const user = userEvent.setup();
    renderAt('/uyeler', <Uyeler />);
    const before = screen.getByText(/Listelenen:/).textContent;
    await user.selectOptions(screen.getByLabelText('Kategori'), 'Kına Salonu');
    expect(screen.getByText(/Listelenen:/).textContent).not.toBe(before);
  });

  it('sonuç bulunamadığında bilgilendirme gösterir', async () => {
    const user = userEvent.setup();
    renderAt('/uyeler', <Uyeler />);
    await user.type(screen.getByLabelText('Arama'), 'zzzzbulunmayan');
    expect(await screen.findByText('Aradığınız kriterlere uygun işletme bulunamadı.')).toBeInTheDocument();
  });

  it('toplam işletme sayısını gösterir', () => {
    renderAt('/uyeler', <Uyeler />);
    expect(screen.getByText('4.024')).toBeInTheDocument();
  });
});

describe('404 sayfası', () => {
  it('bilinmeyen adreste 404 gösterir', () => {
    renderAt('/olmayan-sayfa', <NotFound />);
    expect(screen.getByText('404')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Aradığınız sayfa bulunamadı' })).toBeInTheDocument();
  });
});

describe('Salon detay sayfası', () => {
  const member = DIRECTORY[0];

  it('işletme bilgilerini gösterir', () => {
    renderAt(`/salon/${member.slug}`, <SalonDetay />);
    expect(screen.getByRole('heading', { level: 1, name: member.name })).toBeInTheDocument();
    expect(screen.getByText(`${member.district} / ${member.city}`)).toBeInTheDocument();
    expect(screen.getByText(member.about)).toBeInTheDocument();
  });

  it('bilinmeyen salon adresinde 404 gösterir', () => {
    renderAt('/salon/olmayan-salon', <SalonDetay />);
    expect(screen.getByText('404')).toBeInTheDocument();
  });

  it('teklif formunda zorunlu alanları doğrular', async () => {
    const user = userEvent.setup();
    renderAt(`/salon/${member.slug}`, <SalonDetay />);
    await user.click(screen.getByRole('button', { name: 'Gönder' }));
    expect(await screen.findByText('Adınızı soyadınızı giriniz.')).toBeInTheDocument();
    expect(getMessages()).toHaveLength(0);
  });

  it('teklif talebini işletme bilgisiyle birlikte kaydeder', async () => {
    const user = userEvent.setup();
    renderAt(`/salon/${member.slug}`, <SalonDetay />);

    await user.selectOptions(screen.getByLabelText('Mesaj Konusu'), 'Rezervasyon');
    await user.type(screen.getByLabelText('Adınız Soyadınız'), 'Talep Eden');
    await user.type(screen.getByLabelText('Email Adresiniz'), 'talep@example.com');
    await user.type(screen.getByLabelText('Telefon'), '5321234567');
    await user.type(screen.getByLabelText('Mesajınız'), 'Fiyat bilgisi rica ederim.');
    await user.click(screen.getByRole('button', { name: 'Gönder' }));

    await waitFor(() => expect(getMessages()).toHaveLength(1), { timeout: 3000 });
    const saved = getMessages()[0];
    expect(saved.message).toContain(member.name);
    expect(saved.message).toContain('Konu: Rezervasyon');
  });
});
