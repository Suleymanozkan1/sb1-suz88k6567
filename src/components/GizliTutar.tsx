import { useState } from 'react';
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
 */
export default function GizliTutar({
  deger, className = '',
}: {
  /** Biçimlenmiş tutar: "125.000,00 ₺". */
  deger: string;
  className?: string;
}) {
  const [surekli] = useTutarGorunur();
  const [uzerinde, setUzerinde] = useState(false);
  const gorunur = surekli || uzerinde;

  if (surekli) return <span className={className}>{deger}</span>;

  return (
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
  );
}
