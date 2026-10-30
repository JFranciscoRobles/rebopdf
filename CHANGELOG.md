# Changelog

Every package of ReboPDF is released at the same version. Before 1.0, a
minor version (0.x.0) may change the API; such changes are listed under
**Changed** with what to do about them.

## 0.2.0 — unreleased

The first version to go to npm: 0.1.0 never went, and what it has is here.

### Added

- **Blacking out, for good** (`kind: 'redaction'` marks, the Black out
  tool, R, and Black out on the bar over a selection; `redact_text` and
  `redact_area` of the MCP server). When the PDF is saved, what is under
  the boxes is taken out of the file, not only covered: a page with boxes is
  drawn by PDF.js as a picture with what its fields hold, the boxes are
  burnt into it, and the picture is all the page is; its text out of the
  boxes is put back over it unseen, to be found and selected; its links out
  of them stay. Marks over a box go with it, the fields of the page are part
  of its picture, and the tagged structure of the PDF, which keeps its text
  apart from its pages, goes. Before it is saved, what is blacked out is not
  found any more. Once saved, the editor shows the PDF saved.
- **Saving by adding to the file** (`incremental` of `savePdf`): the bytes
  of the file stay as they came and the changes go after them, as signing
  needs, so a digital signature it carries still holds. Done by itself for
  a signed PDF ('auto'), always when asked (true), and never for pages of
  more than one PDF or anything blacked out, which `whyNotIncremental` says.
  The signatures of a PDF are read (`pdf.signatures`: who, when, why); the
  editor says a PDF is signed when it is opened, and whether its signature
  still holds when it is saved; so does the MCP server.
- The annotations a PDF comes with are taken as marks without writing its
  bytes again: PDF.js draws it from bytes without them (`pdf.drawn`), and
  they are taken off its pages when it is saved (`pdf.taken`).

- **Forms made here** (`addField`, `updateField`, `removeField`; the tool
  of fields, F): text fields, checkboxes, lists of choices and signature
  fields drawn on the pages, named, required, of one line or several,
  moved and resized by their boxes, and put in the form of the PDF when it
  is saved. **Found by themselves** (`detectFields`, Find the fields): a
  line of underscores to write on is a text field, a box drawn with a
  letter (☐) a checkbox, each named by the words beside it.
- **Signature fields** (`kind: 'signature'`): one not signed shows Sign
  here, which puts the signature of the person in its box; the fields of
  the kind a PDF comes with are read too.
- The viewer drew the pages from the bytes a PDF came with, its
  annotations taken as marks drawn twice: it draws them from those without.

- **Digital signatures** (`signPdf`, Sign digitally…, `sign_digitally` of
  the MCP server): a PDF signed with a certificate of the person, a .p12 or
  .pfx, or a .cer and its .key with the password of the key, as Mexico's
  e.firma comes; as a PKCS #7 signature, detached, SHA-256, as Acrobat and
  every reader of signatures checks them. In a signature field of the PDF,
  seen in its box with who signed and when, or not seen. Added after the
  file, so that the signatures it had still hold: checked against pyHanko,
  both a first signature and one after it, made after the PDF was filled,
  are intact and valid. The certificate never leaves the browser.
- **Signatures checked** (`checkSignatures`, `check_signatures`): whether
  what each signed is as it was signed (its digest, and its signature by
  the key of its certificate), who signed and when, who gave the
  certificate, and whether the file was added to after. The editor says it
  when a signed PDF is opened. Who to trust is a reader's to say: the
  authorities that gave the certificates are not checked.
- Saved by adding to the file, only what changed is written: the fields
  that hold what they held, and what the file says of itself, stay as they
  were.

### Fixed

- A signature field, and a button, were taken out of the form when the PDF
  was saved: only the fields the engine fills are now.

## 0.1.0 — never published

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
- **The highlights, notes and ink a PDF comes with are marks**, from
  Acrobat, Preview or any reader: changed, moved, coloured and deleted as
  those put on here, by whom and when as the PDF says, and saved again as
  annotations. Those of other kinds, and those in a thread of replies, stay
  as they are; `openPdf(bytes, { marks: false })` leaves all as they are.
- **Links and the table of contents**: the links of a page lead where they
  lead (an address of the web opens apart; a place of the PDF is gone to,
  at its height), and a PDF with an outline has it in a tab beside the
  pages, its sections opened and closed. Both follow the pages as they are
  moved, joined and taken out (`linksOf`, `outlineOf`). The sample
  agreement has both.
- **Marks copied, pasted and duplicated** (⌘C, ⌘V, ⌘D, and Duplicate in
  their menu), and a text or a signature put **on every page** at once:
  initials, a stamp.
- **The zoom toward the pointer**: ⌘ and the wheel, or two fingers, keep
  still the place under them.
- **Scanned PDFs**: a page with no text is said to be maybe a picture, to
  the assistant; nothing is found in it, and it is marked and signed as
  any other.
- **Blank pages** (`insertBlankPage`, and a button over the thumbnails), as
  big as the page before them.
- **Printing**, the PDF as it is now.
- **Marks put with the keyboard**: with a note, a text or the signature as
  the tool, Enter puts it in the middle of the view.
- **On a phone**: the tools float at the foot of the pages, the bar fits the
  screen, two fingers zoom, and the thumbnails go once a page is chosen.
- **The packages ready for npm**: each built to a `dist/` of its own by
  `tools/package.mjs`, and `npm run release` publishes them in order.
