import { decodePDFRawStream, PDFDocument, PDFHexString, PDFName, PDFRawStream, PDFString } from '@cantoo/pdf-lib';
import { describe, expect, it } from 'vitest';
import { addMark, findField, linksOf, openPdf, type Pdf, PdfError, pageText, readerOf, rotatePages, samplePdf, samplePdfBytes, savePdf, savesIncrementally, searchPdf, setField } from '../src';

/** Every stream of a file, as it reads unpacked, in one string: what is in the file, as a reader of its bytes would find it. */
async function everything(bytes: Uint8Array): Promise<string> {
  const doc = await PDFDocument.load(bytes);
  let all = '';
  for (const [, object] of doc.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFRawStream)) {
      all += object.toString();
      continue;
    }
    try {
      all += Buffer.from(decodePDFRawStream(object).decode()).toString('latin1');
    } catch {
      all += Buffer.from(object.getContents()).toString('latin1');
    }
  }
  return all;
}

/** Text as pdf-lib writes it in Helvetica: the letters as hexadecimal. */
const hex = (text: string) => Buffer.from(text, 'latin1').toString('hex').toUpperCase();

const redactText = async (pdf: Pdf, text: string) => {
  let next = pdf;
  for (const match of await searchPdf(pdf, text)) next = addMark(next, { kind: 'redaction', page: match.page, rects: match.rects, text: match.text });
  return next;
};

describe('blacking out', () => {
  it('takes the text out of the file, not only out of sight, and keeps the rest to be found', async () => {
    const pdf = await redactText(await samplePdf('en'), 'thirty days');
    expect(pdf.marks).toHaveLength(2);
    // Before it is saved, it is not found any more.
    expect(await searchPdf(pdf, 'thirty days')).toEqual([]);
    const bytes = await savePdf(pdf);
    const back = await openPdf(bytes);
    const [one, two] = await Promise.all(back.pages.map((p) => pageText(back, p.id)));
    expect(one.text).not.toMatch(/thirty/i);
    expect(two.text).not.toMatch(/thirty/i);
    expect(one.text).toContain('The client pays the fee of the plan chosen');
    expect(two.text).toContain('Either party may end this agreement with');
    expect(await searchPdf(back, 'confidentiality')).toHaveLength(1);
    const file = await everything(bytes);
    expect(file).not.toContain(hex('thirty'));
    expect(file).not.toContain('thirty');
    // What was not under a box is in the file, unseen over the picture.
    expect(file).toContain(hex('The client pays'));
  });

  it('draws what fields hold into the page, and takes those under a box out with it', async () => {
    let pdf = setField(await samplePdf('en'), 'client.name', 'Ana García');
    pdf = setField(pdf, 'plan', 'Business');
    const name = findField(pdf, 'client.name')!;
    pdf = addMark(pdf, { kind: 'redaction', page: pdf.pages[0].id, rects: [name.widgets[0].rect] });
    const bytes = await savePdf(pdf);
    const back = await openPdf(bytes);
    // The fields of the page are part of its picture now: none is left to be filled, and nothing holds the name.
    expect(back.fields).toEqual([]);
    const file = await everything(bytes);
    expect(file).not.toContain('Ana Garc');
    expect(file).not.toContain(hex('Ana Garc'));
    expect(file).not.toContain('Business');
  });

  it('takes out the links and the marks under a box, and keeps those out of it', async () => {
    let pdf = await samplePdf('en');
    const [one, two] = pdf.pages.map((p) => p.id);
    const [link] = await linksOf(pdf, one);
    pdf = addMark(pdf, { kind: 'note', page: one, at: { x: link.rect.x + 2, y: link.rect.y + 10 }, text: 'Under', color: '#f08c00' });
    pdf = addMark(pdf, { kind: 'note', page: one, at: { x: 500, y: 800 }, text: 'Over', color: '#f08c00' });
    pdf = addMark(pdf, { kind: 'redaction', page: one, rects: [{ ...link.rect, height: link.rect.height + 12 }] });
    expect(await linksOf(pdf, one)).toEqual([]);
    const back = await openPdf(await savePdf(pdf));
    expect(await linksOf(back, back.pages[0].id)).toEqual([]);
    expect(back.marks.map((m) => (m as { text?: string }).text)).toEqual(['Over']);
    // The page not blacked out keeps its link.
    expect((await linksOf(back, back.pages[1].id)).map((l) => l.url)).toEqual(['https://github.com/JFranciscoRobles/rebopdf']);
    void two;
  });

  it('keeps the turn of a page, and its text where it is', async () => {
    let pdf = await samplePdf('en');
    pdf = rotatePages(pdf, [pdf.pages[1].id], 90);
    pdf = await redactText(pdf, 'Confidentiality');
    const back = await openPdf(await savePdf(pdf));
    expect(back.pages[1].rotation).toBe(90);
    const text = (await pageText(back, back.pages[1].id)).text;
    expect(text).not.toContain('Confidentiality');
    expect(text).toContain('Ownership');
  });

  it('takes out the tagged structure, which keeps text apart from the pages', async () => {
    const doc = await PDFDocument.load(await samplePdfBytes('en'));
    doc.catalog.set(PDFName.of('StructTreeRoot'), doc.context.register(doc.context.obj({ Type: 'StructTreeRoot', ActualText: PDFString.of('thirty days secret') })));
    const pdf = await redactText(await openPdf(await doc.save()), 'thirty days');
    expect(await everything(await savePdf(pdf))).not.toContain('secret');
  });
});

