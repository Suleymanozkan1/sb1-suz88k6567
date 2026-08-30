import { useCallback, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { getBusiness, getColorSettings, getReservations } from '../lib/db';

/**
 * Aktif işletmenin rezervasyon ve renk verilerini döndürür.
 *
 * Depo (localStorage) React state'i olmadığından memoize edilmez; kayıtlar her
 * render'da yeniden okunur. `reload` yalnızca yazma sonrası yeni bir render
 * tetiklemek için vardır. Veri kümesi işletme başına birkaç yüz kaydı geçmediği
 * için bu yaklaşım hem daha basit hem de bayat önbellek riskini ortadan kaldırır.
 */
export function useBusinessData() {
  const { user } = useAuth();
  const [version, setVersion] = useState(0);
  const businessId = user?.activeBusinessId ?? '';

  const reload = useCallback(() => setVersion((v) => v + 1), []);

  const business = businessId ? getBusiness(businessId) : undefined;
  const reservations = businessId ? getReservations(businessId) : [];
  const colors = businessId ? getColorSettings(businessId) : [];

  return { businessId, business, reservations, colors, reload, version };
}
