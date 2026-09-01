/**
 * Veri kancaları.
 *
 * Depo çağrılarını TanStack Query ile sarar: yükleniyor/hata durumları,
 * önbellek ve yazma sonrası otomatik tazeleme tek yerden yönetilir.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { repo } from './repo';
import { sendSms } from './sms';
import type { StaffInput } from './repo';
import { useAuth } from '../context/AuthContext';
import { makeBalanceLookup } from './money';
import type {
  Business, CashFlowEntry, ColorSetting, ContactMessage, Payment, Reservation,
} from '../types';

export const keys = {
  businesses: (ownerId: string) => ['businesses', ownerId] as const,
  staff: (ownerId: string) => ['staff', ownerId] as const,
  reservations: (businessId: string) => ['reservations', businessId] as const,
  reservation: (id: string) => ['reservation', id] as const,
  payments: (businessId: string) => ['payments', businessId] as const,
  cashFlow: (businessId: string) => ['cashFlow', businessId] as const,
  colors: (businessId: string) => ['colors', businessId] as const,
  sms: (businessId: string) => ['sms', businessId] as const,
  audit: (ownerId: string) => ['audit', ownerId] as const,
};

/** Oturumdaki kullanıcının aktif işletmesi */
export function useActiveBusinessId(): string {
  return useAuth().user?.activeBusinessId ?? '';
}

export function useBusinesses() {
  const { ownerId } = useAuth();
  return useQuery({
    queryKey: keys.businesses(ownerId),
    queryFn: () => repo.listBusinesses(ownerId),
    enabled: Boolean(ownerId),
  });
}

export function useReservations() {
  const businessId = useActiveBusinessId();
  return useQuery({
    queryKey: keys.reservations(businessId),
    queryFn: () => repo.listReservations(businessId),
    enabled: Boolean(businessId),
  });
}

export function useReservation(id: string | undefined) {
  return useQuery({
    queryKey: keys.reservation(id ?? ''),
    queryFn: () => repo.getReservation(id!),
    enabled: Boolean(id),
  });
}

export function usePayments() {
  const businessId = useActiveBusinessId();
  return useQuery({
    queryKey: keys.payments(businessId),
    queryFn: () => repo.listPayments(businessId),
    enabled: Boolean(businessId),
  });
}

export function useColorSettings() {
  const businessId = useActiveBusinessId();
  return useQuery({
    queryKey: keys.colors(businessId),
    queryFn: () => repo.getColorSettings(businessId),
    enabled: Boolean(businessId),
  });
}

export function useCashFlow() {
  const businessId = useActiveBusinessId();
  return useQuery({
    queryKey: keys.cashFlow(businessId),
    queryFn: () => repo.listCashFlow(businessId),
    enabled: Boolean(businessId),
  });
}

export function useSmsLog() {
  const businessId = useActiveBusinessId();
  return useQuery({
    queryKey: keys.sms(businessId),
    queryFn: () => repo.listSms(businessId),
    enabled: Boolean(businessId),
  });
}

export function useAuditLog(limit = 200) {
  const { ownerId } = useAuth();
  return useQuery({
    queryKey: keys.audit(ownerId),
    queryFn: () => repo.listAuditLog(limit),
    enabled: Boolean(ownerId),
  });
}

export function useStaff() {
  const { ownerId } = useAuth();
  return useQuery({
    queryKey: keys.staff(ownerId),
    queryFn: () => repo.listStaff(ownerId),
    enabled: Boolean(ownerId),
  });
}

/**
 * Rezervasyon listesi + tahsilatlar birlikte.
 * Bakiye hesabı tek yerde yapılır; ekranlar hazır çözücü alır.
 */
export function useReservationsWithBalances() {
  const reservations = useReservations();
  const payments = usePayments();
  const colors = useColorSettings();

  return {
    reservations: reservations.data ?? [],
    payments: payments.data ?? [],
    colors: colors.data ?? [],
    balance: makeBalanceLookup(payments.data ?? []),
    isLoading: reservations.isLoading || payments.isLoading || colors.isLoading,
    error: reservations.error ?? payments.error ?? colors.error ?? null,
  };
}

/* ------------------------------------------------------------ yazmalar */

function useInvalidate() {
  const qc = useQueryClient();
  const businessId = useActiveBusinessId();
  const { ownerId } = useAuth();
  return () => {
    qc.invalidateQueries({ queryKey: keys.reservations(businessId) });
    qc.invalidateQueries({ queryKey: keys.payments(businessId) });
    qc.invalidateQueries({ queryKey: keys.cashFlow(businessId) });
    qc.invalidateQueries({ queryKey: keys.sms(businessId) });
    qc.invalidateQueries({ queryKey: keys.colors(businessId) });
    qc.invalidateQueries({ queryKey: keys.businesses(ownerId) });
    qc.invalidateQueries({ queryKey: keys.staff(ownerId) });
    qc.invalidateQueries({ queryKey: ['reservation'] });
  };
}

export function useSaveReservation() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (reservation: Reservation) => repo.saveReservation(reservation),
    onSuccess: invalidate,
  });
}

export function useDeleteReservation() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => repo.deleteReservation(id),
    onSuccess: invalidate,
  });
}

export function useAddPayment() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (payment: Payment) => repo.addPayment(payment),
    onSuccess: invalidate,
  });
}

export function useDeletePayment() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => repo.deletePayment(id),
    onSuccess: invalidate,
  });
}

export function useAddCashFlow() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (entry: CashFlowEntry) => repo.addCashFlow(entry),
    onSuccess: invalidate,
  });
}

export function useDeleteCashFlow() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => repo.deleteCashFlow(id),
    onSuccess: invalidate,
  });
}

export function useSaveColorSettings() {
  const invalidate = useInvalidate();
  const businessId = useActiveBusinessId();
  return useMutation({
    mutationFn: (settings: ColorSetting[]) => repo.saveColorSettings(businessId, settings),
    onSuccess: invalidate,
  });
}

export function useSaveBusiness() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (business: Omit<Business, 'createdAt'> & { createdAt?: string }) =>
      repo.saveBusiness(business),
    onSuccess: invalidate,
  });
}

export function useDeleteBusiness() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => repo.deleteBusiness(id),
    onSuccess: invalidate,
  });
}

export function useSaveStaff() {
  const invalidate = useInvalidate();
  const { ownerId } = useAuth();
  return useMutation({
    mutationFn: (input: StaffInput) => repo.saveStaff(ownerId, input),
    onSuccess: invalidate,
  });
}

export function useDeleteStaff() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => repo.deleteStaff(id),
    onSuccess: invalidate,
  });
}

/**
 * Müşteriye SMS gönderir ve kaydı işler.
 *
 * Gönderim sunucu tarafındaki /api/sms üzerinden yapılır. Sağlayıcı tanımlı
 * değilse mesaj yine kayıt altına alınır, ancak "gönderilemedi" bilgisi
 * çağırana döner — kullanıcıya yanlış bilgi verilmez.
 */
export function useSendSms() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (entry: Parameters<typeof repo.logSms>[0]) => {
      const result = await sendSms(entry.to, entry.body);
      await repo.logSms(entry);
      return result;
    },
    onSuccess: invalidate,
  });
}

export function useAddMessage() {
  return useMutation({
    mutationFn: (message: Omit<ContactMessage, 'id' | 'createdAt'>) => repo.addMessage(message),
  });
}
