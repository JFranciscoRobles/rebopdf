// A PDF made smaller as it is saved: its pictures no bigger than its pages
// show them at the resolution asked, those of photographs (JPEG) written
// again at the quality asked, the others kept as they were (made smaller
// without losing anything else); and what it has twice (a picture, a font)
// kept once. Each is changed only when that makes it smaller.

import { PDFArray, PDFDict, type PDFDocument, PDFName, PDFNumber, type PDFObject, PDFRawStream, PDFRef, PDFStream } from '@cantoo/pdf-lib';

export interface OptimizeOptions {
  /** How many dots to the inch the pictures are kept at, at the size of the page: 150 when left out. */
  dpi?: number;
  /** The quality of photographs written again, from 0 to 1: 0.75 when left out. */
  quality?: number;
}

/** What was made smaller. */
export interface Optimized {
  pictures: number;
  duplicates: number;
}

interface Canvas {
  canvas: unknown;
  context: CanvasRenderingContext2D;
}

/** Canvases, and pictures read, in Node (@napi-rs/canvas, as PDF.js draws with there) or in a browser. */
async function canvases(): Promise<{ create(w: number, h: number): Canvas; read(jpeg: Uint8Array): Promise<CanvasImageSource & { width: number; height: number }> } | undefined> {
  if (typeof document === 'undefined' && typeof process !== 'undefined' && process.versions?.node) {
    try {
      const { createRequire } = process.getBuiltinModule('module');
      const require = createRequire(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'));
      const napi = require('@napi-rs/canvas') as {
        createCanvas(w: number, h: number): { getContext(kind: '2d'): CanvasRenderingContext2D };
        loadImage(bytes: Uint8Array): Promise<CanvasImageSource & { width: number; height: number }>;
      };
      return {
        create: (w, h) => {
          const canvas = napi.createCanvas(w, h);
          return { canvas, context: canvas.getContext('2d') };
        },
        read: (jpeg) => napi.loadImage(jpeg),
      };
    } catch {
      return undefined;
    }
  }
  if (typeof createImageBitmap === 'undefined') return undefined;
  return {
    create: (w, h) => {
      const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
      return { canvas, context: canvas.getContext('2d') as CanvasRenderingContext2D };
    },
    read: (jpeg) => createImageBitmap(new Blob([jpeg as BlobPart], { type: 'image/jpeg' })),
  };
}

/** A canvas as a JPEG of a quality. */
async function jpegOf(canvas: unknown, quality: number): Promise<Uint8Array> {
  const c = canvas as {
    toBuffer?: (mime: string, quality: number) => Uint8Array;
    convertToBlob?: (options: { type: string; quality: number }) => Promise<Blob>;
    toBlob?: (done: (blob: Blob | null) => void, type: string, quality: number) => void;
  };
  if (c.toBuffer) return new Uint8Array(c.toBuffer('image/jpeg', Math.round(quality * 100)));
  if (c.convertToBlob) return new Uint8Array(await (await c.convertToBlob({ type: 'image/jpeg', quality })).arrayBuffer());
  const blob = await new Promise<Blob | null>((done) => c.toBlob!(done, 'image/jpeg', quality));
  return new Uint8Array(await blob!.arrayBuffer());
}

async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer());
}
async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
}

/** Pixels of so many channels made smaller, each the mean of those it covers. */
function shrink(pixels: Uint8Array, w: number, h: number, channels: number, nw: number, nh: number): Uint8Array {
  const out = new Uint8Array(nw * nh * channels);
  for (let y = 0; y < nh; y++) {
    const y0 = Math.floor((y * h) / nh);
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * h) / nh));
    for (let x = 0; x < nw; x++) {
      const x0 = Math.floor((x * w) / nw);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * w) / nw));
      for (let c = 0; c < channels; c++) {
        let sum = 0;
        for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) sum += pixels[(yy * w + xx) * channels + c];
        out[(y * nw + x) * channels + c] = Math.round(sum / ((y1 - y0) * (x1 - x0)));
      }
    }
  }
  return out;
}

const name = (dict: PDFDict, key: string) => {
  const value = dict.lookup(PDFName.of(key));
  return value instanceof PDFName ? value.decodeText() : undefined;
};
const number = (dict: PDFDict, key: string) => {
  const value = dict.lookup(PDFName.of(key));
  return value instanceof PDFNumber ? value.asNumber() : undefined;
};

/** How many channels a colour space of a picture has, when it is one this changes: gray, RGB, or a profile of them. */
function channelsOf(doc: PDFDocument, dict: PDFDict): 1 | 3 | undefined {
  const space = dict.lookup(PDFName.of('ColorSpace'));
  if (space instanceof PDFName) return space.decodeText() === 'DeviceRGB' ? 3 : space.decodeText() === 'DeviceGray' ? 1 : undefined;
  if (space instanceof PDFArray && space.lookup(0) === PDFName.of('ICCBased')) {
    const profile = doc.context.lookup(space.get(1));
    const n = profile instanceof PDFStream ? number(profile.dict, 'N') : undefined;
    return n === 3 ? 3 : n === 1 ? 1 : undefined;
  }
  return undefined;
}