/** A PDF signed, as a signature field with a value says: what a signature holds on is its bytes. */
async function signed(): Promise<Uint8Array> {
  const doc = await PDFDocument.load(await samplePdfBytes('en'));
  const { context } = doc;
  const page = doc.getPage(1);
  const value = context.obj({
    Type: 'Sig',
    Filter: 'Adobe.PPKLite',
    SubFilter: 'adbe.pkcs7.detached',
    Name: PDFString.of('Ana García'),
    M: PDFString.fromDate(new Date(Date.UTC(2026, 9, 29))),
    Reason: PDFHexString.fromText('Agreed'),
    Contents: PDFHexString.of('00'.repeat(64)),
  });
  const widget = context.register(
    context.obj({ Type: 'Annot', Subtype: 'Widget', FT: 'Sig', T: PDFString.of('Signature1'), Rect: [64, 200, 264, 260], F: 4, P: page.ref, V: context.register(value) }),
  );
  page.node.addAnnot(widget);
  doc.getForm().acroForm.addField(widget);
  return doc.save({ useObjectStreams: false });
}

describe('saving by adding to the file', () => {
  it('leaves the bytes of a signed PDF as they came, its changes after them', async () => {
    const original = await signed();
    let pdf = await openPdf(original);
    expect(pdf.signatures).toEqual([{ source: Object.keys(pdf.sources)[0], field: 'Signature1', name: 'Ana García', date: '2026-10-29T00:00:00.000Z', reason: 'Agreed' }]);
    expect(savesIncrementally(pdf)).toBe(true);
    pdf = setField(pdf, 'client.name', 'Ana García');
    pdf = addMark(pdf, { kind: 'note', page: pdf.pages[0].id, at: { x: 500, y: 700 }, text: 'Signed copy', color: '#f08c00' });
    const bytes = await savePdf(pdf);
    expect(bytes.length).toBeGreaterThan(original.length);
    expect(Buffer.from(bytes.subarray(0, original.length)).equals(Buffer.from(original))).toBe(true);
    const back = await openPdf(bytes);
    expect(findField(back, 'client.name')?.value).toBe('Ana García');
    expect(back.marks.map((m) => (m as { text?: string }).text)).toEqual(['Signed copy']);
    expect(back.signatures).toHaveLength(1);

    // Its own notes, changed: the file as it came still leads, with the note as it is now after it.
    const again = await savePdf({ ...back, marks: back.marks.map((m) => ({ ...m, text: 'Changed' }) as never) });
    expect(Buffer.from(again.subarray(0, bytes.length)).equals(Buffer.from(bytes))).toBe(true);
    expect((await openPdf(again)).marks.map((m) => (m as { text?: string }).text)).toEqual(['Changed']);
  });

  it('is not done to a PDF not signed, unless asked; and says why it cannot be done', async () => {
    const original = await samplePdfBytes('en');
    const opened = await openPdf(original);
    const pdf = addMark(opened, { kind: 'note', page: opened.pages[0].id, at: { x: 10, y: 10 }, text: 'x', color: '#000000' });
    expect(savesIncrementally(pdf)).toBe(false);
    const asked = await savePdf(pdf, { incremental: true });
    expect(Buffer.from(asked.subarray(0, original.length)).equals(Buffer.from(original))).toBe(true);
    const blacked = await redactText(await openPdf(await signed()), 'thirty days');
    expect(savesIncrementally(blacked)).toBe(false);
    await expect(savePdf(blacked, { incremental: true })).rejects.toMatchObject({ code: 'incremental', message: expect.stringContaining('blacked out') });
    await expect(savePdf(blacked, { incremental: true })).rejects.toBeInstanceOf(PdfError);
    void readerOf;
  });
});
