import { useAuth } from '../context/AuthContext';
import Alert from './Alert';

/**
 * Veritabanı bağlı değilken gösterilir. Kullanıcının verilerinin kalıcı
 * olmadığını bilmesi güvenlik açısından kritiktir.
 */
export default function DemoNotice({ className = '' }: { className?: string }) {
  const { isDemoMode } = useAuth();
  if (!isDemoMode) return null;

  return (
    <Alert kind="warning" className={className}>
      <strong>Demo modu.</strong> Veritabanı bağlı değil; kayıtlarınız yalnızca bu tarayıcıda
      saklanır ve başka bir cihazdan görünmez. Gerçek kullanım için Supabase bağlantısını
      yapılandırın.
    </Alert>
  );
}
