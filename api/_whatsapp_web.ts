/**
 * WhatsApp Web oturumu üzerinden mesaj gönderme.
 *
 * Bu, `_whatsapp_gonder.ts` içindeki Cloud API yolundan BAŞKA bir yoldur
 * ve ikisi karıştırılmamalıdır:
 *
 *   Cloud API (whatsapp-gonder.ts)   WhatsApp Web (bu dosya)
 *   ------------------------------   ------------------------------------
 *   Meta'nın resmî arayüzü           Resmî olmayan istemci
 *   Konuşma/mesaj başına ücretli     Ücretsiz
 *   Pencere kapalıysa şablon şart    Serbest metin, pencere kuralı yok
 *   Numara Cloud API'ye kayıtlı      Numara NORMAL WhatsApp hesabı
 *
 * NEDEN İKİNCİ BİR NUMARA GEREKİYOR. Meta'nın kuralı: bir numara Cloud
 * API ile WhatsApp uygulamasında AYNI ANDA kullanılamaz. Müşteri
 * adaylarını yakalayan numara Cloud API'ye kayıtlı; bu yol ayrı bir
 * numara ister.
 *
 * RİSK, AÇIKÇA. Otomatik gönderim WhatsApp'ın kullanım şartlarına
 * aykırıdır ve numara banlanabilir. Bu yüzden:
 *   - Yalnızca YÖNETİCİ bildirimleri buradan gider; müşteriye giden
 *     hiçbir mesaj bu yoldan geçmez.
 *   - Gönderimler arasına bekleme konur (insan hızına yakın dursun).
 *   - Gönderim düşerse kuyruk aynı satırı SMS'e düşürür; bildirim
 *     kaybolmaz (api/sms-queue.ts).
 * Ban gelirse yalnızca bu ikinci numara etkilenir, müşteri iletişim
 * numarası etkilenmez.
 *
 * Gerekli ortam değişkenleri (SUNUCUDA KALIR):
 *   WHATSAPP_WEB_ETKIN    '1' ise bu yol açık
 *   WHATSAPP_WEB_OTURUM   Oturum dizini (varsayılan /var/lib/sahra/whatsapp-oturum)
 *
 * Oturum dosyaları hesabın kendisidir: eline geçen kişi o WhatsApp
 * hesabından mesaj atabilir. Dizin 0700, dosyalar 0600 olmalı; yedeğe ve
 * Git'e girmemeli.
 */
import { mkdir } from 'node:fs/promises';

const OTURUM_DIZINI = process.env.WHATSAPP_WEB_OTURUM ?? '/var/lib/sahra/whatsapp-oturum';

/** Gönderimler arası en az bekleme. Arka arkaya yağan mesaj ban sebebidir. */
export const BEKLEME_MS = 3_000;

export type Durum = 'kapali' | 'baglaniyor' | 'qr_bekleniyor' | 'bagli';

interface Soket {
  sendMessage(jid: string, icerik: { text: string }): Promise<{ key?: { id?: string } } | undefined>;
  onWhatsApp(numara: string): Promise<{ exists?: boolean; jid?: string }[] | undefined>;
  logout(): Promise<void>;
  ev: { on(olay: string, dinleyici: (veri: unknown) => void): void };
}

let soket: Soket | null = null;
let durum: Durum = 'kapali';
let sonQr: string | null = null;
let sonGonderim = 0;

export function whatsappWebEtkinMi(): boolean {
  return process.env.WHATSAPP_WEB_ETKIN === '1';
}

export function baglantiDurumu(): Durum {
  return durum;
}

/** Eşleştirme ekranındaki QR metni. Yalnızca kurulum betiği okur. */
export function bekleyenQr(): string | null {
  return sonQr;
}

/**
 * Türk cep numarasını WhatsApp kimliğine çevirir.
 * Girdi 5XXXXXXXXX biçiminde normalize edilmiş olarak gelir (enqueue_sms
 * bunu zaten yapıyor); yine de baştaki 0 ve 90 temizleniyor.
 */
export function jidCevir(telefon: string): string | null {
  const rakam = telefon.replace(/\D/g, '').replace(/^90/, '').replace(/^0/, '');
  if (!/^5\d{9}$/.test(rakam)) return null;
  return `90${rakam}@s.whatsapp.net`;
}

/**
 * Oturumu açar.
 *
 * `qrGeldi` verilirse eşleştirme modundadır: QR üretildiğinde çağrılır.
 * Verilmezse yalnızca diskteki kayıtlı oturumla bağlanmaya çalışılır ve
 * QR gelirse bağlanma başarısız sayılır -- sunucu açılışında kimsenin
 * göremeyeceği bir QR üretip beklemek anlamsız.
 */
