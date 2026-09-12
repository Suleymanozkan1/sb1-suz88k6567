import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Mobil ve web aynı PostgREST istemcisini kullanıyor.
 *
 * Mobil paketi üst dizinden içe aktarım yapamadığı için dosya kopya
 * tutuluyor. Kopyalar ayrışırsa mobil ile web farklı davranır ve fark,
 * ancak biri bozulduğunda anlaşılır -- nitekim değer kaçırma hatası
 * sessizce sıfır satır döndürüyordu.
 */
const KOK = join(__dirname, '..', '..');

/** Başlık yorumu kopyada uzun; karşılaştırma gövdeden başlıyor. */
function govde(metin: string): string {
  const bas = metin.indexOf('export interface PostgrestHata');
  return metin.slice(bas).trim();
}

describe('PostgREST istemcisi kopyası', () => {
  it('mobil ve web sürümleri aynı', () => {
    const web = readFileSync(join(KOK, 'src', 'lib', 'postgrest.ts'), 'utf8');
    const mobil = readFileSync(join(KOK, 'mobil', 'src', 'postgrest.ts'), 'utf8');
    expect(govde(mobil)).toBe(govde(web));
  });
});
