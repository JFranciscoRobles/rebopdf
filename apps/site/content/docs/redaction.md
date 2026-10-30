# Blacking out

Covering text with a black box does not take it out of a PDF: it is still there to copy. Blacking out with ReboPDF does.

Draw boxes with the Black out tool (R), or select text and choose Black out. When the PDF is saved:

- The page is drawn as a picture, what its fields hold included, and the boxes are burnt into it.
- The picture is all the page is: what was under the boxes (text, pictures, drawings, field values) is nowhere in the file.
- The text out of the boxes is written over the picture, unseen, so the page is found and selected as before.
- Links and marks under a box go with it; the tagged structure of the PDF, which keeps copies of its text, goes.

Before it is saved, what is blacked out is not found any more. Once saved, the editor shows the PDF as it was saved.

```ts
import { addMark, searchPdf, savePdf } from '@rebopdf/core';

for (const match of await searchPdf(pdf, 'ACC-2026-0042'))
  pdf = addMark(pdf, { kind: 'redaction', page: match.page, rects: match.rects });
const safe = await savePdf(pdf);
```

A PDF with something blacked out is never saved by adding to its file: that would leave the original in it.
