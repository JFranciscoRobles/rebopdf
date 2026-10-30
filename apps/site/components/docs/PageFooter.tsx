'use client';

import { useState } from 'react';
import { LocalLink as Link, useT } from '@/components/i18n';
import type { NavItem } from '@/lib/site';
import { hrefOf } from '@/lib/site';

/** The end of every page: the pages before and after it, a question, and where to fix it. */
export function PageFooter({ previous, next, edit }: { previous?: NavItem; next?: NavItem; edit: string }) {
  const [helpful, setHelpful] = useState<boolean>();
  const t = useT();
  const card = 'lift rounded-[14px] border border-border px-4.5 py-4 text-ink';

  return (
    <footer className="mt-14">
      <nav aria-label={t({ en: 'Pages', es: 'Páginas' })} className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))] gap-3">
        {previous ? (
          <Link href={hrefOf(previous.slug)} className={card}>
            <span className="text-[13px] text-muted">← {t({ en: 'Previous', es: 'Anterior' })}</span>
            <span className="mt-1 block font-display text-[17px] font-bold">{t(previous.title)}</span>
          </Link>
        ) : (
          <span />
        )}
        {next && (
          <Link href={hrefOf(next.slug)} className={`${card} text-right`}>
            <span className="text-[13px] text-muted">{t({ en: 'Next', es: 'Siguiente' })} →</span>
            <span className="mt-1 block font-display text-[17px] font-bold">{t(next.title)}</span>
          </Link>
        )}
      </nav>
      <div className="mt-7 flex flex-wrap items-center gap-2.5 text-sm text-muted">
        <span aria-live="polite">
          {helpful === undefined
            ? t({ en: 'Was this page helpful?', es: '¿Te sirvió esta página?' })
            : helpful
              ? t({ en: 'Thanks — glad it helped.', es: 'Gracias, qué bueno que te sirvió.' })
              : t({ en: 'Thanks — we will make it clearer.', es: 'Gracias, la haremos más clara.' })}
        </span>
        {helpful === undefined &&
          (
            [
              [t({ en: 'Yes', es: 'Sí' }), true],
              [t({ en: 'Not really', es: 'No mucho' }), false],
            ] as const
          ).map(([label, value]) => (
            <button
              key={label}
              type="button"
              onClick={() => setHelpful(value)}
              className="cursor-pointer rounded-full border border-border-strong bg-white px-3.5 py-1.5 text-sm text-ink transition-colors hover:bg-hover"
            >
              {label}
            </button>
          ))}
        <a href={edit} className="ml-auto font-medium text-brand hover:text-brand-hover">
          {t({ en: 'Edit this page', es: 'Editar esta página' })}
        </a>
      </div>
    </footer>
  );
}
