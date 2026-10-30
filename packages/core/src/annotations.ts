// The annotations a PDF comes with, taken as marks of the engine: the
// highlights, notes and ink another reader put on it (Acrobat, Preview,
// Chrome), to be changed, moved and deleted as those put on here are, and
// saved again as annotations. Those of other kinds stay as they are, and so
// do those in a thread of replies, which a mark does not keep.

import { PDFArray, PDFDict, type PDFDocument, PDFHexString, PDFName, PDFNumber, type PDFObject, PDFRef, PDFString } from '@cantoo/pdf-lib';
import { uid } from './open';
import type { Mark, Page, Point, Rect } from './types';

const name = (key: string) => PDFName.of(key);

/** The numbers of an array of the PDF. */
const numbers = (doc: PDFDocument, value: PDFObject | undefined): number[] => {
  const array = value instanceof PDFRef ? doc.context.lookup(value) : value;
  if (!(array instanceof PDFArray)) return [];
  return array.asArray().map((item) => {
    const n = item instanceof PDFRef ? doc.context.lookup(item) : item;
    return n instanceof PDFNumber ? n.asNumber() : Number.NaN;
  });
};

/** A number of the PDF, when it is one. */
const numberOf = (doc: PDFDocument, value: PDFObject | undefined): number | undefined => {
  const n = value instanceof PDFRef ? doc.context.lookup(value) : value;
  return n instanceof PDFNumber ? n.asNumber() : undefined;
};

const text = (doc: PDFDocument, value: PDFObject | undefined): string => {
  const v = value instanceof PDFRef ? doc.context.lookup(value) : value;
  return v instanceof PDFString || v instanceof PDFHexString ? v.decodeText() : '';
};

const hex = (n: number) =>
  Math.round(Math.max(0, Math.min(1, n)) * 255)
    .toString(16)
    .padStart(2, '0');

/** A colour of the PDF (grey, RGB or CMYK) as "#rrggbb". */
export function colorOf(values: number[], fallback: string): string {
  if (values.some(Number.isNaN)) return fallback;
  if (values.length === 1) return `#${hex(values[0]).repeat(3)}`;
  if (values.length === 3) return `#${values.map(hex).join('')}`;
  if (values.length === 4) {
    const [c, m, y, k] = values;
    return `#${[c, m, y].map((v) => hex((1 - v) * (1 - k))).join('')}`;
  }
  return fallback;
}

