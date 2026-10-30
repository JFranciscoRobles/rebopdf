import { describe, expect, it } from 'vitest';
import {
  addMark,
  extractPages,
  findField,
  insertBlankPage,
  linksOf,
  outlineOf,
  insertPdf,
  markBounds,
  movePages,
  openPdf,
  type Pdf,
  type Rect,
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

const reopen = async (pdf: Pdf, flatten = false, marks = true) => openPdf(await savePdf(pdf, { flatten }), { marks });
const annotations = async (pdf: Pdf) => {
  const reader = await readerOf(Object.values(pdf.sources)[0]);
  const out: string[][] = [];
  for (let i = 1; i <= reader.numPages; i++) out.push((await (await reader.getPage(i)).getAnnotations()).filter((a) => a.subtype !== 'Widget' && a.subtype !== 'Link').map((a) => a.subtype));
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
    // What each is called for a person, as the PDF says it.
    expect(pdf.fields.map((f) => f.label)).toEqual(['Nombre completo', 'Correo', 'Fecha de inicio', 'Plan', 'Facturación', 'He leído y acepto los términos de este contrato.']);
    const billing = findField(pdf, 'billing')!;
    expect(billing.widgets.map((w) => w.option)).toEqual(['Mensual', 'Anual']);
    expect(billing.widgets.every((w) => w.page === pdf.pages[0].id)).toBe(true);
  });

  it('opens a PDF protected by a password, given it, and saves it to be opened without one', async () => {
    const { PDFDocument } = await import('@cantoo/pdf-lib');
    const doc = await PDFDocument.load(await samplePdfBytes('en'));
    doc.encrypt({ userPassword: 'secret', ownerPassword: 'owner' });
    const locked = await doc.save();
    await expect(openPdf(locked)).rejects.toMatchObject({ code: 'encrypted', message: 'This PDF is protected by a password.' });
    await expect(openPdf(locked, { password: 'wrong' })).rejects.toMatchObject({ code: 'encrypted', message: 'The password is not the one of this PDF.' });
    const pdf = setField(await openPdf(locked, { password: 'secret' }), 'client.name', 'Ana');
    expect(pdf.pages).toHaveLength(2);
    const back = await openPdf(await savePdf(pdf));
    expect(findField(back, 'client.name')?.value).toBe('Ana');
    expect((await pageText(back, back.pages[1].id)).text).toContain('Confidentiality');

    // Protected only from being changed: opened as every reader opens it, with no password.
    const owned = await PDFDocument.load(await samplePdfBytes('en'));
    owned.encrypt({ userPassword: '', ownerPassword: 'owner' });
    const open = await openPdf(await owned.save());
    expect((await pageText(open, open.pages[0].id)).text).toContain('Service agreement');
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

  it('are put in blank, as big as the page before them, and saved with them', async () => {
    const pdf = rotatePages(await samplePdf('en'), [], 0);
    const more = await insertBlankPage(rotatePages(pdf, [pdf.pages[0].id], 90), 1);
    expect(more.pages).toHaveLength(3);
    expect(pageSize(more.pages[1])).toEqual({ width: 841.89, height: 595.28 });
    expect((await insertBlankPage(pdf, 0, { width: 200, height: 100 })).pages[0].box).toMatchObject({ width: 200, height: 100 });
    const back = await reopen(more);
    expect(back.pages).toHaveLength(3);
    expect((await pageText(back, back.pages[1].id)).text).toBe('');
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
    // Read as they are, not as marks.
    const back = await reopen(pdf, false, false);
    expect(await annotations(back)).toEqual([['Highlight', 'Text', 'Ink'], []]);
    const reader = await readerOf(Object.values(back.sources)[0]);
    const notes = await (await reader.getPage(1)).getAnnotations();
    expect(notes.find((a) => a.subtype === 'Text')?.contentsObj?.str).toBe('Señal pagada');
    expect(notes.find((a) => a.subtype === 'Highlight')?.contentsObj?.str).toBe('Check the name');
    expect((await pageText(back, back.pages[1].id)).text).toContain('Madrid, 29 de octubre');

    const flat = await reopen(pdf, true, false);
    expect(await annotations(flat)).toEqual([[], []]);
  });

  it('a PDF comes with are marks: changed, deleted, and saved again', async () => {
    let pdf = await samplePdf('en');
    const [one] = pdf.pages.map((p) => p.id);
    pdf = addMark(pdf, { kind: 'highlight', page: one, rects: [{ x: 64, y: 700, width: 100, height: 12 }], color: '#a5d8ff', comment: 'Look', author: 'Ana', date: '2026-10-29T10:00:00.000Z' });
    pdf = addMark(pdf, { kind: 'note', page: one, at: { x: 500, y: 700 }, text: 'Hola', color: '#2f9e44' });
    pdf = addMark(pdf, {
      kind: 'ink',
      page: one,
      paths: [
        [
          { x: 100, y: 100 },
          { x: 200, y: 150 },
        ],
      ],
      color: '#e03131',
      width: 3,
    });
    const back = await reopen(pdf);
    expect(back.marks.map((m) => m.kind)).toEqual(['highlight', 'note', 'ink']);
    const [highlight, note, ink] = back.marks;
    expect(highlight).toMatchObject({ page: back.pages[0].id, color: '#a5d8ff', comment: 'Look', author: 'Ana', date: '2026-10-29T10:00:00.000Z' });
    expect((highlight as { rects: Rect[] }).rects[0]).toEqual({ x: 64, y: 700, width: 100, height: 12 });
    expect(note).toMatchObject({ at: { x: 500, y: 700 }, text: 'Hola', color: '#2f9e44' });
    expect(ink).toMatchObject({
      color: '#e03131',
      width: 3,
      paths: [
        [
          { x: 100, y: 100 },
          { x: 200, y: 150 },
        ],
      ],
    });
    // Taken out of the bytes: drawn once, by the viewer.
    expect(await annotations(back)).toEqual([[], []]);
    // Deleted, they are gone from what is saved.
    const again = await reopen(removeMark(back, note.id));
    expect(again.marks.map((m) => m.kind)).toEqual(['highlight', 'ink']);
    // Kept as they are when asked.
    expect((await reopen(pdf, false, false)).marks).toEqual([]);
  });

  it('of other kinds, and those in a thread of replies, stay as they are', async () => {
    const { PDFDocument, PDFString } = await import('@cantoo/pdf-lib');
    const doc = await PDFDocument.load(await samplePdfBytes('en'));
    const page = doc.getPage(0);
    const { context } = doc;
    const note = context.register(context.obj({ Type: 'Annot', Subtype: 'Text', Rect: [100, 100, 120, 120], Contents: PDFString.of('Question') }));
    const reply = context.register(context.obj({ Type: 'Annot', Subtype: 'Text', Rect: [100, 100, 120, 120], Contents: PDFString.of('Answer'), IRT: note }));
    const square = context.register(context.obj({ Type: 'Annot', Subtype: 'Square', Rect: [200, 200, 260, 240] }));
    const alone = context.register(context.obj({ Type: 'Annot', Subtype: 'Text', Rect: [300, 300, 320, 320], Contents: PDFString.of('Alone') }));
    for (const ref of [note, reply, square, alone]) page.node.addAnnot(ref);
    const pdf = await openPdf(await doc.save());
    expect(pdf.marks.map((m) => (m as { text?: string }).text)).toEqual(['Alone']);
    expect((await annotations(pdf))[0].sort()).toEqual(['Square', 'Text', 'Text']);
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

  it('are written in a font given, for the letters Helvetica has not', async () => {
    const { readFile } = await import('node:fs/promises');
    const font = new Uint8Array(await readFile(new URL('../../../node_modules/pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf', import.meta.url)));
    let pdf = await samplePdf('en');
    pdf = addMark(pdf, { kind: 'text', page: pdf.pages[0].id, rect: { x: 64, y: 100, width: 300, height: 20 }, text: 'Привет, Αθήνα', size: 10, color: '#000000' });
    const plain = await savePdf(pdf);
    const own = await savePdf(pdf, { font });
    const helvetica = await openPdf(plain);
    expect((await pageText(helvetica, helvetica.pages[0].id)).text).not.toContain('Привет');
    const back = await openPdf(own);
    expect((await pageText(back, back.pages[0].id)).text).toContain('Привет, Αθήνα');
    // The letters used alone go in: far less than the font.
    expect(own.length - plain.length).toBeLessThan(font.length / 4);
  });

  it('keep only the letters the font has', async () => {
    let pdf = await samplePdf('en');
    pdf = addMark(pdf, { kind: 'text', page: pdf.pages[0].id, rect: { x: 64, y: 100, width: 300, height: 20 }, text: 'Done ✅ — ok', size: 10, color: '#000000' });
    const back = await reopen(pdf);
    expect((await pageText(back, back.pages[0].id)).text).toMatch(/Done\s+— ok/);
  });
});

describe('where a PDF leads', () => {
  it('reads its links, to the web and to its pages, and its outline', async () => {
    const pdf = await samplePdf('en');
    const [one, two] = pdf.pages.map((p) => p.id);
    const links = await linksOf(pdf, one);
    expect(links).toHaveLength(1);
    expect(links[0].to).toMatchObject({ page: two });
    expect(links[0].to!.top).toBeGreaterThan(300);
    expect((await linksOf(pdf, two)).map((l) => l.url)).toEqual(['https://github.com/JFranciscoRobles/rebopdf']);
    const outline = await outlineOf(pdf);
    expect(outline.map((o) => o.title)).toEqual(['The client', '1. The work', '2. Payment', '3. Confidentiality', '4. Ownership', '5. Ending', 'Signed in agreement']);
    expect(outline.map((o) => o.to?.page)).toEqual([one, one, one, two, two, two, two]);
  });

  it('follows its pages as they are moved, and leads nowhere for a page taken out', async () => {
    const pdf = await samplePdf('en');
    const [one, two] = pdf.pages.map((p) => p.id);
    expect((await linksOf(movePages(pdf, [two], one), one))[0].to?.page).toBe(two);
    const less = removePages(pdf, [two]);
    expect(await linksOf(less, one)).toEqual([]);
    expect((await outlineOf(less)).filter((o) => o.to).length).toBe(3);
    // Saved, they lead where they led.
    const back = await reopen(movePages(pdf, [two], one));
    expect((await linksOf(back, back.pages[1].id))[0].to?.page).toBe(back.pages[0].id);
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
