'use client';

// The editor itself, running in the page on the sample agreement: mounted in
// the browser after the first render, as nothing of it runs on a server.
// With a room, it works in it with the others there.

import { useEffect, useRef, useState } from 'react';
import { useLocale, useT } from '@/components/i18n';

export interface LiveRoom {
  url: string;
  room?: string;
  /** The key of the room's address: to edit, comment or see. */
  key?: string;
  name?: string;
}

/** What the page that holds the editor can ask of it. */
export interface LiveHandle {
  /** Shares the PDF in a room of the server: the room, and the keys of its addresses. */
  share(url: string, name?: string): Promise<{ room: string; keys: Record<'edit' | 'comment' | 'view', string> }>;
}

export function LivePdf({ className = '', room, viewer = false, onReady }: { className?: string; room?: LiveRoom; viewer?: boolean; onReady?: (handle: LiveHandle) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const locale = useLocale();
  const t = useT();
  useEffect(() => {
    let destroy: (() => void) | undefined;
    let gone = false;
    void (async () => {
      const [core, { mountEditor }, { mountViewer }, collab] = await Promise.all([import('@rebopdf/core'), import('@rebopdf/editor'), import('@rebopdf/viewer'), import('@rebopdf/collab')]);
      if (gone || !host.current) return;
      if (viewer) {
        const view = mountViewer(host.current, { pdf: await core.samplePdf(locale), locale, theme: 'light' });
        destroy = () => view.destroy();
        setReady(true);
        return;
      }
      const editor = mountEditor(host.current, {
        pdf: room?.room ? undefined : await core.samplePdf(locale),
        locale,
        theme: 'light',
        author: room?.name ?? (locale === 'es' ? 'Tú' : 'You'),
        recognize: async (pdf, options) => (await import('@rebopdf/ocr')).recognizeText(pdf, options),
      });
      Object.assign(window, { editor });
      let session: { close(): void } | undefined;
      if (room?.room) session = await collab.joinRoom(editor, { url: room.url, room: room.room, key: room.key ?? '', name: room.name ?? 'Guest' });
      onReady?.({
        async share(url, name) {
          const shared = await collab.shareEditor(editor, { url, name: name ?? 'Host' });
          session = shared;
          return { room: shared.room, keys: shared.keys! };
        },
      });
      destroy = () => {
        session?.close();
        editor.destroy();
      };
      setReady(true);
    })();
    return () => {
      gone = true;
      destroy?.();
    };
  }, [locale, room?.url, room?.room, room?.key, room?.name, viewer, onReady]);
  return (
    <div className={`relative ${className}`}>
      {!ready && <p className="absolute inset-0 m-0 flex items-center justify-center text-sm text-muted">{t({ en: 'Loading the PDF…', es: 'Cargando el PDF…' })}</p>}
      <div ref={host} className="h-full" />
    </div>
  );
}
