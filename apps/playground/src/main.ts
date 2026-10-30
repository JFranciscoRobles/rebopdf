// Where everything is tried: the sample agreement in the editor, or, with
// ?viewer, in the viewer alone; ?empty starts with no PDF, ?lang=es in
// Spanish, ?noworker reads files in the page. With ?collab=<server>, the
// menu shares the PDF to work on it together, and &room=<id> joins a room.

import { samplePdf, usePdfAssets, usePdfWorker } from '@rebopdf/core';
import { joinRoom, shareEditor } from '@rebopdf/collab';
import { mountEditor } from '@rebopdf/editor';
import { recognizeText } from '@rebopdf/ocr';
import { mountViewer } from '@rebopdf/viewer';
import liberation from 'pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf?url';
import worker from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

const params = new URLSearchParams(location.search);
const locale = params.get('lang') === 'es' ? 'es' : 'en';
if (!params.has('noworker')) usePdfWorker(worker);
// The folder of pdfjs-dist as Vite serves it while it is developed: its fonts, for PDF/A, and its maps.
if (import.meta.env.DEV) usePdfAssets(liberation.replace(/standard_fonts\/.*$/, ''));
const app = document.querySelector<HTMLElement>('#app')!;
const collab = params.get('collab');
const room = params.get('room');
const name = params.get('name') ?? 'Ana';

if (params.has('viewer')) {
  Object.assign(window, { viewer: mountViewer(app, { pdf: await samplePdf(locale), locale }) });
} else {
  const editor = mountEditor(app, {
    pdf: params.has('empty') || room ? undefined : await samplePdf(locale),
    locale,
    author: name,
    recognize: recognizeText,
    menu: collab
      ? [
          {
            icon: 'layers',
            label: locale === 'es' ? 'Trabajar en él con otros' : 'Work on it with others',
            hint: locale === 'es' ? 'Un enlace para que otros lo vean y cambien a la vez' : 'A link for others to see it and change it at once',
            run: async () => {
              const session = await shareEditor(editor, { url: collab, name });
              const link = `${location.origin}${location.pathname}?collab=${encodeURIComponent(collab)}&room=${session.room}`;
              Object.assign(window, { session, link });
              await navigator.clipboard?.writeText(link).catch(() => undefined);
              editor.notify(locale === 'es' ? `Enlace copiado: ${link}` : `Link copied: ${link}`);
            },
          },
        ]
      : [],
  });
  if (collab && room) Object.assign(window, { session: await joinRoom(editor, { url: collab, room, name }) });
  Object.assign(window, { editor });
}
