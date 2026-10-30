# API del motor

Todo lo de `@rebopdf/core` crea un `Pdf` nuevo; los archivos de los que se abrió nunca cambian.

## Abrir y guardar

- `openPdf(bytes, { name, password, marks })` — `marks: false` deja como están las anotaciones que trae.
- `savePdf(pdf, { flatten, font, incremental })`, `savesIncrementally(pdf)`, `whyNotIncremental(pdf)`.
- `samplePdf(locale)`, `samplePdfBytes(locale)`.

## Páginas

`rotatePages`, `removePages`, `movePages`, `insertPdf`, `insertBlankPage`, `extractPages`, `pageById`, `pageNumber`, `pageSize`.

## Formularios

`setField`, `findField`, `addField`, `updateField`, `removeField`, `detectFields`.

## Marcas

`addMark`, `updateMark`, `removeMark`, `marksOn`, `markBounds`. Tipos: `highlight`, `note`, `ink`, `text`, `signature`, `redaction`.

## Texto y lugares

`pageText`, `readText`, `searchPdf`, `linksOf`, `outlineOf`, `setRecognized`.

## Firmas y versiones

`signPdf`, `checkSignatures`, `comparePdfs`.

## PDF.js

`setPdfWorker`, `setPdfAssets`, `readerOf`, `readerFor`.

Lo que no se puede hacer se avisa con un `PdfError` y su `code`: `encrypted`, `invalid`, `empty`, `not-found`, `incremental`, `certificate`.
