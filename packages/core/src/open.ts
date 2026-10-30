// A PDF opened: its pages, what it says of itself and its form fields, read
// with pdf-lib. The bytes are kept as they came, to be drawn and saved from.

import { PDFCheckBox, PDFDocument, type PDFField, PDFDropdown, PDFHexString, PDFName, PDFOptionList, PDFRadioGroup, type PDFRef, PDFString, PDFTextField } from '@cantoo/pdf-lib';
import { type Field, type Page, type Pdf, PdfError, type Rect } from './types';

/** How many objects pdf-lib reads or writes before it lets the page answer. */
export const OBJECTS_AT_ONCE = 1500;

let counter = 0;
/** An id not used before in this run. */
export const uid = (prefix: string) => `${prefix}${Date.now().toString(36).slice(-4)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export interface OpenOptions {
  /** Its name, as a file. */
  name?: string;
  /** For a PDF that asks for one to be opened. */
  password?: string;
}

/** Loads a file with pdf-lib, saying in words what keeps it from being opened. */
export async function loadDocument(bytes: Uint8Array, password?: string): Promise<PDFDocument> {
  if (!bytes.length) throw new PdfError('empty', 'The file is empty.');
  try {
    // Read in batches big enough not to be slow (pdf-lib waits between every hundred objects), small enough for a page to keep answering.
    return await PDFDocument.load(bytes, { password, updateMetadata: false, parseSpeed: OBJECTS_AT_ONCE });
  } catch (error) {
    const text = error instanceof Error ? `${error.name} ${error.message}` : String(error);
    if (/encrypt/i.test(text)) throw new PdfError('encrypted', password ? 'The password is not the one of this PDF.' : 'This PDF is protected by a password.');
    throw new PdfError('invalid', `This is not a PDF that can be read: ${error instanceof Error ? error.message : text}`);
  }
}

/**
 * The form of a document. An XFA form beside it (as forms of Adobe's have)
 * is taken out first: what is filled goes in the AcroForm, which every reader
 * reads, and an XFA left behind would show readers that read it what it held
 * before.
 */
export function formOf(doc: PDFDocument): ReturnType<PDFDocument['getForm']> | undefined {
  try {
    doc.catalog.getAcroForm()?.dict.delete(PDFName.of('XFA'));
    return doc.getForm();
  } catch {
    return undefined;
  }
}

/** Opens a PDF from its bytes. */
export async function openPdf(bytes: Uint8Array, options: OpenOptions = {}): Promise<Pdf> {
  const source = uid('s');
  const { pages, fields, info } = await readSource(source, bytes, options.password);
  return { name: options.name ?? (info.title ? `${info.title}.pdf` : 'document.pdf'), sources: { [source]: bytes }, pages, fields, marks: [], info };
}

/** What a file gives a Pdf: its pages and fields, with ids of the source it is given. */
export async function readSource(source: string, bytes: Uint8Array, password?: string): Promise<Pick<Pdf, 'pages' | 'fields' | 'info'>> {
  const doc = await loadDocument(bytes, password);
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

function readField(field: PDFField): Pick<Field, 'kind' | 'value' | 'options' | 'multiline' | 'maxLength'> | undefined {
  if (field instanceof PDFTextField) return { kind: 'text', value: field.getText() ?? '', multiline: field.isMultiline() || undefined, maxLength: field.getMaxLength() };
  if (field instanceof PDFCheckBox) return { kind: 'checkbox', value: field.isChecked() };
  if (field instanceof PDFRadioGroup) return { kind: 'radio', value: field.getSelected() ?? '', options: field.getOptions() };
  if (field instanceof PDFDropdown) return { kind: 'choice', value: field.getSelected()[0] ?? '', options: field.getOptions() };
  if (field instanceof PDFOptionList) return { kind: 'list', value: field.getSelected(), options: field.getOptions() };
  // Buttons and signature fields hold nothing to fill.
  return undefined;
}
