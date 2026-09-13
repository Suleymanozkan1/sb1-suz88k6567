/**
 * GİB fatura belgesi önizleme (tanı uç noktası).
 *
 * Doğrudan entegrasyon iki ön koşul istiyor (GİB onayı, mali mühür) ve
 * ikisi de aylar sürebiliyor. Bu uç nokta o süreci BEKLEMEDEN belgenin
 * doğruluğunu sınamayı sağlıyor: gerçek bir faturanın imzalanmamış
 * UBL-TR 1.2 çıktısını döndürüyor.
 *
 * Çıktı doğrudan GİB'in kendi şema/şematron doğrulayıcısına verilebilir.
 * Belge yanlışsa bunu onay sürecinden SONRA öğrenmek, en pahalı
 * öğrenme biçimi olurdu.
 *
 * İMZA YOK. Buradan dönen belge gönderilemez; yalnızca incelenir.
 */
import { isAuthorizedCron, isDbConfigured, selectRows } from './_db.js';
import { json } from './_guard.js';
import { saticiAyari, ublOnizle, type InvoiceRow, type LineRow } from './_gib.js';

export default async function handler(request: Request): Promise<Response> {
  // Fatura müşteri adı ve adresi taşıyor; uç nokta herkese açık olamaz.
  if (!isAuthorizedCron(request)) return json({ error: 'Yetkisiz.' }, 401);
  if (!isDbConfigured()) return json({ error: 'Veritabanı yapılandırması eksik.' }, 500);

  const satici = saticiAyari();
  if (!satici) {
    return json({
      error: 'GIB_VKN ve GIB_UNVAN tanımlı değil.',
      ipucu: 'Önizleme için mali mühür GEREKMEZ; yalnızca satıcı bilgileri yeterli.',
    }, 400);
  }

  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) return json({ error: 'id parametresi gerekli (fatura kimliği).' }, 400);

  let faturalar: InvoiceRow[];
  try {
    faturalar = await selectRows<InvoiceRow>(`invoices?id=eq.${encodeURIComponent(id)}&select=*`);
  } catch (error) {
    return json({ error: 'Fatura okunamadı.', detail: String(error) }, 502);
  }
  const fatura = faturalar[0];
  if (!fatura) return json({ error: 'Fatura bulunamadı.' }, 404);

  let satirlar: LineRow[];
  try {
    satirlar = await selectRows<LineRow>(
      `invoice_lines?invoice_id=eq.${encodeURIComponent(id)}&select=*`,
    );
  } catch (error) {
    return json({ error: 'Fatura satırları okunamadı.', detail: String(error) }, 502);
  }
  if (satirlar.length === 0) return json({ error: 'Faturada satır bulunmuyor.' }, 400);

  /*
    Alıcının e-Fatura mükellefi olup olmadığı GİB'in mükellef
    listesinden sorulur; onay öncesinde o servise erişim yok. Önizlemede
    parametreyle veriliyor ki iki senaryo da görülebilsin.
  */
  const mukellef = url.searchParams.get('mukellef') === '1';

  try {
    const xml = ublOnizle(fatura, satirlar, mukellef);
    return new Response(xml, {
      status: 200,
      headers: {
        'content-type': 'application/xml; charset=utf-8',
        // Tarayıcıda açılmasın, dosya olarak insin: doğrulayıcıya verilecek.
        'content-disposition': `attachment; filename="${fatura.invoice_number}.xml"`,
        'cache-control': 'no-store',
      },
    });
  } catch (error) {
    return json({ error: 'Belge üretilemedi.', detail: String(error) }, 500);
  }
}
