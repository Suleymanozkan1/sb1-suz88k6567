import { useState } from 'react';
import Seo from '../../components/Seo';
import Alert from '../../components/Alert';
import { useAuth } from '../../context/AuthContext';
import { useBusinessData } from '../../hooks/useBusinessData';
import { saveColorSettings } from '../../lib/db';
import { DEFAULT_COLOR_SETTINGS } from '../../data/constants';
import type { ColorSetting } from '../../types';

export default function RenkAyarlari() {
  const { can } = useAuth();
  const { businessId, colors, reload } = useBusinessData();
  const [draft, setDraft] = useState<ColorSetting[]>(colors);
  const [saved, setSaved] = useState(false);

  function update(key: string, color: string) {
    setDraft((d) => d.map((c) => (c.key === key ? { ...c, color } : c)));
    setSaved(false);
  }

  function save() {
    saveColorSettings(businessId, draft);
    reload();
    setSaved(true);
    window.setTimeout(() => setSaved(false), 3000);
  }

  function reset() {
    setDraft(DEFAULT_COLOR_SETTINGS);
    setSaved(false);
  }

  if (!can('ayarlar.duzenle')) {
    return <Alert kind="error">Ayarları düzenleme yetkiniz bulunmuyor.</Alert>;
  }

  return (
    <>
      <Seo title="Rezervasyon Renk Ayarları - Düğün Takip Panel" noindex />

      <h1 className="mb-2 font-heading text-2xl font-bold text-brand">Rezervasyon Renk Ayarları</h1>
      <p className="mb-6 text-sm text-brand-muted">
        Her organizasyon türü için takvimde ve listelerde görünecek rengi belirleyebilirsiniz.
      </p>

      {saved && <Alert kind="success" className="mb-5">Renk ayarlarınız kaydedildi.</Alert>}

      <div className="card p-5">
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {draft.map((c) => (
            <li key={c.key} className="flex items-center gap-3 rounded-md border border-line p-3">
              <input
                type="color"
                id={`color-${c.key}`}
                value={c.color}
                onChange={(e) => update(c.key, e.target.value)}
                className="h-10 w-12 cursor-pointer rounded border border-line bg-white p-0.5"
                aria-label={`${c.label} rengi`}
              />
              <label htmlFor={`color-${c.key}`} className="flex-1">
                <span className="block font-heading font-semibold text-brand">{c.label}</span>
                <span className="block font-mono text-xs uppercase text-brand-muted">{c.color}</span>
              </label>
            </li>
          ))}
        </ul>

        <div className="mt-6 flex flex-wrap gap-2">
          <button type="button" onClick={save} className="btn-primary text-white hover:text-white">Kaydet</button>
          <button type="button" onClick={reset} className="btn-outline">Varsayılana dön</button>
        </div>
      </div>

      <section className="card mt-6 p-5">
        <h2 className="mb-4 font-heading text-lg font-bold text-brand">Önizleme</h2>
        <div className="grid grid-cols-7 gap-1.5">
          {draft.slice(0, 7).map((c, i) => (
            <div key={c.key} className="rounded p-2 text-center text-[10px] text-white" style={{ background: c.color }}>
              {i + 1}
              <span className="mt-1 block truncate">{c.label}</span>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
