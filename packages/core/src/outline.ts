// What a PDF has besides its pages: its bookmarks (the table of contents a
// reader shows beside it) and the files it carries (attachments). Read from
// its files, changed here, and written when it is saved: the bookmarks
// leading to its pages as they are then, the files with what PDF/A-3 asks of
// them.

import { decodePDFRawStream, PDFArray, PDFDict, type PDFDocument, PDFHexString, PDFName, PDFNumber, type PDFObject, PDFRawStream, type PDFRef, PDFString } from '@cantoo/pdf-lib';
import type { OutlineItem, Place } from './links';
import { type Attachment, type Pdf, PdfError } from './types';

/** The lists of files read with a PDF, as they were: one changed is written when the PDF is saved; one as it was, left. */
const asRead = new WeakSet<Attachment[]>();

const text = (o: PDFObject | undefined) => (o instanceof PDFString || o instanceof PDFHexString ? o.decodeText() : undefined);

/** The files a document carries, from its name tree of them. */
export function attachmentsOf(doc: PDFDocument): Attachment[] {
  const names = doc.catalog.lookup(PDFName.of('Names'));
  const tree = names instanceof PDFDict ? names.lookup(PDFName.of('EmbeddedFiles')) : undefined;
  const out: Attachment[] = [];
  const walk = (node: PDFObject | undefined, depth: number) => {
    if (!(node instanceof PDFDict) || depth > 20) return;
    const kids = node.lookup(PDFName.of('Kids'));
    if (kids instanceof PDFArray) for (let i = 0; i < kids.size(); i++) walk(kids.lookup(i), depth + 1);
    const list = node.lookup(PDFName.of('Names'));
    if (!(list instanceof PDFArray)) return;
    for (let i = 0; i + 1 < list.size(); i += 2) {
      const spec = list.lookup(i + 1);
      if (!(spec instanceof PDFDict)) continue;
      const files = spec.lookup(PDFName.of('EF'));
      const stream = files instanceof PDFDict ? (files.lookup(PDFName.of('UF')) ?? files.lookup(PDFName.of('F'))) : undefined;
      if (!(stream instanceof PDFRawStream)) continue;
      const subtype = stream.dict.lookup(PDFName.of('Subtype'));
      const params = stream.dict.lookup(PDFName.of('Params'));
      const modified = params instanceof PDFDict ? text(params.lookup(PDFName.of('ModDate'))) : undefined;
      const date = modified && /^D:(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?/.exec(modified);
      out.push({
        name: text(spec.lookup(PDFName.of('UF'))) ?? text(spec.lookup(PDFName.of('F'))) ?? text(list.lookup(i)) ?? 'file',
        data: decodePDFRawStream(stream).decode(),
        ...(text(spec.lookup(PDFName.of('Desc'))) ? { description: text(spec.lookup(PDFName.of('Desc'))) } : {}),
        ...(subtype instanceof PDFName ? { mime: subtype.decodeText() } : {}),
        ...(date ? { modified: new Date(Date.UTC(+date[1], +date[2] - 1, +date[3], +(date[4] ?? 0), +(date[5] ?? 0), +(date[6] ?? 0))).toISOString() } : {}),
      });
    }
  };
  walk(tree, 0);
  asRead.add(out);
  return out;
}

/** Whether the files of a PDF are to be written: they were changed since it was read. */
export const attachmentsChanged = (pdf: Pdf) => !!pdf.attachments && !asRead.has(pdf.attachments);

/** Writes the files a PDF carries in a document, in place of those it had. */
export function writeAttachments(doc: PDFDocument, attachments: Attachment[]): void {
  const { context } = doc;
  let names = doc.catalog.lookup(PDFName.of('Names'));
  if (!(names instanceof PDFDict)) {
    names = context.obj({});
    doc.catalog.set(PDFName.of('Names'), context.register(names as PDFDict));
  }
  const tree = names as PDFDict;
  if (!attachments.length) {
    tree.delete(PDFName.of('EmbeddedFiles'));
    doc.catalog.delete(PDFName.of('AF'));
    return;
  }
  const sorted = [...attachments].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const specs: PDFRef[] = [];
  const list = PDFArray.withContext(context);
  for (const file of sorted) {
    const stream = context.flateStream(file.data, {
      Type: 'EmbeddedFile',
      ...(file.mime ? { Subtype: PDFName.of(file.mime) } : {}),
      Params: { Size: file.data.length, ...(file.modified ? { ModDate: PDFString.fromDate(new Date(file.modified)) } : {}) },
    } as never);
    const ref = context.register(stream);
    const spec = context.register(
      context.obj({
        Type: 'Filespec',
        F: PDFString.of(file.name.replace(/[^\x20-\x7e]/g, '_').replace(/[()\\]/g, '_')),
        UF: PDFHexString.fromText(file.name),
        EF: { F: ref, UF: ref },
        AFRelationship: 'Unspecified',
        ...(file.description ? { Desc: PDFHexString.fromText(file.description) } : {}),
      } as never),
    );
    list.push(PDFHexString.fromText(file.name));
    list.push(spec);
    specs.push(spec);
  }
  tree.set(PDFName.of('EmbeddedFiles'), context.register(context.obj({ Names: list } as never)));
  // PDF/A-3 names the files of the document on its catalog too.
  doc.catalog.set(PDFName.of('AF'), context.obj(specs));
}

/** Writes the bookmarks of a PDF in a document, in place of those it had: each to its page, given its page's reference. */
export function writeOutline(doc: PDFDocument, items: OutlineItem[], pageRef: (id: string) => PDFRef | undefined): void {
  const { context } = doc;
  doc.catalog.delete(PDFName.of('Outlines'));
  if (!items.length) return;
  const rootRef = context.nextRef();
  /** A list of bookmarks under a parent: the first, the last, and how many show when it is open. */
  const build = (list: OutlineItem[], parent: PDFRef): { first: PDFRef; last: PDFRef; count: number } => {
    const refs = list.map(() => context.nextRef());
    const count = list.length;
    list.forEach((item, i) => {
      const dict: Record<string, unknown> = { Title: PDFHexString.fromText(item.title), Parent: parent };
      if (i > 0) dict.Prev = refs[i - 1];
      if (i < list.length - 1) dict.Next = refs[i + 1];
      const page = item.to && pageRef(item.to.page);
      if (page) dict.Dest = [page, PDFName.of('XYZ'), null, item.to?.top ?? null, null];
      if (item.items.length) {
        const kids = build(item.items, refs[i]);
        // Closed at first, as most readers show them: what is under it does not count.
        Object.assign(dict, { First: kids.first, Last: kids.last, Count: PDFNumber.of(-kids.count) });
      }
      context.assign(refs[i], context.obj(dict as never));
    });
    return { first: refs[0], last: refs[refs.length - 1], count };
  };
  const top = build(items, rootRef);
  context.assign(rootRef, context.obj({ Type: 'Outlines', First: top.first, Last: top.last, Count: top.count } as never));
  doc.catalog.set(PDFName.of('Outlines'), rootRef);
}

// --- Changes -------------------------------------------------------------------

/** The PDF with these bookmarks: written when it is saved, in place of those its files had. */
export function setOutline(pdf: Pdf, items: OutlineItem[]): Pdf {
  return { ...pdf, outline: items };
}

/** A bookmark to a place, put at the end of the bookmarks (or of those of a bookmark, by its path of indexes). */
export function addBookmark(pdf: Pdf, outline: OutlineItem[], bookmark: { title: string; to: Place }, under: number[] = []): Pdf {
  const items = structuredClone(outline);
  let list = items;
  for (const i of under) list = list[i]?.items ?? list;
  list.push({ title: bookmark.title, to: bookmark.to, items: [] });
  return setOutline(pdf, items);
}

/** The PDF with a file attached: in place of one of its name. */
export function attachFile(pdf: Pdf, file: Attachment): Pdf {
  if (!file.name.trim()) throw new PdfError('invalid', 'A file attached needs a name.');
  return { ...pdf, attachments: [...(pdf.attachments ?? []).filter((a) => a.name !== file.name), file] };
}

/** The PDF without a file it carries. */
export function detachFile(pdf: Pdf, name: string): Pdf {
  const attachments = pdf.attachments ?? [];
  if (!attachments.some((a) => a.name === name)) throw new PdfError('not-found', `The PDF carries no file ${name}.`);
  return { ...pdf, attachments: attachments.filter((a) => a.name !== name) };
}
