// Where everything is tried: the sample agreement in the editor, or, with
// ?viewer, in the viewer alone; ?empty starts with no PDF, ?lang=es in
// Spanish, ?noworker reads files in the page. With ?collab=<server>, the
// menu shares the PDF to work on it together, and &room=<id> joins a room.

import { samplePdf, setPdfAssets, setPdfWorker } from '@rebopdf/core';
import { joinRoom, roomAddress, shareEditor } from '@rebopdf/collab';
import { mountEditor } from '@rebopdf/editor';
import { recognizeText } from '@rebopdf/ocr';
import { mountViewer } from '@rebopdf/viewer';
import liberation from 'pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf?url';
import worker from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

const params = new URLSearchParams(location.search);
let locale: 'en' | 'es' = params.get('lang') === 'es' ? 'es' : 'en';
/** The language chosen in the menu, kept in the address for the page to open in it again. */
const chosen = (next: 'en' | 'es') => {
  locale = next;
  document.documentElement.lang = next;
  params.set('lang', next);
  history.replaceState(null, '', `?${params}`);
};
if (!params.has('noworker')) setPdfWorker(worker);
// The folder of pdfjs-dist as Vite serves it while it is developed: its fonts, for PDF/A, and its maps.
if (import.meta.env.DEV) setPdfAssets(liberation.replace(/standard_fonts\/.*$/, ''));
const app = document.querySelector<HTMLElement>('#app')!;
document.documentElement.lang = locale;
/** The tab says the PDF open, for who has several. */
const titled = (name?: string) => {
  document.title = name ? `${name.replace(/\.pdf$/i, '')} · ReboPDF` : 'ReboPDF';
};
const collab = params.get('collab');
const room = params.get('room');
const name = params.get('name') ?? 'Ana';

if (params.has('viewer')) {
  const pdf = await samplePdf(locale);
  titled(pdf.name);
  // The viewer alone is mounted again in the language chosen.
  const mount = () =>
    mountViewer(app, {
      pdf,
      locale,
      setLocale: (next) => {
        chosen(next);
        (window as unknown as { viewer: { destroy(): void } }).viewer.destroy();
        Object.assign(window, { viewer: mount() });
      },
    });
  Object.assign(window, { viewer: mount() });
} else {
  const editor = mountEditor(app, {
    pdf: params.has('empty') || room ? undefined : await samplePdf(locale),
    locale,
    onLocale: chosen,
    onChange: (pdf) => titled(pdf.name),
    author: name,
    recognize: recognizeText,
    menu: collab
      ? [
          {
            icon: 'layers',
            get label() {
              return locale === 'es' ? 'Trabajar en él con otros' : 'Work on it with others';
            },
            get hint() {
              return locale === 'es' ? 'Un enlace para que otros lo vean y cambien a la vez' : 'A link for others to see it and change it at once';
            },
            run: async () => {
              const session = await shareEditor(editor, { url: collab, name });
              const page = `${location.origin}${location.pathname}?collab=${encodeURIComponent(collab)}`;
              const links = { edit: roomAddress(page, session, 'edit'), comment: roomAddress(page, session, 'comment'), view: roomAddress(page, session, 'view') };
              const link = links.edit;
              Object.assign(window, { session, link, links });
              await navigator.clipboard?.writeText(link).catch(() => undefined);
              editor.notify(locale === 'es' ? `Enlace copiado: ${link}` : `Link copied: ${link}`);
            },
          },
        ]
      : [],
  });
  if (collab && room) Object.assign(window, { session: await joinRoom(editor, { url: collab, room, key: params.get('key') ?? '', name }) });
  titled(editor.pdf?.name);
  Object.assign(window, { editor });
}
