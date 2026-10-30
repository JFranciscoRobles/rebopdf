# Changelog

Every package of ReboPDF is released at the same version. Before 1.0, a
minor version (0.x.0) may change the API; such changes are listed under
**Changed** with what to do about them.

## Unreleased

### Added

- **The engine** (`@rebopdf/core`): a PDF opened as its pages, its form
  fields and its marks, without writing into the file until it is saved;
  pages turned, deleted, moved, joined from other PDFs and taken out as a
  PDF of their own; fields filled (text, checkboxes, radio buttons, choices,
  lists), taking only what each can hold; highlights, notes, ink, text and
  signatures put on, changed and taken off (immutable); the text read and
  searched without minding capitals or accents, across the end of a line,
  with the boxes it takes; and the PDF saved with pdf-lib: the form a form
  still, highlights, notes and ink as annotations with their appearance
  drawn, text and signatures drawn into the pages, or all of it flattened. A
  page taken out is gone from the bytes of the file, with what only it used.
  PDF.js reads the text; in a worker of its own with `usePdfWorker`, with
  its fonts and maps of characters with `usePdfAssets`. A sample service
  agreement of two pages with a form, in English and Spanish (`samplePdf`).
- **The viewer** (`@rebopdf/viewer`): `mountViewer`, the pages drawn as they
  come near the view, at the sharpness of the screen, with their text over
  them to select; thumbnails; the page in view and a box to go to one; zoom
  (automatic, to the width, to the page, 25% to 400%, ⌘ and the wheel,
  ⌘+ ⌘− ⌘0) keeping the place; search (⌘F) with every place shown; the
  fields of the form as controls of the page; the marks of the engine over
  the pages, turned with them; download. In the look of the Rebo suite, in
  red (#b42318), light and dark, English and Spanish; its classes under
  `rp-`.
- **The editor** (`@rebopdf/editor`): `mountEditor`, the viewer with tools
  to select and fill, highlight the text selected (or from a bar over a
  selection), put notes, draw, write text and sign (drawn, typed, or a
  picture), in six colours; a mark chosen to drag, move by the arrows,
  resize by its corner, colour, change and delete; the thumbnails chosen
  with a click (Shift and ⌘ for more) to turn, delete and take out as a PDF,
  moved by dragging or by Alt and the arrows; PDFs opened, and their pages
  put in by dropping them on the editor or from the menu, asking for a
  password when one is needed; one history for every change; Save (with
  `onSave`) or Download, and Download flattened. With no PDF, it asks for
  one.
- **React** (`@rebopdf/react`): `PdfViewer`, `PdfEditor`, and `usePdf` to
  open a PDF from its bytes, a File or an address.
- **Assistants** (`@rebopdf/mcp`): an MCP server with 20 tools to open,
  read, search, fill, highlight, note, write on, sign, turn, delete, move,
  join, take out, undo and save PDF files, kept to the folders it is given
  with `--root`, and writing a copy unless it is told the file.
- **The playground**, on port 5300: the sample agreement in the editor,
  `?viewer`, `?empty`, `?lang=es`.
- **Tried on PDFs of the world**: the forms of the IRS (1040: 199 fields,
  and an XFA form beside them, taken out so that what is filled is what
  every reader shows), a paper of fifteen pages, the Bitcoin paper, and one of
  300 pages and 37 MB, which opens in about a second, draws any page in less
  than one, finds a word in all of them in a second and a half, and is
  saved in two and a half: pdf-lib reads and writes fifteen hundred objects
  at a time, and a PDF of more than four thousand is written without its
  objects packed in streams, which pdf-lib packs in a time that grows with
  the square of their number.
- **Fields called what the PDF calls them** (their tooltip, `/TU`), for
  screen readers, the hint over them and the MCP server.
- **Text in any script** with a font given (`font`, of `savePdf`, the
  viewer, the editor, and `--font` of the MCP server), put in the PDF with
  the letters used alone, by `@cantoo/fontkit`.
- **PDFs with a password**: asked for it (again, when it is not the one),
  opened, drawn and saved, to be opened after with none; those protected
  only from being changed, as many are, open with no password, as every
  reader opens them.
- **Links and the table of contents**: the links of a page lead where they
  lead (an address of the web opens apart; a place of the PDF is gone to,
  at its height), and a PDF with an outline has it in a tab beside the
  pages, its sections opened and closed. Both follow the pages as they are
  moved, joined and taken out (`linksOf`, `outlineOf`). The sample
  agreement has both.
- **Blank pages** (`insertBlankPage`, and a button over the thumbnails), as
  big as the page before them.
- **Printing**, the PDF as it is now.
- **Marks put with the keyboard**: with a note, a text or the signature as
  the tool, Enter puts it in the middle of the view.
- **On a phone**: the tools float at the foot of the pages, the bar fits the
  screen, two fingers zoom, and the thumbnails go once a page is chosen.
- **The packages ready for npm**: each built to a `dist/` of its own by
  `tools/package.mjs`, and `npm run release` publishes them in order.
