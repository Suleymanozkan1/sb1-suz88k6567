import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { KEYS, read, write } from '../lib/storage';
import Alert from './Alert';
import { IconClose } from './Icons';

/**
 * Veritabanı bağlı değilken gösterilir. Kullanıcının verilerinin kalıcı
 * olmadığını bilmesi güvenlik açısından kritiktir.
 *
 * Band kapatılabilir ve kapatma bu tarayıcıda hatırlanır: tanıtım sırasında
 * ekranın üstünde durmasın diye. Uyarının kendisi kaldırılmadı; yapılandırma
 * hatası yüzünden demo moduna düşen bir kurulumda kullanıcı verisinin
 * tarayıcıda kaldığını en az bir kez görmelidir.
 *
 * Kapatma bilgisi diğer kayıtlarla aynı ön eki taşır; Ayarlar ekranındaki
 * "Verileri sıfırla" bunu da temizler ve uyarı yeniden görünür. Sıfırlanmış
 * bir kurulum uyarıyı yeniden hak eder.
 */
export default function DemoNotice({ className = '' }: { className?: string }) {
  const { isDemoMode } = useAuth();
  const [gizli, setGizli] = useState(() => read<boolean>(KEYS.demoNotice, false));

  if (!isDemoMode || gizli) return null;

  function gizle() {
    write(KEYS.demoNotice, true);
    setGizli(true);
  }

  return (
    <Alert kind="warning" className={className}>
      <div className="flex items-start gap-3">
        <p className="flex-1">
          <strong>Demo modu.</strong> Veritabanı bağlı değil; kayıtlarınız yalnızca bu tarayıcıda
          saklanır ve başka bir cihazdan görünmez. Gerçek kullanım için sunucu
          bağlantısını yapılandırın.
        </p>
        <button
          type="button"
          onClick={gizle}
          aria-label="Demo modu uyarısını gizle"
          className="-mr-1 -mt-1 shrink-0 rounded p-1 hover:bg-warning/10"
        >
          <IconClose size={16} />
        </button>
      </div>
    </Alert>
  );
}
