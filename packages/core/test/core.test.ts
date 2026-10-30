import { describe, expect, it } from 'vitest';
import {
  addMark,
  extractPages,
  findField,
  insertPdf,
  markBounds,
  movePages,
  openPdf,
  type Pdf,
  PdfError,
  pageSize,
  pageText,
  readerOf,
  removeMark,
  removePages,
  rotatePages,
  samplePdf,
  samplePdfBytes,
  savePdf,
  searchPdf,
  setField,
  updateMark,
} from '../src';

const reopen = async (pdf: Pdf, flatten = false) => openPdf(await savePdf(pdf, { flatten }));
const annotations = async (pdf: Pdf) => {
  const reader = await readerOf(Object.values(pdf.sources)[0]);
  const out: string[][] = [];
  for (let i = 1; i <= reader.numPages; i++) out.push((await (await reader.getPage(i)).getAnnotations()).filter((a) => a.subtype !== 'Widget').map((a) => a.subtype));
  return out;
};

describe('opening', () => {
  it('reads the pages, what the file says of itself and its form', async () => {
    const pdf = await samplePdf('es');
    expect(pdf.name).toBe('Contrato de servicios.pdf');
    expect(pdf.pages).toHaveLength(2);
    expect(pageSize(pdf.pages[0])).toEqual({ width: 595.28, height: 841.89 });
    expect(pdf.info).toMatchObject({ title: 'Contrato de servicios', author: 'Rebo Studio' });
    expect(pdf.fields.map((f) => [f.name, f.kind, f.value])).toEqual([
      ['client.name', 'text', ''],
      ['client.email', 'text', ''],
      ['start', 'text', ''],
      ['plan', 'choice', ''],
      ['billing', 'radio', ''],
      ['accept', 'checkbox', false],
    ]);
    expect(findField(pdf, 'plan')?.options).toEqual(['Básico', 'Profesional', 'Empresa']);
    const billing = findField(pdf, 'billing')!;
    expect(billing.widgets.map((w) => w.option)).toEqual(['Mensual', 'Anual']);
    expect(billing.widgets.every((w) => w.page === pdf.pages[0].id)).toBe(true);
  });

  it('says in words what keeps a file from being opened', async () => {
    await expect(openPdf(new Uint8Array())).rejects.toMatchObject({ code: 'empty' });
    await expect(openPdf(new TextEncoder().encode('not a pdf at all'))).rejects.toBeInstanceOf(PdfError);
  });
});

describe('the form', () => {
  it('is filled, saved and read back as a form', async () => {
    let pdf = await samplePdf('en');
    pdf = setField(pdf, 'client.name', 'Ana García');
    pdf = setField(pdf, 'plan', 'Professional');
    pdf = setField(pdf, 'billing', 'Yearly');
    pdf = setField(pdf, 'accept', 'yes');
    const back = await reopen(pdf);
    expect(Object.fromEntries(back.fields.map((f) => [f.name, f.value]))).toMatchObject({ 'client.name': 'Ana García', plan: 'Professional', billing: 'Yearly', accept: true });
  });

  it('takes only what a field can hold', async () => {
    const pdf = await samplePdf('en');
    expect(() => setField(pdf, 'plan', 'Gold')).toThrow(/Basic, Professional, Business/);
    expect(() => setField(pdf, 'nothing', 'x')).toThrow(PdfError);
    expect(findField(setField(pdf, 'client.name', 'one\ntwo'), 'client.name')?.value).toBe('one two');
  });

  it('is drawn into the page when flattened', async () => {
    const pdf = setField(await samplePdf('en'), 'client.name', 'Ana García');
    const flat = await reopen(pdf, true);
    expect(flat.fields).toEqual([]);
    expect((await pageText(flat, flat.pages[0].id)).text).toContain('Ana García');
  });
});

