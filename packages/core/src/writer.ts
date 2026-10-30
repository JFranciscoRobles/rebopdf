// The bytes of a PDF, written by ReboPDF from the objects pdf-lib holds: the
// whole file, its objects packed in streams in a time that grows as they do
// (pdf-lib packs them in one that grows with their square); or what changed
// in a file, added after it as it was, for what was signed in it to hold.

import { PDFArray, PDFDict, type PDFDocument, type PDFForm, PDFHexString, PDFInvalidObject, PDFName, PDFNumber, type PDFObject, PDFRawStream, PDFRef, PDFStream, PDFString } from '@cantoo/pdf-lib';

/** How many objects go in each stream they are packed in. */
const PACKED = 100;
/** How many objects are written before the page is let answer. */
const AT_ONCE = 1500;

/** Where each object is: at an offset of the file (1), or in a stream of objects, at an index (2); free (0). */
type Entry = [0 | 1 | 2, number, number];

const ascii = (text: string) => {
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
  return bytes;
};
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Bytes put one after the other, and how many there are. */
class Bytes {
  private parts: Uint8Array[] = [];
  length = 0;
  constructor(readonly start = 0) {}
  get offset() {
    return this.start + this.length;
  }
  bytes(bytes: Uint8Array) {
    this.parts.push(bytes);
    this.length += bytes.length;
  }
  text(text: string) {
    this.bytes(ascii(text));
  }
  object(object: PDFObject) {
    const bytes = new Uint8Array(object.sizeInBytes());
    object.copyBytesInto(bytes, 0);
    this.bytes(bytes);
  }
  join(): Uint8Array {
    const all = new Uint8Array(this.length);
    let at = 0;
    for (const part of this.parts) {
      all.set(part, at);
      at += part.length;
    }
    return all;
  }
}

async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** What pdf-lib read of a file and no longer is: the streams its objects and their places came packed in. */
function stale(object: PDFObject): boolean {
  if (!(object instanceof PDFRawStream)) return false;
  const type = object.dict.get(PDFName.of('Type'));
  return type === PDFName.of('ObjStm') || type === PDFName.of('XRef');
}

function indirect(out: Bytes, entries: Map<number, Entry>, ref: PDFRef, object: PDFObject) {
  entries.set(ref.objectNumber, [1, out.offset, ref.generationNumber]);
  out.text(`${ref.objectNumber} ${ref.generationNumber} obj\n`);
  out.object(object);
  out.text('\nendobj\n');
}

/** What the trailer of the file says of it: its catalog, its information, its identity, how it is encrypted. */
function trailerOf(doc: PDFDocument): string {
  const { Root, Info, ID, Encrypt } = doc.context.trailerInfo;
  const text = (object: unknown) => (object ? String(object) : '');
  return `${Root ? `/Root ${text(Root)}` : ''}${Info ? `/Info ${text(Info)}` : ''}${ID ? `/ID ${text(ID)}` : ''}${Encrypt ? `/Encrypt ${text(Encrypt)}` : ''}`;
}

type Encrypt = (bytes: Uint8Array) => Uint8Array;

/** How the objects of a document protected by a password are encrypted, each by its number: undefined when it is not. */
function cipherOf(doc: PDFDocument): { of(ref: PDFRef): Encrypt; skip: string } | undefined {
  const security = (doc.context as unknown as { security?: { getEncryptFn(n: number, g: number): Encrypt } }).security;
  const ref = doc.context.trailerInfo.Encrypt;
  if (!security || !(ref instanceof PDFRef)) return undefined;
  return { of: (r) => security.getEncryptFn(r.objectNumber, r.generationNumber), skip: String(ref) };
}

const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

/**
 * An object as it is written encrypted: its strings and, a stream, its bytes,
 * by the key of its number (pdf-lib encrypts the streams alone, and readers
 * read its strings as encrypted).
 */
