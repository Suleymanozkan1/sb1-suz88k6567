import { Link } from 'react-router-dom';
import { okunakliMetinRengi } from '../lib/format';
import type { ProgramEvent, ProgramTable } from '../lib/program';

/**
 * Program çizelgesi: sütunlar salonlar, satırlar organizasyon olan günler.
 *
 * Kayıt bulunmayan günler çizelgeye hiç girmez; aralık aylara yayıldığında
 * boş satırlar dolu günleri gözden kaybettiriyordu.
 *
 * Renk tek başına bilgi taşımaz; organizasyon türü bandın içine yazıyla da
 * yazılır. Renk körü bir kullanıcı ya da siyah beyaz çıktı alan biri
 * çizelgeyi aynı şekilde okur.
 */
export default function ProgramCizelgesi({ table }: { table: ProgramTable }) {
  if (table.halls.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-brand-muted">
        Çizelge için en az bir salon tanımlı olmalıdır.
      </p>
    );
  }

  // Aralık hiç seçilmemiş olmakla, seçilip de içinde kayıt bulunmaması iki
  // ayrı durum; aynı iletiyi vermek kullanıcıyı tarih kutularına geri
  // gönderirdi.
  if (table.dayCount === 0) {
    return (
      <p className="py-10 text-center text-sm text-brand-muted">
        Çizelgeyi görmek için bir başlangıç ve bitiş tarihi seçiniz.
      </p>
    );
  }

  if (table.rows.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-brand-muted">
        Seçilen {table.dayCount} günün hiçbirinde organizasyon bulunmuyor.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] table-fixed border-collapse text-sm">
        <caption className="sr-only">
          Salon ve güne göre organizasyon programı
        </caption>
        <thead>
          <tr>
            {table.halls.map((h) => (
              <th
                key={h.id}
                scope="col"
                className="border border-black bg-[#c00000] px-2 py-2 text-center text-xs font-bold uppercase text-white"
              >
                {h.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row) => (
            <tr key={row.date}>
              {row.cells.map((cell) => (
                <td key={cell.hallId} className="border border-black align-top">
                  <p
                    className="px-2 py-1 text-center text-xs font-bold"
                    style={
                      cell.headerColor
                        ? { background: cell.headerColor, color: okunakliMetinRengi(cell.headerColor) }
                        : undefined
                    }
                  >
                    {cell.headerLabel}
                  </p>
                  {cell.events.map((e) => (
                    <Etkinlik key={e.reservationId} event={e} tekBasina={cell.events.length === 1} />
                  ))}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Etkinlik({ event, tekBasina }: { event: ProgramEvent; tekBasina: boolean }) {
  return (
    <div className="px-2 pb-2 text-center text-xs">
      {/* Tek organizasyonda tür zaten tarih bandında yazıyor. */}
      {tekBasina ? (
        event.timeLabel && <p className="pt-1 text-brand-muted">{event.timeLabel}</p>
      ) : (
        <p
          className="-mx-2 mb-1 mt-1 px-2 py-1 font-bold"
          style={{ background: event.color, color: okunakliMetinRengi(event.color) }}
        >
          {event.timeLabel || event.slot.toLocaleUpperCase('tr-TR')}{' '}
          {event.organizationType.toLocaleUpperCase('tr-TR')}
        </p>
      )}
      <p className="font-semibold text-brand">
        <Link to={`/panel/rezervasyonlar/${event.reservationId}`} className="hover:text-accent-ink">
          {event.parties}
        </Link>
      </p>
      <p className="text-brand">{event.guestCount} KİŞİ</p>
      {event.menuLine && <p className="text-brand">{event.menuLine}</p>}
      {event.note && <p className="mt-0.5 italic text-brand-muted">Not: {event.note}</p>}
    </div>
  );
}
