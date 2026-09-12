import { useState } from 'react';
import Alert from './Alert';
import ConfirmDialog from './ConfirmDialog';
import { IconPlus, IconTrash } from './Icons';
import { errorMessage } from '../lib/authHelpers';
import { uid } from '../lib/ids';
import { useDeleteQuickReply, useQuickReplies, useSaveQuickReply } from '../lib/queries';
import type { QuickReply } from '../types';

/**
 * Hızlı yanıtlar (madde 14).
 *
 * Şablonlardan AYRI bir şey: şablon müşteriye giden, yer tutuculu ve
 * olaya bağlı bir taslaktır; hızlı yanıt personelin yazarken kopyaladığı
 * kısa metindir. Aynı listede toplansalardı "üç ayrı fiyat cümlesi" gibi
 * bir dizi, tür başına tek satır tutan şablon tablosuna sığmazdı.
 *
 * Başlık ayrı duruyor: metnin ilk kelimelerine bakılsaydı birbirine
 * benzeyen iki yanıt listede ayırt edilemezdi.
 */
export default function HizliYanitlar({ duzenleyebilir }: { duzenleyebilir: boolean }) {
  const { data: yanitlar = [] } = useQuickReplies();
  const kaydet = useSaveQuickReply();
  const sil = useDeleteQuickReply();

  const [form, setForm] = useState({ title: '', body: '' });
  const [hata, setHata] = useState('');
  const [silinecek, setSilinecek] = useState<QuickReply | null>(null);

  async function ekle(e: React.FormEvent) {
    e.preventDefault();
    setHata('');
    const baslik = form.title.trim();
    const metin = form.body.trim();
    if (!baslik) { setHata('Başlık giriniz.'); return; }
    if (!metin) { setHata('Yanıt metni giriniz.'); return; }

    try {
      await kaydet.mutateAsync({
        id: uid('hizli'), businessId: '', title: baslik, body: metin,
        // Sona ekleniyor: yeni yanıt listenin sonunda beliriyor, sıra
        // kendiliğinden değişmiyor.
        sortOrder: yanitlar.reduce((m, y) => Math.max(m, y.sortOrder), 0) + 10,
      });
      setForm({ title: '', body: '' });
    } catch (err) {
      setHata(errorMessage(err));
    }
  }

  async function kaldir() {
    if (!silinecek) return;
    const hedef = silinecek;
    setSilinecek(null);
    try {
      await sil.mutateAsync(hedef.id);
    } catch (err) { setHata(errorMessage(err)); }
  }

  return (
    <section className="card p-5" aria-labelledby="hizli-yanit-baslik">
      <h2 id="hizli-yanit-baslik" className="mb-1 font-heading text-lg font-bold text-brand">
        Hızlı Yanıt Kaydet
      </h2>
      <p className="mb-4 text-sm text-brand-muted">
        Sık yazdığınız kısa cümleler. Müşteri kartındaki mesaj kutusunda tek tuşla eklenir;
        yer tutucu içermezler, olduğu gibi yazılırlar.
      </p>

      {hata && <Alert kind="error" className="mb-4">{hata}</Alert>}

      {yanitlar.length === 0 ? (
        <p className="py-4 text-center text-sm text-brand-muted">Hızlı yanıt kaydedilmemiş.</p>
      ) : (
        <ul className="mb-4 space-y-2">
          {yanitlar.map((y) => (
            <li key={y.id} className="flex items-start justify-between gap-3 rounded-md bg-surface px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-brand">{y.title}</p>
                <p className="whitespace-pre-wrap text-xs text-brand-muted">{y.body}</p>
              </div>
              {duzenleyebilir && (
                <button type="button" onClick={() => setSilinecek(y)}
                  aria-label={`${y.title} yanıtını sil`}
                  className="shrink-0 rounded p-1 text-brand-muted hover:text-danger">
                  <IconTrash size={15} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {duzenleyebilir && (
        <form onSubmit={(e) => { void ekle(e); }} noValidate className="grid gap-3">
          <div>
            <label htmlFor="hy-title" className="field-label">Başlık</label>
            <input id="hy-title" className="field-input" placeholder="Yemekli fiyat"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          </div>
          <div>
            <label htmlFor="hy-body" className="field-label">Yanıt metni</label>
            <textarea id="hy-body" rows={2} className="field-input" value={form.body}
              onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} />
          </div>
          <div>
            <button type="submit" className="btn-primary text-white hover:text-white"
              disabled={kaydet.isPending}>
              <IconPlus size={16} /> Hızlı yanıtı kaydet
            </button>
          </div>
        </form>
      )}

      <ConfirmDialog
        open={Boolean(silinecek)}
        title="Hızlı yanıtı silmek istiyor musunuz?"
        description={silinecek?.title ?? ''}
        confirmLabel="Evet, sil"
        onConfirm={() => { void kaldir(); }}
        onCancel={() => setSilinecek(null)}
      />
    </section>
  );
}
