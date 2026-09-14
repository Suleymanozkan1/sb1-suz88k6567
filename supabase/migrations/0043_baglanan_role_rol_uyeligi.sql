-- =====================================================================
-- Bağlanan role RLS rolleri için üyelik ver
--
-- NEDEN GEREKLİ. Kendi sunucumuzda isteği PostgREST karşılıyor: o
-- `authenticator` rolüyle bağlanıyor ve jetondaki role geçiyor. 0000
-- göcü bu yüzden üyeliği yalnızca `authenticator`'a veriyor.
--
-- Barındırılan PostgreSQL'de (Neon / Vercel Postgres) PostgREST yok;
-- sunucusuz fonksiyon veritabanına DOĞRUDAN, veritabanı sahibinin
-- rolüyle bağlanıyor ve isteği karşılarken `set local role authenticated`
-- yapması gerekiyor. Üyelik olmadan bu çağrı "permission denied to set
-- role" veriyor ve panel hiçbir veri okuyamıyor.
--
-- `current_user` kullanılıyor, rol adı YAZILMIYOR: Neon'da sahip
-- `neondb_owner`, Vercel'de başka, geliştirme makinesinde başka. Ad
-- gömülseydi göç yalnızca tek bir kurulumda çalışırdı.
--
-- Üyelik yetki GENİŞLETMİYOR: sahip zaten bütün tablolara erişebiliyor.
-- Tersine, DARALTMAYI mümkün kılıyor -- fonksiyon isteği karşılarken
-- `authenticated` rolüne geçebiliyor ve o rolde satır güvenliği
-- devrede oluyor. Üyelik olmasaydı tek seçenek her şeyi sahip olarak
-- çalıştırmak, yani RLS'i tamamen devre dışı bırakmak olurdu.
-- =====================================================================

/*
  ÜYELİK YETMİYOR, `SET` SEÇENEĞİ GEREKİYOR.

  PostgreSQL 16 rol üyeliğini üçe ayırdı: ADMIN (rolü başkasına verebilme),
  INHERIT (yetkilerini kendiliğinden alma) ve SET (`set role` ile o role
  geçebilme). Superuser olmayan bir rol yeni bir rol açtığında kendisine
  ADMIN'li ama SET'siz bir üyelik veriliyor. Sonuç ince: `pg_has_role(...,
  'member')` TRUE döndürüyor, yani "üye misin" sorusunun cevabı evet, ama
  `set role authenticated` yine "permission denied" veriyor.

  İlk yazımda koruma koşulu tam olarak bu üyeliğe bakıyordu ve gerçek
  grant'i atlıyordu; göç "başarıyla" uygulanıyor, panel yine veri
  okuyamıyordu. Kontrol artık doğrudan `set_option` alanına bakıyor.

  Sürüm ayrımı şart: `with set true` sözdizimi 16 ile geldi, daha eski
  sunucuda söz dizimi hatası verir. Eski sürümlerde düz `grant` zaten
  `set role`'e izin veriyor.
*/
do $$
declare
  v_rol text;
  v_set boolean;
begin
  foreach v_rol in array array['anon', 'authenticated', 'service_role'] loop
    if not exists (select 1 from pg_roles where rolname = v_rol) then
      continue;
    end if;

    select m.set_option into v_set
    from pg_auth_members m
    join pg_roles r on r.oid = m.roleid
    join pg_roles g on g.oid = m.member
    where r.rolname = v_rol and g.rolname = current_user;

    if v_set then
      continue;
    end if;

    if current_setting('server_version_num')::int >= 160000 then
      execute format('grant %I to %I with set true', v_rol, current_user);
    else
      execute format('grant %I to %I', v_rol, current_user);
    end if;
  end loop;
end $$;

-- ------------------------------------------------------------ doğrulama
-- Göç yarım uygulanırsa sessiz kalmasın: üyelik yoksa panel veri
-- okuyamaz ve sebebi çok geç anlaşılır.
do $$ begin
  /*
    `pg_has_role(..., 'member')` YETMEZ: SET seçeneği olmayan üyelik de
    o soruya evet diyor ve göç hatayı geçirirdi. Asıl sorulan, rolün
    `set role` ile geçilebilir olup olmadığı.
  */
  if not exists (
    select 1 from pg_auth_members m
    join pg_roles r on r.oid = m.roleid
    join pg_roles g on g.oid = m.member
    where r.rolname = 'authenticated' and g.rolname = current_user and m.set_option
  ) then
    raise exception 'BASARISIZ: baglanan rol authenticated rolune gecemiyor (SET yok)';
  end if;
end $$;
