import { useEffect, useState } from 'react';
import { IconChevronDown } from './Icons';

export default function BackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 300);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      aria-label="Sayfanın başına dön"
      className="no-print fixed bottom-6 right-6 z-40 rounded-full bg-accent p-3 text-white shadow-lg transition hover:bg-accent-dark"
    >
      <IconChevronDown size={20} className="rotate-180" />
    </button>
  );
}
