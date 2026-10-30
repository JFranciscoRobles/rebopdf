// A Pdf saved as a PDF file, with pdf-lib. The first file is the one written
// on: its pages taken in the order of the Pdf, those of the other files
// copied in, its form filled and kept as a form (those of the other files are
// filled and drawn into their pages: a PDF has one form). Highlights, notes
// and ink go on as annotations, which any reader shows and can change, each
// with its appearance drawn; text and signatures are drawn into the page.
// With `flatten`, everything is drawn into the pages, and nothing can be
// changed after.

import {
  LineCapStyle,
  LineJoinStyle,
  type PDFDocument,
  type PDFFont,
  PDFHexString,
  PDFArray,
  PDFDict,
  PDFName,
  PDFNumber,
  PDFObject,
  PDFRef,
  PDFStream,
  type PDFOperator,
  type PDFPage,
  PDFString,
  StandardFonts,
  appendBezierCurve,
  closePath,
  fill,
  lineTo,
  moveTo,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
  rgb,
  setFillingRgbColor,
  setGraphicsState,
  setLineCap,
  setLineJoin,
  setLineWidth,
  setStrokingRgbColor,
  stroke,
  degrees,
} from '@cantoo/pdf-lib';
import { formOf, loadDocument, OBJECTS_AT_ONCE } from './open';
import type { Color, Field, HighlightMark, InkMark, Mark, NoteMark, Pdf, Point, Rect, SignatureMark, TextMark } from './types';

export interface SaveOptions {
  /** Draws fields and marks into the pages, so that they cannot be changed after. */
  flatten?: boolean;
}

/** How many objects a PDF has at most to be written with them packed in streams. */
const PACKED_AT_MOST = 4000;

/** The size of the icon of a note, in points. */
export const NOTE_SIZE = 20;

/** The bytes of the PDF, as it is now. */
export async function savePdf(pdf: Pdf, options: SaveOptions = {}): Promise<Uint8Array> {
  const used = [...new Set(pdf.pages.map((page) => page.source))];
  const base = used[0];
  const docs = new Map<string, PDFDocument>();
  for (const source of used) docs.set(source, await loadDocument(pdf.sources[source]));
  const doc = docs.get(base)!;

  for (const [source, each] of docs)
    fillForm(
      each,
      pdf.fields.filter((field) => field.source === source),
      source === base && !options.flatten,
    );

  // The pages, in their order: those of the first file as they are, those of the others copied in.
  const copied = new Map<string, PDFPage>();
  for (const [source, other] of docs) {
    if (source === base) continue;
    const wanted = pdf.pages.filter((page) => page.source === source);
    const pages = await doc.copyPages(
      other,
      wanted.map((page) => page.index),
    );
    wanted.forEach((page, i) => copied.set(page.id, pages[i]));
  }
  const own = doc.getPages();
  const order = pdf.pages.map((page) => (page.source === base ? own[page.index] : copied.get(page.id)!));
  const kept = new Set(order.map((page) => page.ref.toString()));
  const gone = new Set(own.filter((page) => !kept.has(page.ref.toString())).map((page) => page.ref.toString()));
  setPages(doc, order);

  let font: PDFFont | undefined;
  const helvetica = async () => (font ??= await doc.embedFont(StandardFonts.Helvetica));
  for (const [i, page] of pdf.pages.entries()) {
    const out = order[i];
    out.setRotation(degrees(page.rotation));
    for (const mark of pdf.marks) if (mark.page === page.id) await putMark(doc, out, mark, !!options.flatten, helvetica);
  }

  doc.setProducer('ReboPDF');
  doc.setModificationDate(new Date());
  if (pdf.info.title) doc.setTitle(pdf.info.title);
  dropUnreachable(doc, gone);
  // Objects packed in streams make a smaller file, but pdf-lib packs them in a time that grows with the square of
  // how many there are: a big PDF is written without them, a hundred times faster and a sixth bigger.
  const many = doc.context.enumerateIndirectObjects().length > PACKED_AT_MOST;
  return doc.save({ objectsPerTick: OBJECTS_AT_ONCE, useObjectStreams: !many });
}

const INHERITED = ['Resources', 'MediaBox', 'CropBox', 'Rotate'].map((key) => PDFName.of(key));

/** Makes these the pages of the document, in this order, as the one list of its page tree. */
function setPages(doc: PDFDocument, order: PDFPage[]) {
  // What a page takes from the nodes above it is put on the page, as those nodes go.
  for (const page of order) {
    for (const key of INHERITED) {
      if (page.node.has(key)) continue;
      const value = page.node.getInheritableAttribute(key);
      if (value) page.node.set(key, value);
    }
  }
  const root = doc.catalog.Pages();
  const rootRef = doc.catalog.get(PDFName.of('Pages')) as PDFRef;
  root.set(PDFName.of('Kids'), doc.context.obj(order.map((page) => page.ref)));
  root.set(PDFName.of('Count'), PDFNumber.of(order.length));
  for (const page of order) page.node.setParent(rootRef);
}