export async function baglan(qrGeldi?: (qr: string) => void): Promise<Durum> {
  if (!whatsappWebEtkinMi()) return 'kapali';
  if (durum === 'bagli' && soket) return durum;

  await mkdir(OTURUM_DIZINI, { recursive: true, mode: 0o700 });

  /*
    Baileys çalışma anında yükleniyor: WhatsApp yolu kapalıysa 61 MB'lık
    bağımlılık hiç belleğe alınmasın ve kurulmamışsa sunucu açılışı
    bundan etkilenmesin.
  */
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const baileys = require('@whiskeysockets/baileys') as {
    default: (ayar: Record<string, unknown>) => Soket;
    useMultiFileAuthState: (dizin: string) => Promise<{ state: unknown; saveCreds: () => Promise<void> }>;
    DisconnectReason: { loggedOut: number };
  };

  const { state, saveCreds } = await baileys.useMultiFileAuthState(OTURUM_DIZINI);

  durum = 'baglaniyor';
  const s = baileys.default({
    auth: state,
    // Baileys varsayılan olarak her protokol olayını basıyor; sunucu
    // günlüğünü boğmasın diye susturuluyor.
    logger: sessizGunluk(),
    browser: ['Sahra Takip', 'Chrome', '1.0.0'],
    syncFullHistory: false,
    markOnlineOnConnect: false,
  });
  soket = s;

  return new Promise<Durum>((coz) => {
    let cozuldu = false;
    const bitir = (d: Durum) => { if (!cozuldu) { cozuldu = true; durum = d; coz(d); } };

    s.ev.on('creds.update', () => { void saveCreds(); });

    s.ev.on('connection.update', (ham: unknown) => {
      const g = ham as { qr?: string; connection?: string; lastDisconnect?: { error?: unknown } };

      if (g.qr) {
        sonQr = g.qr;
        if (qrGeldi) { durum = 'qr_bekleniyor'; qrGeldi(g.qr); }
        // Eşleştirme modunda değilsek kayıtlı oturum yok demektir.
        else bitir('kapali');
        return;
      }

      if (g.connection === 'open') { sonQr = null; bitir('bagli'); return; }

      if (g.connection === 'close') {
        soket = null;
        bitir('kapali');
      }
    });

    // Bağlantı hiç kurulmazsa çağıran sonsuza kadar beklemesin.
    setTimeout(() => bitir(durum === 'bagli' ? 'bagli' : 'kapali'), 30_000);
  });
}

/** Baileys'in beklediği günlükçü arayüzü; hiçbir şey yazmıyor. */
function sessizGunluk(): Record<string, unknown> {
  const bos = () => undefined;
  const g: Record<string, unknown> = {
    level: 'silent', trace: bos, debug: bos, info: bos, warn: bos, error: bos, fatal: bos,
  };
  g.child = () => g;
  return g;
}

export interface GonderimSonucu {
  ok: boolean;
  reference?: string;
  error?: string;
}

/**
 * Mesajı gönderir.
 *
 * Numaranın WhatsApp'ta kayıtlı olup olmadığı ÖNCE sorgulanıyor: kayıtlı
 * olmayan bir numaraya gönderim sessizce hiçbir yere gitmez ve kuyruk
 * "gönderildi" sanırdı. Kayıtlı değilse hata dönüyor ve çağıran SMS'e
 * düşüyor.
 */
export async function gonder(telefon: string, metin: string): Promise<GonderimSonucu> {
  if (!whatsappWebEtkinMi()) return { ok: false, error: 'WhatsApp Web yolu kapalı.' };
  if (durum !== 'bagli' || !soket) return { ok: false, error: 'WhatsApp oturumu bağlı değil.' };

  const jid = jidCevir(telefon);
  if (!jid) return { ok: false, error: 'Geçersiz cep telefonu numarası.' };

  const bekle = BEKLEME_MS - (Date.now() - sonGonderim);
  if (bekle > 0) await new Promise((c) => setTimeout(c, bekle));
  sonGonderim = Date.now();

  try {
    const kayitli = await soket.onWhatsApp(jid.split('@')[0]!);
    if (!kayitli?.[0]?.exists) {
      return { ok: false, error: 'Numara WhatsApp kullanmıyor.' };
    }

    const sonuc = await soket.sendMessage(jid, { text: metin });
    return { ok: true, reference: sonuc?.key?.id ?? undefined };
  } catch (hata) {
    durum = 'kapali';
    soket = null;
    return { ok: false, error: `WhatsApp gönderimi başarısız: ${String(hata).slice(0, 200)}` };
  }
}

/** Testlerin ve kurulum betiğinin durumu sıfırlayabilmesi için. */
export function sifirla(): void {
  soket = null;
  durum = 'kapali';
  sonQr = null;
  sonGonderim = 0;
}
