'use client';

// The PDF on the whole window, under the bar the demos of the suite have: the
// name, back to the site, the editor or the viewer alone, and what each is.
//
// With ?collab=<server> it works with other people: Share starts a room on
// that server with the PDF, and the address it gives (…&room=<id>) is the
// one to send.

import { useCallback, useEffect, useRef, useState } from 'react';
import { LocalLink as Link, useT } from '@/components/i18n';
import { type LiveHandle, type LiveRoom, LivePdf } from '@/components/LivePdf';
import type { L } from '@/lib/i18n';

type Tab = 'editor' | 'viewer';

const TABS: { id: Tab; label: L; note: L; dot: string }[] = [
  {
    id: 'editor',
    label: { en: 'The editor', es: 'El editor' },
    note: {
      en: 'mountEditor on a service agreement: fill its form, highlight, note, sign, black out, make fields, turn and move pages. The menu ⋯ signs digitally, compares and reads scans.',
      es: 'mountEditor sobre un contrato de servicios: rellena su formulario, resalta, anota, firma, tacha, crea campos, gira y mueve páginas. El menú ⋯ firma digitalmente, compara y lee escaneos.',
    },
    dot: 'bg-brand',
  },
  {
    id: 'viewer',
    label: { en: 'The viewer alone', es: 'Solo el visor' },
    note: {
      en: 'mountViewer: the pages, thumbnails, contents, links and search, and its form to fill.',
      es: 'mountViewer: las páginas, miniaturas, índice, enlaces y búsqueda, y su formulario para rellenar.',
    },
    dot: 'bg-pastel-green-fg',
  },
];

export function DemoApp() {
  const t = useT();
  const [tab, setTab] = useState<Tab>('editor');
  const [server, setServer] = useState<string>();
  const [room, setRoom] = useState<LiveRoom>();
  const [sharing, setSharing] = useState(false);
  const live = useRef<LiveHandle>(undefined);
  const ready = useCallback((handle: LiveHandle) => {
    live.current = handle;
  }, []);

  useEffect(() => {
    if (window.location.hash === '#viewer') setTab('viewer');
    const query = new URLSearchParams(window.location.search);
    const url = query.get('collab') ?? undefined;
    setServer(url);
    const id = query.get('room');
    if (url && id) setRoom({ url, room: id, key: query.get('key') ?? undefined, name: query.get('name') ?? undefined });
  }, []);

  const choose = (next: Tab) => {
    setTab(next);
    history.replaceState(null, '', next === 'viewer' ? '#viewer' : window.location.pathname + window.location.search);
  };

  /** A room on the server with the PDF, and its address to send. */
  const share = async () => {
    if (!server || !live.current) return;
    setSharing(true);
    try {
      const query = new URLSearchParams(window.location.search);
      const { room: id, keys } = await live.current.share(server, query.get('name') ?? undefined);
      query.set('room', id);
      query.set('key', keys.edit);
      history.replaceState(null, '', `${window.location.pathname}?${query}`);
      setRoom({ url: server, room: id, key: keys.edit, name: query.get('name') ?? undefined });
      await navigator.clipboard?.writeText(window.location.href).catch(() => {});
    } finally {
      setSharing(false);
    }
  };

  const current = TABS.find((one) => one.id === tab)!;
  const button = 'flex min-h-9 cursor-pointer items-center gap-2 rounded-lg bg-brand px-3.5 text-sm font-semibold text-white transition-colors hover:bg-brand-hover pointer-coarse:min-h-11';
  return (
    <div className="flex h-dvh min-h-[560px] flex-col bg-surface text-ink">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border bg-white px-3 py-2 sm:px-4">
        <h1 className="sr-only">{t({ en: 'ReboPDF demo', es: 'Demo de ReboPDF' })}</h1>
        <Link href="/" title={t({ en: 'Back to the site', es: 'Volver al sitio' })} className="flex items-center gap-2 rounded-lg py-1 pr-1 font-display text-[17px] font-bold tracking-tight text-ink">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="" width={24} height={24} />
          <span className="hidden sm:inline">ReboPDF</span>
          <span className="rounded-md bg-hover px-1.5 py-0.5 font-text text-xs font-semibold text-ink-soft">Demo</span>
        </Link>

        <div role="tablist" aria-label={t({ en: 'Which part', es: 'Qué parte' })} className="order-3 flex w-full rounded-xl bg-surface p-1 sm:order-none sm:w-auto">
          {TABS.map(({ id, label, dot }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => choose(id)}
              className={`flex min-h-9 flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg px-3.5 text-sm font-semibold transition-colors sm:flex-none ${
                tab === id ? 'bg-white text-ink shadow-[0_1px_3px_rgba(47,46,43,0.14)]' : 'text-ink-soft hover:text-ink'
              }`}
            >
              <span aria-hidden="true" className={`size-2 rounded-full ${tab === id ? dot : 'bg-border-strong'}`} />
              {t(label)}
            </button>
          ))}
        </div>

        <p className="hidden min-w-0 flex-1 truncate text-sm text-muted lg:block">
          {room?.room
            ? t({ en: `Shared in room ${room.room}: send this address to work together.`, es: `Compartido en la sala ${room.room}: manda esta dirección para trabajar juntos.` })
            : t(current.note)}
        </p>
        <div className="ml-auto flex items-center gap-2">
          <Link href="/docs/getting-started/" className="hidden rounded-lg px-3 py-2 text-sm font-semibold text-ink-soft hover:bg-hover hover:text-ink md:block">
            {t({ en: 'Docs', es: 'Documentación' })}
          </Link>
          {server && !room?.room && tab === 'editor' && (
            <button type="button" onClick={() => void share()} disabled={sharing} className={button}>
              {sharing ? t({ en: 'Sharing…', es: 'Compartiendo…' }) : t({ en: 'Share', es: 'Compartir' })}
            </button>
          )}
        </div>
      </header>
      <div className="min-h-0 flex-1">
        <LivePdf key={tab} viewer={tab === 'viewer'} room={room} onReady={ready} className="h-full" />
      </div>
    </div>
  );
}
