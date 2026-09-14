import { useState } from 'react';
import { IconEye, IconEyeOff } from './Icons';
import { useTutarGorunur } from '../lib/tutarGizleme';

/**
 * Perdelenmiş para tutarı.
 *
 * Varsayılan olarak yıldızlı duruyor; imleç üstüne gelince (ya da klavyeyle
 * odaklanınca) o tutar açılıyor. Üstteki düğmeyle hepsi sürekli açık
 * bırakılabiliyor -- `useTutarGorunur` o seçimi taşıyor.
 *
 * YILDIZ SAYISI TUTARIN UZUNLUĞUNDAN geliyor. Sabit sayıda yıldız
 * konsaydı açılıp kapandıkça satır genişliği değişir, tablo zıplardı.
 * Uzunluk zaten tutarın büyüklüğünü kabaca ele veriyor; perde tam
 * gizlilik değil, "yanından geçen okumasın" düzeyinde.
 *
 * KLAVYE İLE DE AÇILIYOR. Yalnızca `:hover` ile yapılsaydı klavye
 * kullanan ve dokunmatik ekrandaki kullanıcı tutarı hiç göremezdi;
 * odaklanma da açıyor ve düğme herkes için çalışıyor.
 *
 * DÜĞME RAKAMIN YANINDA (`dugme`). Perdeyi kaldıran tek düğme sayfanın
 * en üstündeydi; perdelenen rakama bakan kullanıcı onu görmüyor, yıldızın
 * yanında bir açma yolu arıyordu. Düğme artık rakamın yanına da
 * konulabiliyor ve aynı genel tercihi çeviriyor: birinden açılınca
 * ekrandaki bütün tutarlar birlikte açılıyor, kapatılana kadar da açık
 * kalıyor.
 *
 * SAYI DA PERDELENEBİLİYOR, yalnızca para değil: "bu ay kaç düğün
 * sattık" rakamı da omzun üstünden okunmaması gereken bir bilgi. Bileşen
 * biçimlenmiş bir metin alıyor, içeriğin para olup olmadığını bilmiyor.
 */
export default function GizliTutar({
  deger, className = '', dugme = false,
}: {
  /** Biçimlenmiş değer: "125.000,00 ₺" ya da "17". */
  deger: string;
  className?: string;
  /** Rakamın yanına "sürekli aç / gizle" düğmesi koyar. */
  dugme?: boolean;
}) {
  const [surekli, setSurekli] = useTutarGorunur();
  const [uzerinde, setUzerinde] = useState(false);
  const gorunur = surekli || uzerinde;

  /*
    Düğme perdelenen metnin DIŞINDA duruyor. İçine konsaydı düğme içinde
    düğme olurdu: hem erişilebilirlik denetimi buna takılıyor hem de
    klavyeyle gezen kullanıcı iki ayrı durağı ayırt edemiyordu.
  */
  const anahtar = dugme ? (
    <button
      type="button"
      className="ml-1.5 inline-flex translate-y-[2px] text-brand-muted transition hover:text-brand"
      aria-pressed={surekli}
      aria-label={surekli ? 'Tutarları gizle' : 'Tutarları sürekli göster'}
      title={surekli ? 'Tutarları gizle' : 'Tutarları sürekli göster'}
      onClick={() => setSurekli(!surekli)}
    >
      {surekli ? <IconEyeOff size={16} /> : <IconEye size={16} />}
    </button>
  ) : null;

  if (surekli) return <>
    <span className={className}>{deger}</span>
    {anahtar}
  </>;

  return (<>
    <span
      className={`cursor-default rounded ${className}`}
      tabIndex={0}
      role="button"
      aria-label={gorunur ? deger : `Gizli tutar: ${deger}`}
      onMouseEnter={() => setUzerinde(true)}
      onMouseLeave={() => setUzerinde(false)}
      onFocus={() => setUzerinde(true)}
      onBlur={() => setUzerinde(false)}
    >
      {gorunur ? deger : (
        /*
          Yıldızlar ekran okuyucudan gizleniyor: `aria-label` zaten tutarı
          söylüyor, yıldızların ayrıca okunması gürültü olurdu.
        */
        <span aria-hidden="true" className="tracking-widest">
          {'•'.repeat(Math.min(Math.max(deger.replace(/\D/g, '').length, 3), 10))}
        </span>
      )}
    </span>
    {anahtar}
  </>);
}
