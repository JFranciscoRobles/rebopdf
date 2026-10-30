// What is blacked out, taken out of the file for good. A page with boxes to
// black out is drawn by PDF.js as a picture (its text, pictures, drawings,
// annotations and what its fields hold), the boxes are painted over the
// picture, and the picture is all the page is then: what was under them is
// nowhere in the file. The text out of the boxes is put back over it,
// unseen, so that the page is found and selected as it was. The links out of
// the boxes stay; everything else of the page goes with what it was drawn
// from.

import {
  beginText,
  endText,
  type PDFDocument,
  type PDFFont,
  PDFName,
  type PDFOperator,
  type PDFPage,
  popGraphicsState,
  pushGraphicsState,
  setCharacterSqueeze,
  setFontAndSize,
  setTextMatrix,
  setTextRenderingMode,
  showText,
  TextRenderingMode,
} from '@cantoo/pdf-lib';
import { outside, overlaps } from './geometry';
import { freshReaderOf, pdfjs, type PdfJsDocument } from './pdfjs';
import type { Field, Page, Rect, Word } from './types';

/** Pixels a point of a page is drawn as: twice as sharp as the screen at 100%, 144 to the inch. */
export const REDACTED_SCALE = 2;

/** What a canvas PDF.js draws on gives as a PNG, in Node (@napi-rs/canvas) or in a browser. */
export async function png(canvas: unknown): Promise<Uint8Array> {
  const c = canvas as {
    toBuffer?: (mime: string) => Uint8Array;
    convertToBlob?: (options: { type: string }) => Promise<Blob>;
    toBlob?: (done: (blob: Blob | null) => void, type: string) => void;
  };
  if (c.toBuffer) return new Uint8Array(c.toBuffer('image/png'));
  if (c.convertToBlob) return new Uint8Array(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer());
  const blob = await new Promise<Blob | null>((done) => c.toBlob!(done, 'image/png'));
  if (!blob) throw new Error('The page could not be drawn as a picture.');
  return new Uint8Array(await blob.arrayBuffer());
}

/** A run of text to write unseen: its letters, its size, how wide it is to be, and its matrix (as a matrix of text, its size taken out). */
export interface UnseenRun {
  text: string;
  size: number;
  width: number;
  matrix: [number, number, number, number, number, number];
}

/** A run of text by its box, written as the box has it: on a line, as big as the box is tall. */
export const unseenOf = (run: { text: string; rect: Rect }): UnseenRun => {
  const size = run.rect.height / 1.16;
  return { text: run.text, size, width: run.rect.width, matrix: [1, 0, 0, 1, run.rect.x, run.rect.y + size * 0.22] };
};

/** Writes text over a page, unseen: found, selected and copied where it is, drawn nowhere. */
export function writeUnseen(out: PDFPage, runs: UnseenRun[], font: PDFFont): void {
  if (!runs.length) return;
  const key = out.node.newFontDictionary(font.name, font.ref);
  const letters = new Set(font.getCharacterSet());
  const ops: PDFOperator[] = [pushGraphicsState(), beginText(), setTextRenderingMode(TextRenderingMode.Invisible)];
  for (const run of runs) {
    const str = [...run.text].filter((ch) => letters.has(ch.codePointAt(0)!)).join('');
    if (!str.trim()) continue;
    const natural = font.widthOfTextAtSize(str, run.size);
    ops.push(setFontAndSize(key, run.size), setTextMatrix(...run.matrix), setCharacterSqueeze(natural > 0 ? (100 * run.width) / natural : 100), showText(font.encodeText(str)));
  }
  ops.push(endText(), popGraphicsState());
  out.pushOperators(...ops);
}

/** The files PDF.js draws redacted pages from, each read once for a saving and let go after. */
export class Redactor {
  private readers = new Map<Uint8Array, Promise<PdfJsDocument>>();

  constructor(private doc: PDFDocument) {}

  private reader(bytes: Uint8Array) {
    let reading = this.readers.get(bytes);
    if (!reading) {
      reading = freshReaderOf(bytes);
      this.readers.set(bytes, reading);
    }
    return reading;
  }

