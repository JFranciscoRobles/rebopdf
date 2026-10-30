// The API of @rebopdf/core: a PDF opened, changed and saved, its text read
// and searched. It runs in the browser and in Node alike.

export { type ChangePlace, type Comparison, comparePdfs, type FieldChange, type TextChange } from './compare';
export { detectFields } from './detect';
export {
  addField,
  addMark,
  extractPages,
  fieldsOn,
  findField,
  insertBlankPage,
  insertPdf,
  markId,
  marksOn,
  movePages,
  pageAt,
  pageById,
  pageNumber,
  pageSize,
  type NewField,
  removeField,
  removeMark,
  removePages,
  rotatePages,
  setField,
  setRecognized,
  updateField,
  updateMark,
} from './edit';
export { linksOf, type OutlineItem, outlineOf, type PageLink, type Place } from './links';
export { type OpenOptions, openPdf } from './open';
export { freshReaderOf, type PdfJsDocument, pdfjs, readerFor, readerOf, setPdfAssets, setPdfWorker, usePdfAssets, usePdfWorker } from './pdfjs';
export { samplePdf, samplePdfBytes } from './sample';
export { boundsOf, markBounds, NOTE_SIZE, type SaveOptions, savePdf, savesIncrementally, whyNotIncremental } from './save';
export { overlaps } from './geometry';
export { png, REDACTED_SCALE, Redactor } from './redact';
export type { OptimizeOptions } from './optimize';
export { addBookmark, attachFile, detachFile, setOutline } from './outline';
export type { PdfALevel } from './pdfa';
export type { Permissions } from './save';
export { addValidationData, type CheckOptions, checkSignatures, type Revocation, type SignatureCheck, type SignOptions, signPdf, type TimestampAuthority, timestampPdf } from './sign';
export { authorityAt } from './cms';
export { type Match, type PageText, pageText, readText, rectsOf, searchPdf, type TextRun } from './text';
export type {
  Attachment,
  Color,
  Field,
  FieldKind,
  HighlightMark,
  InkMark,
  Mark,
  MarkKind,
  MarkPatch,
  NewMark,
  NoteMark,
  Page,
  Pdf,
  Point,
  Rect,
  RedactionMark,
  Reply,
  Signature,
  SignatureMark,
  TextMark,
  Word,
} from './types';
export { PdfError } from './types';
