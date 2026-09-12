/**
 * Sahra Takip sunucusu.
 *
 * Cloudflare Worker'ın yerini alıyor ve üç işi birden görüyor:
 *   1. Derlenmiş siteyi (dist/) sunar
 *   2. /api/* uç noktalarını karşılar
 *   3. /veri/* isteklerini PostgREST'e iletir
 *   4. Zamanlanmış görevleri çalıştırır
 *
 * PostgREST'in doğrudan dışarı açılmaması bilinçli: aynı kökenden
 * geçince tarayıcıda CORS'a gerek kalmıyor, içerik güvenlik politikası
 * `connect-src 'self'` kadar dar tutulabiliyor ve veritabanı arayüzü
 * internete ayrı bir kapı açmıyor.
 *
 * `api/` altındaki işleyiciler web standardı imzayı kullanıyor
 * (`(request: Request) => Promise<Response>`), bu yüzden taşıma için
 * hiçbiri değiştirilmedi.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join, normalize, extname } from 'node:path';
import { pipeline } from 'node:stream/promises';

import { ROTALAR, CRON_GOREVLERI, gorevIstegi } from './rotalar';
import { basliklariUygula } from './basliklar';
import { zamanlayiciBaslat } from './zamanlayici';

const PORT = Number(process.env.PORT ?? 8787);
const DIST = process.env.DIST_DIZINI ?? join(process.cwd(), 'dist');
const PGRST = process.env.PGRST_URL ?? 'http://127.0.0.1:3000';
/** Ters vekil arkasındaysak dış bağlantı HTTPS demektir. */
const HTTPS = process.env.SITE_HTTPS !== '0';

const TIPLER: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

/** Node isteğini web standardı `Request` nesnesine çevirir. */
function istegeCevir(req: IncomingMessage): Request {
  const konak = req.headers.host ?? 'localhost';
  const url = new URL(req.url ?? '/', `${HTTPS ? 'https' : 'http'}://${konak}`);

  const basliklar = new Headers();
  for (const [ad, deger] of Object.entries(req.headers)) {
    if (deger === undefined) continue;
    if (Array.isArray(deger)) deger.forEach((d) => basliklar.append(ad, d));
    else basliklar.set(ad, deger);
  }

  const govdesiz = req.method === 'GET' || req.method === 'HEAD';
  return new Request(url, {
    method: req.method,
    headers: basliklar,
    body: govdesiz ? undefined : (req as unknown as ReadableStream),
    // Node akışını gövde olarak vermek için gerekli.
    duplex: 'half',
  } as RequestInit & { duplex: 'half' });
}

/** Web standardı `Response` nesnesini Node yanıtına yazar. */
async function yanitiYaz(res: ServerResponse, yanit: Response): Promise<void> {
  const basliklar: Record<string, string | string[]> = {};
  yanit.headers.forEach((deger, ad) => {
    if (ad === 'set-cookie') {
      // Birden çok çerez tek başlıkta birleşirse tarayıcı yalnızca ilkini alır.
      const mevcut = basliklar[ad];
      basliklar[ad] = Array.isArray(mevcut) ? [...mevcut, deger] : [deger];
    } else {
      basliklar[ad] = deger;
    }
  });
  res.writeHead(yanit.status, basliklar);

  if (!yanit.body) { res.end(); return; }
  await pipeline(yanit.body as unknown as NodeJS.ReadableStream, res);
}

/** Dizin dışına çıkmaya çalışan yolları eler. */
function guvenliYol(kok: string, istenen: string): string | null {
  const temiz = normalize(decodeURIComponent(istenen)).replace(/^(\.\.[/\\])+/, '');
  const tam = join(kok, temiz);
  // `..` ile dist dışına çıkılırsa sunucudaki her dosya okunabilirdi.
  if (!tam.startsWith(kok)) return null;
  return tam;
}