/**
 * Takes out of the file what nothing in it reaches any more: the pages taken
 * out, which would otherwise still be in its bytes, and what only they used.
 * What pointed at a page taken out (a link, a bookmark) points at nothing,
 * which readers take as nothing.
 */
function dropUnreachable(doc: PDFDocument, gone: Set<string>) {
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

/** Writes what the fields hold; those no longer in the Pdf (their pages taken out) are taken out of the form. */
function fillForm(doc: PDFDocument, fields: Field[], keep: boolean) {
  const form = formOf(doc);
  if (!form?.getFields().length) return;
  const byName = new Map(fields.map((field) => [field.name, field]));
  for (const field of form.getFields()) {
    const ours = byName.get(field.getName());
    if (!ours) {
      if (keep) {
        try {
          form.removeField(field);
        } catch {
          // A field whose widgets have no page is left; its pages are gone with it.
        }
      }
      continue;
    }
    const value = ours.value;
    const f = field as unknown as Record<string, (...args: unknown[]) => void>;
    switch (ours.kind) {
      case 'text':
        f.setText(String(value) || undefined);
        break;
      case 'checkbox':
        value ? f.check() : f.uncheck();
        break;
      case 'radio':
      case 'choice':
        value ? f.select(String(value)) : f.clear();
        break;
      case 'list':
        (value as string[]).length ? f.select(value) : f.clear();
        break;
    }
  }
  if (keep) form.updateFieldAppearances();
  else form.flatten();
}

const colour = (hex: Color) => {
  const n = Number.parseInt(hex.replace('#', '').padEnd(6, '0').slice(0, 6), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255] as const;
};

/** The box that holds these points, made wider by `pad`. */
export function boundsOf(points: Point[], pad = 0): Rect {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const x = Math.min(...xs) - pad;
  const y = Math.min(...ys) - pad;
  return { x, y, width: Math.max(...xs) + pad - x, height: Math.max(...ys) + pad - y };
}

/** The box a mark takes on its page. */
export function markBounds(mark: Mark): Rect {
  switch (mark.kind) {
    case 'highlight':
      return boundsOf(
        mark.rects.flatMap((r) => [
          { x: r.x, y: r.y },
          { x: r.x + r.width, y: r.y + r.height },
        ]),
      );
    case 'note':
      return { x: mark.at.x, y: mark.at.y - NOTE_SIZE, width: NOTE_SIZE, height: NOTE_SIZE };
    case 'ink':
      return boundsOf(mark.paths.flat(), mark.width);
    default:
      return mark.rect;
  }
}

/** A line through the points, smoothed by curves between their middles. */
function path(points: Point[]): PDFOperator[] {
  if (!points.length) return [];
  if (points.length === 1) return [moveTo(points[0].x, points[0].y), lineTo(points[0].x + 0.01, points[0].y)];
  const ops = [moveTo(points[0].x, points[0].y)];
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i];
    const next = points[i + 1];
    const mx = (p.x + next.x) / 2;
    const my = (p.y + next.y) / 2;
    // A quadratic curve, as a cubic: through the middle, bent by the point.
    const prev = ops.length === 1 ? points[0] : { x: (points[i - 1].x + p.x) / 2, y: (points[i - 1].y + p.y) / 2 };
    ops.push(appendBezierCurve(prev.x + (2 / 3) * (p.x - prev.x), prev.y + (2 / 3) * (p.y - prev.y), mx + (2 / 3) * (p.x - mx), my + (2 / 3) * (p.y - my), mx, my));
  }
  const last = points[points.length - 1];
  ops.push(lineTo(last.x, last.y));
  return ops;
}

const strokes = (paths: Point[][], color: Color, width: number): PDFOperator[] => [
  pushGraphicsState(),
  setStrokingRgbColor(...colour(color)),
  setLineWidth(width),
  setLineCap(LineCapStyle.Round),
  setLineJoin(LineJoinStyle.Round),
  ...paths.flatMap((points) => [...path(points), stroke()]),
  popGraphicsState(),
];

/** What draws a highlight, a note or ink, in the space of its page; `multiply` names the state that blends a highlight. */
function drawing(mark: HighlightMark | NoteMark | InkMark, multiply: string | PDFName): PDFOperator[] {
  switch (mark.kind) {
    case 'highlight':
      return [pushGraphicsState(), setGraphicsState(multiply), setFillingRgbColor(...colour(mark.color)), ...mark.rects.map((r) => rectangle(r.x, r.y, r.width, r.height)), fill(), popGraphicsState()];
    case 'note': {
      const { x, y } = { x: mark.at.x, y: mark.at.y - NOTE_SIZE };
      const s = NOTE_SIZE;
      // A sheet with its corner turned and three lines.
      return [
        pushGraphicsState(),
        setFillingRgbColor(...colour(mark.color)),
        moveTo(x + 2, y + 2),
        lineTo(x + s - 2, y + 2),
        lineTo(x + s - 2, y + s - 7),
        lineTo(x + s - 7, y + s - 2),
        lineTo(x + 2, y + s - 2),
        closePath(),
        fill(),
        setStrokingRgbColor(1, 1, 1),
        setLineWidth(1.2),
        ...[0, 1, 2].flatMap((n) => [moveTo(x + 5, y + s - 7 - n * 3.5), lineTo(x + s - (n ? 5 : 9), y + s - 7 - n * 3.5)]),
        stroke(),
        popGraphicsState(),
      ];
    }
    case 'ink':
      return strokes(mark.paths, mark.color, mark.width);
  }
}

