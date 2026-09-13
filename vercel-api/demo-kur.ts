/**
 * Tanıtım için döviz kuru (Vercel fonksiyonu).
 *
 * NEDEN SUNUCUDAN. Tanıtım kipi tarayıcıda çalışıyor ve içerik güvenlik
 * politikası `connect-src 'self'` (sunucu/basliklar.ts): tarayıcı
 * tcmb.gov.tr adresine çıkamaz. Aynı kökenden sunulunca engel kalkıyor.
 *
 * KAYNAK TCMB. Merkez Bankası'nın günlük kur dosyası ücretsiz, anahtar
 * istemiyor ve resmî. Çözümleme `api/kurlar.ts` içindeki `tcmbCevir` ile
 * yapılıyor -- canlı zamanlanmış görevle AYNI kod; ikinci bir ayrıştırıcı
 * yazılsaydı TCMB biçimi değiştiğinde iki yeri düzeltmek gerekirdi.
 *
 * ALTIN YOK. TCMB yalnızca döviz veriyor. Uydurma bir altın fiyatı
 * yazılmıyor: o rakama bakıp fiyat belirleyen salon sahibini yanıltırdı.
 * Altın isteniyorsa gerçek kurulumda `KUR_SAGLAYICI=collectapi`.
 *
 * ÖNBELLEK. Altı saat. TCMB kuru iş günü içinde bir kez yayımlıyor;
 * daha sık sorulması yeni bir değer getirmiyor.
 */
import { tcmbCevir, tcmbTarihi, type KurSatiri } from '../api/kurlar.js';

const TCMB_ADRESI = 'https://www.tcmb.gov.tr/kurlar/today.xml';

interface VercelYanit {
  status(kod: number): VercelYanit;
  setHeader(ad: string, deger: string): void;
  send(govde: string): void;
}

export default async function handler(_req: unknown, res: VercelYanit): Promise<void> {
  let kurlar: KurSatiri[] = [];
  let tarih: string | null = null;
  let hata = '';

  try {
    const yanit = await fetch(TCMB_ADRESI, { signal: AbortSignal.timeout(15_000) });
    if (!yanit.ok) throw new Error(`TCMB ${yanit.status} döndü.`);
    const xml = await yanit.text();
    tarih = tcmbTarihi(xml);
    kurlar = tcmbCevir(xml);
  } catch (e) {
    /*
      Hata metin olarak dönüyor: sessizce boş liste verilseydi "TCMB
      ulaşılamadı" ile "kod çöktü" ayırt edilemez, sorun canlıda
      körlemesine aranırdı. TCMB herkese açık, sır içermiyor.
    */
    hata = String(e instanceof Error ? e.message : e).slice(0, 300);
  }

  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader(
    'cache-control',
    kurlar.length > 0
      ? 'public, s-maxage=21600, stale-while-revalidate=86400'
      // Başarısız yanıt uzun süre önbellekte kalmamalı.
      : 'public, s-maxage=300',
  );
  res.status(kurlar.length > 0 ? 200 : 503).send(JSON.stringify({
    uretim: new Date().toISOString(), tarih, kurlar, hata,
  }));
}
