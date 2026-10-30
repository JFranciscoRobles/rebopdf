// What is done to a PDF, each a new Pdf: pages turned, taken out, moved,
// joined from another PDF and taken into one of their own; fields filled;
// marks put on, changed and taken off. The files themselves are never changed.

import { PDFDocument } from '@cantoo/pdf-lib';
import { openPdf, uid } from './open';
import { type Field, type Mark, type MarkPatch, type NewMark, type Page, type Pdf, PdfError } from './types';

/** The page of this id. */
export const pageById = (pdf: Pdf, id: string): Page | undefined => pdf.pages.find((page) => page.id === id);

/** The page at this number, from 1, as a person counts them. */
export const pageAt = (pdf: Pdf, number: number): Page | undefined => pdf.pages[number - 1];

/** The number of a page, from 1; 0 when it is not there. */
export const pageNumber = (pdf: Pdf, id: string): number => pdf.pages.findIndex((page) => page.id === id) + 1;

/** How big a page is as it is seen, turned. */
export function pageSize(page: Page): { width: number; height: number } {
  const across = page.rotation === 90 || page.rotation === 270;
  return across ? { width: page.box.height, height: page.box.width } : { width: page.box.width, height: page.box.height };
}

const need = (pdf: Pdf, ids: string[]) => {
  const set = new Set(ids);
  for (const id of set) if (!pageById(pdf, id)) throw new PdfError('not-found', `There is no page ${id}.`);
  return set;
};

/** Turns pages clockwise by 90, 180 or 270 degrees (or back, by -90). */
export function rotatePages(pdf: Pdf, ids: string[], by: number): Pdf {
  const set = need(pdf, ids);
  const turn = (page: Page) => ((((page.rotation + by) % 360) + 360) % 360) as Page['rotation'];
  return { ...pdf, pages: pdf.pages.map((page) => (set.has(page.id) ? { ...page, rotation: turn(page) } : page)) };
}

/** Takes pages out, with their marks and the fields only on them. One page at least stays. */
export function removePages(pdf: Pdf, ids: string[]): Pdf {
  const set = need(pdf, ids);
  if (pdf.pages.every((page) => set.has(page.id))) throw new PdfError('empty', 'A PDF keeps one page at least.');
  return keepPages(pdf, (page) => !set.has(page.id));
}

/** Moves pages, in the order they are in, to before another page, or to the end. */
export function movePages(pdf: Pdf, ids: string[], before: string | null): Pdf {
  const set = need(pdf, ids);
  if (before !== null && !pageById(pdf, before)) throw new PdfError('not-found', `There is no page ${before}.`);
  const moved = pdf.pages.filter((page) => set.has(page.id));
  const rest = pdf.pages.filter((page) => !set.has(page.id));
  // Before one of those moved: before the first not moved after it.
  let at = before === null ? rest.length : rest.findIndex((page) => page.id === before);
  if (at < 0) {
    const from = pdf.pages.findIndex((page) => page.id === before);
    const next = pdf.pages.slice(from).find((page) => !set.has(page.id));
    at = next ? rest.indexOf(next) : rest.length;
  }
  return { ...pdf, pages: [...rest.slice(0, at), ...moved, ...rest.slice(at)] };
}

/** Puts the pages of another PDF in, before the page at this place (from 0), or at the end. */
export function insertPdf(pdf: Pdf, other: Pdf, at = pdf.pages.length): Pdf {
  // Its files go under ids of their own, in case it was made from the same.
  const renamed: Record<string, string> = {};
  const sources = { ...pdf.sources };
  for (const [id, bytes] of Object.entries(other.sources)) {
    const next = id in sources ? uid('s') : id;
    renamed[id] = next;
    sources[next] = bytes;
  }
  const pageIds: Record<string, string> = {};
  const pages = other.pages.map((page) => {
    const id = pdf.pages.some((p) => p.id === page.id) ? uid('p') : page.id;
    pageIds[page.id] = id;
    return { ...page, id, source: renamed[page.source] };
  });
  const fields = other.fields.map((field) => ({
    ...field,
    id: `${renamed[field.source]}/${field.name}`,
    source: renamed[field.source],
    widgets: field.widgets.map((widget) => ({ ...widget, page: pageIds[widget.page] })),
  }));
  const marks = other.marks.map((mark) => ({ ...mark, id: pdf.marks.some((m) => m.id === mark.id) ? uid('m') : mark.id, page: pageIds[mark.page] }));
  const place = Math.max(0, Math.min(at, pdf.pages.length));
  const byFile = <T>(mine: Record<string, T> | undefined, theirs: Record<string, T> | undefined) => {
    const all = { ...mine, ...Object.fromEntries(Object.entries(theirs ?? {}).map(([id, value]) => [renamed[id], value])) };
    return Object.keys(all).length ? all : undefined;
  };
  const drawn = byFile(pdf.drawn, other.drawn);
  const taken = byFile(pdf.taken, other.taken);
  const signatures = [...(pdf.signatures ?? []), ...(other.signatures ?? []).map((s) => ({ ...s, source: renamed[s.source] }))];
  return {
    ...pdf,
    sources,
    pages: [...pdf.pages.slice(0, place), ...pages, ...pdf.pages.slice(place)],
    fields: [...pdf.fields, ...fields],
    marks: [...pdf.marks, ...marks],
    ...(drawn ? { drawn } : {}),
    ...(taken ? { taken } : {}),
    ...(signatures.length ? { signatures } : {}),
  };
}

