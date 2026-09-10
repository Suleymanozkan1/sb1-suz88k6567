import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { ReactElement } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../../context/AuthContext';
import PublicLayout from '../../layouts/PublicLayout';
import KodDogrulama from '../KodDogrulama';
import UyeGirisi from '../UyeGirisi';
import NotFound from '../NotFound';
import { clearAll } from '../../lib/storage';
import { localRepo } from '../../lib/repo/local';
import { seedIfEmpty } from '../../lib/seed';
import { makeReservationCode, uid } from '../../lib/ids';

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

describe('Giriş', () => {
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
    expect(await screen.findByText(/kayıtlı hesap bulunamadı/, {}, { timeout: 3000 })).toBeInTheDocument();
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
