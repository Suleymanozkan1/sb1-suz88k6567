import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { ReactElement } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../../context/AuthContext';
import PublicLayout from '../../layouts/PublicLayout';
import KodDogrulama from '../KodDogrulama';
import UyeOl from '../UyeOl';
import UyeGirisi from '../UyeGirisi';
import NotFound from '../NotFound';
import { clearAll, KEYS, read } from '../../lib/storage';
import { localRepo } from '../../lib/repo/local';
import { seedIfEmpty } from '../../lib/seed';
import { makeReservationCode, normalizeEmail, uid } from '../../lib/ids';
import type { User } from '../../types';

const findUserByEmail = (email: string) =>
  read<User[]>(KEYS.users, []).find((u) => normalizeEmail(u.email) === normalizeEmail(email));

function renderAt(path: string, element: ReactElement, extra?: { path: string; element: ReactElement }[]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
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
    </AuthProvider>
    </QueryClientProvider>,
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
    await user.type(screen.getByLabelText('Rezervasyon Kodu'), 'SA-2000-0000');
    await user.click(screen.getByRole('button', { name: 'Kodu Kontrol Et' }));
    expect(await screen.findByText(/bir rezervasyon kaydı bulunamadı/, {}, { timeout: 3000 })).toBeInTheDocument();
  });

  it('geçerli kodda rezervasyon bilgilerini gösterir', async () => {
    seedIfEmpty();
    const code = makeReservationCode();
    await localRepo.saveReservation({
      id: uid('res'), businessId: 'biz_demo', hallId: 'hall_demo1', code, customerName: 'Test Çift',
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
    expect(screen.getByText('100.000,00 ₺')).toBeInTheDocument(); // toplam tutar
    expect(screen.getByText('532*****33')).toBeInTheDocument();   // maskeli telefon
    expect(screen.queryByText(/Kalan Alacak/)).not.toBeInTheDocument();
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
    await user.type(screen.getByLabelText(/E-posta Adresiniz/), 'yeni@example.com');
    await user.type(passwordField(), 'sifre123');
    await user.type(passwordRepeatField(), 'sifre123');
    await user.click(screen.getByLabelText(/Gizlilik Politikası/));
    await user.click(screen.getByLabelText(/Üyelik Sözleşmesi/));
    await user.click(screen.getByRole('button', { name: 'Üye Ol' }));

    await waitFor(() => expect(findUserByEmail('yeni@example.com')).toBeDefined(), { timeout: 3000 });
    const created = findUserByEmail('yeni@example.com')!;
    expect(created.companyName).toBe('Test Düğün Salonu');
    expect(created.role).toBe('owner');
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
    await user.type(screen.getByLabelText(/E-posta Adresiniz/), 'demo@sahratakip.com');
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
    renderAt('/', <UyeGirisi />);
    await user.type(screen.getByLabelText('E-posta Adresiniz'), 'demo@sahratakip.com');
    await user.type(screen.getByLabelText('Şifreniz'), 'yanlis');
    await user.click(screen.getByRole('button', { name: 'Giriş Yap' }));
    expect(await screen.findByText('E-posta veya şifreniz hatalı.', {}, { timeout: 3000 })).toBeInTheDocument();
  });

  it('kayıtlı olmayan e-postada uyarı gösterir', async () => {
    const user = userEvent.setup();
    renderAt('/', <UyeGirisi />);
    await user.type(screen.getByLabelText('E-posta Adresiniz'), 'yok@example.com');
    await user.type(screen.getByLabelText('Şifreniz'), 'sifre123');
    await user.click(screen.getByRole('button', { name: 'Giriş Yap' }));
    expect(await screen.findByText(/kayıtlı üyelik bulunamadı/, {}, { timeout: 3000 })).toBeInTheDocument();
  });

  it('doğru bilgilerde panele yönlendirir', async () => {
    seedIfEmpty();
    const user = userEvent.setup();
    renderAt('/', <UyeGirisi />, [{ path: '/panel', element: <p>Panel açıldı</p> }]);
    await user.click(screen.getByRole('button', { name: 'Demo bilgilerini doldur' }));
    await user.click(screen.getByRole('button', { name: 'Giriş Yap' }));
    expect(await screen.findByText('Panel açıldı', {}, { timeout: 3000 })).toBeInTheDocument();
  });
});

describe('404 sayfası', () => {
  it('bilinmeyen adreste 404 gösterir', () => {
    renderAt('/olmayan-sayfa', <NotFound />);
    expect(screen.getByText('404')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Aradığınız sayfa bulunamadı' })).toBeInTheDocument();
  });
});
