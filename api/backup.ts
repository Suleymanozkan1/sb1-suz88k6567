/**
 * Günlük yedekleme (Vercel Cron).
 *
 * Supabase'in kendi otomatik yedeği vardır; bu iş onun YERİNE değil YANINA
 * çalışır. Amaç, tek bir sağlayıcıya bağlı kalmamaktır: hesaba erişimin
 * kaybı ya da yanlışlıkla silme durumunda elinizde bağımsız bir JSON
 * anlık görüntüsü bulunur.
 *
 * Yedek `yedekler` adlı Storage kovasına yazılır. Kovanın önceden
 * oluşturulmuş ve GİZLİ (public olmayan) olması gerekir.
 */
import { callRpc, insertRow, isAuthorizedCron, isDbConfigured, patchRows, selectRows, uploadToStorage } from './_db';
import { json } from './_guard';

const BUCKET = process.env.BACKUP_BUCKET ?? 'yedekler';
interface OwnerRow { id: string }
interface BackupRun { id: string }

export default async function handler(request: Request): Promise<Response> {
  if (!isAuthorizedCron(request)) return json({ error: 'Yetkisiz.' }, 401);
  if (!isDbConfigured()) return json({ error: 'Veritabanı yapılandırması eksik.' }, 500);

  // Yalnızca yönetici hesapları (personelin ayrı yedeği olmaz)
  let owners: OwnerRow[];
  try {
    owners = await selectRows<OwnerRow>('profiles?role=eq.owner&select=id');
  } catch (error) {
    return json({ error: 'Hesaplar okunamadı.', detail: String(error) }, 502);
  }

  const results: { ownerId: string; ok: boolean; error?: string }[] = [];

  for (const owner of owners) {
    let run: BackupRun | null = null;
    try {
      run = await insertRow<BackupRun>('backup_runs', { owner_id: owner.id, status: 'calisiyor' });

      const data = await callRpc<unknown>('export_owner_data', { p_owner_id: owner.id });
      const counts = await callRpc<unknown>('backup_row_counts', { p_owner_id: owner.id });
      const content = JSON.stringify(data);

      const stamp = new Date().toISOString().slice(0, 10);
      const path = `${owner.id}/${stamp}.json`;
      await uploadToStorage(BUCKET, path, content);

      await patchRows(`backup_runs?id=eq.${run.id}`, {
        status: 'basarili',
        finished_at: new Date().toISOString(),
        row_counts: counts,
        size_bytes: new TextEncoder().encode(content).length,
        storage_path: `${BUCKET}/${path}`,
      });
      results.push({ ownerId: owner.id, ok: true });
    } catch (error) {
      const message = String(error).slice(0, 300);
      if (run) {
        await patchRows(`backup_runs?id=eq.${run.id}`, {
          status: 'basarisiz', finished_at: new Date().toISOString(), error: message,
        }).catch(() => undefined);
      }
      results.push({ ownerId: owner.id, ok: false, error: message });
    }
  }

  const failed = results.filter((r) => !r.ok).length;
  // Başarısız yedek izleme tarafından fark edilebilsin diye hata durumu döndürülür
  return json({ total: results.length, failed, results }, failed > 0 ? 500 : 200);
}
