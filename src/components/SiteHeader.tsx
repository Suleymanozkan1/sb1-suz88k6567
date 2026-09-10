import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * Herkese açık üstlük.
 *
 * Sistem bir tanıtım sitesi değil, işletmenin kendi paneli; bu yüzden
 * gezinme menüsü yok. Üstlükte yalnızca marka ve oturum açmış kullanıcı
 * için panele dönüş bağlantısı bulunur.
 */
export default function SiteHeader() {
  const { user } = useAuth();

  return (
    <header className="bg-brand">
      <div className="container-dt flex h-20 items-center justify-between">
        <Link to="/" className="font-display text-2xl font-bold text-white hover:text-white">
          Sahra<span className="text-accent-light">Takip</span>
        </Link>

        {user ? (
          <Link to="/panel" className="btn-primary btn-sm !px-5 !py-2 text-white hover:text-white">
            Panele git
          </Link>
        ) : null}
      </div>
    </header>
  );
}
