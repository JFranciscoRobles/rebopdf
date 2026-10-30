// What is in a PDF file as pdf-lib holds it: its objects, and those of them
// nothing reaches any more.

import { PDFArray, PDFDict, type PDFDocument, PDFObject, PDFRef, PDFStream } from '@cantoo/pdf-lib';

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
