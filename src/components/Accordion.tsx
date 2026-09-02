import { useState } from 'react';
import { Link } from 'react-router-dom';
import { IconChevronDown } from './Icons';

interface Item {
  no?: string;
  question: string;
  answer: string;
  linkText?: string;
  linkTo?: string;
}

export default function Accordion({ items, defaultOpen = 0 }: { items: Item[]; defaultOpen?: number | null }) {
  const [open, setOpen] = useState<number | null>(defaultOpen);

  return (
    <div className="space-y-3">
      {items.map((item, i) => {
        const isOpen = open === i;
        const panelId = `acc-panel-${i}`;
        const buttonId = `acc-button-${i}`;
        return (
          <div key={item.question} className="rounded-md border border-line bg-white">
            <h3>
              <button
                id={buttonId}
                type="button"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => setOpen(isOpen ? null : i)}
                className="flex w-full items-start gap-3 px-4 py-4 text-left"
              >
                {item.no && <span className="font-heading font-bold text-accent">{item.no}</span>}
                <span className={`flex-1 font-heading font-semibold ${isOpen ? 'text-accent' : 'text-brand'}`}>
                  {item.question}
                </span>
                <IconChevronDown
                  size={20}
                  className={`mt-0.5 shrink-0 text-accent transition-transform ${isOpen ? 'rotate-180' : ''}`}
                />
              </button>
            </h3>
            <div id={panelId} role="region" aria-labelledby={buttonId} hidden={!isOpen}>
              <p className="px-4 pb-4 leading-relaxed text-ink">
                {item.answer}
                {item.linkText && item.linkTo && <Link to={item.linkTo}>{item.linkText}</Link>}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
