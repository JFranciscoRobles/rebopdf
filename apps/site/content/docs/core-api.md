# Engine API

Everything of `@rebopdf/core` makes a new `Pdf`; the files it was opened from are never changed.

## Opening and saving

- `openPdf(bytes, { name, password, marks })` — `marks: false` leaves the annotations it comes with as they are.
- `savePdf(pdf, { flatten, font, incremental })`, `savesIncrementally(pdf)`, `whyNotIncremental(pdf)`.
- `samplePdf(locale)`, `samplePdfBytes(locale)`.

## Pages

`rotatePages`, `removePages`, `movePages`, `insertPdf`, `insertBlankPage`, `extractPages`, `pageById`, `pageNumber`, `pageSize`.

## Forms

`setField`, `findField`, `addField`, `updateField`, `removeField`, `detectFields`.

## Marks

`addMark`, `updateMark`, `removeMark`, `marksOn`, `markBounds`. Kinds: `highlight`, `note`, `ink`, `text`, `signature`, `redaction`.

## Text and places

`pageText`, `readText`, `searchPdf`, `linksOf`, `outlineOf`, `setRecognized`.

## Signatures and versions

`signPdf`, `checkSignatures`, `comparePdfs`.

## PDF.js

`usePdfWorker`, `usePdfAssets`, `readerOf`, `readerFor`.

What cannot be done is said with a `PdfError` and its `code`: `encrypted`, `invalid`, `empty`, `not-found`, `incremental`, `certificate`.
