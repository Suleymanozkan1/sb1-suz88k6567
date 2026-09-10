import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import DemoNotice from './DemoNotice';
import { KEYS, clearAll, read } from '../lib/storage';

/**
 * Demo modu uyarı bandı.
 *
 * Bandın varlık sebebi, kullanıcının verisinin yalnızca tarayıcıda kaldığını
 * bilmesi. Tanıtım sırasında ekranı meşgul etmesin diye kapatılabilir, ama
 * kapatma yalnızca kullanıcının kendi eylemiyle olmalı: yapılandırma hatası
 * yüzünden demo moduna düşen bir kurulumda uyarı en az bir kez görünmeli.
 */
const oturum = { isDemoMode: true };

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ isDemoMode: oturum.isDemoMode }),
}));

beforeEach(() => { clearAll(); oturum.isDemoMode = true; });

describe('DemoNotice', () => {
  it('demo modunda uyarıyı gösterir', () => {
    render(<DemoNotice />);
    expect(screen.getByText(/Demo modu\./)).toBeInTheDocument();
    expect(screen.getByText(/yalnızca bu tarayıcıda/)).toBeInTheDocument();
  });

  it('veritabanı bağlıyken hiç görünmez', () => {
    oturum.isDemoMode = false;
    render(<DemoNotice />);
    expect(screen.queryByText(/Demo modu\./)).not.toBeInTheDocument();
  });

  it('kapatma düğmesinin erişilebilir adı vardır', () => {
    // Yalnızca simgeden oluşan bir düğme, adı olmadan ekran okuyucuda
    // "button" diye okunur.
    render(<DemoNotice />);
    expect(screen.getByRole('button', { name: 'Demo modu uyarısını gizle' })).toBeInTheDocument();
  });

  it('kapatılınca gizlenir', async () => {
    const kullanici = userEvent.setup();
    render(<DemoNotice />);

    await kullanici.click(screen.getByRole('button', { name: 'Demo modu uyarısını gizle' }));

    expect(screen.queryByText(/Demo modu\./)).not.toBeInTheDocument();
  });

  it('kapatma bu tarayıcıda hatırlanır', async () => {
    const kullanici = userEvent.setup();
    const { unmount } = render(<DemoNotice />);
    await kullanici.click(screen.getByRole('button', { name: 'Demo modu uyarısını gizle' }));
    unmount();

    render(<DemoNotice />);

    expect(screen.queryByText(/Demo modu\./)).not.toBeInTheDocument();
    expect(read<boolean>(KEYS.demoNotice, false)).toBe(true);
  });

  it('kendiliğinden kapanmaz: kayıt yokken görünür', () => {
    // Bandın "bir kez gösterilip unutulması" güvenlik açısından yanlış olurdu.
    expect(read<boolean>(KEYS.demoNotice, false)).toBe(false);
    render(<DemoNotice />);
    expect(screen.getByText(/Demo modu\./)).toBeInTheDocument();
  });

  it('veriler sıfırlanınca uyarı yeniden görünür', async () => {
    const kullanici = userEvent.setup();
    const { unmount } = render(<DemoNotice />);
    await kullanici.click(screen.getByRole('button', { name: 'Demo modu uyarısını gizle' }));
    unmount();

    // Ayarlar ekranındaki "Verileri sıfırla" aynı ön ekli kayıtları siler.
    clearAll();

    render(<DemoNotice />);
    expect(screen.getByText(/Demo modu\./)).toBeInTheDocument();
  });
});