function encrypted(doc: PDFDocument, object: PDFObject, encrypt: Encrypt): PDFObject {
  const { context } = doc;
  const strings = (o: PDFObject): PDFObject => {
    if (o instanceof PDFString || o instanceof PDFHexString) return PDFHexString.of(hex(encrypt(o.asBytes())));
    if (o instanceof PDFArray) {
      const out = PDFArray.withContext(context);
      for (let i = 0; i < o.size(); i++) out.push(strings(o.get(i)));
      return out;
    }
    if (o instanceof PDFDict) {
      const out = context.obj({}) as unknown as PDFDict;
      for (const [key, value] of o.entries()) out.set(key, strings(value));
      return out;
    }
    return o;
  };
  if (object instanceof PDFStream) {
    const contents = encrypt(object.getContents());
    const dict = strings(object.dict) as PDFDict;
    dict.set(PDFName.of('Length'), PDFNumber.of(contents.length));
    return PDFRawStream.of(dict, contents);
  }
  return strings(object);
}

/** The places of the objects as a stream: a row of 7 bytes each, from object `first` on. */
async function xrefStream(out: Bytes, entries: Map<number, Entry>, number: number, extra: string, index?: [number, number][]) {
  entries.set(number, [1, out.offset, 0]);
  const rows = index ?? [[0, number + 1]];
  const count = rows.reduce((sum, [, n]) => sum + n, 0);
  const table = new Uint8Array(count * 7);
  let at = 0;
  for (const [first, n] of rows) {
    for (let i = first; i < first + n; i++, at += 7) {
      const [type, field, generation] = entries.get(i) ?? (i === 0 ? [0, 0, 65535] : [0, 0, 0]);
      table[at] = type;
      table[at + 1] = (field >>> 24) & 0xff;
      table[at + 2] = (field >>> 16) & 0xff;
      table[at + 3] = (field >>> 8) & 0xff;
      table[at + 4] = field & 0xff;
      table[at + 5] = (generation >>> 8) & 0xff;
      table[at + 6] = generation & 0xff;
    }
  }
  const data = await deflate(table);
  let size = 0;
  for (const key of entries.keys()) size = Math.max(size, key + 1);
  const start = out.offset;
  const indexed = index ? `/Index [${index.flat().join(' ')}]` : '';
  out.text(`${number} 0 obj\n<</Type /XRef /Size ${size} /W [1 4 2]${indexed}${extra} /Filter /FlateDecode /Length ${data.length}>>\nstream\n`);
  out.bytes(data);
  out.text(`\nendstream\nendobj\nstartxref\n${start}\n%%EOF\n`);
}

/** The places of the objects as a table, and the trailer after it. */
function xrefTable(out: Bytes, entries: Map<number, Entry>, size: number, extra: string, index: [number, number][]) {
  const start = out.offset;
  let text = 'xref\n';
  for (const [first, count] of index) {
    text += `${first} ${count}\n`;
    for (let i = first; i < first + count; i++) {
      const [type, offset, generation] = entries.get(i) ?? (i === 0 ? [0, 0, 65535] : [0, 0, 0]);
      text += `${String(offset).padStart(10, '0')} ${String(generation).padStart(5, '0')} ${type ? 'n' : 'f'}\r\n`;
    }
  }
  out.text(`${text}trailer\n<</Size ${size}${extra}>>\nstartxref\n${start}\n%%EOF\n`);
}

/** Runs of numbers one after the other: [first, how many]. */
function runs(numbers: number[]): [number, number][] {
  const sorted = [...numbers].sort((a, b) => a - b);
  const list: [number, number][] = [];
  for (const n of sorted) {
    const last = list.at(-1);
    if (last && last[0] + last[1] === n) last[1]++;
    else list.push([n, 1]);
  }
  return list;
}

/** What pdf-lib does to a document before it is written: what it embeds, embedded, and the fields it changed drawn. */
async function prepare(doc: PDFDocument, whole: boolean) {
  if (whole) {
    if (!doc.getPageCount()) doc.addPage();
    (doc as unknown as { formCache: { getValue(): PDFForm | undefined } }).formCache.getValue()?.updateFieldAppearances();
  }
  await doc.flush();
}

/**
 * The bytes of a whole document: the streams, and what has a generation of
 * its own, each as an object of the file; the others packed a hundred to a
 * stream; where each is, in a stream at the end.
 */
