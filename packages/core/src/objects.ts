// What is in a PDF file as pdf-lib holds it: its objects, and those of them
// nothing reaches any more.

import { PDFArray, PDFDict, type PDFDocument, PDFObject, PDFRef, PDFStream } from '@cantoo/pdf-lib';

/** How many objects pdf-lib reads or writes before it lets the page answer. */
export const OBJECTS_AT_ONCE = 1500;

/** How many objects a PDF has at most to be written with them packed in streams. */
const PACKED_AT_MOST = 4000;

/**
 * The bytes of a document. Objects packed in streams make a smaller file, but
 * pdf-lib packs them in a time that grows with the square of how many there
 * are: a big PDF is written without them, a hundred times faster and a sixth
 * bigger.
 */
export function writeDocument(doc: PDFDocument): Promise<Uint8Array> {
  const many = doc.context.enumerateIndirectObjects().length > PACKED_AT_MOST;
  return doc.save({ objectsPerTick: OBJECTS_AT_ONCE, useObjectStreams: !many });
}

/**
 * Takes out of the file what nothing in it reaches any more: the pages taken
 * out, which would otherwise still be in its bytes, and what only they used.
 * What pointed at a page taken out (a link, a bookmark) points at nothing,
 * which readers take as nothing.
 */
export function dropUnreachable(doc: PDFDocument, gone: Set<string> = new Set()) {
  const { context } = doc;
  const seen = new Set<string>();
  const stack: PDFObject[] = Object.values(context.trailerInfo).filter((value): value is PDFObject => value instanceof PDFObject);
  while (stack.length) {
    const object = stack.pop()!;
    if (object instanceof PDFRef) {
      const key = object.toString();
      if (seen.has(key) || gone.has(key)) continue;
      seen.add(key);
      const value = context.lookup(object);
      if (value) stack.push(value);
    } else if (object instanceof PDFDict) {
      for (const [, value] of object.entries()) stack.push(value);
    } else if (object instanceof PDFArray) {
      for (let i = 0; i < object.size(); i++) stack.push(object.get(i));
    } else if (object instanceof PDFStream) {
      stack.push(object.dict);
    }
  }
  for (const [ref] of context.enumerateIndirectObjects()) if (!seen.has(ref.toString())) context.delete(ref);
}
