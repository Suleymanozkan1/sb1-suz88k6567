import { describe, expect, it, vi } from 'vitest';
import duyurular from './__fixtures__/meb-duyurular.json';
import { arsiviCek, duyuruyuCoz, takvimDuyurulari } from './meb-takvim';

const ARSIV = [
  { BASLIK: 'BİR HABER', LINK: '/bir-haber/haber/100/tr', ISLEMSAAT: '01/01/2026' },
  { BASLIK: '2024-2025 TAKVİMİ', LINK: '/2024-2025-egitim-ogretim-yili-takvimi-aciklandi/haber/33888/tr', ISLEMSAAT: '28/05/2024' },
  { BASLIK: '2026-2027 TAKVİMİ', LINK: '/2026-2027-egitim-ogretim-yili-takvimi-aciklandi/haber/41057/tr', ISLEMSAAT: '13/06/2026' },
  { BASLIK: '2025-2026 TAKVİMİ', LINK: '/2025-2026-egitim-ogretim-yili-takvimi-aciklandi/haber/37198/tr', ISLEMSAAT: '15/05/2025' },
];

describe('takvimDuyurulari', () => {
  it('yalnızca takvim duyurularını seçer', () => {
    expect(takvimDuyurulari(ARSIV)).toHaveLength(3);
  });

  it('EĞİTİM YILINA göre sıralar, arşivin sırasına güvenmez', () => {
    /*
      Arşivin tarih alanı metin olarak sıralanıyor ve "30/06/2026",
      "16/09/2026"dan büyük çıkıyor. Sıralama duyurudaki yıla göre
      yapılmasaydı eski bir takvim en yeni sanılabilirdi.
    */
    expect(takvimDuyurulari(ARSIV).map((d) => d.yil)).toEqual([2026, 2025, 2024]);
  });

  it('bağlantısı olmayan satırı atar', () => {
    expect(takvimDuyurulari([{ BASLIK: 'x' }])).toEqual([]);
  });

  it('boş arşivde boş döner', () => {
    expect(takvimDuyurulari([])).toEqual([]);
  });
});

describe('arsiviCek', () => {
  it('iki sütunun tanımını da gönderir', async () => {
    /*
      Sütun tanımları eksik gönderildiğinde MEB uç noktası 500 dönüyor;
      bu ölçülerek bulundu.
    */
    const getir = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: ARSIV }), { status: 200 }),
    );
    await arsiviCek(getir as unknown as typeof fetch);
    const govde = String((getir.mock.calls[0]![1] as RequestInit).body);
    expect(govde).toContain('columns%5B0%5D%5Bdata%5D=0');
    expect(govde).toContain('columns%5B1%5D%5Bdata%5D=1');
    expect(govde).toContain('length=5000');
    // Arama parametresi sunucuda hata veriyor; boş gönderiliyor.
    expect(govde).toContain('search%5Bvalue%5D=&');
  });

  it('hata durumunda açık mesajla düşer', async () => {
    const getir = vi.fn().mockResolvedValue(new Response('', { status: 500 }));
    await expect(arsiviCek(getir as unknown as typeof fetch)).rejects.toThrow(/500/);
  });

  it('data alanı dizi değilse boş döner', async () => {
    const getir = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: null }), { status: 200 }),
    );
    expect(await arsiviCek(getir as unknown as typeof fetch)).toEqual([]);
  });
});

describe('duyuruyuCoz', () => {
  it('gerçek duyuru metninden günleri çıkarır', async () => {
    const getir = vi.fn().mockResolvedValue(
      new Response(`<html><body><p>${duyurular['2026-2027']}</p></body></html>`, { status: 200 }),
    );
    const gunler = await duyuruyuCoz('/x/haber/1/tr', getir as unknown as typeof fetch);
    expect(gunler.some((g) => g.gun === '2026-09-14' && g.etiket === 'Okullar açılıyor')).toBe(true);
    expect(gunler.some((g) => g.gun === '2027-01-25' && g.etiket === 'Yarıyıl tatili')).toBe(true);
  });

  it('göreli bağlantıyı tam adrese çevirir', async () => {
    const getir = vi.fn().mockResolvedValue(new Response('<p>yok</p>', { status: 200 }));
    await duyuruyuCoz('/a/haber/1/tr', getir as unknown as typeof fetch);
    expect(getir.mock.calls[0]![0]).toBe('https://www.meb.gov.tr/a/haber/1/tr');
  });

  it('tam adresi olduğu gibi kullanır', async () => {
    const getir = vi.fn().mockResolvedValue(new Response('<p>yok</p>', { status: 200 }));
    await duyuruyuCoz('https://x.meb.gov.tr/y', getir as unknown as typeof fetch);
    expect(getir.mock.calls[0]![0]).toBe('https://x.meb.gov.tr/y');
  });
});
