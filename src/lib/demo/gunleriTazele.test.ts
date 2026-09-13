import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gunleriTazele, havayiTazele } from './gunleriTazele';
import { localRepo } from '../repo/local';
import { clearAll, KEYS, read } from '../storage';
import type { SpecialDay, WeatherForecast } from '../../types';

/*
  Uç nokta hem takvimi hem HAVA TAHMİNİNİ döndürüyor. Tahmin bir süre
  okunmuyordu: uç nokta doğru veriyi veriyor, istemci atıyor ve tanıtımda
  hava durumu satırı hiç görünmüyordu. Bu dosya zincirin iki ucunu da
  bağlıyor.
*/
const GUN_YANITI = {
  uretim: '2026-09-13T04:30:00.000Z',
  gunler: [{ day: '2026-10-29', label: 'Cumhuriyet Bayramı', kind: 'resmi' }],
};

const HAVA_YANITI = {
  uretim: '2026-09-13T04:30:00.000Z',
  gunluk: [
    { gun: '2026-09-13', enDusuk: 14, enYuksek: 27, hadise: 'A' },
    { gun: '2026-09-14', enDusuk: 15, enYuksek: 24, hadise: 'PB' },
  ],
  saatlik: [{ saat: '2026-09-13T19:00', sicaklik: 21, hadise: 'A' }],
};

function yanitla(govde: unknown, ok = true) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok, json: async () => govde,
  }));
}

describe('gunleriTazele', () => {
  beforeEach(() => { clearAll(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('hava tahminini depoya yazar ve depo katmanı okur', async () => {
    yanitla(HAVA_YANITI);
    expect(await havayiTazele()).toBe(true);

    const yazilan = read<WeatherForecast[]>(KEYS.weather, []);
    expect(yazilan).toHaveLength(2);
    expect(yazilan[0]).toMatchObject({ day: '2026-09-13', minC: 14, maxC: 27, hadise: 'A' });
    // Hadise kodu okunur ada çevriliyor; ekranda "A" yazmamalı.
    expect(yazilan[0].summary).not.toBe('A');
    expect(yazilan[0].summary.length).toBeGreaterThan(1);

    const okunan = await localRepo.listWeather('biz_demo');
    expect(okunan.map((h) => h.day)).toEqual(['2026-09-13', '2026-09-14']);
  });

  it('başka işletmenin tahminini vermez', async () => {
    yanitla(HAVA_YANITI);
    await havayiTazele();
    expect(await localRepo.listWeather('biz_baska')).toEqual([]);
  });

  it('hava gelmezse uydurmuyor', async () => {
    yanitla({ ...HAVA_YANITI, gunluk: [] });
    expect(await havayiTazele()).toBe(false);
    expect(await localRepo.listWeather('biz_demo')).toEqual([]);
  });

  it('saatlik tahmini de yazar', async () => {
    yanitla(HAVA_YANITI);
    await havayiTazele();
    const saatler = await localRepo.listWeatherHours('biz_demo');
    expect(saatler).toHaveLength(1);
    expect(saatler[0]).toMatchObject({ hour: '2026-09-13T19:00', tempC: 21 });
  });

  it('özel günleri yazarken işletmenin kendi gününü korur', async () => {
    yanitla(GUN_YANITI);
    await gunleriTazele();
    const gunler = read<SpecialDay[]>(KEYS.specialDays, []);
    expect(gunler.some((g) => g.label === 'Cumhuriyet Bayramı')).toBe(true);
  });

  it('uç nokta düşerse sessiz kalıyor', async () => {
    yanitla({}, false);
    expect(await gunleriTazele()).toBe(false);
  });
});
