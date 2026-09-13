#!/bin/bash
# =====================================================================
# Yükseltme testi: KURULU BİR SİSTEM üzerinde göçler güvenli mi?
#
# Diğer SQL paketleri temiz bir şemada çalışıyor ve yalnızca "yeni
# kurulum doğru mu" sorusunu cevaplıyor. Asıl risk bu değil: çalışan bir
# salonun veritabanına göç uygulandığında eski rezervasyonların,
# tahsilatların ve kasa hesabının bozulması.
#
# Akış:
#   1. Temiz veritabanına 0000-0023 (güncelleme ÖNCESİ şema)
#   2. 01_eski_veri.sql ile gerçek bir salonun verisi
#   3. 0024-0034 (36 maddelik güncellemenin göçleri)
#   4. 02_dogrula.sql ile verinin bozulmadığının sınanması
#
# Kullanım:  supabase/tests/yukseltme/calistir.sh [veritabani_adi]
# Ortam:     PGHOST, PGPORT, PGUSER psql'in beklediği gibi
# =====================================================================
set -u
DB="${1:-sahra_yukseltme}"
KOK="$(cd "$(dirname "$0")/../../.." && pwd)"
GOC="$KOK/supabase/migrations"

psql -q -c "drop database if exists \"$DB\"" >/dev/null || exit 1
psql -q -c "create database \"$DB\"" >/dev/null || exit 1

uygula() {
  for f in "$@"; do
    if ! psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$f" >/tmp/yukseltme.log 2>&1; then
      echo "BAŞARISIZ: $(basename "$f")"; tail -20 /tmp/yukseltme.log; exit 1
    fi
  done
}

# Göç dosyaları dört haneli sıra numarasıyla başlıyor; ayrım numaraya
# göre yapılıyor. Glob deseniyle bölünseydi 0030-0034 hem "00[2-9]*" hem
# "003*" desenine uyar ve İKİ KEZ uygulanırdı.
onceki=(); sonraki=()
for f in $(ls "$GOC"/*.sql | sort); do
  no="$(basename "$f" | cut -c1-4)"
  if [ "$no" -le 23 ]; then onceki+=("$f"); else sonraki+=("$f"); fi
done

echo "1) Guncelleme oncesi sema (0000-0023)"
uygula "${onceki[@]}"

echo "2) Eski salonun verisi"
uygula "$KOK/supabase/tests/yukseltme/01_eski_veri.sql"

echo "3) Guncellemenin goculeri (0024 ve sonrasi)"
uygula "${sonraki[@]}"

echo "4) Goclerin IKINCI KEZ uygulanmasi"
# Kurulum belgesi göçleri bir döngüyle uyguluyor ve operatörün döngüyü
# yeniden çalıştırması olağan. İkinci koşu hata verirse yükseltme yarıda
# kalır; bu yüzden sınanıyor.
uygula "${sonraki[@]}"

echo "5) Dogrulama"
if psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$KOK/supabase/tests/yukseltme/02_dogrula.sql"; then
  echo "--- YUKSELTME TESTI GECTI ---"
  exit 0
fi
echo "--- YUKSELTME TESTI DUSTU ---"
exit 1