/** Puts a blank page before the page at this place (from 0), or at the end: as big as the page before it, or as this size in points. */
export async function insertBlankPage(pdf: Pdf, at = pdf.pages.length, size?: { width: number; height: number }): Promise<Pdf> {
  const near = pdf.pages[Math.max(0, Math.min(at, pdf.pages.length) - 1)];
  const { width, height } = size ?? (near ? pageSize(near) : { width: 595.28, height: 841.89 });
  const doc = await PDFDocument.create();
  doc.addPage([width, height]);
  doc.setProducer('ReboPDF');
  return insertPdf(pdf, await openPdf(await doc.save()), at);
}

/** A PDF of these pages alone, in the order they are in, with their fields and marks. */
export function extractPages(pdf: Pdf, ids: string[], name?: string): Pdf {
  const set = need(pdf, ids);
  if (!set.size) throw new PdfError('empty', 'A PDF keeps one page at least.');
  const kept = keepPages(pdf, (page) => set.has(page.id));
  const used = new Set(kept.pages.map((page) => page.source));
  const only = <T>(all: Record<string, T> | undefined) => (all ? Object.fromEntries(Object.entries(all).filter(([id]) => used.has(id))) : undefined);
  const signatures = pdf.signatures?.filter((s) => used.has(s.source));
  return {
    ...kept,
    sources: only(pdf.sources)!,
    drawn: only(pdf.drawn),
    taken: only(pdf.taken),
    signatures: signatures?.length ? signatures : undefined,
    name: name ?? pdf.name.replace(/(\.pdf)?$/i, ' (pages).pdf'),
  };
}

function keepPages(pdf: Pdf, keep: (page: Page) => boolean): Pdf {
  const pages = pdf.pages.filter(keep);
  const ids = new Set(pages.map((page) => page.id));
  const fields = pdf.fields.map((field) => ({ ...field, widgets: field.widgets.filter((widget) => ids.has(widget.page)) })).filter((field) => field.widgets.length);
  return { ...pdf, pages, fields, marks: pdf.marks.filter((mark) => ids.has(mark.page)) };
}

/** A new id for a mark. */
export const markId = () => uid('m');

/** Puts a mark on a page. One without an id is given one; the mark put on is the last of `marks`. */
export function addMark(pdf: Pdf, mark: NewMark): Pdf {
  if (!pageById(pdf, mark.page)) throw new PdfError('not-found', `There is no page ${mark.page}.`);
  const made = { ...mark, id: mark.id ?? markId(), date: mark.date ?? new Date().toISOString() } as Mark;
  return { ...pdf, marks: [...pdf.marks, made] };
}

/** Changes a mark: what it says, where it is, its colour. */
export function updateMark(pdf: Pdf, id: string, patch: MarkPatch): Pdf {
  if (!pdf.marks.some((mark) => mark.id === id)) throw new PdfError('not-found', `There is no mark ${id}.`);
  return { ...pdf, marks: pdf.marks.map((mark) => (mark.id === id ? ({ ...mark, ...patch, date: new Date().toISOString() } as Mark) : mark)) };
}

export function removeMark(pdf: Pdf, id: string): Pdf {
  return { ...pdf, marks: pdf.marks.filter((mark) => mark.id !== id) };
}

/** The marks on a page, in the order they were put on. */
export const marksOn = (pdf: Pdf, page: string): Mark[] => pdf.marks.filter((mark) => mark.page === page);

/** The fields with a place on a page. */
export const fieldsOn = (pdf: Pdf, page: string): Field[] => pdf.fields.filter((field) => field.widgets.some((widget) => widget.page === page));

/** A field by its id, or by its name when no other field has it. */
export function findField(pdf: Pdf, key: string): Field | undefined {
  const byId = pdf.fields.find((field) => field.id === key);
  if (byId) return byId;
  const named = pdf.fields.filter((field) => field.name === key);
  return named.length === 1 ? named[0] : undefined;
}

/** Fills a field. A choice must be one of its options; a checkbox takes true or false. */
export function setField(pdf: Pdf, key: string, value: Field['value']): Pdf {
  const field = findField(pdf, key);
  if (!field) throw new PdfError('not-found', `There is no field ${key}.`);
  return { ...pdf, fields: pdf.fields.map((f) => (f === field ? { ...f, value: checkValue(f, value) } : f)) };
}

function checkValue(field: Field, value: Field['value']): Field['value'] {
  const options = field.options ?? [];
  switch (field.kind) {
    case 'checkbox':
      if (typeof value === 'boolean') return value;
      return ['true', 'yes', 'on', 'sí', 'si', '1', 'x'].includes(String(value).trim().toLowerCase());
    case 'text': {
      const text = Array.isArray(value) ? value.join(', ') : String(value);
      const flat = field.multiline ? text : text.replace(/\s*\n\s*/g, ' ');
      return field.maxLength ? flat.slice(0, field.maxLength) : flat;
    }
    case 'radio':
    case 'choice': {
      const text = String(Array.isArray(value) ? (value[0] ?? '') : value);
      if (text && !options.includes(text)) throw new PdfError('not-found', `${field.name} takes one of: ${options.join(', ')}.`);
      return text;
    }
    case 'list': {
      const list = (Array.isArray(value) ? value : [String(value)]).filter(Boolean);
      const wrong = list.filter((item) => !options.includes(item));
      if (wrong.length) throw new PdfError('not-found', `${field.name} takes some of: ${options.join(', ')}.`);
      return list;
    }
  }
}
