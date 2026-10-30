'use client';

import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '@/components/i18n';
import type { L } from '@/lib/i18n';
import type { SearchEntry } from './searchIndex';

type Kind = SearchEntry['kind'];

/** Each kind: its name over a group of results, its colours, and the path of a 16 × 16 icon drawn with a stroke. */
const KIND: Record<Kind, { group: L; tint: string; icon: string }> = {
  Page: { group: { en: 'Pages', es: 'Páginas' }, tint: 'bg-pastel-green text-pastel-green-fg', icon: 'M4 2h5.5L12 4.5V14H4zM9.5 2v2.5H12M6 8h4M6 11h3' },
  Section: { group: { en: 'Sections', es: 'Secciones' }, tint: 'bg-hover text-muted', icon: 'M6.5 2.5l-1 11M10.5 2.5l-1 11M3 6h10.5M2.5 10H13' },
  Function: { group: { en: 'Functions', es: 'Funciones' }, tint: 'bg-pastel-orange text-pastel-orange-fg', icon: 'M10.5 2.5C8.5 2.5 8 4 7.7 6l-1.2 7.5M5 7h5' },
  Package: { group: { en: 'Packages', es: 'Paquetes' }, tint: 'bg-pastel-pink text-pastel-pink-fg', icon: 'M8 2l5.5 3v6L8 14l-5.5-3V5zM2.5 5L8 8l5.5-3M8 8v6' },
};
/** The order of the groups when something is typed: what is looked for most, first. */
const ORDER: Kind[] = ['Page', 'Function', 'Package', 'Section'];
const CODE_KINDS = new Set<Kind>(['Function', 'Package']);

/** How well an entry answers what is typed; 0 for not at all. */
function score(entry: SearchEntry, words: string[]): number {
  const title = entry.title.toLowerCase();
  const detail = entry.detail.toLowerCase();
  let total = 0;
  for (const word of words) {
    if (title === word) total += 10;
    else if (title.startsWith(word)) total += 6;
    else if (title.includes(word)) total += 4;
    else if (detail.includes(word)) total += 1;
    else return 0;
  }
  return total;
}

/** The title with what was typed in it marked. */
function marked(text: string, words: string[]): ReactNode {
  if (!words.length) return text;
  const lower = text.toLowerCase();
  const on = new Array<boolean>(text.length).fill(false);
  for (const word of words) for (let at = lower.indexOf(word); at >= 0; at = lower.indexOf(word, at + 1)) on.fill(true, at, at + word.length);
  const parts: ReactNode[] = [];
  for (let i = 0; i < text.length; ) {
    let j = i;
    while (j < text.length && on[j] === on[i]) j++;
    parts.push(
      on[i] ? (
        <mark key={i} className="rounded-[3px] bg-pastel-yellow px-px text-inherit">
          {text.slice(i, j)}
        </mark>
      ) : (
        text.slice(i, j)
      ),
    );
    i = j;
  }
  return parts;
}

