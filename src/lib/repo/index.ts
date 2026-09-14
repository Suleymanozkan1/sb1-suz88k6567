/**
 * Etkin veri kaynağını seçer.
 *
 * `VITE_SUNUCU_MODU=1` ise gerçek veritabanı, aksi hâlde tarayıcı belleği
 * (tanıtım kipi) kullanılıyor. Eskiden karar Supabase adresinin tanımlı
 * olup olmamasına bakıyordu; Supabase kaldırıldıktan sonra o değişkenler
 * hiç okunmuyor ve açıklama yanıltıcı kalmıştı.
 */
import { isSupabaseConfigured, supabaseRepo } from './supabase';
import { localRepo } from './local';
import type { Repository } from './types';

export const repo: Repository = isSupabaseConfigured ? supabaseRepo : localRepo;

/** Demo modunda mıyız? Arayüzde uyarı göstermek için kullanılır. */
export const isDemoMode = !isSupabaseConfigured;

export { RepoError } from './types';
export type { PublicReservation, Repository, StaffInput } from './types';
