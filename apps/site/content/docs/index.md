# What is ReboPDF

ReboPDF puts PDFs in your app: read them, search them, fill and make their forms, highlight, note, draw and write on them, sign them (with a picture of a signature, or digitally with a certificate), black out what is private for good, turn, move, delete and join their pages, compare two versions, read the text of scans, and work on one with other people at once. What is done is saved as a PDF any reader opens.

It runs in the browser: the PDF is never sent anywhere. The engine runs in Node too, for a server that fills, signs or blacks out PDFs, and an MCP server lets AI assistants do all of it.

## What it is made of

| Package | What it is |
| --- | --- |
| `@rebopdf/core` | The engine, with no DOM: a PDF opened, changed, signed, compared and saved, its text read and searched. |
| `@rebopdf/viewer` | The viewer: pages, thumbnails, contents, links, search, forms to fill. |
| `@rebopdf/editor` | The editor: the viewer with tools, pages, files, history, signatures, comparing. |
| `@rebopdf/react` | `PdfViewer`, `PdfEditor`, `usePdf`. |
| `@rebopdf/collab` | Several people on one PDF at once. |
| `@rebopdf/ocr` | The text of scanned pages, with Tesseract. |
| `@rebopdf/mcp` | 29 tools for AI assistants. |

## How it reads and writes PDFs

[PDF.js](https://mozilla.github.io/pdf.js/), Mozilla's reader, draws the pages and reads their text; [pdf-lib](https://github.com/cantoo-scribe/pdf-lib) writes the file. What ReboPDF adds is the rest: the model of what is done to a PDF, the appearance of every annotation, signing and checking signatures, blacking out, the interface, collaboration and the assistants.

It is a sibling of [Rebodocs](https://rebodocs.com), Rebosheets, ReboSlides, ReboFiles, Rebomail and ReboNotes, in the same look.
