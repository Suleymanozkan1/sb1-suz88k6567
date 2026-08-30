import { useEffect } from 'react';
import { IconClose } from './Icons';

interface Props {
  open: boolean;
  onClose: () => void;
  youtubeId: string;
  title?: string;
}

/** Tanıtım videosu için lightbox (orijinaldeki venobox karşılığı) */
export default function VideoModal({ open, onClose, youtubeId, title = 'Tanıtım videosu' }: Props) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      <div className="w-full max-w-4xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex justify-end">
          <button type="button" onClick={onClose} aria-label="Videoyu kapat" className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20">
            <IconClose size={22} />
          </button>
        </div>
        <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-black">
          <iframe
            className="absolute inset-0 h-full w-full"
            src={`https://www.youtube.com/embed/${youtubeId}?autoplay=1&rel=0`}
            title={title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      </div>
    </div>
  );
}