async function putMark(doc: PDFDocument, page: PDFPage, mark: Mark, flatten: boolean, helvetica: () => Promise<PDFFont>) {
  if (mark.kind === 'text') return drawText(page, mark, await helvetica());
  if (mark.kind === 'signature') return drawSignature(doc, page, mark);
  const blend = doc.context.obj({ Type: 'ExtGState', BM: 'Multiply', CA: 1, ca: 1 });
  if (flatten) {
    const name = page.node.newExtGState('RpMultiply', blend);
    page.pushOperators(...drawing(mark, name));
    return;
  }
  const rect = markBounds(mark);
  const appearance = doc.context.formXObject(drawing(mark, 'GS0'), {
    BBox: [rect.x, rect.y, rect.x + rect.width, rect.y + rect.height],
    Resources: { ExtGState: { GS0: blend } },
  });
  const [r, g, b] = colour(mark.color);
  const text = mark.kind === 'highlight' ? (mark.comment ?? '') : mark.kind === 'note' ? mark.text : '';
  const dict: Record<string, unknown> = {
    Type: 'Annot',
    Subtype: { highlight: 'Highlight', note: 'Text', ink: 'Ink' }[mark.kind],
    Rect: [rect.x, rect.y, rect.x + rect.width, rect.y + rect.height],
    C: [r, g, b],
    F: 4,
    NM: PDFString.of(mark.id),
    M: PDFString.fromDate(mark.date ? new Date(mark.date) : new Date()),
    AP: { N: doc.context.register(appearance) },
    ...(text ? { Contents: PDFHexString.fromText(text) } : {}),
    ...(mark.author ? { T: PDFHexString.fromText(mark.author) } : {}),
  };
  if (mark.kind === 'highlight') {
    // Each box by its corners: top left, top right, bottom left, bottom right, as readers take them.
    dict.QuadPoints = mark.rects.flatMap((q) => [q.x, q.y + q.height, q.x + q.width, q.y + q.height, q.x, q.y, q.x + q.width, q.y]);
    dict.CA = 1;
  } else if (mark.kind === 'note') {
    dict.Name = 'Comment';
    dict.Open = false;
  } else {
    dict.InkList = mark.paths.map((points) => points.flatMap((p) => [p.x, p.y]));
    dict.BS = { W: mark.width, S: 'S' };
  }
  const annot = doc.context.obj(dict as never);
  page.node.addAnnot(doc.context.register(annot));
}

/** The text as the font can write it: what it has no glyph for is left out. */
export function writable(font: PDFFont, text: string): string {
  const letters = new Set(font.getCharacterSet());
  let out = '';
  for (const char of text) {
    if (letters.has(char.codePointAt(0)!) || char === '\n') out += char;
    else if (/\s/.test(char)) out += ' ';
  }
  return out;
}

/** The lines the text makes in a width, broken between words. */
export function wrap(text: string, width: number, measure: (line: string) => number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/(\s+)/)) {
      const next = line + word;
      if (line && measure(next.trimEnd()) > width) {
        lines.push(line.trimEnd());
        line = word.trimStart();
      } else line = next;
    }
    lines.push(line.trimEnd());
  }
  return lines;
}

function drawText(page: PDFPage, mark: TextMark, font: PDFFont) {
  const text = writable(font, mark.text);
  const lines = wrap(text, mark.rect.width, (line) => font.widthOfTextAtSize(line, mark.size));
  const leading = mark.size * 1.25;
  const [r, g, b] = colour(mark.color);
  lines.forEach((line, i) => {
    const y = mark.rect.y + mark.rect.height - mark.size * 0.95 - i * leading;
    if (line) page.drawText(line, { x: mark.rect.x, y, size: mark.size, font, color: rgb(r, g, b) });
  });
}

async function drawSignature(doc: PDFDocument, page: PDFPage, mark: SignatureMark) {
  const { rect } = mark;
  if (mark.image) {
    const [head, data] = mark.image.split(',');
    const bytes = Uint8Array.from(atob(data ?? ''), (c) => c.charCodeAt(0));
    const image = /jpe?g/i.test(head) ? await doc.embedJpg(bytes) : await doc.embedPng(bytes);
    // As big as it fits in the box, in the middle of it.
    const fit = Math.min(rect.width / image.width, rect.height / image.height);
    const width = image.width * fit;
    const height = image.height * fit;
    page.drawImage(image, { x: rect.x + (rect.width - width) / 2, y: rect.y + (rect.height - height) / 2, width, height });
    return;
  }
  const paths = (mark.paths ?? []).map((points) => points.map((p) => ({ x: rect.x + p.x * rect.width, y: rect.y + rect.height - p.y * rect.height })));
  page.pushOperators(...strokes(paths, mark.color, Math.max(1, Math.min(rect.width, rect.height) / 40)));
}
