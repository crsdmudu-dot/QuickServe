'use client';
// FaqItem — collapsible FAQ row with accessible button toggle.
// 'use client' required because of useState for the collapse state.

import { useState } from 'react';

type Props = {
  question: string;
  answer: string;
};

export default function FaqItem({ question, answer }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center justify-between gap-4 px-6 py-4 text-left bg-surface hover:bg-surfaceMuted transition-colors"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
      >
        <span className="text-label font-semibold text-ink">{question}</span>
        <span
          className={`flex-shrink-0 text-textSecondary transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        >
          ▾
        </span>
      </button>

      {open && (
        <div className="px-6 py-4 bg-surfaceMuted border-t border-border">
          <p className="text-label text-textSecondary leading-relaxed">{answer}</p>
        </div>
      )}
    </div>
  );
}
