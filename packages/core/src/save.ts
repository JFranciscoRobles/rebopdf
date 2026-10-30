// A Pdf saved as a PDF file, with pdf-lib. The first file is the one written
// on: its pages taken in the order of the Pdf, those of the other files
// copied in, its form filled and kept as a form (those of the other files are
// filled and drawn into their pages: a PDF has one form). Highlights, notes
// and ink go on as annotations, which any reader shows and can change, each
// with its appearance drawn; text and signatures are drawn into the page.
// With `flatten`, everything is drawn into the pages, and nothing can be
// changed after.

import {
  PDFCheckBox,
  PDFDropdown,
  PDFOptionList,
  PDFRadioGroup,
  PDFTextField,
  LineCapStyle,
  LineJoinStyle,
  type PDFDocument,
  type PDFFont,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFRef,
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
import { dropAnnotations } from './annotations';
import { overlaps } from './geometry';
import { removeText } from './content';
import { annotate, dropUnreachable, mergeWidget } from './objects';
import { type OptimizeOptions, optimizeDocument } from './optimize';
import { outlineOf } from './links';
import { attachmentsChanged, writeAttachments, writeOutline } from './outline';
import { makePdfA, type PdfALevel, unclaimPdfA } from './pdfa';
import { writeDocument, writeIncrement } from './writer';
import { formOf, loadDocument, readField } from './open';
import { Redactor, unseenOf, writeUnseen } from './redact';
import { type Color, type Field, type HighlightMark, type InkMark, type Mark, type NoteMark, type Pdf, PdfError, type Point, type Rect, type SignatureMark, type TextMark } from './types';

export interface SaveOptions {
  /** Draws fields and marks into the pages, so that they cannot be changed after. */
  flatten?: boolean;
  /**
   * A TrueType or OpenType font to write text marks in, put in the PDF with
   * the letters they use alone: for letters the standard font of PDFs has
   * not (Greek, Cyrillic, Chinese…). Without it, text is written in Helvetica,
   * and what it has no letter for is left out. Words are not shaped, so
   * Arabic and the scripts of India are not written as they should be.
   */
  font?: Uint8Array;
  /**
   * Whether the changes are added after the file as it came, leaving its
   * bytes as they were, as signing needs: a digital signature it carries
   * still holds, and the changes since show apart. 'auto' (when left out)
   * does so for a signed PDF; true does so always, and says why it cannot
   * when it cannot: for pages of more than one PDF, and for anything blacked
   * out, which must be taken out of the file, not added after it.
   */
  incremental?: boolean | 'auto';
  /**
   * A password to open it with (AES-256), and what may be done with it
   * opened: printed, copied, changed. Who has `ownerPassword` may do all;
   * left out, no one may. A protected PDF is written whole, not added to.
   */
  protect?: { password: string; ownerPassword?: string; permissions?: Permissions };
  /**
   * Made smaller: its pictures no bigger than its pages show them (at 150
   * dots to the inch, or `dpi`), photographs written again at `quality`, and
   * what it has twice kept once. An optimized PDF is written whole.
   */
  optimize?: boolean | OptimizeOptions;
  /**
   * Made PDF/A, as archives keep documents: PDF/A-2B (or 3B when it carries
   * files, or when asked), every font it draws with carried in it. Written
   * whole, and not with a password, which PDF/A does not allow.
   */
  pdfa?: boolean | PdfALevel;
}

/** What may be done with a protected PDF opened by its password: all of it, when left out. */
export interface Permissions {
  printing?: boolean | 'lowResolution';
  copying?: boolean;
  modifying?: boolean;
  annotating?: boolean;
  fillingForms?: boolean;
  documentAssembly?: boolean;
}

/** Why a Pdf cannot be saved by adding to its file: undefined when it can. */
export function whyNotIncremental(pdf: Pdf): string | undefined {
  if (new Set(pdf.pages.map((page) => page.source)).size > 1) return 'Its pages come from more than one PDF.';
  if (pdf.marks.some((mark) => mark.kind === 'redaction')) return 'Something is blacked out in it, which is taken out of the file, not added after it.';
  return undefined;
}

/** Whether a Pdf is saved by adding to its file: as asked, or, by default, when it is signed. */
export function savesIncrementally(pdf: Pdf, asked: SaveOptions['incremental'] = 'auto', protect?: SaveOptions['protect'], optimize?: SaveOptions['optimize'], pdfa?: SaveOptions['pdfa']): boolean {
  const why = protect
    ? 'It is protected by a password, which the whole file is written with.'
    : pdfa
      ? 'It is made PDF/A, which the whole file is written again for.'
      : optimize
        ? 'It is made smaller, which the whole file is written again for.'
        : whyNotIncremental(pdf);
  if (asked === true && why) throw new PdfError('incremental', `It cannot be saved by adding to the file as it came: ${why}`);
  if (asked === false || why) return false;
  if (asked === true) return true;
  const base = pdf.pages[0]?.source;
  return !!pdf.signatures?.some((signature) => signature.source === base);
}

/** The size of the icon of a note, in points. */
export const NOTE_SIZE = 20;

/** The bytes of the PDF, as it is now. */
export async function savePdf(pdf: Pdf, options: SaveOptions = {}): Promise<Uint8Array> {
  const used = [...new Set(pdf.pages.map((page) => page.source))];
  const base = used[0];
  if (options.pdfa && options.protect) throw new PdfError('invalid', 'A PDF/A is not protected by a password: PDF/A does not allow it.');
  const incremental = savesIncrementally(pdf, options.incremental, options.protect, options.optimize, options.pdfa);
  const docs = new Map<string, PDFDocument>();
  for (const source of used) docs.set(source, await loadDocument(pdf.sources[source], undefined, incremental));
  const doc = docs.get(base)!;
  // What the catalog of the file was: pdf-lib counts it changed once it is read for adding to it.
  const catalog = incremental ? doc.catalog.toString() : '';
  // The annotations taken as marks go: the marks are written as they are now.
  for (const [source, each] of docs) dropAnnotations(each, pdf.taken?.[source] ?? []);

  // What is blacked out, by page; the fields on those pages are drawn into them, and go from the form.
  const boxes = new Map<string, Rect[]>();
  for (const mark of pdf.marks) if (mark.kind === 'redaction') boxes.set(mark.page, [...(boxes.get(mark.page) ?? []), ...mark.rects]);
  const kept = (field: Field) => !field.widgets.some((widget) => boxes.has(widget.page));

  for (const [source, each] of docs)
    fillForm(
      each,
      pdf.fields.filter((field) => field.source === source && kept(field)),
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
  const stay = new Set(order.map((page) => page.ref.toString()));
  const gone = new Set(own.filter((page) => !stay.has(page.ref.toString())).map((page) => page.ref.toString()));
  // The page tree is written again only when the pages are not those of the file, in its order.
  if (order.length !== own.length || order.some((page, i) => page !== own[i])) setPages(doc, order);

  // The fields made here, in the form of the PDF saved, on the pages they are on now.
  const made = pdf.fields.filter((field) => field.created && kept(field));
  if (made.length) createFields(doc, made, (id) => order[pdf.pages.findIndex((page) => page.id === id)]);
  if (made.length && options.flatten) formOf(doc)?.flatten();

  let font: PDFFont | undefined;
  const helvetica = async () => (font ??= await textFont(doc, options.font));
  const redactor = new Redactor(doc);
  try {
    for (const [i, page] of pdf.pages.entries()) {
      const out = order[i];
      if (out.getRotation().angle !== page.rotation) out.setRotation(degrees(page.rotation));
      const blacked = boxes.get(page.id);
      if (blacked) {
        const fields = pdf.fields.filter((field) => field.source === page.source);
        await redactor.redact(out, page, pdf.drawn?.[page.source] ?? pdf.sources[page.source], blacked, fields, helvetica, pdf.recognized?.[page.id]);
      } else if (pdf.recognized?.[page.id]?.length) {
        // The words recognized in the picture of the page, unseen over it, as a scanner that reads them writes them.
        writeUnseen(out, pdf.recognized[page.id].map(unseenOf), await helvetica());
      }
      // Text written in place of the page's: the page's taken out of what it draws, or, where that cannot be, covered.
      const replacing = pdf.marks.filter((mark): mark is TextMark => mark.page === page.id && mark.kind === 'text' && !!mark.replaces);
      const covered =
        replacing.length &&
        !removeText(
          out,
          replacing.map((mark) => mark.replaces!.rect),
        );
      for (const mark of pdf.marks) {
        if (mark.page !== page.id || mark.kind === 'redaction') continue;
        if (covered && mark.kind === 'text' && mark.replaces) {
          const { x, y, width, height } = mark.replaces.rect;
          out.drawRectangle({ x: x - 0.5, y: y - 0.5, width: width + 1, height: height + 1, color: rgb(1, 1, 1) });
        }
        // What would lie over what is blacked out goes with it.
        if (blacked?.some((box) => overlaps(markBounds(mark), box))) continue;
        await putMark(doc, out, mark, !!options.flatten, options.font ? helvetica : mark.kind === 'text' ? () => standardFont(doc, mark) : helvetica);
      }
    }
  } finally {
    await redactor.close();
  }
  // Its bookmarks, once changed, to its pages as they are now; and the files it carries, once changed.
  if (pdf.outline) writeOutline(doc, await outlineOf(pdf), (id) => order[pdf.pages.findIndex((page) => page.id === id)]?.ref);
  if (attachmentsChanged(pdf)) writeAttachments(doc, pdf.attachments!);
  if (boxes.size) {
    // The tagged structure of a PDF keeps its text apart from its pages: it goes.
    for (const key of ['StructTreeRoot', 'MarkInfo']) doc.catalog.delete(PDFName.of(key));
  }

  // Added to a signed file, nothing but what was changed: what the file says of itself stays, and so does its catalog, as it is.
  if (incremental) {
    const snapshot = (doc.context as unknown as { snapshot?: { changedObjects: Set<number> } }).snapshot;
    const ref = doc.context.trailerInfo.Root;
    if (snapshot && ref instanceof PDFRef && doc.catalog.toString() === catalog) snapshot.changedObjects.delete(ref.objectNumber);
    return writeIncrement(doc);
  }
  doc.setProducer('ReboPDF');
  doc.setModificationDate(new Date());
  if (pdf.info.title && doc.getTitle() !== pdf.info.title) doc.setTitle(pdf.info.title);
  dropUnreachable(doc, gone);
  if (options.optimize) await optimizeDocument(doc, options.optimize === true ? {} : options.optimize);
  if (options.pdfa) {
    // The appearances of the fields, and the fonts they and the marks use, made first: then all is carried.
    formOf(doc)?.updateFieldAppearances();
    await doc.flush();
    await makePdfA(doc, options.pdfa === true ? undefined : options.pdfa);
  }
  if (options.protect) {
    // Protected, a PDF/A is no longer one: what says it is goes.
    unclaimPdfA(doc);
    const { password, ownerPassword, permissions } = options.protect;
    const allowed = { printing: 'highResolution' as const, copying: true, modifying: true, annotating: true, fillingForms: true, contentAccessibility: true, documentAssembly: true, ...permissions };
    // Without the owner's password, no one may do more than the password lets: a random one no one knows.
    const owner = ownerPassword ?? Array.from(globalThis.crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(36)).join('');
    doc.encrypt({ userPassword: password, ownerPassword: owner, permissions: { ...allowed, printing: allowed.printing === true ? 'highResolution' : allowed.printing } });
  }
  return writeDocument(doc);
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

/** Puts fields made here in the form of the document, each on its page. */
function createFields(doc: PDFDocument, fields: Field[], pageOf: (id: string) => PDFPage | undefined) {
  const form = formOf(doc) ?? doc.getForm();
  const tell = (dict: { set(key: PDFName, value: PDFHexString): void }, label?: string) => label && dict.set(PDFName.of('TU'), PDFHexString.fromText(label));
  for (const field of fields) {
    const [widget] = field.widgets;
    const page = widget && pageOf(widget.page);
    if (!page) continue;
    const { rect } = widget;
    // pdf-lib makes a widget as big as its box and half its border more on each side: it is given the box less that.
    const border = 0.8;
    const at = { x: rect.x + border / 2, y: rect.y + border / 2, width: rect.width - border, height: rect.height - border, borderWidth: border, borderColor: rgb(0.55, 0.55, 0.55) };
    if (field.kind === 'signature') {
      // pdf-lib makes no signature field: it is made as the PDF says one is, a widget of the kind Sig.
      const { context } = doc;
      const ref = context.register(
        context.obj({
          Type: 'Annot',
          Subtype: 'Widget',
          FT: 'Sig',
          T: PDFHexString.fromText(field.name),
          Rect: [rect.x, rect.y, rect.x + rect.width, rect.y + rect.height],
          F: 4,
          P: page.ref,
        } as never),
      );
      tell(context.lookup(ref) as never, field.label);
      annotate(page, ref);
      form.acroForm.addField(ref);
      continue;
    }
    let made: PDFTextField | PDFCheckBox | PDFDropdown | PDFOptionList;
    if (field.kind === 'text') {
      const text = form.createTextField(field.name);
      if (field.multiline) text.enableMultiline();
      text.addToPage(page, at);
      if (field.value) text.setText(String(field.value));
      made = text;
    } else if (field.kind === 'checkbox') {
      const box = form.createCheckBox(field.name);
      box.addToPage(page, at);
      if (field.value === true) box.check();
      made = box;
    } else if (field.kind === 'choice') {
      const choice = form.createDropdown(field.name);
      choice.addOptions(field.options ?? []);
      choice.addToPage(page, at);
      if (field.value) choice.select(String(field.value));
      made = choice;
    } else if (field.kind === 'list') {
      const list = form.createOptionList(field.name);
      list.addOptions(field.options ?? []);
      list.addToPage(page, at);
      if ((field.value as string[]).length) list.select(field.value as string[]);
      made = list;
    } else continue;
    if (field.required) made.enableRequired();
    tell(made.acroField.dict, field.label);
    mergeWidget(doc, made);
  }
}

/** The kinds of fields the engine keeps, and fills. */
const FILLED = [PDFTextField, PDFCheckBox, PDFRadioGroup, PDFDropdown, PDFOptionList];

/** Writes what the fields hold; those no longer in the Pdf (their pages taken out) are taken out of the form. */
function fillForm(doc: PDFDocument, fields: Field[], keep: boolean) {
  const form = formOf(doc);
  if (!form?.getFields().length) return;
  const byName = new Map(fields.map((field) => [field.name, field]));
  for (const field of form.getFields()) {
    const ours = byName.get(field.getName());
    if (!ours) {
      // Only a field of a kind the engine keeps is taken out: a signature, or a button, is no field of it, and stays.
      if (keep && FILLED.some((kind) => field instanceof kind)) {
        try {
          form.removeField(field);
        } catch {
          // A field whose widgets have no page is left; its pages are gone with it.
        }
      }
      continue;
    }
    if (ours.kind === 'signature') continue;
    const value = ours.value;
    // What holds what it held is not written again: a signed PDF changes only where it was filled.
    if (JSON.stringify(readField(field)?.value) === JSON.stringify(value)) continue;
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
    case 'redaction':
      return boundsOf(
        mark.rects.flatMap((r) => [
          { x: r.x, y: r.y },
          { x: r.x + r.width, y: r.y + r.height },
        ]),
      );
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
  if (mark.kind === 'redaction') return;
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
  annotate(page, doc.context.register(annot));
}

/** The font text marks are written in: the one given, with the letters used alone, or Helvetica. */
async function textFont(doc: PDFDocument, bytes?: Uint8Array): Promise<PDFFont> {
  if (!bytes) return doc.embedFont(StandardFonts.Helvetica);
  doc.registerFontkit((await import('@cantoo/fontkit')).default);
  return doc.embedFont(bytes, { subset: true });
}

const STANDARD_FAMILIES = {
  sans: [StandardFonts.Helvetica, StandardFonts.HelveticaBold, StandardFonts.HelveticaOblique, StandardFonts.HelveticaBoldOblique],
  serif: [StandardFonts.TimesRoman, StandardFonts.TimesRomanBold, StandardFonts.TimesRomanItalic, StandardFonts.TimesRomanBoldItalic],
  mono: [StandardFonts.Courier, StandardFonts.CourierBold, StandardFonts.CourierOblique, StandardFonts.CourierBoldOblique],
};

/** The standard font of a text mark's family, weight and slant, put in the document once. */
function standardFont(doc: PDFDocument, mark: TextMark): Promise<PDFFont> {
  const name = STANDARD_FAMILIES[mark.family ?? 'sans'][(mark.bold ? 1 : 0) + (mark.italic ? 2 : 0)];
  const cache = ((doc as unknown as { rpFonts?: Map<string, Promise<PDFFont>> }).rpFonts ??= new Map());
  let font = cache.get(name);
  if (!font) cache.set(name, (font = doc.embedFont(name)));
  return font;
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
  // In place of the page's text, on one line, as it was.
  const lines = mark.replaces ? [text.replace(/\n/g, ' ')] : wrap(text, mark.rect.width, (line) => font.widthOfTextAtSize(line, mark.size));
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
