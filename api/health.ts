/**
 * Sistem sağlık kontrolü.
 *
 * Uptime izleme servisleri (UptimeRobot, Better Stack vb.) bu adresi
 * dakikada bir çağırarak sistemin ayakta olduğunu doğrular. Sorun varsa
 * HTTP 503 döner; böylece izleyici bildirim gönderir.
 *
 * Kişisel veri döndürmez; yalnızca sayısal özet verir. Ayrıntılı durum
 * (kuyruk, yedek yaşı) yalnızca CRON_SECRET ile çağrıldığında eklenir.
 */
import {
  callRpc, faturaAdresi, faturaBolmesiVar, isAuthorizedCron, isDbConfigured, selectRows,
} from './_db.js';
import { json } from './_guard.js';
import { isProviderConfigured } from './sms.js';

/** Sağlıksız kabul edilme eşikleri */
const THRESHOLDS = {
  /** Kuyrukta bu kadar dakikadır bekleyen mesaj varsa işleyici durmuş demektir */
  queueOldestMinutes: 30,
  /** Bu kadar saatten eski yedek kabul edilemez */
  backupMaxAgeHours: 48,
};

interface OwnerRow { id: string }
interface Health {
  kuyruk_bekleyen: number;
  kuyruk_basarisiz: number;
  kuyruk_en_eski_dakika: number;
  iys_aktarilmamis: number;
  son_yedek: { yas_saat: number; durum: string } | null;
}

export default async function handler(request: Request): Promise<Response> {
  const detailed = isAuthorizedCron(request);

  if (!isDbConfigured()) {
    // Veritabanı yapılandırılmamışsa uygulama demo modundadır; bu bir
    // arıza değildir, ancak izlemede ayırt edilebilmelidir.
    return json({ status: 'demo', message: 'Veritabanı yapılandırılmamış.' });
  }

  const sorunlar: string[] = [];
  let toplam: Health = {
    kuyruk_bekleyen: 0, kuyruk_basarisiz: 0, kuyruk_en_eski_dakika: 0,
    iys_aktarilmamis: 0, son_yedek: null,
  };

  try {
    const owners = await selectRows<OwnerRow>('profiles?role=eq.owner&select=id&limit=50');

    for (const owner of owners) {
      const health = await callRpc<Health>('system_health', { p_owner_id: owner.id });
      toplam = {
        kuyruk_bekleyen: toplam.kuyruk_bekleyen + (health.kuyruk_bekleyen ?? 0),
        kuyruk_basarisiz: toplam.kuyruk_basarisiz + (health.kuyruk_basarisiz ?? 0),
        kuyruk_en_eski_dakika: Math.max(toplam.kuyruk_en_eski_dakika, health.kuyruk_en_eski_dakika ?? 0),
        iys_aktarilmamis: toplam.iys_aktarilmamis + (health.iys_aktarilmamis ?? 0),
        son_yedek: health.son_yedek ?? toplam.son_yedek,
      };
    }
  } catch (error) {
    return json(
      {
        status: 'arizali',
        ...(detailed ? { sorunlar: ['Veritabanına ulaşılamıyor.'], detay: String(error) } : {}),
      },
      503,
    );
  }

  if (toplam.kuyruk_en_eski_dakika > THRESHOLDS.queueOldestMinutes) {
    sorunlar.push(`SMS kuyruğunda ${toplam.kuyruk_en_eski_dakika} dakikadır bekleyen mesaj var.`);
  }
  if (toplam.kuyruk_basarisiz > 0) {
    sorunlar.push(`${toplam.kuyruk_basarisiz} mesaj kalıcı olarak gönderilemedi.`);
  }
  if (!toplam.son_yedek) {
    sorunlar.push('Henüz başarılı bir yedek alınmamış.');
  } else if (toplam.son_yedek.yas_saat > THRESHOLDS.backupMaxAgeHours) {
    sorunlar.push(`Son yedek ${toplam.son_yedek.yas_saat} saat önce alınmış.`);
  }
  if (!isProviderConfigured()) {
    sorunlar.push('SMS sağlayıcısı yapılandırılmamış.');
  }

  /*
    Fatura veritabanı ayrı bir sunucudaysa (docs/IKI-SUNUCU.md) ana
    veritabanı ayakta olsa bile fatura ekranı çalışmıyor olabilir:
    ağ kopması ya da orada duran PostgREST yeter. İzleme bunu ana
    veritabanıyla aynı anda görmeli, yoksa arıza ancak fatura kesilmeye
    çalışıldığında ortaya çıkar.
  */
  if (faturaBolmesiVar()) {
    try {
      // PostgREST kökü şema özetini döndürüyor; jeton gerekmiyor,
      // yalnızca ulaşılabilirlik sınanıyor.
      const yanit = await fetch(`${faturaAdresi()}/`, {
        signal: AbortSignal.timeout(5_000),
      });
      if (!yanit.ok) {
        sorunlar.push(`Fatura veritabanı yanıt vermiyor (HTTP ${yanit.status}).`);
      }
    } catch {
      sorunlar.push('Fatura veritabanına ulaşılamıyor.');
    }
  }

  const healthy = sorunlar.length === 0;
  // Sorun metinleri hangi alt sistemin bozuk olduğunu (yedek yok, SMS
  // gönderilemiyor, kuyruk tıkalı) açık eder; yetkisiz çağrıya yalnızca
  // ayakta/değil bilgisi verilir.
  return json(
    {
      status: healthy ? 'saglikli' : 'uyari',
      ...(detailed ? { sorunlar, ozet: toplam, fatura_ayri: faturaBolmesiVar() } : {}),
      zaman: new Date().toISOString(),
    },
    healthy ? 200 : 503,
  );
}
