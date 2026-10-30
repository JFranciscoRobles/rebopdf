// The API of @rebopdf/core: a PDF opened, changed and saved, its text read
// and searched. It runs in the browser and in Node alike.

export {
  addMark,
  extractPages,
  fieldsOn,
  findField,
  insertPdf,
  markId,
  marksOn,
  movePages,
  pageAt,
  pageById,
  pageNumber,
  pageSize,
  removeMark,
  removePages,
  rotatePages,
  setField,
  updateMark,
} from './edit';
export { type OpenOptions, openPdf } from './open';
export { type PdfJsDocument, pdfjs, readerOf, usePdfAssets, usePdfWorker } from './pdfjs';
export { samplePdf, samplePdfBytes } from './sample';
export { boundsOf, markBounds, NOTE_SIZE, type SaveOptions, savePdf } from './save';
export { type Match, type PageText, pageText, readText, rectsOf, searchPdf, type TextRun } from './text';
export type { Color, Field, FieldKind, HighlightMark, InkMark, Mark, MarkKind, MarkPatch, NewMark, NoteMark, Page, Pdf, Point, Rect, SignatureMark, TextMark } from './types';
export { PdfError } from './types';