async function statikSun(
  res: ServerResponse, yol: string, yontem: string,
): Promise<boolean> {
  const dosya = guvenliYol(DIST, yol);
  if (!dosya) return false;

  let bilgi;
  try {
    bilgi = await stat(dosya);
  } catch {
    return false;
  }
  if (!bilgi.isFile()) return false;

  const basliklar = new Headers();
  basliklariUygula(basliklar, yol, HTTPS);
  basliklar.set('Content-Type', TIPLER[extname(dosya).toLowerCase()] ?? 'application/octet-stream');
  basliklar.set('Content-Length', String(bilgi.size));

  const cikti: Record<string, string> = {};
  basliklar.forEach((d, a) => { cikti[a] = d; });
  res.writeHead(200, cikti);

  if (yontem === 'HEAD') { res.end(); return true; }
  await pipeline(createReadStream(dosya), res);
  return true;
}

/** PostgREST'e iletir. Jetonu istemci `Authorization` başlığında taşır. */
async function veriyeIlet(istek: Request, yol: string): Promise<Response> {
  const hedef = new URL(istek.url);
  const adres = `${PGRST}${yol.replace(/^\/veri/, '')}${hedef.search}`;

  const basliklar = new Headers(istek.headers);
  // Konak başlığı hedefe ait olmalı; aksi hâlde PostgREST kendi adresini
  // yanlış kurar ve sayfalama bağlantıları bozulur.
  basliklar.delete('host');

  const yanit = await fetch(adres, {
    method: istek.method,
    headers: basliklar,
    body: istek.method === 'GET' || istek.method === 'HEAD' ? undefined : await istek.arrayBuffer(),
    signal: AbortSignal.timeout(30_000),
  });

  const cikti = new Headers(yanit.headers);
  cikti.set('Cache-Control', 'no-store');
  return new Response(yanit.body, { status: yanit.status, headers: cikti });
}

export async function istegiKarsila(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const yol = new URL(req.url ?? '/', 'http://yerel').pathname;

  try {
    if (yol.startsWith('/veri/') || yol === '/veri') {
      await yanitiYaz(res, await veriyeIlet(istegeCevir(req), yol));
      return;
    }

    const isleyici = ROTALAR[yol];
    if (isleyici) {
      const yanit = await isleyici(istegeCevir(req));
      // Uç nokta yanıtları önbelleğe girmemeli: oturuma bağlı veri taşıyorlar.
      const basliklar = new Headers(yanit.headers);
      basliklar.set('Cache-Control', 'no-store');
      if (HTTPS) basliklar.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
      await yanitiYaz(res, new Response(yanit.body, { status: yanit.status, headers: basliklar }));
      return;
    }

    /*
      Tanımsız bir /api yolu siteye düşüp index.html döndürmemeli:
      istemci JSON beklerken HTML alır ve hata mesajı anlaşılmaz olur.
    */
    if (yol.startsWith('/api/')) {
      res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Uç nokta bulunamadı.' }));
      return;
    }

    if (await statikSun(res, yol, req.method ?? 'GET')) return;

    // Tek sayfa uygulaması: bilinmeyen yolu yönlendirici çözer.
    if (await statikSun(res, '/index.html', req.method ?? 'GET')) return;

    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Sayfa bulunamadı.');
  } catch (hata) {
    console.error('İstek karşılanamadı:', yol, hata);
    if (res.headersSent) { res.destroy(); return; }
    res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
    // Hata ayrıntısı dışarı verilmez: yığın izi sunucu hakkında bilgi sızdırır.
    res.end(JSON.stringify({ error: 'Sunucu hatası.' }));
  }
}

export function sunucuyuBaslat(port = PORT) {
  const sunucu = createServer((req, res) => { void istegiKarsila(req, res); });

  const gorevler: Record<string, () => Promise<unknown>> = {};
  for (const [ifade, yol] of Object.entries(CRON_GOREVLERI)) {
    gorevler[ifade] = () => ROTALAR[yol](gorevIstegi(yol));
  }
  const zamanlayiciyiDurdur = zamanlayiciBaslat({
    gorevler,
    gunluk: (mesaj, hata) => console.error(mesaj, hata),
  });

  sunucu.listen(port, () => {
    console.log(`Sahra Takip ${port} portunda çalışıyor.`);
  });

  const kapat = () => {
    zamanlayiciyiDurdur();
    sunucu.close(() => process.exit(0));
  };
  process.on('SIGTERM', kapat);
  process.on('SIGINT', kapat);

  return sunucu;
}
