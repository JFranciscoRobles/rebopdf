# Changelog

Every package of ReboPDF is released at the same version. Before 1.0, a
minor version (0.x.0) may change the API; such changes are listed under
**Changed** with what to do about them.

## 0.2.2 — 2026-10-30

### Changed

- `setPdfWorker` and `setPdfAssets` (of `@rebopdf/core`, and of
  `@rebopdf/react`) in place of `usePdfWorker` and `usePdfAssets`: named as
  React's hooks are, which they are not, the linters of hooks (Biome's
  `useHookAtTopLevel`, ESLint's `rules-of-hooks`) took them for hooks, and
  refused them called once, or in a function of the application's. The old
  names are still there, the same functions, marked deprecated: nothing
  has to change, but the name.

### Fixed

- The documentation speaks of the menu as it is now (☰, its parts), not of
  the More menu (⋯).

## 0.2.1 — 2026-10-30

### Fixed

- node-forge 1.4.2 (from 1.4.0), which `npm audit` asked for:
  [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv),
  RSA PKCS#1 v1.5 signatures checked with extra elements in their digest
  taken as good. ReboPDF never checked a signature with node-forge (it
  checks them with WebCrypto, and signs with node-forge), so no signature
  it said holds did not; an application that installs it is no longer
  told otherwise.

## 0.2.0 — 2026-10-30

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
- **Versions compared** (`comparePdfs`, `mountComparison`, Compare with
  another version…, `compare_pdfs`): word by word across the whole of each
  PDF, so text moved to another page is no change; what was taken out in
  red on the first, what was put in in green on the second, side by side,
  the changes listed and brought into view one by one, and what the fields
  of their forms hold that changed.
- **Scanned pages read** (`@rebopdf/ocr`: `recognizeText`; Recognize text
  in the editor, given `recognize`; `recognize_text` of the MCP server):
  the pages that are pictures drawn and read by Tesseract, in the browser
  and in Node, in the languages asked (English and Spanish when not), their
  words put where they are seen (`pdf.recognized`, `setRecognized`), to be
  found, selected, highlighted and blacked out as text is, and written
  unseen over the pages when the PDF is saved. A big title beside a dark
  band of a scan Tesseract may not read.
- **Working on a PDF together** (`@rebopdf/collab`: `shareEditor`,
  `joinRoom`, the room server `rebopdf-collab`, `npm run collab`): the
  marks, notes and what is filled in of each person seen by the others as
  they make them, and who is in the room and on which page. A room keeps
  the file and what was done on it, given to whoever comes in. Pages go by
  their number and fields by their name, so in a room pages are not turned,
  moved or deleted; undo takes back what was done here, not what others
  did (`subscribe`, `applyRemote`, `setPeers`, `lockPages` of the editor).
- **The site** (`npm run site`, :5301): the landing page in the look of
  the suite, with a picture of the editor in the hero and the editor live
  under it, the demo on the whole window (the editor or the viewer alone,
  shared with `?collab=`), and seventeen pages of documentation in English
  and Spanish.
- **The desktop app** (`npm run desktop`, Tauri): a window for each PDF,
  saved to its file (after its signatures, when it is signed) or to
  another; PDFs opened from the Finder or the Explorer, dropped on its icon
  or on a window (their pages put in when it has a PDF); native menus in
  Spanish and English; changes not saved asked about before a window
  closes. The editor gives `addFiles` for it.
- The thumbnails show the marks of their pages: where something is
  highlighted, noted, signed or blacked out is seen at a glance.
- The editor takes items of the application's own in its menu (`menu`),
  and says what they did (`notify`).
- Saved by adding to the file, only what changed is written: the fields
  that hold what they held, and what the file says of itself, stay as they
  were.
- **ReboPDF writes its files itself**: the whole file with its objects
  packed in streams, in a time that grows as they do (pdf-lib's grows with
  their square: big PDFs were written unpacked, a sixth bigger); and what
  changed, added after a file, in a table of places or a stream as the file
  has its own. pdf-lib still reads PDFs and holds their objects.
