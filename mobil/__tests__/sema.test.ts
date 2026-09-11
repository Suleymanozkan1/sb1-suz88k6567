/**
 * Şema uyumu.
 *
 * Mobil ve panel, Supabase'e doğrudan tablo ve sütun adıyla sorar. Bu adlar
 * sessizce kayabiliyor: taklit istemci hangi ad istenirse onu döndürdüğü
 * için birim testleri yeşil kalır, hata ancak gerçek veritabanına
 * bağlanınca ortaya çıkar. Nitekim mobilde tam bu oldu — `cash_entries`
 * diye bir tablo hiç olmadı, kasa ekranı gerçek veriyle hiç açılmadı.
 *
 * Bu test, istemcilerin istediği her tablo ve sütunun göçlerde gerçekten
 * tanımlı olduğunu doğruluyor. Kaynak şema değil, göç dosyalarının kendisi:
 * araya elle tutulan bir kopya girerse o kopya da kayar.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const KOK = join(__dirname, '..', '..');
const GOCLER = join(KOK, 'supabase', 'migrations');

/** Göçlerden tablo -> sütun kümesi çıkarır. */
function semayiOku(): Map<string, Set<string>> {
  const sema = new Map<string, Set<string>>();
  const dosyalar = readdirSync(GOCLER).filter((d) => d.endsWith('.sql')).sort();

  for (const d of dosyalar) {
    const sql = readFileSync(join(GOCLER, d), 'utf8');

    // create table if not exists public.<ad> ( ... );
    const kurma = /create\s+table\s+(?:if\s+not\s+exists\s+)?public\.(\w+)\s*\(([\s\S]*?)\n\s*\)\s*;/gi;
    for (let m = kurma.exec(sql); m; m = kurma.exec(sql)) {
      const [, tablo, govde] = m;
      const sutunlar = sema.get(tablo) ?? new Set<string>();
      for (const satir of govde.split('\n')) {
        const temiz = satir.trim();
        if (!temiz || temiz.startsWith('--')) continue;
        // Kısıt satırları sütun değildir.
        if (/^(constraint|primary\s+key|unique|check|foreign\s+key|exclude)\b/i.test(temiz)) continue;
        // Ayrılmış sözcükler tırnaklı yazılıyor: "to" text not null.
        const ad = /^"?(\w+)"?\s+\S/.exec(temiz);
        if (ad) sutunlar.add(ad[1]);
      }
      sema.set(tablo, sutunlar);
    }

    // alter table public.<ad> ... add column [if not exists] <sutun>
    const degistirme = /alter\s+table\s+(?:only\s+)?public\.(\w+)([\s\S]*?);/gi;
    for (let m = degistirme.exec(sql); m; m = degistirme.exec(sql)) {
      const [, tablo, govde] = m;
      const sutunlar = sema.get(tablo) ?? new Set<string>();
      const ekleme = /add\s+column\s+(?:if\s+not\s+exists\s+)?(\w+)/gi;
      for (let e = ekleme.exec(govde); e; e = ekleme.exec(govde)) sutunlar.add(e[1]);
      const silme = /drop\s+column\s+(?:if\s+exists\s+)?(\w+)/gi;
      for (let e = silme.exec(govde); e; e = silme.exec(govde)) sutunlar.delete(e[1]);
      if (sutunlar.size > 0) sema.set(tablo, sutunlar);
    }
  }
  return sema;
}

interface Kullanim { tablo: string; ad: string; tur: string }

/** Bir istemci dosyasının istediği tablo ve sütunları çıkarır. */
function kullanimlariOku(dosya: string): Kullanim[] {
  const src = readFileSync(dosya, 'utf8');
  const kullanim: Kullanim[] = [];

  const cagrilar = [...src.matchAll(/from\('([a-z_]+)'\)/g)];
  cagrilar.forEach((m, i) => {
    const bas = m.index! + m[0].length;
    const son = i + 1 < cagrilar.length ? cagrilar[i + 1].index! : src.length;
    let kuyruk = src.slice(bas, son);
    const nokta = kuyruk.indexOf(';');
    if (nokta > 0) kuyruk = kuyruk.slice(0, nokta);
    const tablo = m[1];
    kullanim.push({ tablo, ad: '', tur: 'tablo' });

    for (const sel of kuyruk.matchAll(/\.select\(\s*'([^']*)'/g)) {
      for (const parca of sel[1].split(',')) {
        const ham = parca.trim();
        // PostgREST gömme sözdizimi sütun değildir: "iliski(...)" ya da "iliski!inner".
        if (!ham || ham === '*' || ham.includes('(') || ham.includes(')') || ham.includes('!')) continue;
        const ad = ham.split(':')[0].trim();
        if (ad) kullanim.push({ tablo, ad, tur: 'select' });
      }
    }
    for (const yaz of kuyruk.matchAll(/\.(?:insert|update|upsert)\(\s*\{([\s\S]*?)\}/g)) {
      for (const anahtar of yaz[1].matchAll(/(?:^|,)\s*([a-z_]+)\s*:/g)) {
        kullanim.push({ tablo, ad: anahtar[1], tur: 'yazma' });
      }
    }
    for (const f of kuyruk.matchAll(/\.(?:eq|neq|gte|lte|gt|lt|in|order)\(\s*'([a-z_]+)'/g)) {
      kullanim.push({ tablo, ad: f[1], tur: 'filtre' });
    }
  });
  return kullanim;
}

const sema = semayiOku();

describe('şema uyumu', () => {
  it('göçlerden şema okunabiliyor', () => {
    // Ayrıştırıcı bozulursa test sessizce "hiç uyuşmazlık yok" demesin.
    expect(sema.size).toBeGreaterThan(20);
    expect(sema.get('cash_flow')).toContain('description');
    expect(sema.get('safe_movements')).toContain('direction');
    // Sonradan eklenen sütunlar da görülmeli.
    expect(sema.get('reservations')).toContain('identity_no');
    // Ayrılmış sözcük olduğu için tırnaklı tanımlanan sütun da sayılmalı.
    expect(sema.get('sms_log')).toContain('to');
  });

  it.each([
    ['mobil', join(KOK, 'mobil', 'src', 'veri.ts')],
    ['panel', join(KOK, 'src', 'lib', 'repo', 'supabase.ts')],
  ])('%s yalnızca şemada var olan tablo ve sütunları istiyor', (_ad, dosya) => {
    const kullanim = kullanimlariOku(dosya);
    expect(kullanim.length).toBeGreaterThan(20);

    const eksik = kullanim
      .filter((k) => (k.tur === 'tablo'
        ? !sema.has(k.tablo)
        : !sema.get(k.tablo)?.has(k.ad)))
      .map((k) => (k.tur === 'tablo' ? `TABLO YOK: ${k.tablo}` : `${k.tur}: ${k.tablo}.${k.ad}`));

    expect([...new Set(eksik)]).toEqual([]);
  });
});
