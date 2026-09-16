/**
 * Göçleri sırayla uygular.
 *
 * NEDEN BETİK. Belgede bir `for` döngüsü vardı ve iki sorunu vardı:
 * `psql` her makinede kurulu değil (Windows'ta çoğunlukla değil) ve
 * döngü hangi göçün uygulandığını, nerede durduğunu söylemiyordu. Bu
 * betik depodaki `pg` bağımlılığını kullanıyor; Node çalışan her yerde
 * çalışıyor ve ne yaptığını satır satır yazıyor.
 *
 * HER DOSYA TEK PARÇA gönderiliyor. PostgreSQL çok ifadeli bir sorguyu
 * kendiliğinden tek bir işleme alıyor, yani yarısı uygulanmış bir göç
 * kalmıyor. Kendi `begin`/`commit` yazan göçler (0009) kendi işlemini
 * yönetmeye devam ediyor.
 *
 * İLK HATADA DURUYOR. Kalan göçleri de koşturmak yarım bir şema
 * bırakırdı ve asıl hata ekranda yukarıda kaybolurdu.
 *
 * TEKRAR ÇALIŞTIRILABİLİR. Göçler `if not exists` / `create or replace`
 * ile yazıldı; uygulanmış bir veritabanında yeniden koşturmak zarar
 * vermiyor. Yine de büyük bir güncellemeden önce yedek alın.
 *
 * Kullanım:
 *   DATABASE_URL='postgres://...' npm run goc
 *   DATABASE_URL='postgres://...' npm run goc -- --ws
 *
 * `--ws`: bağlantıyı 5432 yerine WEBSOCKET (443) üzerinden kurar.
 * Kurumsal ağların ve bazı bulut ortamlarının çoğu 5432'yi kapatıyor;
 * o durumda normal sürücü sessizce zaman aşımına düşüyor. Neon aynı
 * Postgres protokolünü 443'ten de konuşuyor ve sürücü (`Client`) `pg`
 * ile aynı arayüzü sunduğu için betiğin geri kalanı değişmiyor.
 * Yalnızca Neon'da çalışır.
 *
 * DATABASE_URL veritabanının kullanıcı adını ve parolasını taşıyor;
 * komut geçmişine düşmesini istemiyorsanız `.env.local` dosyasına
 * koyup kabuktan okutun.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { istemciAc as baglantiAc, type Baglanti } from './_baglanti.js';

const KOK = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIZIN = join(KOK, 'supabase', 'migrations');

/** Kurulumun tamamlandığını gösteren asgari işaretler. */
const BEKLENEN_ROLLER = ['anon', 'authenticated', 'service_role'];

/** `--ws` verildi mi? */
const websocket = process.argv.includes('--ws');

function adres(): string {
  const deger = process.env.DATABASE_URL?.trim();
  if (!deger) {
    console.error(
      'DATABASE_URL tanımlı değil.\n'
      + "  Kullanım: DATABASE_URL='postgres://...' npm run goc",
    );
    process.exit(1);
  }
  return deger;
}

/** Bağlantı ortak modülden; TLS ve WebSocket kararı orada. */
async function istemciAc(url: string): Promise<Baglanti> {
  return baglantiAc(url, websocket);
}

/**
 * Adreste parola var; ekrana basılan her şeyden temizleniyor.
 * Hata mesajları bağlantı adresini olduğu gibi yazabiliyor.
 *
 * Parola kısmı AÇGÖZLÜ eşleşiyor (son `@` işaretine kadar). Kaçırılmamış
 * bir `@` taşıyan parolada tembel eşleşme kalanını ekrana bırakırdı;
 * fazladan maskelemek yalnızca okunurluğu bozuyor, eksik maskelemek
 * parolayı sızdırıyor.
 */
function gizle(metin: string): string {
  return metin.replace(/(postgres(?:ql)?:\/\/[^:/@\s]+:)[^\s]*@/gi, '$1****@');
}