  /**
   * Makes a page a picture of itself with the boxes blacked out, and its text
   * out of them unseen over it. `bytes` are those PDF.js draws the page from,
   * `fields` the fields of its file, whose values are drawn into the picture.
   */
  async redact(out: PDFPage, page: Page, bytes: Uint8Array, boxes: Rect[], fields: Field[], font: () => Promise<PDFFont>, recognized: Word[] = []): Promise<void> {
    const lib = await pdfjs();
    const reader = await this.reader(bytes);
    const proxy = await reader.getPage(page.index + 1);
    // As the page is before it is turned: it keeps its turn, the picture is put in it as it lies.
    const viewport = proxy.getViewport({ scale: REDACTED_SCALE, rotation: 0 });
    const { box } = page;

    // What the fields of the page hold, drawn as they hold it now.
    const storage = reader.annotationStorage;
    const annotations = await proxy.getAnnotations({ intent: 'display' });
    for (const a of annotations) {
      if (a.subtype !== 'Widget' || !a.fieldName) continue;
      const field = fields.find((f) => f.name === a.fieldName);
      if (!field) continue;
      const [x1, y1] = a.rect as number[];
      const widget = field.widgets.find((w) => Math.abs(w.rect.x - Math.min(x1, a.rect[2])) < 1 && Math.abs(w.rect.y - Math.min(y1, a.rect[3])) < 1);
      const value = field.kind === 'radio' ? field.value === widget?.option : field.value;
      storage.setValue(a.id, { value });
    }

    const factory = (reader as unknown as { canvasFactory: { create(w: number, h: number): { canvas: unknown; context: CanvasRenderingContext2D } } }).canvasFactory;
    const { canvas, context } = factory.create(Math.ceil(viewport.width), Math.ceil(viewport.height));
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, viewport.width, viewport.height);
    await proxy.render({ canvas: canvas as HTMLCanvasElement, viewport, annotationMode: lib.AnnotationMode.ENABLE_STORAGE }).promise;
    // The boxes, painted over: what was under them is no more than black pixels.
    context.fillStyle = '#000000';
    for (const r of boxes) {
      const [ax, ay] = viewport.convertToViewportPoint(r.x, r.y);
      const [bx, by] = viewport.convertToViewportPoint(r.x + r.width, r.y + r.height);
      const x = Math.floor(Math.min(ax, bx)) - 1;
      const y = Math.floor(Math.min(ay, by)) - 1;
      context.fillRect(x, y, Math.ceil(Math.abs(bx - ax)) + 2, Math.ceil(Math.abs(by - ay)) + 2);
    }
    const picture = await this.doc.embedPng(await png(canvas));
    const text = await proxy.getTextContent();

    // The page is the picture, and nothing it was.
    const { context: pdf } = this.doc;
    const keep = (out.node.Annots()?.asArray() ?? []).filter((ref) => {
      const dict = pdf.lookup(ref);
      if (!dict || !('get' in dict)) return false;
      const d = dict as unknown as { lookup(key: PDFName): unknown };
      const subtype = d.lookup(PDFName.of('Subtype'));
      const rect = d.lookup(PDFName.of('Rect')) as { asArray?: () => { asNumber?: () => number }[] } | undefined;
      const [x1, y1, x2, y2] = rect?.asArray?.().map((n) => n.asNumber?.() ?? 0) ?? [0, 0, 0, 0];
      const area = { x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) };
      return subtype === PDFName.of('Link') && !boxes.some((b) => overlaps(area, b));
    });
    for (const key of ['Contents', 'Resources', 'Thumb', 'StructParents', 'PieceInfo', 'Group', 'Metadata', 'Annots']) out.node.delete(PDFName.of(key));
    out.node.set(PDFName.of('Resources'), pdf.obj({ XObject: {}, Font: {}, ExtGState: {} }));
    out.node.set(PDFName.of('Contents'), pdf.obj([]));
    out.node.set(PDFName.of('Annots'), pdf.obj(keep));
    out.setMediaBox(box.x, box.y, box.width, box.height);
    out.setCropBox(box.x, box.y, box.width, box.height);
    out.drawImage(picture, { x: box.x, y: box.y, width: box.width, height: box.height });

    // The text out of the boxes, unseen over the picture: found and selected where it is seen.
    const runs: UnseenRun[] = [];
    for (const item of text.items) {
      if (!('str' in item) || !item.str.trim()) continue;
      const [a, b, c, d, e, f] = item.transform as number[];
      const size = Math.hypot(c, d) || item.height;
      if (!size) continue;
      const straight = Math.abs(b) < 0.01 && Math.abs(c) < 0.01 && a > 0;
      const runBox = { x: e, y: f - size * 0.22, width: item.width, height: size * 1.16 };
      // Text turned or slanted goes whole, or not at all when a box touches it.
      const pieces = straight ? outside(item.str, runBox, boxes) : boxes.some((r) => overlaps(runBox, r)) ? [] : [{ text: item.str, from: 0, rect: runBox }];
      for (const piece of pieces) runs.push({ text: piece.text, size, width: piece.rect.width, matrix: [a / size, b / size, c / size, d / size, straight ? piece.rect.x : e, f] });
    }
    // What was recognized in a picture of the page, out of the boxes too.
    for (const run of recognized) for (const piece of outside(run.text, run.rect, boxes)) runs.push(unseenOf(piece));
    writeUnseen(out, runs, await font());
  }

  /** Lets go of the files read. */
  async close(): Promise<void> {
    for (const reading of this.readers.values()) await (await reading).loadingTask.destroy();
    this.readers.clear();
  }
}
