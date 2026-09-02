/**
 * Etkin veri kaynağını seçer.
 *
 * VITE_SUPABASE_URL ve VITE_SUPABASE_ANON_KEY tanımlıysa gerçek veritabanı,
 * aksi hâlde tarayıcı belleği (demo modu) kullanılır.
 */
import { isSupabaseConfigured, supabaseRepo } from './supabase';
import { localRepo } from './local';
import type { Repository } from './types';

export const repo: Repository = isSupabaseConfigured ? supabaseRepo : localRepo;

/** Demo modunda mıyız? Arayüzde uyarı göstermek için kullanılır. */
export const isDemoMode = !isSupabaseConfigured;

export { RepoError } from './types';
export type { PublicReservation, Repository, SignUpInput, StaffInput } from './types';
