// The text of pictures of pages recognized, with Tesseract: a scanned page
// drawn by PDF.js, read, and its words put on the page of the Pdf where they
// are seen, to be found, selected and blacked out as its text is, and
// written unseen over it when the PDF is saved. In the browser and in Node;
// the data of each language is fetched the first time it is needed (from
// `langPath`, or the CDN Tesseract uses), and kept.

import { type Pdf, pageText, png, readerFor, setRecognized, type Word } from '@rebopdf/core';
import type { Worker } from 'tesseract.js';

export interface RecognizeOptions {
  /** The pages to read, by id: those with no text of their own, when left out. */
  pages?: string[];
  /** The languages of the text, as Tesseract names them: English and Spanish when left out. */
  languages?: string[];
  /** How many pixels a point is read at: 2, 144 to the inch, as big as Tesseract reads text best from the body of a page to its titles. */
  scale?: number;
  /** Where the data of the languages is fetched from, and, in Node, kept. */
  langPath?: string;
  cachePath?: string;
  /** Told how many pages are read of how many, as they are. */
  onProgress?: (done: number, total: number) => void;
  /** Whether a page scanned askew is straightened before it is read: true unless false. */
  deskew?: boolean;
}

/**
 * How many degrees the lines of a picture lean, between -6 and 6: the angle
 * at which its rows of ink are most apart (their projection the sharpest),
 * measured on its dark points; 0 when it is less than a third of a degree.
 */
export function skewOf(context: CanvasRenderingContext2D, width: number, height: number): number {
  const { data } = context.getImageData(0, 0, width, height);
  const step = Math.max(1, Math.round(Math.max(width, height) / 1200));
  const xs: number[] = [];
  const ys: number[] = [];
  for (let y = 0; y < height; y += step)
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4;
      if (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2] < 140) {
        xs.push(x);
        ys.push(y);
      }
    }
  if (xs.length < 200) return 0;
  const bins = new Float64Array(Math.ceil((width + height) / step) * 2 + 4);
  const offset = bins.length / 2;
  const score = (degrees: number) => {
    const a = (degrees * Math.PI) / 180;
    const sin = Math.sin(a);
    const cos = Math.cos(a);
    bins.fill(0);
    for (let k = 0; k < xs.length; k++) bins[Math.round((ys[k] * cos - xs[k] * sin) / step + offset)]++;
    let sum = 0;
    for (const n of bins) sum += n * n;
    return sum;
  };
  let best = 0;
  let most = score(0);
  for (let d = -6; d <= 6; d += 0.5) {
    const s = score(d);
    if (s > most) [best, most] = [d, s];
  }
  for (let d = best - 0.5; d <= best + 0.5; d += 0.1) {
    const s = score(d);
    if (s > most) [best, most] = [d, s];
  }
  return Math.abs(best) < 0.3 ? 0 : Math.round(best * 10) / 10;
}

/** A moment for the page to answer between the steps done in it. */
const breathe = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Whether a page has text of its own: a page of a scan has none, or a few letters. */
async function hasText(pdf: Pdf, id: string) {
  const own = { ...pdf, recognized: undefined };
  return (await pageText(own, id)).text.replace(/\s/g, '').length > 20;
}

interface Found {
  text: string;
  /** The line it was read in, from the top. */
  line: number;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

/** The words Tesseract reads in a picture, in the picture of the page it is a strip of, from `top`. */
async function read(worker: Worker, canvas: unknown, top: number): Promise<Found[]> {
  const picture = await png(canvas);
  const image = typeof Blob !== 'undefined' && typeof document !== 'undefined' ? new Blob([picture as BlobPart], { type: 'image/png' }) : picture;
  const { data } = await worker.recognize(image as never, {}, { blocks: true });
  const words: Found[] = [];
  let n = 0;
  for (const block of data.blocks ?? [])
    for (const paragraph of block.paragraphs)
      for (const line of paragraph.lines) {
        // Where the line is, to put it in its order among the others: its middle, from the top.
        const at = (line.bbox.y0 + line.bbox.y1) / 2 + top;
        for (const { text, confidence, bbox } of line.words) {
          if (!text.trim() || confidence < 30) continue;
          words.push({ text, confidence, line: at * 1000 + n, bbox: { x0: bbox.x0, y0: bbox.y0 + top, x1: bbox.x1, y1: bbox.y1 + top } });
        }
        n++;
      }
  return words;
}

/**
 * The strips of the page, top to bottom, with something drawn in them and no
 * word read: rows with ink close together, the bars and rules across the page
 * (more ink than any line of text has) left out.
 */
function unread(context: CanvasRenderingContext2D, width: number, height: number, found: Found[], scale: number) {
  const { data } = context.getImageData(0, 0, width, height);
  const strips: { top: number; bottom: number }[] = [];
  let strip: { top: number; bottom: number } | undefined;
  for (let y = 0; y < height; y++) {
    let ink = 0;
    for (let x = 0, i = y * width * 4; x < width; x++, i += 4) if (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2] < 200) ink++;
    if (!ink || ink > width / 2) continue;
    if (strip && y - strip.bottom <= 4 * scale) strip.bottom = y + 1;
    else strips.push((strip = { top: y, bottom: y + 1 }));
  }
  return strips.filter((s) => s.bottom - s.top >= 6 * scale && !found.some(({ bbox }) => bbox.y1 > s.top && bbox.y0 < s.bottom));
}

