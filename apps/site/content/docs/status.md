# Status and roadmap

Version 0.2. Every package written and tested: unit tests in Node, and the editor driven in Chrome as a person would, with an accessibility check in light and dark, on a desktop and on a phone. Tried on PDFs of the world: the forms of the IRS, papers, scans, 300 pages.

## Checked

- Digital signatures checked by pyHanko as intact and valid, a first one and one after it.
- What is blacked out is nowhere in the bytes of the file saved.
- A page taken out is gone from the file.

## Missing, or not yet as it should be

- Signatures: no time stamps or long-term validation (PAdES LTV); the authorities of certificates are not checked. Changes after a signature on a form whose widgets are apart from its fields are classed by pyHanko as other changes, not as form filling.
- Text in Arabic and the scripts of India is not shaped.
- The annotations a PDF comes with, but highlights, notes and ink, are shown and not changed.
- Rooms are kept in memory; in a room, pages are not turned, moved or deleted.
- OCR: a big title beside a dark band of a scan may not be read.
