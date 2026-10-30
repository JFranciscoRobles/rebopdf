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

## Pages scanned askew, and their languages

A page fed into the scanner askew is straightened before it is read: how much its lines lean is measured (between -6° and 6°), the picture is turned back, and the words found are put where they are on the page as it was scanned, read a line at a time as they were. `deskew: false` leaves it as it is.

The languages are those Tesseract knows, by its names: `languages: ['eng', 'fra']`. In the editor, Recognize text asks which, and remembers them. Each is fetched the first time it is needed. Tesseract reads in a worker of its own; what ReboPDF does around it gives the page time to answer between pages.