describe('pages', () => {
  it('are turned, moved and taken out, and saved so', async () => {
    let pdf = await samplePdf('en');
    const [one, two] = pdf.pages.map((p) => p.id);
    pdf = rotatePages(pdf, [two], 90);
    expect(pageSize(pdf.pages[1])).toEqual({ width: 841.89, height: 595.28 });
    expect(rotatePages(pdf, [two], -90).pages[1].rotation).toBe(0);
    pdf = movePages(pdf, [two], one);
    expect(pdf.pages.map((p) => p.id)).toEqual([two, one]);
    expect(movePages(pdf, [two], null).pages.map((p) => p.id)).toEqual([one, two]);
    const back = await reopen(pdf);
    expect(back.pages.map((p) => p.rotation)).toEqual([90, 0]);
    expect((await pageText(back, back.pages[0].id)).text).toContain('Confidentiality');
    // The form went with the first page, now the second.
    expect(back.fields[0].widgets[0].page).toBe(back.pages[1].id);

    const less = removePages(pdf, [one]);
    expect(less.pages).toHaveLength(1);
    expect(less.fields).toEqual([]);
    expect((await reopen(less)).fields).toEqual([]);
    expect(() => removePages(less, [two])).toThrow(/one page at least/);
  });

  it('of two PDFs are joined, and some taken into one of their own', async () => {
    const en = setField(await samplePdf('en'), 'client.name', 'Ana');
    const es = setField(await samplePdf('es'), 'client.name', 'Luis');
    const both = insertPdf(en, es, 1);
    expect(both.pages).toHaveLength(4);
    expect(Object.keys(both.sources)).toHaveLength(2);
    expect(both.fields).toHaveLength(12);
    const back = await reopen(both);
    const texts = await Promise.all(back.pages.map(async (p) => (await pageText(back, p.id)).text));
    expect(texts[0]).toContain('Service agreement');
    expect(texts[1]).toContain('Contrato de servicios');
    // The form of the first is a form still; that of the second is drawn into its page.
    expect(back.fields.map((f) => f.name)).toContain('client.name');
    expect(findField(back, 'client.name')?.value).toBe('Ana');
    expect(texts[1]).toContain('Luis');

    const part = extractPages(both, [both.pages[0].id, both.pages[1].id]);
    expect(Object.keys(part.sources)).toHaveLength(2);
    const saved = await reopen(part);
    expect(saved.pages).toHaveLength(2);
  });

  it('taken out are gone from the bytes of the file, not only from its list of pages', async () => {
    const pdf = await samplePdf('en');
    const objects = async (bytes: Uint8Array) => (await import('@cantoo/pdf-lib')).PDFDocument.load(bytes).then((doc) => doc.context.enumerateIndirectObjects().length);
    const whole = await objects(await savePdf(pdf));
    const one = await objects(await savePdf(removePages(pdf, [pdf.pages[0].id])));
    // The first page held the form: its fields, their looks, its content go with it.
    expect(one).toBeLessThan(whole - 10);
  });

  it('of the same PDF joined twice keep apart', async () => {
    const pdf = await samplePdf('en');
    const twice = insertPdf(pdf, pdf);
    expect(new Set(twice.pages.map((p) => p.id)).size).toBe(4);
    expect(new Set(twice.fields.map((f) => f.id)).size).toBe(12);
    expect((await reopen(twice)).pages).toHaveLength(4);
  });
});

