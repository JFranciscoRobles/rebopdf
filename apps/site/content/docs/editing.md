# Working in the editor

The bar has the tools, each with its key, and they act on the pages:

| Key | Tool | What it does |
| --- | --- | --- |
| V | Select and fill | Choose a mark to move, colour, change or delete; fill the form; select text. |
| H | Highlight | Select text: it is highlighted. |
| N | Note | Click where the note goes, write it. |
| D | Draw | Draw with the pointer, a finger or a pen. |
| T | Text | Click where it goes, write it: to fill a PDF with no fields. |
| S | Sign | Draw, type or upload your signature, then click where it goes. |
| R | Black out | Draw a box over what is to go, for good. |
| F | Form fields | Draw fields of a form, move and resize them. |

With Note, Text or Sign, Enter puts it in the middle of the view: everything can be done with the keyboard.

## Marks

A mark chosen is moved by dragging it or by the arrows (Shift: by 10), resized by its corner, given another colour, and deleted with Delete. ⌘C copies it, ⌘V puts it on the page in view, ⌘D duplicates it. A text or a signature goes on every page at once from its menu: initials on each page of a contract.

The highlights, notes and drawings a PDF comes with, from Acrobat, Preview or any reader, are marks too.

## Pages

The thumbnails at the side act on the pages chosen (a click; Shift or ⌘ for more), or on the page in view: turn them, delete them, put a blank one in, or save them as a PDF of their own. Drag them to move them, or Alt and the arrows. Drop a PDF on the editor to put its pages after the page in view.

## The menu

The menu (☰, the first button of the bar) is a screen of its own: Document opens a PDF, adds the pages of another, downloads and prints; Export downloads it flattened (fields and marks drawn into the pages), smaller, as PDF/A or with a password; Digital signature signs it with a certificate; Tools compares it with another version and reads the text of scanned pages when the editor is given `recognize`; Language and Appearance are there too. The page in view, how the pages fit, the zoom and full screen are at the foot of the pages.

## Undo

⌘Z and ⇧⌘Z go through every change, what was typed in fields included.

## Protected by a password

Download with a password… (in the menu, under Export) encrypts the PDF with AES-256: it opens only with the password, and what it does not allow (printing, copying its text, changing it) readers do not offer. In code:

```ts
const bytes = await savePdf(pdf, { protect: { password: 'abre', permissions: { copying: false } } });
```

`ownerPassword` opens it for everything; left out, no one may do more than the password lets. A PDF protected by a password opens in ReboPDF asking for it.

## Smaller

Download smaller (in the menu, under Export) makes the PDF smaller: its pictures no bigger than its pages show them, at 150 dots to the inch; photographs written again as JPEG; and a picture or a font it has twice kept once. Each is changed only when that makes it smaller. In code, `savePdf(pdf, { optimize: { dpi: 150, quality: 0.75 } })`.

## PDF/A

Download as PDF/A (in the menu, under Export) makes a PDF/A-2B, as archives and many offices ask documents to be kept: every font it draws with carried in it (those it only names taken from the ones PDF.js carries, made to measure as the standard ones: Liberation Sans for Helvetica and Arial, Foxit's for Times, Courier, Symbol and ZapfDingbats), nothing that runs, its colours and its metadata as PDF/A says. In code, `savePdf(pdf, { pdfa: true })` (or `'3B'`; it is 3B by itself when the PDF carries files). In a browser, the fonts are fetched from the folder given to `usePdfAssets`.

To be sure an archive takes it, check it with [veraPDF](https://verapdf.org/).

## Bookmarks and files carried

Beside the pages, Contents has the bookmarks of the PDF: in the editor, Add a bookmark makes one to the place in view, named at once, and each can be renamed, moved up and down, put under the one before or taken out of it, and removed. Files has the files the PDF carries, each to download: Attach a file adds some. In code:

```ts
import { setOutline, attachFile, detachFile, outlineOf } from '@rebopdf/core';

let next = setOutline(pdf, [{ title: 'Terms', to: { page: pdf.pages[1].id }, items: [] }]);
next = attachFile(next, { name: 'accounts.csv', data, mime: 'text/csv' });
```

Bookmarks lead to the pages as they are when the PDF is saved; a PDF/A that carries files is PDF/A-3.

## The text of the page, written again

Edit text (E) writes a line of the page again: click it, change what it says (and its letters, if you like), and Replace. When the PDF is saved, the old text is taken out of what the page draws, glyph by glyph, with the room it took kept so the rest of the line stays where it was: it is not covered, it is gone, and it is not found any more. The new text is written where it was, of its size. In code, a text mark with `replaces`:

```ts
addMark(pdf, { kind: 'text', page, rect, text: '1500 pesos', size: 11, color: '#000000', replaces: { rect, text: '1200 pesos' } });
```

Text drawn inside forms (XObjects) of the page, or in fonts of codes other than one or two bytes, is covered instead.
