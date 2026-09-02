import { useEffect, useRef, useState } from 'react';

interface Props {
  label: string;
  value: number;
}

/** Sektör dağılımı çubuğu — görünür olduğunda animasyonla dolar */
export default function ProgressBar({ label, value }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    if (typeof IntersectionObserver === 'undefined') {
      setWidth(value);
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setWidth(value);
            observer.disconnect();
          }
        });
      },
      { threshold: 0.3 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [value]);

  return (
    <div ref={ref} className="mb-6">
      <div className="mb-1.5 flex items-center justify-between font-heading font-medium text-brand">
        <span>{label}</span>
        <span>{value}%</span>
      </div>
      <div
        className="h-2.5 w-full overflow-hidden rounded-sm bg-[#e2eefd]"
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className="h-full rounded-sm bg-accent transition-[width] duration-1000 ease-out"
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}