export async function writeDocument(doc: PDFDocument): Promise<Uint8Array> {
  await prepare(doc, true);
  const { context } = doc;
  const out = new Bytes();
  const [major, minor] = context.header.getVersionString().split('.').map(Number);
  out.text(`%PDF-${major > 1 || minor >= 5 ? `${major}.${minor}` : '1.7'}\n%`);
  out.bytes(new Uint8Array([0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));

  const entries = new Map<number, Entry>();
  const packed: [PDFRef, PDFObject][] = [];
  const cipher = cipherOf(doc);
  let n = 0;
  for (const [ref, object] of context.enumerateIndirectObjects()) {
    if (stale(object)) continue;
    // What says how the file is encrypted is not. Encrypted, nothing is packed: pdf-lib reads strings packed as encrypted each, as they are not.
    const own = cipher && String(ref) === cipher.skip;
    if (cipher || object instanceof PDFStream || ref.generationNumber !== 0 || !(object instanceof PDFDict || object instanceof PDFArray))
      indirect(out, entries, ref, cipher && !own && !(object instanceof PDFInvalidObject) ? encrypted(doc, object, cipher.of(ref)) : object);
    else packed.push([ref, object]);
    if (++n % AT_ONCE === 0) await tick();
  }
  let next = context.largestObjectNumber + 1;
  for (let i = 0; i < packed.length; i += PACKED) {
    const chunk = packed.slice(i, i + PACKED);
    const body = new Bytes();
    const head: string[] = [];
    chunk.forEach(([ref, object], index) => {
      head.push(`${ref.objectNumber} ${body.length}`);
      body.object(object);
      body.text('\n');
      entries.set(ref.objectNumber, [2, next, index]);
    });
    const first = ascii(`${head.join(' ')}\n`);
    const all = new Bytes();
    all.bytes(first);
    all.bytes(body.join());
    const data = await deflate(all.join());
    entries.set(next, [1, out.offset, 0]);
    out.text(`${next} 0 obj\n<</Type /ObjStm /N ${chunk.length} /First ${first.length} /Filter /FlateDecode /Length ${data.length}>>\nstream\n`);
    out.bytes(data);
    out.text('\nendstream\nendobj\n');
    next++;
  }
  // Encrypted, the places of the objects go in a table, as pdf-lib reads the trailer of an encrypted file.
  if (cipher) xrefTable(out, entries, next, trailerOf(doc), [[0, next]]);
  else await xrefStream(out, entries, next, trailerOf(doc));
  return out.join();
}

/**
 * The file a document was read from, and after it what changed in it: each
 * object changed or added, as an object of the file (as readers of
 * signatures read what was added, object by object), and where they are, in
 * a table as the file has its own, or a stream when it has one.
 */
export async function writeIncrement(doc: PDFDocument): Promise<Uint8Array> {
  await prepare(doc, false);
  const { context } = doc;
  const { originalBytes: original, prevStartXRef: previous } = (context as unknown as { pdfFileDetails: { originalBytes?: Uint8Array; prevStartXRef: number } }).pdfFileDetails;
  const snapshot = (context as unknown as { snapshot?: { shouldSave(n: number): boolean; deleted: PDFRef[] } }).snapshot;
  if (!original || !snapshot) throw new Error('The document was not read to be added to.');

  const out = new Bytes(original.length);
  out.text('\n');
  const entries = new Map<number, Entry>();
  let n = 0;
  for (const [ref, object] of context.enumerateIndirectObjects()) {
    if (!snapshot.shouldSave(ref.objectNumber) || stale(object)) continue;
    indirect(out, entries, ref, object);
    if (++n % AT_ONCE === 0) await tick();
  }
  for (const ref of snapshot.deleted) entries.set(ref.objectNumber, [0, 0, ref.generationNumber + 1]);

  const extra = `${trailerOf(doc)} /Prev ${previous}`;
  let at = previous;
  while (at < original.length && /\s/.test(String.fromCharCode(original[at]))) at++;
  const table = String.fromCharCode(...original.subarray(at, at + 4)) === 'xref';

  if (!table) {
    const number = context.largestObjectNumber + 1;
    await xrefStream(out, entries, number, extra, runs([...entries.keys(), number]));
  } else xrefTable(out, entries, context.largestObjectNumber + 1, extra, runs([...entries.keys()]));
  const all = new Uint8Array(original.length + out.length);
  all.set(original);
  all.set(out.join(), original.length);
  return all;
}
