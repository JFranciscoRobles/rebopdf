# Componentes de React

```bash
npm install @rebopdf/react
```

## PdfEditor

```tsx
'use client';
import { PdfEditor, usePdf } from '@rebopdf/react';

export function Editor() {
  const { pdf } = usePdf('/contrato.pdf');
  const [actual, setActual] = useState(pdf);
  return pdf ? <PdfEditor pdf={pdf} locale="es" author="Ana" onChange={setActual} onSave={(bytes) => subir(bytes)} style={{ height: 720 }} /> : null;
}
```

Acepta todas las opciones de `mountEditor` (ver la API del editor) y un `ref` al editor. El PDF dado se abre de nuevo solo cuando se da otro: el que `onChange` avisa, devuelto, no.

## PdfViewer

```tsx
<PdfViewer pdf={pdf} locale="es" toolbar thumbnails={false} onChange={(relleno) => guardar(relleno)} />
```

## usePdf

```ts
const { pdf, error, loading } = usePdf(fuente, { name, password });
```

`fuente` son los bytes de un PDF, un `File` o un `Blob`, o una dirección de donde traerlo.

## Next.js

Los componentes son de cliente: en el servidor dibujan una caja y se montan en el navegador.
