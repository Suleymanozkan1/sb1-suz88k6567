-- ============================================================
-- 0000 - Kendi sunucusunda çalıştırma: kimlik katmanı (Supabase'siz)
--
-- Bugüne kadar `auth` şemasını Supabase hazır veriyordu; testlerde ise
-- `supabase/tests/00_supabase_stub.sql` taklit ediyordu. Sistem kendi
-- sunucusunda çalışacağı için o taklit artık ÜRÜNÜN KENDİSİ olmalı:
-- test ortamında var olup üretimde olmayan bir şema, ancak canlıda
-- fark edilirdi.
--
-- Bu göç yalnızca kimlik katmanını kurar. 39 RLS politikası, 27
-- tetikleyici, 20 enum ve 41 `security definer` fonksiyon DEĞİŞMEDEN
-- çalışmaya devam eder; hepsi `auth.uid()` üzerinden konuşuyor ve o
-- fonksiyon burada birebir aynı sözleşmeyle yeniden kuruluyor.
--
-- Dosya EN BAŞTA çalışır (0000): `0001_init.sql` içindeki
-- `profiles.id references auth.users (id)` satırı bu şema olmadan
-- uygulanamıyor. Tablo yetkileri ise tablolar açıldıktan SONRA
-- verilebildiği için ayrı bir dosyada, en sonda duruyor (0021).
--
-- Göç yeniden çalıştırılabilir ve Supabase üzerinde çalıştırılırsa
-- hazır gelen yapıyı EZMEZ: her adım varlık kontrolünden geçiyor.
-- ============================================================

-- ------------------------------------------------------------ roller
-- PostgREST isteği "authenticator" rolüyle karşılar, sonra jetondaki
-- role geçer. Roller yoksa mevcut göçlerdeki grant satırları düşer.
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;

-- ------------------------------------------------------------ auth şeması
create schema if not exists auth;

/*
  Kimlik tablosu. Supabase'de hazır gelir; kendi sunucumuzda bizim.
  `public.profiles.id` buraya bağlı ve silme basamaklı, o yüzden
  sütun adları ve tipleri korunuyor.

  Şifre BURADA durur ve yalnızca sunucu görür: tarayıcıya açılan
  PostgREST bağlantısının `auth` şemasında hiçbir yetkisi yok.
*/
create table if not exists auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now()
);

-- Kendi sunucusu için gereken alanlar. Supabase'de `encrypted_password`
-- zaten var; oradaki yapıyı bozmamak için tek tek ekleniyor.
do $$
begin
  alter table auth.users add column if not exists encrypted_password text;
  alter table auth.users add column if not exists last_sign_in_at timestamptz;
  alter table auth.users add column if not exists recovery_token text;
  alter table auth.users add column if not exists recovery_sent_at timestamptz;
exception when insufficient_privilege then
  -- Supabase üzerinde auth.users'a dokunulamaz; orada bu alanlar zaten
  -- gerekmiyor çünkü kimlik doğrulamayı Supabase yapıyor.
  raise notice 'auth.users genisletilemedi (yonetilen ortam); atlandi';
end $$;

-- Şifre sıfırlama jetonu tek seferlik; aynı jetonla iki kez şifre
-- değiştirilememeli.
create unique index if not exists users_recovery_token_unique
  on auth.users (recovery_token) where recovery_token is not null;

/*
  Oturumlar.

  Erişim jetonu kısa ömürlü ve imzalı; iptal edilemez, süresi dolunca
  geçersizleşir. Yenileme jetonu ise BURADA duruyor ve iptal edilebilir:
  "çıkış yap" gerçekten çıkış olmalı, jetonun kendiliğinden ölmesini
  beklemek değil.

  Jetonun kendisi değil, karması saklanıyor. Veritabanı yedeği birinin
  eline geçerse, içindeki satırlarla oturum açılamaz.
*/
create table if not exists auth.sessions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  token_hash    text not null unique,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null,
  last_used_at  timestamptz,
  user_agent    text not null default ''
);

create index if not exists sessions_user_idx on auth.sessions (user_id);
create index if not exists sessions_expires_idx on auth.sessions (expires_at);

/*
  Oturumdaki kullanıcının kimliği.

  PostgREST jetondaki talepleri iki biçimde yayımlıyor: eski sürümler
  `request.jwt.claim.sub`, yeni sürümler `request.jwt.claims` altında
  JSON olarak. İkisi de okunuyor -- yalnızca birine güvenmek, PostgREST
  sürümü yükseltildiğinde bütün RLS politikalarını sessizce "kullanıcı
  yok" durumuna düşürürdü: hiçbir sorgu hata vermez, sadece her yerde
  boş liste döner.
*/
create or replace function auth.uid() returns uuid
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::json ->> 'sub'
  )::uuid;
$$;

comment on function auth.uid() is
  'Oturumdaki kullanıcının kimliği. RLS politikalarının tamamı buna dayanır.';

-- ------------------------------------------------------------ yetkiler
-- Tarayıcıya açılan roller `auth` şemasını GÖRMEMELİ: şifre hash''i ve
-- sıfırlama jetonu orada duruyor.
revoke all on schema auth from anon, authenticated;
revoke all on all tables in schema auth from anon, authenticated;

grant usage on schema public to anon, authenticated, service_role;

-- auth.uid() her RLS politikasında çağrılıyor; çağırma yetkisi şemayı
-- görme yetkisi değildir.
grant execute on function auth.uid() to anon, authenticated, service_role;

/*
  PostgREST'in bağlanacağı rol. Kendisi hiçbir veriye erişemez;
  yalnızca jetondaki role geçebilir. Şifresi kurulum sırasında
  `alter role authenticator with password ...` ile verilir --
  göç dosyasına şifre yazılmaz, depoya girerdi.
*/
do $$ begin
  create role authenticator noinherit login;
exception when duplicate_object then null; end $$;

grant anon, authenticated, service_role to authenticator;
