-- Yalnızca yerel doğrulama içindir. Supabase'de auth şeması hazır gelir.
create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb default '{}'::jsonb
);

-- Supabase'de auth.uid() JWT'den gelir; testte oturum değişkeninden okunur.
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create role anon;
create role authenticated;
