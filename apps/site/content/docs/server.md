# On a server

The engine has no DOM: it runs in Node with the same code the editor runs.

```ts
import { readFile, writeFile } from 'node:fs/promises';
import { openPdf, savePdf, setField, insertPdf, signPdf } from '@rebopdf/core';

let pdf = await openPdf(new Uint8Array(await readFile('form.pdf')));
pdf = setField(pdf, 'client.name', 'Ana García');
pdf = insertPdf(pdf, await openPdf(new Uint8Array(await readFile('annex.pdf'))));
await writeFile('filled.pdf', await savePdf(pdf));
await writeFile('signed.pdf', await signPdf(pdf, { p12, password }));
```

Blacking out draws pages as pictures: in Node, PDF.js draws them with `@napi-rs/canvas`, which it installs.

## Saving

`savePdf(pdf, options)` takes `flatten` (fields and marks drawn into the pages for good), `font` (a TrueType or OpenType font for text in any script), and `incremental` (`'auto'`, `true` or `false`).
