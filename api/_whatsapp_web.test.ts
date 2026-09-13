import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/**
 * WhatsApp Web yolu.
 *
 * Baileys'in kendisi burada çalıştırılmıyor: gerçek bağlantı WhatsApp
 * sunucularına çıkar ve test ağa çıkmamalı. Sınanan şey, gönderim
 * yapılmadan ÖNCE verilen kararlar -- numara çevrimi, kapalı yol ve
 * bağlı olmayan oturum. Bunlar yanlış olursa mesaj sessizce hiçbir yere
 * gitmez ve kuyruk gönderildi sanar.
 */
const ESKI = { ...process.env };

async function modul(env: Record<string, string | undefined> = {}) {
  process.env = { ...ESKI, ...env };
  const m = await import('./_whatsapp_web');
  m.sifirla();
  return m;
}

beforeEach(() => { process.env = { ...ESKI }; });
afterEach(() => { process.env = { ...ESKI }; });

describe('jidCevir', () => {
  it('cep numarasını WhatsApp kimliğine çevirir', async () => {
    const { jidCevir } = await modul();
    expect(jidCevir('5551112233')).toBe('905551112233@s.whatsapp.net');
  });

  it('baştaki 0 ve 90 ön eklerini temizler', async () => {
    const { jidCevir } = await modul();
    expect(jidCevir('05551112233')).toBe('905551112233@s.whatsapp.net');
    expect(jidCevir('905551112233')).toBe('905551112233@s.whatsapp.net');
    expect(jidCevir('+90 555 111 22 33')).toBe('905551112233@s.whatsapp.net');
  });

  it('cep olmayan numarayı reddeder', async () => {
    const { jidCevir } = await modul();
    // Sabit hat ve eksik haneli numara: gönderim denenirse mesaj
    // hiçbir yere gitmez, bu yüzden burada durduruluyor.
    expect(jidCevir('2121112233')).toBeNull();
    expect(jidCevir('555111223')).toBeNull();
    expect(jidCevir('')).toBeNull();
  });
});

describe('whatsappWebEtkinMi', () => {
  it('yalnızca WHATSAPP_WEB_ETKIN=1 iken açık', async () => {
    expect((await modul({ WHATSAPP_WEB_ETKIN: '1' })).whatsappWebEtkinMi()).toBe(true);
    expect((await modul({ WHATSAPP_WEB_ETKIN: '0' })).whatsappWebEtkinMi()).toBe(false);
    expect((await modul({ WHATSAPP_WEB_ETKIN: undefined })).whatsappWebEtkinMi()).toBe(false);
    // 'true' yazmak açmaz: belgede '1' deniyor, iki yazım da kabul
    // edilseydi hangisinin geçerli olduğu belirsizleşirdi.
    expect((await modul({ WHATSAPP_WEB_ETKIN: 'true' })).whatsappWebEtkinMi()).toBe(false);
  });
});

describe('gonder, gönderim öncesi kararlar', () => {
  it('yol kapalıyken gönderim YAPMAZ', async () => {
    const { gonder } = await modul({ WHATSAPP_WEB_ETKIN: undefined });
    const sonuc = await gonder('5551112233', 'deneme');
    expect(sonuc.ok).toBe(false);
    expect(sonuc.error).toContain('kapalı');
  });

  it('oturum bağlı değilken gönderim YAPMAZ', async () => {
    // Kuyruk bunu görüp SMS'e düşecek; sessizce başarılı dönmemeli.
    const { gonder } = await modul({ WHATSAPP_WEB_ETKIN: '1' });
    const sonuc = await gonder('5551112233', 'deneme');
    expect(sonuc.ok).toBe(false);
    expect(sonuc.error).toContain('bağlı değil');
  });

  it('baglan yol kapalıyken bağlanmaya çalışmaz', async () => {
    const { baglan } = await modul({ WHATSAPP_WEB_ETKIN: undefined });
    await expect(baglan()).resolves.toBe('kapali');
  });
});

describe('bekleme süresi', () => {
  it('gönderimler arasında bekleme tanımlı', async () => {
    // Arka arkaya yağan mesaj ban sebebi; sabitin sıfırlanmaması için.
    const { BEKLEME_MS } = await modul();
    expect(BEKLEME_MS).toBeGreaterThanOrEqual(1000);
  });
});
