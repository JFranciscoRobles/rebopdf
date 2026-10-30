'use client';

import { LanguageSwitcher, LocalLink as Link, useT } from '@/components/i18n';
import { VERSION } from '@/lib/home';
import { NPM, REBODOCS, REPO } from '@/lib/site';
import { primary } from './buttons';

const ghost = 'rounded-lg px-3 py-2 text-ink transition-colors hover:bg-hover';

/** Rebodocs' tile with a note in place of a page: a sheet of paper with two lines on it. */
export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect x="2" y="2" width="28" height="28" rx="8" fill="#FDEEF3" />
      <path d="M10 8h8.5l4 4v12H10z" fill="#FFFFFF" stroke="#C2255C" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M13.5 16h5.5M13.5 19.5h4" stroke="#C2255C" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/** The header of the landing page. Its links go down to a second line on a narrow screen. */
export function SiteHeader() {
  const t = useT();
  return (
    <header className="mx-auto flex max-w-[1180px] flex-wrap items-center gap-x-6 gap-y-3 px-6 py-4.5">
      <Link href="/" className="flex items-center gap-2.5 text-ink">
        <Logo />
        <span className="font-display text-xl font-extrabold tracking-[-0.03em]">ReboPDF</span>
      </Link>
      <span className="rounded-full bg-pastel-pink px-2.5 py-1 text-xs font-medium text-pastel-pink-fg">
        {t({ en: 'Open source', es: 'Código abierto' })} · MIT · v{VERSION}
      </span>
      <nav aria-label={t({ en: 'Main', es: 'Principal' })} className="ml-auto flex flex-wrap items-center gap-0.5 text-[15px] font-medium">
        <Link href="/demo/" className={ghost}>
          Demo
        </Link>
        <Link href="/docs/" className={ghost}>
          Docs
        </Link>
        <Link href="/docs/status/" className={ghost}>
          {t({ en: 'Status', es: 'Estado' })}
        </Link>
        <a href={NPM} className={ghost}>
          npm
        </a>
        <a href={REPO} className={ghost}>
          GitHub
        </a>
        <LanguageSwitcher />
        <Link href="/docs/getting-started/" className={`ml-2 rounded-[10px] px-4 py-2.5 ${primary}`}>
          {t({ en: 'Get started', es: 'Empezar' })}
        </Link>
      </nav>
    </header>
  );
}

export function SiteFooter() {
  const t = useT();
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-[1180px] flex-wrap items-center gap-x-6 gap-y-3 px-6 pb-10 pt-8 text-sm text-muted">
        <span className="font-display text-base font-extrabold tracking-[-0.03em] text-ink">ReboPDF</span>
        <Link href="/demo/" className="hover:text-ink">
          Demo
        </Link>
        <Link href="/docs/" className="hover:text-ink">
          Docs
        </Link>
        <Link href="/docs/status/" className="hover:text-ink">
          {t({ en: 'Status & roadmap', es: 'Estado y hoja de ruta' })}
        </Link>
        <a href={NPM} className="hover:text-ink">
          npm
        </a>
        <a href={REPO} className="hover:text-ink">
          GitHub
        </a>
        <span className="sm:ml-auto">
          {t({ en: 'Part of the Rebo suite, with', es: 'Parte de la suite Rebo, con' })}{' '}
          <a href={REBODOCS} className="font-medium text-ink underline decoration-border-strong underline-offset-4 hover:decoration-current">
            Rebodocs
          </a>
          . {t({ en: 'Open source under the MIT license.', es: 'Código abierto con licencia MIT.' })}
        </span>
      </div>
    </footer>
  );
}
