-- ============================================================
-- 0022 - Oturum fonksiyonları
--
-- `auth` şeması PostgREST'e kapalı ve öyle kalmalı: şifre karması ve
-- oturum jetonları orada duruyor. Sunucunun oraya erişmesi gereken
-- dar yollar burada, `security definer` fonksiyonlar olarak tanımlı
-- ve YALNIZCA service_role'a açık.
--
-- Şifre karşılaştırması burada YAPILMAZ; karma sunucuya verilir ve
-- doğrulama orada scrypt ile yapılır. Şifreyi veritabanına göndermek,
-- onu sorgu günlüklerine düşme riskine atardı.
-- ============================================================

-- ------------------------------------------------------ kimlik arama
create or replace function public.kimlik_bul(p_email text)
returns table (id uuid, encrypted_password text)
language sql security definer set search_path = public, auth, pg_temp as $$
  select u.id, u.encrypted_password
  from auth.users u
  where lower(u.email) = lower(btrim(p_email))
  limit 1;
$$;

revoke all on function public.kimlik_bul(text) from public, anon, authenticated;
grant execute on function public.kimlik_bul(text) to service_role;

-- ------------------------------------------------------ oturum açma
create or replace function public.oturum_ac(
  p_user_id uuid, p_token_hash text, p_expires timestamptz, p_agent text default ''
) returns uuid
language plpgsql security definer set search_path = public, auth, pg_temp as $$
declare v_id uuid;
begin
  insert into auth.sessions (user_id, token_hash, expires_at, user_agent)
  values (p_user_id, p_token_hash, p_expires, coalesce(p_agent, ''))
  returning id into v_id;

  update auth.users set last_sign_in_at = now() where id = p_user_id;

  -- Süresi dolmuş satırlar birikmesin; oturum tablosu sınırsız büyümemeli.
  delete from auth.sessions where expires_at < now();
  return v_id;
end $$;

revoke all on function public.oturum_ac(uuid, text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.oturum_ac(uuid, text, timestamptz, text) to service_role;

-- ------------------------------------------------------ oturum doğrulama
/*
  Yenileme jetonunu doğrular ve DÖNDÜRÜR-DÖNMEZ tüketir.

  Eski jeton aynı anda geçersizleşiyor (dönüşümlü yenileme): çalınan bir
  yenileme jetonu ikinci kez kullanılamaz, ve meşru kullanıcı bir
  sonraki yenilemede reddedilince hırsızlık fark edilir.
*/
create or replace function public.oturum_yenile(
  p_token_hash text, p_yeni_hash text, p_expires timestamptz
) returns uuid
language plpgsql security definer set search_path = public, auth, pg_temp as $$
declare v_user uuid;
begin
  update auth.sessions
     set token_hash = p_yeni_hash, expires_at = p_expires, last_used_at = now()
   where token_hash = p_token_hash and expires_at > now()
  returning user_id into v_user;

  return v_user;  -- eşleşme yoksa null
end $$;

revoke all on function public.oturum_yenile(text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.oturum_yenile(text, text, timestamptz) to service_role;

-- ------------------------------------------------------ çıkış
create or replace function public.oturum_kapat(p_token_hash text)
returns integer
language plpgsql security definer set search_path = public, auth, pg_temp as $$
declare v_sayi integer;
begin
  delete from auth.sessions where token_hash = p_token_hash;
  get diagnostics v_sayi = row_count;
  return v_sayi;
end $$;

revoke all on function public.oturum_kapat(text) from public, anon, authenticated;
grant execute on function public.oturum_kapat(text) to service_role;

-- ------------------------------------------------------ şifre değiştirme
/*
  Şifre değişince O KULLANICININ BÜTÜN OTURUMLARI kapanır.

  "Şifremi değiştirdim" demek, "başkası giriş yaptıysa artık giremesin"
  demektir. Oturumlar açık bırakılsaydı şifre değiştirmek, hesabı ele
  geçiren birini dışarı atmazdı.
*/
create or replace function public.sifre_degistir(p_user_id uuid, p_hash text)
returns void
language plpgsql security definer set search_path = public, auth, pg_temp as $$
begin
  update auth.users set encrypted_password = p_hash, recovery_token = null
   where id = p_user_id;
  delete from auth.sessions where user_id = p_user_id;
end $$;

revoke all on function public.sifre_degistir(uuid, text) from public, anon, authenticated;
grant execute on function public.sifre_degistir(uuid, text) to service_role;

-- ------------------------------------------------------ kullanıcı açma
/*
  Yeni kullanıcı. `profiles` satırını 0001'deki tetikleyici açıyor,
  bu yüzden burada yalnızca kimlik kaydı oluşturuluyor.
*/
create or replace function public.kullanici_ac(
  p_email text, p_hash text, p_meta jsonb default '{}'::jsonb
) returns uuid
language plpgsql security definer set search_path = public, auth, pg_temp as $$
declare v_id uuid;
begin
  insert into auth.users (email, encrypted_password, raw_user_meta_data)
  values (lower(btrim(p_email)), p_hash, coalesce(p_meta, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end $$;

revoke all on function public.kullanici_ac(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.kullanici_ac(text, text, jsonb) to service_role;
