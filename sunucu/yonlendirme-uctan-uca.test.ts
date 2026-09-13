/**
 * Yönlendirmenin UÇTAN UCA doğrulaması.
 *
 * Birim testleri `hedefKok`'un doğru adresi seçtiğini gösteriyor; bu
 * test gerçek bir Node sunucusu ayağa kaldırıp isteğin gerçekten iki
 * farklı arka uca düştüğünü sınıyor. PostgREST yerine iki taklit HTTP
 * sunucusu kullanılıyor: sınanan şey yönlendirme, veritabanı değil.
 */
import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

function sahteArkaUc(ad: string): Promise<{ sunucu: Server; port: number; istekler: string[] }> {
  const istekler: string[] = [];
  const sunucu = createServer((req, res) => {
    istekler.push(req.url ?? '');
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ arkaUc: ad, yol: req.url }));
  });
  return new Promise((coz) => {
    sunucu.listen(0, () => {
      coz({ sunucu, port: (sunucu.address() as { port: number }).port, istekler });
    });
  });
}

describe('veri yönlendirmesi uçtan uca', () => {
  let ana: Awaited<ReturnType<typeof sahteArkaUc>>;
  let tr: Awaited<ReturnType<typeof sahteArkaUc>>;
  let uygulama: Server;
  let kok: string;

  beforeAll(async () => {
    ana = await sahteArkaUc('yurtdisi');
    tr = await sahteArkaUc('turkiye');

    process.env.PGRST_URL = `http://127.0.0.1:${ana.port}`;
    process.env.PGRST_FATURA_URL = `http://127.0.0.1:${tr.port}`;
    process.env.SITE_HTTPS = '0';

    // Ortam değişkenleri modül yüklenirken okunuyor; import bu yüzden
    // beforeAll içinde ve atamalardan SONRA.
    const { istegiKarsila } = await import('./index');
    uygulama = createServer((req, res) => { void istegiKarsila(req, res); });
    await new Promise<void>((coz) => uygulama.listen(0, () => coz()));
    kok = `http://127.0.0.1:${(uygulama.address() as { port: number }).port}`;
  });

  afterAll(() => {
    ana.sunucu.close(); tr.sunucu.close(); uygulama.close();
  });

  it('fatura tablosunu TÜRKİYE sunucusuna gönderir', async () => {
    const yanit = await fetch(`${kok}/veri/invoices?business_id=eq.42`);
    expect(await yanit.json()).toMatchObject({ arkaUc: 'turkiye' });
    expect(tr.istekler.at(-1)).toBe('/invoices?business_id=eq.42');
  });

  it('fatura satırlarını ve seriyi de Türkiye’ye gönderir', async () => {
    expect(await (await fetch(`${kok}/veri/invoice_lines`)).json())
      .toMatchObject({ arkaUc: 'turkiye' });
    expect(await (await fetch(`${kok}/veri/invoice_series`)).json())
      .toMatchObject({ arkaUc: 'turkiye' });
  });

  it('numara üreten çağrıyı faturayla AYNI sunucuya gönderir', async () => {
    const yanit = await fetch(`${kok}/veri/rpc/next_invoice_number`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ p_business_id: '42' }),
    });
    expect(await yanit.json()).toMatchObject({ arkaUc: 'turkiye' });
  });

  it('diğer tabloları YURT DIŞI sunucusunda bırakır', async () => {
    expect(await (await fetch(`${kok}/veri/reservations`)).json())
      .toMatchObject({ arkaUc: 'yurtdisi' });
    expect(await (await fetch(`${kok}/veri/payments`)).json())
      .toMatchObject({ arkaUc: 'yurtdisi' });
    expect(await (await fetch(`${kok}/veri/profiles`)).json())
      .toMatchObject({ arkaUc: 'yurtdisi' });
  });

  it('adı faturayla başlayan başka tabloyu Türkiye’ye göndermez', async () => {
    expect(await (await fetch(`${kok}/veri/invoices_arsiv`)).json())
      .toMatchObject({ arkaUc: 'yurtdisi' });
  });

  it('fatura DIŞI rpc çağrısını yurt dışında bırakır', async () => {
    const yanit = await fetch(`${kok}/veri/rpc/system_health`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(await yanit.json()).toMatchObject({ arkaUc: 'yurtdisi' });
  });
});
