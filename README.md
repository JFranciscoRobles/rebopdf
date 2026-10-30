# ReboPDF

PDFs in the browser and in your application, in the look of the Rebo suite
(light and dark): read them, search them, fill their forms, highlight, note,
draw and write on them, sign them, and turn, delete, move, join and take out
their pages. What is done is saved as a PDF any reader opens: the form stays
a form, highlights and notes stay annotations, and a page taken out is gone
from the file, not only from its list of pages. The interface is in English
and Spanish.

It is the PDFs of the Rebo suite, beside [Rebodocs](https://rebodocs.com),
Rebosheets, ReboSlides, ReboFiles, Rebomail and ReboNotes. It is early:
version 0.2.

## Quick start

```sh
npm install @rebopdf/editor    # or @rebopdf/viewer, or @rebopdf/react
```

```ts
import { openPdf } from '@rebopdf/core';
import { mountEditor } from '@rebopdf/editor';

const bytes = new Uint8Array(await (await fetch('/contract.pdf')).arrayBuffer());
const editor = mountEditor(document.querySelector('#pdf')!, {
  pdf: await openPdf(bytes, { name: 'contract.pdf' }),
  locale: 'en',
  author: 'Ana',
  onSave: (bytes) => upload(bytes), // without it, the button downloads the PDF
});
```

```tsx
import { PdfEditor, usePdf } from '@rebopdf/react';

function Contract() {
  const { pdf } = usePdf('/contract.pdf');
  return pdf ? <PdfEditor pdf={pdf} onSave={(bytes) => upload(bytes)} style={{ height: 720 }} /> : null;
}
```

```ts
// A server: fill a form and save it
import { openPdf, savePdf, setField } from '@rebopdf/core';

let pdf = await openPdf(await readFile('form.pdf'));
pdf = setField(pdf, 'client.name', 'Ana García');
pdf = setField(pdf, 'accept', true);
await writeFile('filled.pdf', await savePdf(pdf)); // or { flatten: true }
```

## What it does

- **Read:** the pages drawn as they come near the view, thumbnails at the side, the page in view and a box to go to one, zoom (to the width, to the page, or 25% to 400%; ⌘ and the wheel), and the text over each page to select and copy.
- **Links and contents:** the links of the pages lead where they lead, and the table of contents of a book or a paper is a tab beside the pages.
- **Search:** without minding capitals or accents ("accion" finds "Acción"), across the end of a line, every place shown, the next and the one before with Enter and Shift+Enter.
- **Forms:** text, checkboxes, radio buttons, choices and lists, filled in the page and saved as a form; and made: fields drawn on the pages (text, checkboxes, choices, signature fields), or found by themselves in a PDF with lines to write on and boxes to tick.
- **Marks:** highlights of the text selected (with a comment), notes, drawing by hand, text written on the page (to fill a form with no fields), and signatures, drawn, typed or a picture. Each chosen to move by dragging or by the arrows, to colour, to change and to delete.
- **Comments made elsewhere:** the highlights, notes and drawings a PDF comes with (from Acrobat, Preview or any reader) are changed and deleted as those made here.
- **Pages:** turned, deleted, moved by dragging their thumbnails or by Alt and the arrows, taken out as a PDF of their own, blank ones put in, and the pages of other PDFs put in by dropping them on the editor.
- **Any script:** text is written in Helvetica, with Latin letters; given a font (`font: bytesOfATtf`), in any script it has letters for, the letters used alone put in the PDF.
- **Big PDFs:** 300 pages and 37 MB open in about a second and are saved in two and a half; the pages are drawn as they come near the view.
- **A phone:** the tools at the foot of the pages, two fingers to zoom.
- **The keyboard:** every tool by a key, Enter to put a note, a text or a signature in the middle of the view, the thumbnails moved by Alt and the arrows.
- **One history:** ⌘Z and ⇧⌘Z through every change, fields typed in included.
- **Blacking out, for good:** boxes drawn, or text selected, are blacked out when the PDF is saved, and what was under them (text, pictures, what fields hold) is taken out of the file, not only covered. Pages with boxes are saved as pictures with the boxes burnt in, their other text kept unseen over them, to be found and selected.
- **Together:** several people on one PDF at once (`@rebopdf/collab`), their marks, notes and what they fill in seen by the others as they make them, and who is on which page.
- **Scanned pages:** their text recognized with Tesseract (`@rebopdf/ocr`), then found, selected and blacked out as any text, and saved unseen over the pages.
- **Versions compared:** another version of the PDF side by side, what was taken out in red and what was put in in green, word by word, and what its form holds that changed.
- **Digital signatures:** a PDF signed with your certificate (a .p12 or .pfx, or a .cer and its .key, as e.firma comes), in a signature field or not seen, as Acrobat checks signatures; and the signatures of a PDF checked: intact, by whom, and whether it was added to after. The certificate stays in the browser.
- **Signed PDFs:** what is changed in a PDF with a digital signature is added after its bytes as they came, so the signature still holds; the editor says who signed, and whether the signature still holds once saved.
- **Saving:** a PDF any reader opens, or flattened, with the fields and the marks drawn into the pages for good.

## Packages

| Package | What it is |
| --- | --- |
| `@rebopdf/core` | The engine, with no DOM, in the browser and in Node: a PDF opened as its pages, its fields and its marks; what is done to it (immutable); its text read and searched; the PDF saved. On [PDF.js](https://mozilla.github.io/pdf.js/) to read and [pdf-lib](https://github.com/cantoo-scribe/pdf-lib) to write. |
| `@rebopdf/viewer` | The viewer, with no framework: the pages, thumbnails, zoom, search, the text to select, and the fields and marks over them. |
| `@rebopdf/editor` | The editor, with no framework: the viewer with tools, the thumbnails to act on, files opened and dropped, the history and saving. |
| `@rebopdf/ocr` | The text of scanned pages recognized with [Tesseract](https://tesseract.projectnaptha.com/), for the engine, the editor and the MCP server. |
| `@rebopdf/collab` | A PDF worked on by several people at once: the room server (`rebopdf-collab`) and its client (`shareEditor`, `joinRoom`). |
| `@rebopdf/react` | `PdfViewer`, `PdfEditor` and `usePdf`. |
| `@rebopdf/mcp` | An MCP server (`rebopdf-mcp`) so that Claude and other assistants read, search, fill, mark, sign and put in order PDF files. |
| `@rebopdf/playground` | Where everything is tried: `npm run dev` · :5300 |
| `apps/site` | The landing page, the live editor, the demo and the documentation, in English and Spanish: `npm run site` · :5301 |

## PDF.js, in a worker of its own

PDF.js reads files in the page itself unless it is given a worker, which
keeps the page answering while a big file is read. With Vite:

```ts
import { usePdfWorker, usePdfAssets } from '@rebopdf/core';
import worker from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

usePdfWorker(worker);
// Fonts a PDF names without carrying them, and the maps of Chinese, Japanese
// and Korean text: a copy of the pdfjs-dist folder the application serves.
usePdfAssets('/pdfjs/');
```

## Assistants (MCP)

```sh
claude mcp add rebopdf -- npx -y @rebopdf/mcp --root ~/Documents [--font ~/Fonts/NotoSans.ttf]
```

The assistant opens a PDF (`open_pdf`), reads it page by page (`read_pdf`),
finds text (`search_pdf`), fills its form (`list_fields`, `fill_fields`),
highlights text and puts notes and text by a text of the page
(`highlight_text`, `add_note`, `add_text`), signs it with a picture of a
signature the person gives (`sign`), blacks out text and parts of pages for
good (`redact_text`, `redact_area`), turns, deletes, moves, joins and takes
out pages, and writes it (`save_pdf`), to a copy unless it is told the file.
`--root` keeps it to those folders.

## Usage

```sh
npm install
npm run dev            # the playground: ?viewer, ?empty, ?lang=es
npm test               # the engine, the viewer, the editor, React and the MCP server
npm run test:browser   # the editor in Chrome, driven as a person would
npm run typecheck
npm run lint
```

## Shortcuts

| | |
| --- | --- |
| V · H · N · D · T · S · R · F | Select and fill · Highlight · Note · Draw · Text · Sign · Black out · Form fields |
| ⌘F | Search |
| ⌘Z · ⇧⌘Z | Undo · Redo |
| ⌘+ · ⌘− · ⌘0 | Zoom in · out · automatic (⌘ and the wheel, or two fingers: toward where they are) |
| Delete · arrows | Delete or move the mark chosen (Shift: by 10) |
| ⌘C · ⌘V · ⌘D | Copy the mark chosen, paste it on the page in view, duplicate it |
| Alt+↑ · Alt+↓ | Move the page of the thumbnail with the focus |
| Escape | Let go of the mark, then of the tool |

## License

MIT. PDF.js is Apache-2.0 and pdf-lib MIT; both are dependencies, installed
from npm.
