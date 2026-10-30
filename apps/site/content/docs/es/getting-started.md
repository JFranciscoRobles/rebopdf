# Primeros pasos

Instala el editor, o los componentes de React:

```bash
npm install @rebopdf/editor    # o @rebopdf/react, o @rebopdf/viewer
```

## En React

```tsx
'use client';
import { PdfEditor, usePdf } from '@rebopdf/react';

export default function Contrato() {
  const { pdf, error } = usePdf('/contrato.pdf');
  if (error) return <p>{error.message}</p>;
  return pdf ? (
    <div style={{ height: '100vh' }}>
      <PdfEditor pdf={pdf} locale="es" author="Ana" onSave={(bytes) => subir(bytes)} />
    </div>
  ) : null;
}
```

El elemento toma la altura de lo que lo contiene: dásela.

## En cualquier página

```ts
import { openPdf } from '@rebopdf/core';
import { mountEditor } from '@rebopdf/editor';

const bytes = new Uint8Array(await (await fetch('/contrato.pdf')).arrayBuffer());
const editor = mountEditor(document.querySelector('#pdf')!, {
  pdf: await openPdf(bytes, { name: 'contrato.pdf' }),
  locale: 'es',
  onSave: (bytes, pdf) => subir(bytes),
});
```

Sin `onSave`, el botón descarga el PDF. Sin `pdf`, el editor pide que se abra o se suelte uno.

## PDF.js en un worker

PDF.js lee los archivos en la página salvo que se le dé un worker propio, que mantiene la página respondiendo mientras lee un archivo grande. Con Vite:

```ts
import { usePdfWorker, usePdfAssets } from '@rebopdf/core';
import worker from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

usePdfWorker(worker);
// Las fuentes que un PDF nombra sin traerlas, y los mapas del texto chino,
// japonés y coreano: una copia de la carpeta de pdfjs-dist que sirvas.
usePdfAssets('/pdfjs/');
```

## Probarlo desde el repositorio

```bash
git clone https://github.com/JFranciscoRobles/rebopdf pdf
cd pdf && npm install
npm run dev        # el playground, en :5300
```
