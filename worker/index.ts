/**
 * Cloudflare Worker giriş noktası.
 *
 * Tek bir Worker hem derlenmiş siteyi (statik varlıklar) sunar hem de
 * `/api/*` uç noktalarını karşılar hem de zamanlanmış görevleri çalıştırır.
 *
 * `api/` altındaki işleyiciler web standardı imzayı kullanıyor
 * (`(request: Request) => Promise<Response>`), bu yüzden olduğu gibi
 * çağrılabiliyorlar; taşıma için değiştirilmediler.
 */
import backup from '../api/backup';
import health from '../api/health';
import invoice from '../api/invoice';
import iys from '../api/iys';
import login from '../api/login';
import otp from '../api/otp';
import reminders from '../api/reminders';
import smsQueue from '../api/sms-queue';
import sms from '../api/sms';

type Isleyici = (request: Request) => Promise<Response>;

export interface Env {
  /** wrangler.jsonc içindeki assets bağlantısı; derlenmiş site. */
  ASSETS: { fetch: (request: Request) => Promise<Response> };
}

export const ROTALAR: Record<string, Isleyici> = {
  '/api/backup': backup,
  '/api/health': health,
  '/api/invoice': invoice,
  '/api/iys': iys,
  '/api/login': login,
  '/api/otp': otp,
  '/api/sms': sms,
  '/api/sms-queue': smsQueue,
  '/api/reminders': reminders,
};

/**
 * Zamanlanmış görevin cron ifadesi hangi uç noktayı çalıştıracak.
 * wrangler.jsonc içindeki `triggers.crons` listesiyle birebir aynı olmalı.
 */
export const CRON_GOREVLERI: Record<string, keyof typeof ROTALAR> = {
  '*/5 * * * *': '/api/sms-queue',
  '*/15 * * * *': '/api/invoice',
  '30 2 * * *': '/api/backup',
  '0 3 * * *': '/api/iys',
  // Hatırlatmalar sabah taranır; kuralın kendi saat alanı gün içinde
  // hangi saatten sonra gönderileceğine karar verir.
  '0 7 * * *': '/api/reminders',
};

/**
 * Zamanlanmış görevler yetkilerini `Authorization: Bearer <CRON_SECRET>`
 * başlığından doğruluyor. Worker içinden çağrıldıklarında ortada bir HTTP
 * isteği olmadığı için başlık burada üretilir; sır yalnızca sunucuda kalır.
 */
function gorevIstegi(yol: string): Request {
  const secret = process.env.CRON_SECRET;
  return new Request(`https://gorev.local${yol}`, {
    method: 'POST',
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);

    const isleyici = ROTALAR[pathname];
    if (isleyici) return isleyici(request);

    // Tanımsız bir /api yolu siteye düşüp index.html döndürmemeli; aksi hâlde
    // istemci JSON beklerken HTML alır ve hata mesajı anlaşılmaz olur.
    if (pathname.startsWith('/api/')) {
      return Response.json({ error: 'Uç nokta bulunamadı.' }, { status: 404 });
    }

    return env.ASSETS.fetch(request);
  },

  async scheduled(event: { cron: string }, _env: Env, ctx: { waitUntil: (p: Promise<unknown>) => void }): Promise<void> {
    const yol = CRON_GOREVLERI[event.cron];
    if (!yol) return;
    ctx.waitUntil(ROTALAR[yol](gorevIstegi(yol)));
  },
};