const Icon = ({ path }: { path: string }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
    <path d={path} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const Key = ({ children }: { children: ReactNode }) => (
  <kbd className="inline-flex min-w-5 justify-center rounded-[5px] border border-border bg-white px-1 py-px font-code text-[11px] text-ink-soft shadow-[0_1px_0_var(--color-border)]">{children}</kbd>
);

/**
 * The search box of the top bar, and the dialog it opens: pages, sections
 * and packages, in groups, with what was typed marked. ⌘K (Ctrl+K
 * elsewhere) opens it from anywhere.
 */
export function SearchCommand({ index }: { index: SearchEntry[] }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [at, setAt] = useState(0);
  const [mac, setMac] = useState(true);
  const t = useT();

  const words = useMemo(() => query.toLowerCase().split(/\s+/).filter(Boolean), [query]);
  // The groups shown, and every result in the order the arrows go through them.
  const { groups, flat } = useMemo(() => {
    let groups: { title: string; entries: SearchEntry[] }[];
    if (!words.length) {
      // Nothing typed: the pages, in the groups of the menu.
      const pages = index.filter((entry) => entry.kind === 'Page');
      const titles = [...new Set(pages.map((entry) => entry.detail))];
      groups = titles.map((title) => ({ title, entries: pages.filter((entry) => entry.detail === title) }));
    } else {
      const hits = index
        .map((entry) => ({ entry, score: score(entry, words) }))
        .filter((hit) => hit.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 50);
      groups = ORDER.map((kind) => ({ title: t(KIND[kind].group), entries: hits.filter((hit) => hit.entry.kind === kind).map((hit) => hit.entry) })).filter((group) => group.entries.length);
      // The group with the best result goes first.
      const best = hits[0]?.entry.kind;
      if (best) groups.sort((a, b) => Number(b.title === t(KIND[best].group)) - Number(a.title === t(KIND[best].group)));
    }
    return { groups, flat: groups.flatMap((group) => group.entries) };
  }, [index, words, t]);

  const open = () => {
    setQuery('');
    setAt(0);
    dialog.current?.showModal();
    input.current?.focus();
  };
  const go = (entry: SearchEntry | undefined) => {
    if (!entry) return;
    dialog.current?.close();
    const to = new URL(entry.href, window.location.href);
    // On the same page, the hash alone changes.
    if (to.pathname !== window.location.pathname) router.push(entry.href);
    else if (to.hash !== window.location.hash) window.location.hash = to.hash;
    else window.dispatchEvent(new HashChangeEvent('hashchange'));
  };

  useEffect(() => {
    setMac(/Mac|iPhone|iPad/.test(navigator.platform));
    const onKey = (event: KeyboardEvent) => {
      // The autofill of a browser sends a keydown without a key.
      if (event.key?.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        if (dialog.current?.open) dialog.current.close();
        else open();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // The one chosen stays in sight while the arrows move through a long list.
  useEffect(() => {
    document.getElementById(`search-${at}`)?.scrollIntoView({ block: 'nearest' });
  }, [at]);

  let n = -1;
  return (
    <>
      <button
        type="button"
        onClick={open}
        className="ml-0 flex max-w-115 flex-[1_1_260px] cursor-pointer items-center gap-2.5 rounded-[10px] border border-border bg-surface px-3 py-2 text-left text-sm text-muted transition-colors hover:border-border-strong hover:bg-hover sm:ml-3"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        <span className="min-w-0 flex-1 truncate">{t({ en: 'Search the docs, packages…', es: 'Buscar en la documentación, paquetes…' })}</span>
        <Key>{mac ? '⌘K' : 'Ctrl K'}</Key>
      </button>

      <dialog
        ref={dialog}
        aria-label={t({ en: 'Search the documentation', es: 'Buscar en la documentación' })}
        className="palette m-auto mt-[10vh] w-[min(680px,calc(100vw-24px))]"
        onClick={(event) => event.target === dialog.current && dialog.current.close()}
      >
        <div className="overflow-hidden rounded-[18px] border border-border bg-white shadow-[0_24px_60px_rgba(47,46,43,0.22)]">
          <div className="flex items-center gap-3 border-b border-border px-5">
            <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true" className="flex-none text-brand">
              <circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="1.6" />
              <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            <input
              ref={input}
              role="combobox"
              aria-expanded="true"
              aria-controls="search-results"
              aria-activedescendant={flat.length ? `search-${at}` : undefined}
              aria-label={t({ en: 'Search', es: 'Buscar' })}
              value={query}
              placeholder={t({ en: 'Search pages, sections, packages…', es: 'Buscar páginas, secciones, paquetes…' })}
              spellCheck={false}
              autoComplete="off"
              onChange={(event) => {
                setQuery(event.target.value);
                setAt(0);
              }}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown') setAt((i) => Math.min(i + 1, flat.length - 1));
                else if (event.key === 'ArrowUp') setAt((i) => Math.max(i - 1, 0));
                else if (event.key === 'Enter') go(flat[at]);
                else return;
                event.preventDefault();
              }}
              style={{ outline: 'none' }}
              className="min-w-0 flex-1 border-0 bg-transparent py-4.5 text-[17px] text-ink placeholder:text-faint"
            />
            {query && (
              <button
                type="button"
                onClick={() => (setQuery(''), setAt(0), input.current?.focus())}
                className="cursor-pointer rounded-md px-1.5 py-0.5 text-[13px] text-muted hover:bg-hover hover:text-ink"
              >
                {t({ en: 'Clear', es: 'Borrar' })}
              </button>
            )}
          </div>

          <div id="search-results" role="listbox" aria-label={t({ en: 'Results', es: 'Resultados' })} className="max-h-[min(460px,62vh)] overflow-y-auto overscroll-contain px-2 pb-2">
            {groups.map((group, g) => (
              <div key={group.title} role="group" aria-labelledby={`search-group-${g}`}>
                <div
                  id={`search-group-${g}`}
                  className="sticky top-0 z-[1] flex items-center justify-between bg-white/95 px-3 pb-1.5 pt-3.5 text-[11.5px] font-semibold uppercase tracking-[0.05em] text-muted backdrop-blur-sm"
                >
                  <span>{group.title}</span>
                  <span className="font-code font-normal normal-case tracking-normal text-faint">{group.entries.length}</span>
                </div>
                {group.entries.map((entry) => {
                  const i = ++n;
                  const on = i === at;
                  const kind = KIND[entry.kind];
                  return (
                    <div
                      key={`${entry.kind} ${entry.href} ${entry.title}`}
                      id={`search-${i}`}
                      role="option"
                      aria-selected={on}
                      onMouseMove={() => setAt(i)}
                      onClick={() => go(entry)}
                      className={`flex cursor-pointer items-center gap-3 rounded-[10px] px-3 py-2 transition-colors ${on ? 'bg-brand-light' : ''}`}
                    >
                      <span className={`inline-flex size-8 flex-none items-center justify-center rounded-lg ${kind.tint}`}>
                        <Icon path={kind.icon} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate text-[14.5px] font-medium ${CODE_KINDS.has(entry.kind) ? 'font-code text-[13.5px]' : ''} ${on ? 'text-brand' : 'text-ink'}`}>
                          {marked(entry.title, words)}
                        </span>
                        {entry.detail && (words.length || entry.kind !== 'Page') && <span className="block truncate text-[12.5px] text-muted">{entry.detail}</span>}
                      </span>
                      <span aria-hidden="true" className={`flex-none text-[13px] text-brand transition-opacity ${on ? 'opacity-100' : 'opacity-0'}`}>
                        ↵
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}
            {!flat.length && (
              <div className="px-3 py-12 text-center">
                <p className="m-0 text-[15px] text-ink">{t({ en: `Nothing found for “${query}”.`, es: `No se encontró nada para “${query}”.` })}</p>
                <p className="m-0 mt-1.5 text-[13px] text-muted">
                  {t({
                    en: 'Try a word of a page or a function of formulas: markdown, board, IF…',
                    es: 'Prueba con una palabra de una página o una función de fórmulas: markdown, tablero, IF…',
                  })}
                </p>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border bg-surface px-5 py-2.5 text-[12.5px] text-muted">
            <span className="flex items-center gap-1.5">
              <Key>↑</Key>
              <Key>↓</Key> {t({ en: 'to move', es: 'para moverte' })}
            </span>
            <span className="flex items-center gap-1.5">
              <Key>↵</Key> {t({ en: 'to open', es: 'para abrir' })}
            </span>
            <span className="flex items-center gap-1.5">
              <Key>Esc</Key> {t({ en: 'to close', es: 'para cerrar' })}
            </span>
            <span className="ml-auto">
              {words.length
                ? t({ en: `${flat.length} ${flat.length === 1 ? 'result' : 'results'}`, es: `${flat.length} ${flat.length === 1 ? 'resultado' : 'resultados'}` })
                : t({ en: `${flat.length} pages`, es: `${flat.length} páginas` })}
            </span>
          </div>
        </div>
      </dialog>
    </>
  );
}
