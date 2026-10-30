// What is in a PDF file as pdf-lib holds it: its objects, and those of them
// nothing reaches any more.

import { PDFArray, PDFDict, type PDFDocument, type PDFField, PDFName, PDFObject, type PDFPage, PDFRef, PDFStream } from '@cantoo/pdf-lib';

/** How many objects pdf-lib reads before it lets the page answer. */
export const OBJECTS_AT_ONCE = 1500;

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

/**
 * Makes a field of one widget one object with it, as most forms have them:
 * pdf-lib makes the widget a kid of the field, and readers of signatures
 * (pyHanko) do not tell a change of such a widget, once it is filled after
 * the PDF was signed, from any other change.
 */
export function mergeWidget(doc: PDFDocument, field: PDFField): void {
  const { context } = doc;
  const dict = field.acroField.dict;
  const kids = dict.lookup(PDFName.of('Kids'));
  if (!(kids instanceof PDFArray) || kids.size() !== 1) return;
  const widgetRef = kids.get(0);
  const fieldRef = context.getObjectRef(dict);
  const widget = context.lookup(widgetRef);
  if (!(widgetRef instanceof PDFRef) || !fieldRef || !(widget instanceof PDFDict)) return;
  for (const [key, value] of widget.entries()) if (key !== PDFName.of('Parent')) dict.set(key, value);
  dict.delete(PDFName.of('Kids'));
  // The pages show the field itself where they showed its widget.
  for (const page of doc.getPages()) {
    const annots = page.node.Annots();
    if (!annots) continue;
    for (let i = 0; i < annots.size(); i++) if (annots.get(i) instanceof PDFRef && String(annots.get(i)) === String(widgetRef)) annots.set(i, fieldRef);
  }
  context.delete(widgetRef);
}

/**
 * Puts an annotation on a page, and nothing else: pdf-lib's addAnnot wraps
 * what the page draws in q … Q first, a change of the page that readers of
 * signatures take for one of its content.
 */
export function annotate(page: PDFPage, ref: PDFRef): void {
  const annots = page.node.Annots();
  if (annots) annots.push(ref);
  else page.node.set(PDFName.of('Annots'), page.doc.context.obj([ref]));
}
