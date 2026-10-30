# Getting started

Install the editor, or the React components:

```bash
npm install @rebopdf/editor    # or @rebopdf/react, or @rebopdf/viewer
```

## In React

```tsx
'use client';
import { PdfEditor, usePdf } from '@rebopdf/react';

export default function Contract() {
  const { pdf, error } = usePdf('/contract.pdf');
  if (error) return <p>{error.message}</p>;
  return pdf ? (
    <div style={{ height: '100vh' }}>
      <PdfEditor pdf={pdf} locale="en" author="Ana" onSave={(bytes) => upload(bytes)} />
    </div>
  ) : null;
}
```

The element takes the height of what it is in: give it one.

## In any page

```ts
import { openPdf } from '@rebopdf/core';
import { mountEditor } from '@rebopdf/editor';

const bytes = new Uint8Array(await (await fetch('/contract.pdf')).arrayBuffer());
const editor = mountEditor(document.querySelector('#pdf')!, {
  pdf: await openPdf(bytes, { name: 'contract.pdf' }),
  onSave: (bytes, pdf) => upload(bytes),
});
```

Without `onSave`, the button downloads the PDF. Without `pdf`, the editor asks for one to be opened or dropped.

## PDF.js in a worker

PDF.js reads files in the page unless it is given a worker of its own, which keeps the page answering while a big file is read. With Vite:

```ts
import { usePdfWorker, usePdfAssets } from '@rebopdf/core';
import worker from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

usePdfWorker(worker);
// The fonts a PDF names without carrying them, and the maps of Chinese,
// Japanese and Korean text: a copy of the pdfjs-dist folder you serve.
usePdfAssets('/pdfjs/');
```

## Trying it from the repository

```bash
git clone https://github.com/JFranciscoRobles/rebopdf pdf
cd pdf && npm install
npm run dev        # the playground, on :5300
```