- **Signatures that hold in law and in time**: signatures are PAdES now
  (`format: 'pkcs7'` for the old kind); `timestamp` of `signPdf` has a
  time-stamping authority (RFC 3161) vouch for when it was signed;
  `addValidationData` puts in the file the chain of each certificate and
  whether it was revoked, as OCSP answers and CRLs ask (PAdES LT);
  `timestampPdf` time-stamps the whole file (PAdES LTA). `checkSignatures`
  says the time-stamp, the chain, whether a certificate was revoked,
  whether the file carries what checks it for years, and, given the
  authorities to trust (`trusted`), whether to trust it. It checks keys of
  RSA (PKCS #1 and PSS) and of elliptic curves with Web Crypto, as
  authorities sign with. In the editor, Sign digitally has a field for the
  authority (`signing.timestamp`) and a box to keep what checks it; in the
  MCP server, `timestamp`, `long_term` and `trusted`.
- **Rooms for real work**: kept on the disk (`store`, `--store`) and there
  again when the server starts again; three keys a room, to edit, comment
  (notes and their replies alone) or see, kept to by the server and by the
  editor (`setRole`); who did what and when (`session.history`, History of
  the room in the editor). `joinRoom` takes the `key` of the address;
  `roomAddress` makes the three.
- **Replies to notes** (`replies` of a note mark): answered from the note's
  menu, saved as annotations in reply to it as other readers show them, and
  read back with their note.
- **The text of a page, written again** (the Edit text tool, E; a text
  mark's `replaces`; `replace_text` of the MCP server): the old text taken
  out of what the page draws, glyph by glyph, by our own reading of its
  content (matrices, fonts and their widths, spacings), its room kept so
  the rest of the line stays; the new written in its place, in the family
  and weight chosen. Text marks take `family`, `bold` and `italic`.
- **Bookmarks and files carried**: `setOutline`, `addBookmark`,
  `attachFile`, `detachFile`, and `pdf.attachments` read when it is opened;
  written when it is saved, the bookmarks to the pages as they are then,
  the files as PDF/A-3 asks. Beside the pages, the viewer has a Files tab;
  the editor makes, names, moves and removes bookmarks, and attaches and
  takes off files. In the MCP server, `bookmarks` and `attachments`.
- **PDF/A** (`pdfa` of `savePdf`; Download as PDF/A in the editor; `pdfa`
  of `save_pdf`): PDF/A-2B (3B when it carries files), every font it draws
  with carried in it: those it only names taken from PDF.js's (Liberation
  Sans, and Foxit's CFF fonts, read here for their widths), nothing that
  runs, annotations printed, its identity, sRGB output intent and XMP
  metadata by pdf-lib (which our writer now keeps in step, as pdf-lib's
  did).
- **Smaller PDFs** (`optimize` of `savePdf`; Download smaller in the editor;
  `optimize` of `save_pdf`): pictures no bigger than the pages show them
  (150 dots to the inch, or `dpi`), photographs written again as JPEG at
  `quality`, the others made smaller without losing more, and streams the
  file has twice kept once. A test PDF of a photograph went from 2.8 MB to
  0.6 MB; a book of 36 MB to 20 MB.
- **Protected by a password** (`protect` of `savePdf`; Download with a
  password… in the editor; `password` of `save_pdf`): encrypted with
  AES-256, with what may be done with it opened (printed, copied, changed).
  Its strings are encrypted with its streams, which pdf-lib left out.
- Recognizing text straightens a page scanned askew first (`deskew`, by
  the projection of its rows of ink), puts the words back where they are on
  the page as scanned, and keeps the lines as they were read (`line` of a
  word). The editor asks the languages of the pages, among fifteen.
- Recognizing text reads again, each on its own, the strips of a page with
  ink and no word read: a big title the layout of the whole page leaves
  out, as under a dark band, is read.
- **The menu and the bar at the foot, as Rebodocs has them**: the first
  button of the bar opens the menu, a screen of its own with its parts
  down one side (Document, Export, Sign, Tools, Appearance), in place of
  the More menu. The page in view, how the pages fit, the zoom and full
  screen are chips that float at the foot of the pages (`statusBar` of the
  viewer, shown unless false); the bar over them keeps the title, the
  tools, search, the pages and Download. The appearance (as the system,
  light or dark) is chosen in the menu, and so is the language: the
  editor speaks English or Spanish at once (`setLocale`, `onLocale`,
  `languages: false` to leave it out), the PDF, its history and the page
  in view kept; the viewer alone, when given `setLocale`. The panel of
  the pages, the contents and the files is wider, its thumbnails bigger.
- **The contents, made better**: each section with its page, the one
  being read marked (`aria-current="location"`) and kept in sight as the
  pages scroll, titles across the panel on up to two lines. One stop of
  Tab, then the arrows, Home and End, right and left to open and close.
  In the editor, what is done to a bookmark is one button and its menu,
  in place of six; F2, Delete and Alt with the arrows do it from the
  keyboard, which stays on the bookmark moved. What does not apply is
  offered disabled, and is not done.
- **Accessible as a page**: the viewer says its language on its root
  (`lang`), the menu keeps the keyboard and screen readers in it while it
  is open (what is under it is inert), and the playground keeps the
  language of the page and the name of the PDF in its title.
- **Two signatures, told apart**: the tool of the bar is Handwritten
  signature (S), a picture put on the page; the part of the menu is
  Digital signature, with its own icon, and says what each proves. It
  offers both: Sign digitally… and the handwritten one.

### Fixed

- A mark dragged went with the pointer only its first move: the marks are
  drawn again as it moves, and the one that held the pointer was let go.
  The page holds it now, for moving and for the corner that makes it
  bigger, and the marks are drawn once a frame. A mark over a field of the
  form is taken by the pointer there, not the field under it; a finger on
  a signature, a text or a note drags it, not the pages.

- A form filled after it was signed is classified as form filling by
  readers of signatures (pyHanko), not as any other change: the fields
  ReboPDF makes are one object with their widget, and a note put on a page
  no longer changes what the page draws.
- A menu closed as soon as it opened kept closing every pop-up opened
  after it on its first click: Sign digitally, among others, did nothing.
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