async function main(): Promise<void> {
  const url = adres();
  const dosyalar = readdirSync(DIZIN).filter((d) => d.endsWith('.sql')).sort();
  if (dosyalar.length === 0) {
    console.error(`Göç bulunamadı: ${DIZIN}`);
    process.exit(1);
  }

  let istemci: Awaited<ReturnType<typeof istemciAc>>;
  try {
    istemci = await istemciAc(url);
  } catch (e) {
    console.error(`Bağlanılamadı: ${gizle(String(e))}`);
    if (!websocket) {
      console.error(
        '\nBağlantı zaman aşımına düştüyse ağınız 5432 portunu kapatıyor'
        + ' olabilir. Neon kullanıyorsanız aynı komutu `-- --ws` ekleyerek'
        + ' deneyin; bağlantı 443 üzerinden kurulur:\n'
        + "  DATABASE_URL='...' npm run goc -- --ws",
      );
    }
    process.exit(1);
  }

  const { rows: bilgi } = await istemci.query<{ ad: string; surum: string }>(
    'select current_database() as ad, version() as surum',
  );
  console.log(`Veritabanı: ${bilgi[0]!.ad}`);
  console.log(`Sürüm     : ${bilgi[0]!.surum.split(' ').slice(0, 2).join(' ')}`);
  console.log(`Göç sayısı: ${dosyalar.length}\n`);

  for (const [sira, dosya] of dosyalar.entries()) {
    const numara = String(sira + 1).padStart(2, ' ');
    process.stdout.write(`[${numara}/${dosyalar.length}] ${dosya} ... `);
    try {
      await istemci.query(readFileSync(join(DIZIN, dosya), 'utf8'));
      console.log('tamam');
    } catch (e) {
      const hata = e as { message?: string; position?: string; hint?: string };
      console.log('HATA');
      console.error(`\n${dosya} uygulanamadı:\n  ${gizle(hata.message ?? String(e))}`);
      if (hata.hint) console.error(`  İpucu: ${hata.hint}`);
      console.error(
        '\nBu göçten sonrakiler UYGULANMADI. Hatayı giderip betiği yeniden'
        + ' çalıştırın; uygulanmış göçler zarar vermeden tekrar geçiyor.',
      );
      await istemci.end();
      process.exit(1);
    }
  }

  /*
    Göçler "tamam" dedi diye kurulum bitmiş sayılmıyor. Asıl risk
    rollerde: barındırılan bir veritabanında rol açma yetkisi kısıtlı
    olabiliyor ve roller açılmazsa site açılır ama HİÇBİR sorgu satır
    döndürmez -- RLS politikalarının tamamı bu rollere yazılı.
  */
  const { rows: roller } = await istemci.query<{ rolname: string }>(
    'select rolname from pg_roles where rolname = any($1)', [BEKLENEN_ROLLER],
  );
  const eksik = BEKLENEN_ROLLER.filter((r) => !roller.some((k) => k.rolname === r));

  const { rows: sayim } = await istemci.query<{ tablolar: string; fonksiyonlar: string }>(
    "select (select count(*) from information_schema.tables"
    + " where table_schema = 'public' and table_type = 'BASE TABLE') as tablolar,"
    + ' (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace'
    + " where n.nspname = 'public') as fonksiyonlar",
  );

  await istemci.end();

  console.log(`\nTablo     : ${sayim[0]!.tablolar}`);
  console.log(`Fonksiyon : ${sayim[0]!.fonksiyonlar}`);

  if (eksik.length > 0) {
    console.error(
      `\nEKSİK ROL: ${eksik.join(', ')}\n`
      + 'Göçler bu rolleri kendisi açıyor; açılmadıysa veritabanı kullanıcınızın'
      + ' rol açma yetkisi yok demektir. Bu hâlde panel açılır ama hiçbir ekran'
      + ' veri gösteremez. Sağlayıcınızın panelinden yetkiyi verip betiği'
      + ' yeniden çalıştırın.',
    );
    process.exit(1);
  }

  console.log(`Roller    : ${BEKLENEN_ROLLER.join(', ')} — hepsi var`);
  console.log('\nŞema hazır. Sıradaki adım: ilk kullanıcı (docs/VERCEL.md bölüm 6).');
}

main().catch((e: unknown) => {
  console.error(gizle(String(e)));
  process.exit(1);
});
