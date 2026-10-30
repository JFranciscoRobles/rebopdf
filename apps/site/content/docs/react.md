# React components

```bash
npm install @rebopdf/react
```

## PdfEditor

```tsx
'use client';
import { PdfEditor, usePdf } from '@rebopdf/react';

export function Editor() {
  const { pdf } = usePdf('/contract.pdf');
  const [current, setCurrent] = useState(pdf);
  return pdf ? <PdfEditor pdf={pdf} locale="es" author="Ana" onChange={setCurrent} onSave={(bytes) => upload(bytes)} style={{ height: 720 }} /> : null;
}
```

It takes every option of `mountEditor` (see the editor API), and a `ref` to the editor itself. The PDF given is opened again only when another is given: the one `onChange` tells, given back, is not.

## PdfViewer

```tsx
<PdfViewer pdf={pdf} locale="en" toolbar thumbnails={false} onChange={(filled) => save(filled)} />
```

## usePdf

```ts
const { pdf, error, loading } = usePdf(source, { name, password });
```

`source` is the bytes of a PDF, a `File` or a `Blob`, or an address to fetch it from.

## Next.js

The components are client components; they render a box on the server and are mounted in the browser.