/** Reads the text of pictures of pages, and gives the Pdf with the words found on them. */
export async function recognizeText(pdf: Pdf, options: RecognizeOptions = {}): Promise<Pdf> {
  const scale = options.scale ?? 2;
  const ids: string[] = [];
  for (const id of options.pages ?? pdf.pages.map((p) => p.id)) if (options.pages || !(await hasText(pdf, id))) ids.push(id);
  if (!ids.length) return pdf;
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker(options.languages ?? ['eng', 'spa'], 1, {
    ...(options.langPath ? { langPath: options.langPath } : {}),
    ...(options.cachePath ? { cachePath: options.cachePath } : {}),
  });
  let next = pdf;
  try {
    for (const [n, id] of ids.entries()) {
      const page = pdf.pages.find((p) => p.id === id)!;
      const reader = await readerFor(pdf, page.source);
      const proxy = await reader.getPage(page.index + 1);
      // As the page lies before it is turned: the words are put in its own space.
      const viewport = proxy.getViewport({ scale, rotation: 0 });
      const factory = (reader as unknown as { canvasFactory: { create(w: number, h: number): { canvas: unknown; context: CanvasRenderingContext2D } } }).canvasFactory;
      const { canvas, context } = factory.create(Math.ceil(viewport.width), Math.ceil(viewport.height));
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, viewport.width, viewport.height);
      await proxy.render({ canvas: canvas as HTMLCanvasElement, viewport }).promise;
      const width = Math.ceil(viewport.width);
      const height = Math.ceil(viewport.height);
      // Tesseract reads in a worker of its own; what is done here, between its steps, lets the page answer.
      await breathe();
      // Scanned askew, straightened: the picture turned about its middle, and the words turned back after.
      const lean = options.deskew === false ? 0 : skewOf(context, width, height);
      let picture = { canvas, context };
      if (lean) {
        picture = factory.create(width, height);
        picture.context.fillStyle = '#ffffff';
        picture.context.fillRect(0, 0, width, height);
        picture.context.translate(width / 2, height / 2);
        picture.context.rotate((-lean * Math.PI) / 180);
        picture.context.drawImage(canvas as CanvasImageSource, -width / 2, -height / 2);
        picture.context.setTransform(1, 0, 0, 1, 0, 0);
      }
      const back = (x: number, y: number) => {
        if (!lean) return { x, y };
        const a = (lean * Math.PI) / 180;
        const [dx, dy] = [x - width / 2, y - height / 2];
        return { x: width / 2 + dx * Math.cos(a) - dy * Math.sin(a), y: height / 2 + dx * Math.sin(a) + dy * Math.cos(a) };
      };
      await breathe();
      const found = await read(worker, picture.canvas, 0);
      // What the layout of the whole page leaves unread (a big title, as often as not) read again, each strip of it apart.
      for (const strip of unread(picture.context, width, height, found, scale).slice(0, 20)) {
        const pad = Math.round(6 * scale);
        const top = Math.max(0, strip.top - pad);
        const bottom = Math.min(height, strip.bottom + pad);
        const piece = factory.create(width, bottom - top);
        piece.context.fillStyle = '#ffffff';
        piece.context.fillRect(0, 0, width, bottom - top);
        piece.context.drawImage(picture.canvas as CanvasImageSource, 0, top, width, bottom - top, 0, 0, width, bottom - top);
        const more = (await read(worker, piece.canvas, top)).filter((word) => word.confidence >= 60);
        const at = found.findIndex((word) => word.bbox.y0 > strip.bottom);
        found.splice(at < 0 ? found.length : at, 0, ...more);
      }
      // The lines in their order on the straightened page, numbered from 0.
      const order = [...new Set(found.map((w) => w.line))].sort((a, b) => a - b);
      const words: Word[] = found.map(({ text, bbox, line: at }) => {
        const line = order.indexOf(at);
        // Its corners, as they are on the page scanned.
        const corners = [back(bbox.x0, bbox.y0), back(bbox.x1, bbox.y0), back(bbox.x0, bbox.y1), back(bbox.x1, bbox.y1)];
        const [x0, x1] = [Math.min(...corners.map((c) => c.x)), Math.max(...corners.map((c) => c.x))];
        const [y0, y1] = [Math.min(...corners.map((c) => c.y)), Math.max(...corners.map((c) => c.y))];
        return { text, rect: { x: page.box.x + x0 / scale, y: page.box.y + page.box.height - y1 / scale, width: (x1 - x0) / scale, height: (y1 - y0) / scale }, line };
      });
      next = setRecognized(next, id, words);
      options.onProgress?.(n + 1, ids.length);
    }
  } finally {
    await worker.terminate();
  }
  return next;
}
