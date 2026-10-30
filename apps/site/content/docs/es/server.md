# En un servidor

El motor no usa el DOM: corre en Node con el mismo código que corre el editor.

```ts
import { readFile, writeFile } from 'node:fs/promises';
import { openPdf, savePdf, setField, insertPdf, signPdf } from '@rebopdf/core';

let pdf = await openPdf(new Uint8Array(await readFile('formulario.pdf')));
pdf = setField(pdf, 'client.name', 'Ana García');
pdf = insertPdf(pdf, await openPdf(new Uint8Array(await readFile('anexo.pdf'))));
await writeFile('relleno.pdf', await savePdf(pdf));
await writeFile('firmado.pdf', await signPdf(pdf, { p12, password }));
```

El tachado dibuja páginas como imágenes: en Node, PDF.js las dibuja con `@napi-rs/canvas`, que instala él mismo.

## Guardar

`savePdf(pdf, opciones)` acepta `flatten` (campos y marcas dibujados en las páginas para siempre), `font` (una fuente TrueType u OpenType para texto en cualquier alfabeto) e `incremental` (`'auto'`, `true` o `false`).
