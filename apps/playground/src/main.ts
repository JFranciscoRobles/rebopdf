// Where everything is tried: the sample agreement in the editor, or, with
// ?viewer, in the viewer alone; ?empty starts with no PDF, ?lang=es in
// Spanish, ?noworker reads files in the page.

import { samplePdf, usePdfWorker } from '@rebopdf/core';
import { mountEditor } from '@rebopdf/editor';
import { mountViewer } from '@rebopdf/viewer';
import worker from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

const params = new URLSearchParams(location.search);
const locale = params.get('lang') === 'es' ? 'es' : 'en';
if (!params.has('noworker')) usePdfWorker(worker);
const app = document.querySelector<HTMLElement>('#app')!;

if (params.has('viewer')) {
  Object.assign(window, { viewer: mountViewer(app, { pdf: await samplePdf(locale), locale }) });
} else {
  const editor = mountEditor(app, { pdf: params.has('empty') ? undefined : await samplePdf(locale), locale, author: 'Ana' });
  Object.assign(window, { editor });
}