/** A date of the PDF ("D:20261029143000+01'00'") as an ISO date. */
export function dateOf(value: string): string | undefined {
  const m = /^D?:?(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?([Zz+-])?(\d{2})?'?(\d{2})?/.exec(value.trim());
  if (!m) return undefined;
  const [, y, mo = '01', d = '01', h = '00', mi = '00', s = '00', sign, zh = '00', zm = '00'] = m;
  const zone = !sign || /z/i.test(sign) ? 'Z' : `${sign}${zh}:${zm}`;
  const date = new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}${zone}`);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

/** The mark an annotation is, when it is one the engine keeps as it is. */
function markOf(doc: PDFDocument, dict: PDFDict, page: string): Mark | undefined {
  const kind = dict.lookup(name('Subtype'));
  const subtype = kind instanceof PDFName ? kind.decodeText() : '';
  const flags = numberOf(doc, dict.get(name('F'))) ?? 0;
  // Hidden, or not to be seen: left as it is.
  if (flags & 2 || flags & 32) return undefined;
  const author = text(doc, dict.get(name('T'))) || undefined;
  const date = dateOf(text(doc, dict.get(name('M'))));
  const color = numbers(doc, dict.get(name('C')));
  const common = { id: uid('m'), page, ...(author ? { author } : {}), ...(date ? { date } : {}) };
  switch (subtype) {
    case 'Highlight': {
      const quads = numbers(doc, dict.get(name('QuadPoints')));
      const rects: Rect[] = [];
      for (let i = 0; i + 7 < quads.length; i += 8) {
        const xs = [quads[i], quads[i + 2], quads[i + 4], quads[i + 6]];
        const ys = [quads[i + 1], quads[i + 3], quads[i + 5], quads[i + 7]];
        if ([...xs, ...ys].some(Number.isNaN)) return undefined;
        rects.push({ x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) });
      }
      if (!rects.length) return undefined;
      const comment = text(doc, dict.get(name('Contents')));
      return { ...common, kind: 'highlight', rects, color: colorOf(color, '#ffe066'), ...(comment ? { comment } : {}) };
    }
    case 'Text': {
      const [x1, y1, x2, y2] = numbers(doc, dict.get(name('Rect')));
      if ([x1, y1, x2, y2].some((n) => n === undefined || Number.isNaN(n))) return undefined;
      return { ...common, kind: 'note', at: { x: Math.min(x1, x2), y: Math.max(y1, y2) }, text: text(doc, dict.get(name('Contents'))), color: colorOf(color, '#f08c00') };
    }
    case 'Ink': {
      const list = dict.lookup(name('InkList'));
      if (!(list instanceof PDFArray)) return undefined;
      const paths: Point[][] = [];
      for (const item of list.asArray()) {
        const n = numbers(doc, item);
        if (n.some(Number.isNaN) || n.length < 2) return undefined;
        const points: Point[] = [];
        for (let i = 0; i + 1 < n.length; i += 2) points.push({ x: n[i], y: n[i + 1] });
        paths.push(points);
      }
      const border = dict.lookup(name('BS'));
      const width = numberOf(doc, border instanceof PDFDict ? border.get(name('W')) : undefined) ?? numbers(doc, dict.get(name('Border')))[2] ?? 1;
      return { ...common, kind: 'ink', paths, color: colorOf(color, '#1b1b1b'), width: Number.isNaN(width) || width <= 0 ? 1 : width };
    }
    default:
      return undefined;
  }
}

/**
 * Takes the highlights, notes and ink of the pages out of the document, as
 * marks of the pages of these ids (in the order of the document), with the
 * popups that went with them; says which annotations it took, by reference.
 */
export function takeMarks(doc: PDFDocument, pages: Page[]): { marks: Mark[]; refs: string[] } {
  const { context } = doc;
  const all = doc.getPages();
  const dictOf = (ref: PDFObject) => {
    const value = ref instanceof PDFRef ? context.lookup(ref) : ref;
    return value instanceof PDFDict ? value : undefined;
  };
  // A note and the notes that reply to it are one mark, its replies with it. Other threads stay as they are.
  const replied = new Set<string>();
  const replies = new Map<string, { ref: PDFObject; dict: PDFDict }[]>();
  for (const page of all) {
    for (const ref of page.node.Annots()?.asArray() ?? []) {
      const dict = dictOf(ref);
      const to = dict?.get(name('IRT'));
      if (!dict || !to) continue;
      replied.add(String(to));
      replies.set(String(to), [...(replies.get(String(to)) ?? []), { ref, dict }]);
    }
  }
  const isNote = (dict: PDFDict | undefined) => (dict?.get(name('Subtype')) as PDFName | undefined)?.decodeText() === 'Text';
  /** Whether a thread is of notes alone, which replace nothing (RT /R): taken as one note with its replies. */
  const noteThread = (ref: PDFObject, dict: PDFDict) =>
    isNote(dict) &&
    !dict.get(name('IRT')) &&
    (replies.get(String(ref)) ?? []).every((r) => isNote(r.dict) && !replies.has(String(r.ref)) && ((r.dict.get(name('RT')) as PDFName | undefined)?.decodeText() ?? 'R') === 'R');
  const takenReplies = new Set<string>();
  const marks: Mark[] = [];
  const refs: string[] = [];
  all.forEach((page, i) => {
    const list = page.node.Annots();
    if (!list || !pages[i]) return;
    const kept: PDFObject[] = [];
    const popups = new Set<string>();
    for (const ref of list.asArray()) {
      const dict = dictOf(ref);
      if (takenReplies.has(String(ref))) continue;
      const thread = dict && replied.has(String(ref)) && noteThread(ref, dict);
      const mark = dict && !dict.get(name('IRT')) && (!replied.has(String(ref)) || thread) ? markOf(doc, dict, pages[i].id) : undefined;
      if (!mark) {
        kept.push(ref);
        continue;
      }
      if (thread && mark.kind === 'note') {
        mark.replies = (replies.get(String(ref)) ?? []).map(({ ref: r, dict: d }) => {
          takenReplies.add(String(r));
          if (r instanceof PDFRef) refs.push(String(r));
          const author = text(doc, d.get(name('T'))) || undefined;
          const date = dateOf(text(doc, d.get(name('M'))));
          return { id: uid('r'), text: text(doc, d.get(name('Contents'))), ...(author ? { author } : {}), ...(date ? { date } : {}) };
        });
      }
      marks.push(mark);
      if (ref instanceof PDFRef) refs.push(String(ref));
      const popup = dict!.get(name('Popup'));
      if (popup) {
        popups.add(String(popup));
        refs.push(String(popup));
      }
    }
    const left = kept.filter((ref) => !popups.has(String(ref)) && !takenReplies.has(String(ref)));
    if (left.length !== list.size()) page.node.set(name('Annots'), context.obj(left));
  });
  return { marks, refs };
}

/** Takes these annotations off the pages of a document: those taken as marks, to be written again as they are now. */
export function dropAnnotations(doc: PDFDocument, refs: string[]): void {
  if (!refs.length) return;
  const gone = new Set(refs);
  for (const page of doc.getPages()) {
    const list = page.node.Annots();
    if (!list) continue;
    const kept = list.asArray().filter((ref) => !gone.has(String(ref)));
    if (kept.length !== list.size()) page.node.set(name('Annots'), doc.context.obj(kept));
  }
}
