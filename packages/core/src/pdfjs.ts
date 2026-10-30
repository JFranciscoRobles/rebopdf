// PDF.js, which reads the text of a PDF and draws its pages, loaded once and
// when it is first needed. In the browser it works in the page itself unless
// it is given a worker of its own (`setPdfWorker`), which keeps the page
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
export function setPdfAssets(base: string): void {
  assets = base.endsWith('/') ? base : `${base}/`;
}

/**
 * Has PDF.js read files in a worker of its own: the address of
 * `pdfjs-dist/legacy/build/pdf.worker.min.mjs` as the application serves it
 * (with Vite, `import url from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'`),
 * or the worker made from it. Called before the first PDF is opened.
 */
export function setPdfWorker(src: string | Worker): void {
  worker = src;
}

/** @deprecated Named as React's hooks are, which it is not, so that linters of hooks take it for one: `setPdfAssets`. */
export const usePdfAssets = setPdfAssets;
/** @deprecated Named as React's hooks are, which it is not, so that linters of hooks take it for one: `setPdfWorker`. */
export const usePdfWorker = setPdfWorker;

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

/** In Node, the folder of pdfjs-dist on the disk: its fonts and maps are read from there, with no address to give. */
function nodeAssets(): string | undefined {
  if (typeof document !== 'undefined' || typeof process === 'undefined' || !process.versions?.node) return undefined;
  try {
    const { createRequire } = process.getBuiltinModule('module');
    const { dirname, sep } = process.getBuiltinModule('path');
    return dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json')) + sep;
  } catch {
    return undefined;
  }
}

/** A font PDF.js carries (of its `standard_fonts/`), by its file: from the disk in Node, from the address given to `setPdfAssets` in a browser. */
export async function standardFont(file: string): Promise<Uint8Array | undefined> {
  const local = nodeAssets();
  if (local) {
    try {
      const { readFileSync } = process.getBuiltinModule('fs');
      return new Uint8Array(readFileSync(`${local}standard_fonts/${file}`));
    } catch {
      return undefined;
    }
  }
  if (!assets) return undefined;
  const response = await fetch(`${assets}standard_fonts/${file}`).catch(() => undefined);
  return response?.ok ? new Uint8Array(await response.arrayBuffer()) : undefined;
}

/** What PDF.js is given to open a file: its bytes (a copy: PDF.js takes them away to its worker), and where its fonts and maps are. */
function source(bytes: Uint8Array) {
  const base = assets ?? nodeAssets();
  return { data: bytes.slice(), verbosity: 0, ...(base ? { cMapUrl: `${base}cmaps/`, cMapPacked: true, standardFontDataUrl: `${base}standard_fonts/` } : {}) };
}

const opened = new WeakMap<Uint8Array, Promise<PdfJsDocument>>();

/** The file as PDF.js has it, read once for every Pdf that shares it. */
export function readerOf(bytes: Uint8Array): Promise<PdfJsDocument> {
  let reading = opened.get(bytes);
  if (!reading) {
    reading = pdfjs().then((lib) => lib.getDocument(source(bytes)).promise);
    opened.set(bytes, reading);
  }
  return reading;
}

/** A file read by PDF.js for once, apart from the one every Pdf shares: to be drawn with values of its own, and let go. */
export async function freshReaderOf(bytes: Uint8Array): Promise<PdfJsDocument> {
  return (await pdfjs()).getDocument(source(bytes)).promise;
}

/** The file of a Pdf as PDF.js draws it: without the annotations taken as marks. */
export function readerFor(pdf: { sources: Record<string, Uint8Array>; drawn?: Record<string, Uint8Array> }, source: string): Promise<PdfJsDocument> {
  return readerOf(pdf.drawn?.[source] ?? pdf.sources[source]);
}
