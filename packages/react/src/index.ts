// The API of @rebopdf/react: the viewer and the editor as components, a PDF
// opened as a hook, and what of the engine is used with them.

export {
  extractPages,
  insertPdf,
  openPdf,
  type Pdf,
  PdfError,
  readText,
  samplePdf,
  savePdf,
  searchPdf,
  setField,
  setPdfAssets,
  setPdfWorker,
  usePdfAssets,
  usePdfWorker,
} from '@rebopdf/core';
export type { Editor, EditorOptions, Tool } from '@rebopdf/editor';
export type { Viewer, ViewerOptions, Zoom } from '@rebopdf/viewer';
export { PdfEditor, type PdfEditorProps, type PdfFile, PdfViewer, type PdfViewerProps, usePdf } from './components';
