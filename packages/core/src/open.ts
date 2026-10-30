// A PDF opened: its pages, what it says of itself and its form fields, read
// with pdf-lib. The bytes are kept as they came, to be drawn and saved from.

import {
  PDFCheckBox,
  PDFDocument,
  type PDFField,
  PDFDropdown,
  PDFHexString,
  PDFName,
  PDFOptionList,
  PDFRadioGroup,
  type PDFRef,
  PDFSignature,
  PDFString,
  PDFTextField,
  PDFDict,
} from '@cantoo/pdf-lib';
import { dateOf, takeMarks } from './annotations';
import { dropUnreachable, OBJECTS_AT_ONCE } from './objects';
import { writeDocument } from './writer';
import { type Field, type Page, type Pdf, PdfError, type Rect, type Signature } from './types';
import { attachmentsOf } from './outline';

let counter = 0;
/** An id not used before in this run. */
export const uid = (prefix: string) => `${prefix}${Date.now().toString(36).slice(-4)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export interface OpenOptions {
  /** Its name, as a file. */
  name?: string;
  /** For a PDF that asks for one to be opened. What is saved of it asks for none. */
  password?: string;
  /**
   * Whether the highlights, notes and ink it comes with are taken as marks,
   * to be changed and deleted. They are, unless false: then they stay in the
   * pages as they are.
   */
  marks?: boolean;
}

/** The documents that were opened with a password (an empty one, too). */
const unlockedDocs = new WeakSet<PDFDocument>();

/** Loads a file with pdf-lib, saying in words what keeps it from being opened. */
export async function loadDocument(bytes: Uint8Array, password?: string, incremental = false): Promise<PDFDocument> {
  if (!bytes.length) throw new PdfError('empty', 'The file is empty.');
  // Read in batches big enough not to be slow (pdf-lib waits between every hundred objects), small enough for a page to keep answering.
  const load = (pass?: string) => PDFDocument.load(bytes, { password: pass, updateMetadata: false, parseSpeed: OBJECTS_AT_ONCE, forIncrementalUpdate: incremental });
  const locked = (error: unknown) => /encrypt|password/i.test(error instanceof Error ? `${error.name} ${error.message}` : String(error));
  try {
    const doc = await load(password);
    // A password given for a PDF that asks for none goes unused: only one used is told.
    if (
      password !== undefined &&
      (await load().then(
        () => false,
        () => true,
      ))
    )
      unlockedDocs.add(doc);
    return doc;
  } catch (error) {
    if (!locked(error)) throw new PdfError('invalid', `This is not a PDF that can be read: ${error instanceof Error ? error.message : String(error)}`);
    if (password) throw new PdfError('encrypted', 'The password is not the one of this PDF.');
  }
  // Protected only from being changed, as many are: every reader opens it with no password, which is an empty one.
  try {
    const doc = await load('');
    unlockedDocs.add(doc);
    return doc;
  } catch {
    throw new PdfError('encrypted', 'This PDF is protected by a password.');
  }
}

/** The bytes of a protected PDF as they read without its protection. */
async function unlocked(doc: PDFDocument): Promise<Uint8Array> {
  // What pdf-lib read it has read open; what said how it was locked (its dictionary of encryption, its old table of objects) goes.
  doc.context.trailerInfo.Encrypt = undefined;
  dropUnreachable(doc);
  return writeDocument(doc);
}

/**
 * The form of a document. An XFA form beside it (as forms of Adobe's have)
 * is taken out first: what is filled goes in the AcroForm, which every reader
 * reads, and an XFA left behind would show readers that read it what it held
 * before.
 */
export function formOf(doc: PDFDocument): ReturnType<PDFDocument['getForm']> | undefined {
  try {
    const acro = doc.catalog.getAcroForm();
    if (acro?.dict.has(PDFName.of('XFA'))) acro.dict.delete(PDFName.of('XFA'));
    return doc.getForm();
  } catch {
    return undefined;
  }
}

/** Opens a PDF from its bytes. */
export async function openPdf(bytes: Uint8Array, options: OpenOptions = {}): Promise<Pdf> {
  const source = uid('s');
  // A protected PDF is kept open: its bytes as they read without its protection, for PDF.js to draw and to be saved from.
  let doc = await loadDocument(bytes, options.password);
  if (unlockedDocs.has(doc)) {
    bytes = await unlocked(doc);
    doc = await loadDocument(bytes);
  }
  const { pages, fields, info } = await readSource(source, bytes, undefined, doc);
  const signatures = signaturesOf(doc, source);
  const attachments = attachmentsOf(doc);
  const pdf: Pdf = {
    name: options.name ?? (info.title ? `${info.title}.pdf` : 'document.pdf'),
    sources: { [source]: bytes },
    pages,
    fields,
    marks: [],
    info,
    ...(signatures.length ? { signatures } : {}),
    attachments,
  };
  if (options.marks === false) return pdf;
  // The highlights, notes and ink it came with, as marks. Its bytes stay as they came (a signature holds on them);
  // PDF.js draws it from bytes without them, which the viewer draws.
  const { marks, refs } = takeMarks(doc, pages);
  if (!marks.length) return pdf;
  dropUnreachable(doc);
  return { ...pdf, marks, drawn: { [source]: await writeDocument(doc) }, taken: { [source]: refs } };
}

/** The digital signatures of a document: who signed, and when, as each says. */
function signaturesOf(doc: PDFDocument, source: string): Signature[] {
  const out: Signature[] = [];
  for (const field of formOf(doc)?.getFields() ?? []) {
    if (!(field instanceof PDFSignature)) continue;
    const value = field.acroField.dict.lookup(PDFName.of('V'));
    if (!(value instanceof PDFDict)) continue;
    const read = (key: string) => {
      const v = value.lookup(PDFName.of(key));
      return v instanceof PDFString || v instanceof PDFHexString ? v.decodeText().trim() : '';
    };
    const name = read('Name');
    const reason = read('Reason');
    const date = dateOf(read('M'));
    out.push({ source, field: field.getName(), ...(name ? { name } : {}), ...(date ? { date } : {}), ...(reason ? { reason } : {}) });
  }
  return out;
}

/** What a file gives a Pdf: its pages and fields, with ids of the source it is given. */
export async function readSource(source: string, bytes: Uint8Array, password?: string, read?: PDFDocument): Promise<Pick<Pdf, 'pages' | 'fields' | 'info'>> {
  const doc = read ?? (await loadDocument(bytes, password));
  const refs = new Map<string, string>();
  const pages: Page[] = doc.getPages().map((page, index) => {
    const id = uid('p');
    refs.set(page.ref.toString(), id);
    const box = page.getCropBox();
    const turned = (((page.getRotation().angle % 360) + 360) % 360) as Page['rotation'];
    return { id, source, index, box: { x: box.x, y: box.y, width: box.width, height: box.height }, rotation: [0, 90, 180, 270].includes(turned) ? turned : 0 };
  });
  // A widget that does not say its page is looked for among the annotations of each.
  const annots = new Map<string, string>();
  for (const page of doc.getPages()) {
    const list = page.node.Annots();
    for (let i = 0; list && i < list.size(); i++) annots.set(String(list.get(i)), refs.get(page.ref.toString())!);
  }
  const pageOf = (ref: PDFRef | undefined, widget: string) => (ref && refs.get(ref.toString())) ?? annots.get(widget);

  const fields: Field[] = [];
  for (const field of formOf(doc)?.getFields() ?? []) {
    const read = readField(field);
    if (!read) continue;
    const widgets: Field['widgets'] = [];
    field.acroField.getWidgets().forEach((widget, i) => {
      const page = pageOf(widget.P(), String(doc.context.getObjectRef(widget.dict)));
      if (!page) return;
      const r = widget.getRectangle();
      const rect: Rect = { x: Math.min(r.x, r.x + r.width), y: Math.min(r.y, r.y + r.height), width: Math.abs(r.width), height: Math.abs(r.height) };
      // The choice of each button of a radio, by name: its value inside may be only its number.
      const option = read.kind === 'radio' ? (read.options?.[i] ?? widget.getOnValue()?.decodeText()) : undefined;
      widgets.push({ page, rect, ...(option ? { option } : {}) });
    });
    if (!widgets.length) continue;
    const name = field.getName();
    // What the field is called for a person, as the PDF says it (its tooltip), when it says so.
    const told = field.acroField.dict.lookup(PDFName.of('TU'));
    const label = told instanceof PDFString || told instanceof PDFHexString ? told.decodeText().trim() : '';
    fields.push({ id: `${source}/${name}`, source, name, ...(label ? { label } : {}), ...read, readOnly: field.isReadOnly() || undefined, required: field.isRequired() || undefined, widgets });
  }
  const info = { title: doc.getTitle() || undefined, author: doc.getAuthor() || undefined, subject: doc.getSubject() || undefined };
  return { pages, fields, info };
}

export function readField(field: PDFField): Pick<Field, 'kind' | 'value' | 'options' | 'multiline' | 'maxLength'> | undefined {
  if (field instanceof PDFTextField) return { kind: 'text', value: field.getText() ?? '', multiline: field.isMultiline() || undefined, maxLength: field.getMaxLength() };
  if (field instanceof PDFCheckBox) return { kind: 'checkbox', value: field.isChecked() };
  if (field instanceof PDFRadioGroup) return { kind: 'radio', value: field.getSelected() ?? '', options: field.getOptions() };
  if (field instanceof PDFDropdown) return { kind: 'choice', value: field.getSelected()[0] ?? '', options: field.getOptions() };
  if (field instanceof PDFOptionList) return { kind: 'list', value: field.getSelected(), options: field.getOptions() };
  // A signature field not signed yet is where the PDF is to be signed; one signed is among its signatures.
  if (field instanceof PDFSignature && !field.acroField.dict.get(PDFName.of('V'))) return { kind: 'signature', value: '' };
  // Buttons hold nothing to fill.
  return undefined;
}
