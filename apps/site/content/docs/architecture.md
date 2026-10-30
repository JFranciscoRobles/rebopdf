# How it works

A `Pdf` is the files it was opened from, its pages in their order, its fields with what they hold, and what was put on it (marks). Every change makes a new `Pdf`; the files are shared between them, so the history of the editor is a list of `Pdf`s.

Nothing is written into the files until the PDF is saved. Then pdf-lib writes on the first file: its pages put in their order (those of other files copied in), its form filled, each mark written (highlights, notes and ink as annotations with their appearance drawn; text and signatures into the page), pages with boxes drawn as pictures, and what nothing reaches any more taken out. A signed PDF is written by adding to its file.

PDF.js draws the pages (from bytes without the annotations taken as marks, which the viewer draws), reads their text, their links and their outline. The viewer lays over each page its text to select, its links, the marks, the fields as controls of the page, and what was found.
