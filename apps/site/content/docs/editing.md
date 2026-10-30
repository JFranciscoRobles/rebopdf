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

⋯ opens a PDF, adds the pages of another, prints, downloads (or flattened: fields and marks drawn into the pages), signs digitally, compares with another version, and reads the text of scanned pages when the editor is given `recognize`.

## Undo

⌘Z and ⇧⌘Z go through every change, what was typed in fields included.

## Protected by a password

Download with a password… (in the menu ⋯) encrypts the PDF with AES-256: it opens only with the password, and what it does not allow (printing, copying its text, changing it) readers do not offer. In code:

```ts
const bytes = await savePdf(pdf, { protect: { password: 'abre', permissions: { copying: false } } });
```

`ownerPassword` opens it for everything; left out, no one may do more than the password lets. A PDF protected by a password opens in ReboPDF asking for it.

## Smaller

Download smaller (in the menu ⋯) makes the PDF smaller: its pictures no bigger than its pages show them, at 150 dots to the inch; photographs written again as JPEG; and a picture or a font it has twice kept once. Each is changed only when that makes it smaller. In code, `savePdf(pdf, { optimize: { dpi: 150, quality: 0.75 } })`.

## PDF/A

Download as PDF/A (in the menu ⋯) makes a PDF/A-2B, as archives and many offices ask documents to be kept: every font it draws with carried in it (those it only names taken from the ones PDF.js carries, made to measure as the standard ones: Liberation Sans for Helvetica and Arial, Foxit's for Times, Courier, Symbol and ZapfDingbats), nothing that runs, its colours and its metadata as PDF/A says. In code, `savePdf(pdf, { pdfa: true })` (or `'3B'`; it is 3B by itself when the PDF carries files). In a browser, the fonts are fetched from the folder given to `usePdfAssets`.

To be sure an archive takes it, check it with [veraPDF](https://verapdf.org/).
