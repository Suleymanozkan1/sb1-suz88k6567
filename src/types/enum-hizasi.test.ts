import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LEAD_SOURCES } from './index';
import { ESKI_LEAD_CHANNELS, LEAD_CHANNELS } from '../data/constants';

/**
 * ARAYÜZ LİSTELERİ İLE VERİTABANI ENUM'LARI AYNI MI.
 *
 * NEDEN VAR. Açılır kutudaki seçenekler TypeScript'te, veritabanı kısıtı
 * SQL göçlerinde duruyor. İkisi birbirini bilmiyor: biri büyüdüğünde
 * derleyici de testler de susuyor. Tam olarak bu oldu -- rezervasyon
 * formu sekiz kanal sunarken `lead_channel` enum'ında beşi vardı ve
 * "Facebook" seçilen her rezervasyon veritabanında "invalid input value
 * for enum" ile reddediliyordu.
 *
 * HATA TANITIM KİPİNDE HİÇ GÖRÜNMÜYOR: orada veri tarayıcıda tutuluyor
 * ve enum kısıtı yok. Yani ekranda her şey çalışıyor gibi duruyor,
 * gerçek veritabanına geçilince patlıyor. Bu test o boşluğu kapatıyor.
 *
 * Göç dosyaları METİN OLARAK okunuyor, veritabanına bağlanılmıyor:
 * test her ortamda, bağlantı olmadan çalışabilmeli.
 */

const GOC_DIZINI = join(process.cwd(), 'supabase', 'migrations');

/** Bütün göçleri okuyup bir enum'un NİHAİ değer kümesini çıkarır. */
function enumDegerleri(tip: string): Set<string> {
  const dosyalar = readdirSync(GOC_DIZINI).filter((d) => d.endsWith('.sql')).sort();
  const metin = dosyalar.map((d) => readFileSync(join(GOC_DIZINI, d), 'utf-8')).join('\n');
  const degerler = new Set<string>();

  // create type ... as enum ('a', 'b', ...)
  const olustur = new RegExp(
    `create type public\\.${tip} as enum\\s*\\(([^)]*)\\)`, 'gi',
  );
  for (const m of metin.matchAll(olustur)) {
    for (const d of m[1].matchAll(/'((?:[^']|'')*)'/g)) {
      degerler.add(d[1].replace(/''/g, "'"));
    }
  }

  // alter type ... add value [if not exists] 'x'
  const ekle = new RegExp(
    `alter type public\\.${tip} add value(?: if not exists)? '((?:[^']|'')*)'`, 'gi',
  );
  for (const m of metin.matchAll(ekle)) {
    degerler.add(m[1].replace(/''/g, "'"));
  }

  return degerler;
}

describe('açılır kutu seçenekleri veritabanı enum\'ında var', () => {
  it('göç dosyalarından enum okunabiliyor', () => {
    // Ayrıştırıcı bozulursa test sessizce "her şey uygun" derdi.
    expect(enumDegerleri('lead_channel').size).toBeGreaterThan(4);
    expect(enumDegerleri('lead_source').size).toBeGreaterThan(4);
  });

  it('ulaşım kanalı seçeneklerinin hepsi kaydedilebiliyor', () => {
    const izinli = enumDegerleri('lead_channel');
    const disarida = LEAD_CHANNELS.filter((k) => !izinli.has(k));
    expect(disarida, 'veritabanına yazılamayacak kanal(lar)').toEqual([]);
  });

  it('aday kaynağı seçeneklerinin hepsi kaydedilebiliyor', () => {
    const izinli = enumDegerleri('lead_source');
    const disarida = LEAD_SOURCES.filter((k) => !izinli.has(k));
    expect(disarida, 'veritabanına yazılamayacak kaynak(lar)').toEqual([]);
  });

  /*
    İki ekran AYNI soruyu soruyor: görüşme formu ve rezervasyon formu.
    Listeler ayrıştığında kanal raporu ikiye bölünür ve "Facebook'tan kaç
    müşteri geldi" sorusunun tek bir cevabı olmaz.
  */
  it('görüşme ve rezervasyon formu aynı seçenekleri sunuyor', () => {
    const kaynak = LEAD_SOURCES.filter((k) => k !== 'Manuel');
    // Listeden çıkarılmış eski değerler yeni kayıtta seçilemiyor.
    const kanal = LEAD_CHANNELS.filter((k) => !ESKI_LEAD_CHANNELS.includes(k));
    expect([...kaynak].sort()).toEqual([...kanal].sort());
  });
});
