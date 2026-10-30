// PDF.js, which reads the text of a PDF and draws its pages, loaded once and
// when it is first needed. In the browser it works in the page itself unless
// it is given a worker of its own (`usePdfWorker`), which keeps the page
// answering while a big file is read; in Node it works in the process.

type PdfJs = typeof import('pdfjs-dist/legacy/build/pdf.mjs');
export type PdfJsDocument = Awaited<ReturnType<PdfJs['getDocument']>['promise']>;

let loading: Promise<PdfJs> | undefined;
let worker: string | Worker | undefined;
let assets: string | undefined;

/**
 * Where PDF.js finds the fonts a PDF names without carrying them, and the
 * maps of characters of Chinese, Japanese and Korean text: the address of a
 * copy of the `pdfjs-dist` folder the application serves (with its
 * `standard_fonts/` and `cmaps/`), as "/pdfjs/". Without it, those fonts are
 * taken from the system, and such text may not be drawn.
 */
export function usePdfAssets(base: string): void {
  assets = base.endsWith('/') ? base : `${base}/`;
}

/**
 * Has PDF.js read files in a worker of its own: the address of
 * `pdfjs-dist/legacy/build/pdf.worker.min.mjs` as the application serves it
 * (with Vite, `import url from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'`),
 * or the worker made from it. Called before the first PDF is opened.
 */
export function usePdfWorker(src: string | Worker): void {
  worker = src;
}

export function pdfjs(): Promise<PdfJs> {
  loading ??= (async () => {
    const lib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const options = lib.GlobalWorkerOptions;
    if (typeof worker === 'string') options.workerSrc = worker;
    else if (worker) options.workerPort = worker;
    else if (typeof document !== 'undefined' && !options.workerSrc && !options.workerPort) {
      // No worker: its code is run in the page, as PDF.js does when it is put there.
      const global = globalThis as { pdfjsWorker?: unknown };
      // biome-ignore lint/suspicious/noTsIgnore: the code of PDF.js's worker has no types of its own, and the packages that use this one compile it without a declaration of them.
      // @ts-ignore
      global.pdfjsWorker ??= await import('pdfjs-dist/legacy/build/pdf.worker.mjs');
    }
    return lib;
  })();
  return loading;
}

const opened = new WeakMap<Uint8Array, Promise<PdfJsDocument>>();

/** The file as PDF.js has it, read once for every Pdf that shares it. */
export function readerOf(bytes: Uint8Array): Promise<PdfJsDocument> {
  let reading = opened.get(bytes);
  if (!reading) {
    // PDF.js takes the bytes it is given away to its worker: it is given a copy.
    reading = pdfjs().then(
      (lib) => lib.getDocument({ data: bytes.slice(), verbosity: 0, ...(assets ? { cMapUrl: `${assets}cmaps/`, cMapPacked: true, standardFontDataUrl: `${assets}standard_fonts/` } : {}) }).promise,
    );
    opened.set(bytes, reading);
  }
  return reading;
}
