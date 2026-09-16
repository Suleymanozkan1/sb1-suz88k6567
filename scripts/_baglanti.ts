/**
 * Araçların veritabanı bağlantısı.
 *
 * Göç aracı ve demo hesabı aracı aynı şekilde bağlanıyor: aynı TLS
 * kararı, aynı WebSocket seçeneği. Kod iki dosyada da dururken biri
 * düzeltilip öteki unutulabilirdi -- Neon'a düz TCP ile bağlanmayı
 * denemek tam olarak böyle bir hata.
 */
import { Client as PgClient } from 'pg';

/** `pg` ve Neon sürücüsünün ortak yüzü; çağıran taraf farkı görmüyor. */
export interface Baglanti {
  query: PgClient['query'];
  end: () => Promise<void>;
}

/**
 * Neon ve Vercel Postgres TLS zorunlu tutuyor. Adresin kendisi karar
 * veriyor; elle bayrak yok ki yanlışlıkla üretimde kapatılmasın
 * (api/_pg.ts ile aynı kural).
 */
export function tls(url: string): { rejectUnauthorized: boolean } | undefined {
  return /\bsslmode=require\b|neon\.tech|vercel-storage\.com/.test(url)
    ? { rejectUnauthorized: true }
    : undefined;
}

/**
 * Bağlantıyı açar.
 *
 * `websocket` ile Neon'a 443 üzerinden bağlanılıyor: bazı ağlar 5432'yi
 * kapatıyor ve düz TCP hiç açılmıyor.
 */
export async function istemciAc(url: string, websocket: boolean): Promise<Baglanti> {
  if (!websocket) {
    const istemci = new PgClient({ connectionString: url, ssl: tls(url) });
    await istemci.connect();
    return istemci;
  }
  const { Client, neonConfig } = await import('@neondatabase/serverless');
  // Node 22'den beri WebSocket yerleşik; ayrı bir paket gerekmiyor.
  neonConfig.webSocketConstructor = WebSocket as never;
  const istemci = new Client(url);
  await istemci.connect();
  return istemci as unknown as Baglanti;
}

/** DATABASE_URL yoksa anlaşılır bir hata ile durur. */
export function adres(komut: string): string {
  const deger = process.env.DATABASE_URL?.trim();
  if (!deger) {
    throw new Error(
      'DATABASE_URL tanımlı değil.\n'
      + `  Kullanım: DATABASE_URL='postgres://...' npm run ${komut}`,
    );
  }
  return deger;
}
