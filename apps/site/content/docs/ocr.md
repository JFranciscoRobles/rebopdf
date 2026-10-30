# Scanned pages (OCR)

A scanned page is a picture: it has no text to find, select or black out. `@rebopdf/ocr` reads it with [Tesseract](https://github.com/naptha/tesseract.js), in the browser or in Node.

```bash
npm install @rebopdf/ocr
```

```ts
import { recognizeText } from '@rebopdf/ocr';

pdf = await recognizeText(pdf, { languages: ['spa', 'eng'], onProgress: (done, total) => show(done, total) });
```

Only the pages with no text of their own are read, unless `pages` names them. The words are put where they are seen: found, selected, highlighted and blacked out as text is, and written unseen over the pages when the PDF is saved.

In the editor, give it the function, and the menu has Recognize text:

```ts
mountEditor(element, { pdf, recognize: recognizeText });
```

The data of each language is fetched the first time it is needed (`langPath` says from where) and kept (`cachePath` in Node). A big title beside a dark band of a scan Tesseract may not read.
