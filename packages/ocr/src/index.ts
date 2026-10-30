// The text of pictures of pages recognized, with Tesseract: a scanned page
// drawn by PDF.js, read, and its words put on the page of the Pdf where they
// are seen, to be found, selected and blacked out as its text is, and
// written unseen over it when the PDF is saved. In the browser and in Node;
// the data of each language is fetched the first time it is needed (from
// `langPath`, or the CDN Tesseract uses), and kept.

import { type Pdf, pageText, png, readerFor, setRecognized, type Word } from '@rebopdf/core';

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
}

/** Whether a page has text of its own: a page of a scan has none, or a few letters. */
async function hasText(pdf: Pdf, id: string) {
  const own = { ...pdf, recognized: undefined };
  return (await pageText(own, id)).text.replace(/\s/g, '').length > 20;
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
      const picture = await png(canvas);
      const image = typeof Blob !== 'undefined' && typeof document !== 'undefined' ? new Blob([picture as BlobPart], { type: 'image/png' }) : picture;
      const { data } = await worker.recognize(image as never, {}, { blocks: true });
      const words: Word[] = [];
      for (const block of data.blocks ?? []) {
        for (const paragraph of block.paragraphs) {
          for (const line of paragraph.lines) {
            for (const word of line.words) {
              if (!word.text.trim() || word.confidence < 30) continue;
              const { x0, y0, x1, y1 } = word.bbox;
              words.push({
                text: word.text,
                rect: { x: page.box.x + x0 / scale, y: page.box.y + page.box.height - y1 / scale, width: (x1 - x0) / scale, height: (y1 - y0) / scale },
              });
            }
          }
        }
      }
      next = setRecognized(next, id, words);
      options.onProgress?.(n + 1, ids.length);
    }
  } finally {
    await worker.terminate();
  }
  return next;
}