describe('marks', () => {
  it('go on as annotations any reader shows', async () => {
    let pdf = await samplePdf('en');
    const page = pdf.pages[0].id;
    const [found] = await searchPdf(pdf, 'Rebo Studio ("the provider")');
    pdf = addMark(pdf, { kind: 'highlight', page, rects: found.rects, color: '#ffd400', text: found.text, comment: 'Check the name' });
    pdf = addMark(pdf, { kind: 'note', page, at: { x: 500, y: 700 }, text: 'Señal pagada', color: '#f59f00' });
    pdf = addMark(pdf, {
      kind: 'ink',
      page,
      paths: [
        [
          { x: 100, y: 100 },
          { x: 150, y: 140 },
          { x: 200, y: 100 },
        ],
      ],
      color: '#1971c2',
      width: 2,
    });
    pdf = addMark(pdf, { kind: 'text', page: pdf.pages[1].id, rect: { x: 64, y: 400, width: 200, height: 40 }, text: 'Madrid, 29 de octubre', size: 12, color: '#000000' });
    pdf = addMark(pdf, {
      kind: 'signature',
      page: pdf.pages[1].id,
      rect: { x: 64, y: 240, width: 180, height: 60 },
      paths: [
        [
          { x: 0, y: 0.8 },
          { x: 0.3, y: 0.1 },
          { x: 0.6, y: 0.9 },
          { x: 1, y: 0.2 },
        ],
      ],
      color: '#0b1f4d',
    });
    const back = await reopen(pdf);
    expect(await annotations(back)).toEqual([['Highlight', 'Text', 'Ink'], []]);
    const reader = await readerOf(Object.values(back.sources)[0]);
    const notes = await (await reader.getPage(1)).getAnnotations();
    expect(notes.find((a) => a.subtype === 'Text')?.contentsObj?.str).toBe('Señal pagada');
    expect(notes.find((a) => a.subtype === 'Highlight')?.contentsObj?.str).toBe('Check the name');
    expect((await pageText(back, back.pages[1].id)).text).toContain('Madrid, 29 de octubre');

    const flat = await reopen(pdf, true);
    expect(await annotations(flat)).toEqual([[], []]);
  });

  it('are changed and taken off, and leave with their page', async () => {
    let pdf = await samplePdf('en');
    pdf = addMark(pdf, { kind: 'note', page: pdf.pages[1].id, at: { x: 10, y: 50 }, text: 'a', color: '#f59f00' });
    const id = pdf.marks[0].id;
    pdf = updateMark(pdf, id, { text: 'b' } as never);
    expect(pdf.marks[0]).toMatchObject({ text: 'b' });
    expect(markBounds(pdf.marks[0])).toEqual({ x: 10, y: 30, width: 20, height: 20 });
    expect(removeMark(pdf, id).marks).toEqual([]);
    expect(removePages(pdf, [pdf.pages[1].id]).marks).toEqual([]);
    expect(() => addMark(pdf, { kind: 'note', page: 'nowhere', at: { x: 0, y: 0 }, text: '', color: '#000000' })).toThrow(PdfError);
  });

  it('keep only the letters the font has', async () => {
    let pdf = await samplePdf('en');
    pdf = addMark(pdf, { kind: 'text', page: pdf.pages[0].id, rect: { x: 64, y: 100, width: 300, height: 20 }, text: 'Done ✅ — ok', size: 10, color: '#000000' });
    const back = await reopen(pdf);
    expect((await pageText(back, back.pages[0].id)).text).toMatch(/Done\s+— ok/);
  });
});

describe('text', () => {
  it('is read a page at a time and found without minding capitals or accents', async () => {
    const pdf = await samplePdf('es');
    const text = await pageText(pdf, pdf.pages[1].id);
    expect(text.text).toContain('3. Confidencialidad');
    const found = await searchPdf(pdf, 'CONFIDENCIALIDAD');
    expect(found).toHaveLength(1);
    expect(found[0].page).toBe(pdf.pages[1].id);
    expect(found[0].text).toBe('Confidencialidad');
    expect(found[0].rects).toHaveLength(1);
    expect(await searchPdf(pdf, 'terminacion')).toHaveLength(1);
    expect((await searchPdf(pdf, 'treinta días')).length).toBe(2);
    expect(await searchPdf(pdf, '   ')).toEqual([]);
  });

  it('is found across the end of a line, one box a line', async () => {
    const pdf = await samplePdf('en');
    const intro = (await pageText(pdf, pdf.pages[0].id)).text.split('\n');
    const [end, start] = [intro[3].split(' ').slice(-2).join(' '), intro[4].split(' ').slice(0, 2).join(' ')];
    const [found] = await searchPdf(pdf, `${end} ${start}`);
    expect(found.rects).toHaveLength(2);
    expect(found.rects[0].y).toBeGreaterThan(found.rects[1].y);
  });

  it('is the same in the sample every time', async () => {
    expect(Buffer.from(await samplePdfBytes('en')).equals(Buffer.from(await samplePdfBytes('en')))).toBe(true);
  });
});