/** Makes the pictures of a document smaller, and keeps once what it has twice. */
export async function optimizeDocument(doc: PDFDocument, options: OptimizeOptions = {}): Promise<Optimized> {
  const dpi = options.dpi ?? 150;
  const quality = options.quality ?? 0.75;
  const { context } = doc;
  // The most a picture needs: the side of the biggest page, at the resolution asked.
  const most = Math.ceil((Math.max(...doc.getPages().map((p) => Math.max(p.getWidth(), p.getHeight())), 1) / 72) * dpi);
  const kit = await canvases();
  let pictures = 0;

  for (const [ref, object] of context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFRawStream) || name(object.dict, 'Subtype') !== 'Image') continue;
    const dict = object.dict;
    const w = number(dict, 'Width') ?? 0;
    const h = number(dict, 'Height') ?? 0;
    const scale = Math.min(1, most / Math.max(w, h, 1));
    if (scale >= 0.95 || dict.has(PDFName.of('ImageMask')) || dict.has(PDFName.of('Decode')) || dict.has(PDFName.of('Mask'))) continue;
    const filter = dict.lookup(PDFName.of('Filter'));
    const filters = filter instanceof PDFName ? [filter.decodeText()] : filter instanceof PDFArray ? filter.asArray().map((f) => (f instanceof PDFName ? f.decodeText() : '')) : [];
    const channels = channelsOf(doc, dict);
    if (!channels || number(dict, 'BitsPerComponent') !== 8) continue;
    const nw = Math.max(1, Math.round(w * scale));
    const nh = Math.max(1, Math.round(h * scale));
    try {
      let contents: Uint8Array | undefined;
      let entries: Record<string, unknown> = {};
      if (filters.length === 1 && filters[0] === 'DCTDecode' && kit) {
        // A photograph: drawn smaller, and written again as a JPEG.
        const image = await kit.read(object.getContents());
        const { canvas, context: c } = kit.create(nw, nh);
        c.drawImage(image, 0, 0, nw, nh);
        contents = await jpegOf(canvas, quality);
        entries = { Filter: PDFName.of('DCTDecode'), ColorSpace: PDFName.of('DeviceRGB') };
      } else if ((filters.length === 0 || (filters.length === 1 && filters[0] === 'FlateDecode')) && !dict.has(PDFName.of('DecodeParms'))) {
        // Pixels as they are: made smaller, and kept without losing more.
        const raw = filters.length ? await inflate(object.getContents()) : object.getContents();
        if (raw.length < w * h * channels) continue;
        contents = await deflate(shrink(raw, w, h, channels, nw, nh));
        entries = { Filter: PDFName.of('FlateDecode') };
      }
      if (!contents || contents.length >= object.getContents().length) continue;
      const next = PDFRawStream.of(dict.clone(context), contents);
      for (const [key, value] of Object.entries({ ...entries, Width: PDFNumber.of(nw), Height: PDFNumber.of(nh), Length: PDFNumber.of(contents.length) }))
        next.dict.set(PDFName.of(key), value as PDFObject);
      if (entries.Filter === PDFName.of('DCTDecode')) next.dict.delete(PDFName.of('DecodeParms'));
      // Its mask, the same size or not, stays as it is: readers draw it at the size of the picture.
      context.assign(ref, next);
      pictures++;
    } catch {
      // A picture not read: left as it was.
    }
  }
  return { pictures, duplicates: dedupe(doc) };
}

/** Keeps once the streams a document has twice, byte for byte, and points at the one kept what pointed at the others. */
function dedupe(doc: PDFDocument): number {
  const { context } = doc;
  const seen = new Map<string, PDFRef>();
  const same = new Map<string, PDFRef>();
  for (const [ref, object] of context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFRawStream) || object.getContents().length < 256) continue;
    const contents = object.getContents();
    let hash = 2166136261;
    for (let i = 0; i < contents.length; i += Math.max(1, Math.floor(contents.length / 4096))) hash = Math.imul(hash ^ contents[i], 16777619);
    const key = `${String(object.dict)}|${contents.length}|${hash >>> 0}`;
    const first = seen.get(key);
    const firstObject = first && context.lookup(first);
    if (first && firstObject instanceof PDFRawStream && equal(firstObject.getContents(), contents)) same.set(String(ref), first);
    else seen.set(key, ref);
  }
  if (!same.size) return 0;
  const swap = (o: PDFObject): PDFObject | undefined => (o instanceof PDFRef ? same.get(String(o)) : undefined);
  const visit = (o: PDFObject | undefined): void => {
    if (o instanceof PDFDict)
      for (const [key, value] of o.entries()) {
        const to = swap(value);
        if (to) o.set(key, to);
        else visit(value);
      }
    else if (o instanceof PDFArray)
      for (let i = 0; i < o.size(); i++) {
        const to = swap(o.get(i));
        if (to) o.set(i, to);
        else visit(o.get(i));
      }
    else if (o instanceof PDFStream) visit(o.dict);
  };
  for (const [, object] of context.enumerateIndirectObjects()) visit(object);
  for (const value of Object.values(context.trailerInfo)) if (value instanceof PDFDict || value instanceof PDFArray) visit(value);
  for (const ref of same.keys()) context.delete(PDFRef.of(Number(ref.split(' ')[0]), Number(ref.split(' ')[1])));
  return same.size;
}

function equal(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
