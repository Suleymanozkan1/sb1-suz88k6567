/**
 * Demo takvim verisini ÜRETİR (elle yazılmaz).
 *
 * NEDEN BU BETİK VAR. Özel günler, okul takvimi ve hava durumu canlıda
 * zamanlanmış görevlerle doluyor (api/ozel-gunler.ts, api/meb-takvim.ts,
 * api/hava.ts). Demo modunda ne sunucu ne veritabanı var, dolayısıyla o
 * görevler hiç çalışmıyor ve takvim boş görünüyor.
 *
 * Boşluğu kapatmanın iki yolu vardı: tarihleri tohuma elle yazmak ya da
 * otomasyonun kendi kod yolunu çalıştırıp sonucu saklamak. İlki ilk yıl
 * doğru görünür, sonra sessizce eskir ve kimse fark etmez. Bu yüzden
 * ikincisi seçildi: betik CANLIDAKİ FONKSİYONLARI çağırıyor
 * (`tatilleriCek`, `kandilleriHesapla`, `arsiviCek`, `duyuruyuCoz`),
 * çıktıyı üretilmiş bir dosyaya yazıyor ve tohum oradan okuyor.
 *
 * Yenilemek için:  npm run demo:veri
 *
 * Üretilen dosya depoya giriyor: demo modunun ağ bağlantısı yok, veriyi
 * çalışma anında çekemez.
 */
import { writeFile } from 'node:fs/promises';

import {
  HICRI_FARKI, kandilleriHesapla, ramazanCipasi, tatilleriCek, type OzelGun,
} from '../api/ozel-gunler';
import { arsiviCek, duyuruyuCoz, takvimDuyurulari } from '../api/meb-takvim';

/**
 * Kapsanan yıllar: GEÇEN YIL + bu yıl + 3.
 *
 * Canlıdaki görev yalnızca ileriye bakıyor (geçmiş takvimi kimse
 * kurmuyor). Demo farklı: tanıtım verisi bugünün iki yanına yayılıyor ve
 * geçen yılın bayramları eksik kalırsa takvim geriye doğru boşalıyor.
 */
const GERI_YIL = 1;
const YIL_SAYISI = 5;

const HEDEF = new URL('../src/lib/demo/uretilmis-gunler.ts', import.meta.url).pathname;

interface UretilmisGun {
  day: string;
  label: string;
  kind: string;
  tentative?: boolean;
}

async function ozelGunler(yillar: number[]): Promise<UretilmisGun[]> {
  const tatiller = new Map<number, OzelGun[]>();
  for (const yil of yillar) {
    tatiller.set(yil, await tatilleriCek(yil));
    console.log(`  ${yil}: ${tatiller.get(yil)!.length} tatil/bayram`);
  }

  /*
    Kandiller hicri yıl başına hesaplanıp miladi yıla dağıtılıyor; bir
    önceki hicri yıl da gerekiyor çünkü o yılın Mevlid'i bu miladi yıla
    düşebiliyor. Canlıdaki işleyicinin sırasıyla aynı.
  */
  const hicriYillar = new Set<number>();
  for (const yil of yillar) {
    hicriYillar.add(yil - HICRI_FARKI);
    hicriYillar.add(yil - HICRI_FARKI + 1);
  }

  const kandiller: OzelGun[] = [];
  for (const hicriYil of hicriYillar) {
    const cipa = ramazanCipasi(tatiller.get(hicriYil + HICRI_FARKI) ?? []);
    const hesaplanan = await kandilleriHesapla(hicriYil, cipa);
    // Çapraz doğrulama tutmadıysa liste boş dönüyor; uydurma tarih yazılmıyor.
    kandiller.push(...hesaplanan);
  }
  console.log(`  ${kandiller.length} kandil`);

  const hepsi = [...[...tatiller.values()].flat(), ...kandiller];
  // Yazdığımız yılların dışına düşen kandilleri atıyoruz.
  return hepsi
    .filter((g) => yillar.includes(Number(g.day.slice(0, 4))))
    .map((g) => ({ day: g.day, label: g.label, kind: g.kind, tentative: g.tentative }))
    .sort((a, b) => a.day.localeCompare(b.day));
}

async function okulGunleri(): Promise<UretilmisGun[]> {
  const duyurular = takvimDuyurulari(await arsiviCek());
  console.log(`  ${duyurular.length} takvim duyurusu bulundu`);

  const gunler: UretilmisGun[] = [];
  // En yeni iki eğitim yılı yeter: demo takvimi bugünün etrafını gösteriyor.
  for (const duyuru of duyurular.slice(0, 2)) {
    const cozulen = await duyuruyuCoz(duyuru.link);
    console.log(`  ${duyuru.yil}-${duyuru.yil + 1}: ${cozulen.length} gün`);
    gunler.push(...cozulen.map((g) => ({
      day: g.gun, label: g.etiket, kind: 'okul',
    })));
  }
  return gunler.sort((a, b) => a.day.localeCompare(b.day));
}

async function main(): Promise<void> {
  const buYil = new Date().getUTCFullYear();
  const yillar = Array.from({ length: YIL_SAYISI }, (_, i) => buYil - GERI_YIL + i);

  console.log('Özel günler çekiliyor (date.nager.at + api.aladhan.com)...');
  const gunler = await ozelGunler(yillar);

  console.log('MEB okul takvimi çekiliyor (meb.gov.tr)...');
  const okul = await okulGunleri();

  const tumu = [...gunler, ...okul].sort((a, b) => a.day.localeCompare(b.day));

  const icerik = `/**
 * ÜRETİLMİŞ DOSYA -- ELLE DÜZENLEMEYİN.
 *
 * \`npm run demo:veri\` ile yeniden üretilir. İçerik, canlıdaki
 * zamanlanmış görevlerin kullandığı kaynaklardan çekilmiştir:
 *   - Resmî tatil ve dini bayram: date.nager.at
 *   - Kandil: api.aladhan.com (bayram tarihiyle çapraz doğrulanmış)
 *   - Okul takvimi: meb.gov.tr duyuruları
 *
 * Demo modunda zamanlanmış görev çalışmadığı için takvim bu dosyadan
 * doluyor. Gerçek kurulumda bu dosya KULLANILMIYOR; veriyi görevler
 * veritabanına yazıyor.
 *
 * Üretim tarihi: ${new Date().toISOString().slice(0, 10)}
 * Kapsanan yıllar: ${yillar.join(', ')}
 */
import type { SpecialDay } from '../../types';

type UretilmisGun = Pick<SpecialDay, 'day' | 'label' | 'kind'> & { tentative?: boolean };

export const URETIM_TARIHI = '${new Date().toISOString().slice(0, 10)}';

export const URETILMIS_GUNLER: UretilmisGun[] = ${JSON.stringify(tumu, null, 2)
    .replace(/"day"/g, 'day')
    .replace(/"label"/g, 'label')
    .replace(/"kind"/g, 'kind')
    .replace(/"tentative"/g, 'tentative')} as UretilmisGun[];
`;

  await writeFile(HEDEF, icerik, 'utf-8');
  console.log(`\\nYazıldı: ${HEDEF}`);
  console.log(`Toplam ${tumu.length} gün (${gunler.length} özel gün + ${okul.length} okul günü).`);
}

void main().catch((hata) => {
  console.error('Üretim başarısız:', hata);
  process.exit(1);
});
