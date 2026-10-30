import { readFile } from 'node:fs/promises';
import { PDFDocument, StandardFonts } from '@cantoo/pdf-lib';
import fontkit from '@cantoo/fontkit';
import { describe, expect, it } from 'vitest';
import { addField, detectFields, findField, openPdf, PdfError, removeField, samplePdf, savePdf, setField, updateField } from '../src';

/** A letter with lines to write on and boxes to tick, and no form. */
async function letter(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(new Uint8Array(await readFile(new URL('../../../node_modules/pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf', import.meta.url))));
  const page = doc.addPage([595, 842]);
  page.drawText('Name: ____________________', { x: 60, y: 760, size: 12, font });
  page.drawText('Date of birth: __________', { x: 60, y: 730, size: 12, font });
  page.drawText('□ I agree to the terms', { x: 60, y: 700, size: 12, font });
  void StandardFonts;
  return doc.save();
}

describe('making a form', () => {
  it('puts fields of every kind in the PDF, named, labelled and required as asked', async () => {
    let pdf = await openPdf(await letter());
    const page = pdf.pages[0].id;
    pdf = addField(pdf, { kind: 'text', page, rect: { x: 100, y: 755, width: 200, height: 18 }, label: 'Full name', required: true, value: 'Ana' });
    pdf = addField(pdf, { kind: 'checkbox', page, rect: { x: 60, y: 600, width: 12, height: 12 }, name: 'agree', value: true });
    pdf = addField(pdf, { kind: 'choice', page, rect: { x: 60, y: 560, width: 120, height: 18 }, name: 'plan', options: ['Basic', 'Pro'], value: 'Pro' });
    pdf = addField(pdf, { kind: 'list', page, rect: { x: 60, y: 480, width: 120, height: 60 }, name: 'days', options: ['Mon', 'Tue', 'Wed'], value: ['Tue'] });
    pdf = addField(pdf, { kind: 'signature', page, rect: { x: 300, y: 100, width: 200, height: 50 }, label: 'Client signature' });
    pdf = addField(pdf, { kind: 'text', page, rect: { x: 100, y: 400, width: 200, height: 18 }, label: 'Full name' });
    expect(pdf.fields.map((f) => f.name)).toEqual(['Full_name', 'agree', 'plan', 'days', 'Client_signature', 'Full_name_2']);
    expect(() => setField(pdf, 'Client_signature', 'x')).toThrow(/to be signed/);
    expect(() => addField(pdf, { kind: 'choice', page, rect: { x: 0, y: 0, width: 1, height: 1 } })).toThrow(PdfError);

    const back = await openPdf(await savePdf(pdf));
    expect(back.fields.map((f) => [f.name, f.kind, f.value, f.label ?? null, !!f.required])).toEqual([
      ['Full_name', 'text', 'Ana', 'Full name', true],
      ['agree', 'checkbox', true, null, false],
      ['plan', 'choice', 'Pro', null, false],
      ['days', 'list', ['Tue'], null, false],
      ['Client_signature', 'signature', '', 'Client signature', false],
      ['Full_name_2', 'text', '', 'Full name', false],
    ]);
    expect(back.fields[0].widgets[0].rect).toEqual({ x: 100, y: 755, width: 200, height: 18 });
  });

  it('moves, renames and takes out fields, those made here and those of the PDF', async () => {
    let pdf = await samplePdf('en');
    pdf = addField(pdf, { kind: 'text', page: pdf.pages[1].id, rect: { x: 64, y: 300, width: 150, height: 18 }, name: 'city' });
    pdf = updateField(pdf, 'city', { name: 'place', rect: { x: 70, y: 310, width: 160, height: 20 }, required: true });
    pdf = updateField(pdf, 'plan', { options: ['Basic', 'Gold'] });
    pdf = removeField(pdf, 'billing');
    const back = await openPdf(await savePdf(pdf));
    expect(findField(back, 'place')).toMatchObject({ required: true, widgets: [{ rect: { x: 70, y: 310, width: 160, height: 20 } }] });
    expect(findField(back, 'billing')).toBeUndefined();
    expect(findField(back, 'city')).toBeUndefined();
    expect(back.fields.map((f) => f.name)).toContain('client.name');
  });

  it('finds the lines to write on and the boxes to tick of a PDF with no form', async () => {
    const pdf = await openPdf(await letter());
    const found = await detectFields(pdf);
    expect(found.map((f) => [f.kind, f.label])).toEqual([
      ['text', 'Name'],
      ['text', 'Date of birth'],
      ['checkbox', 'I agree to the terms'],
    ]);
    const [name] = found;
    expect(name.rect.x).toBeGreaterThan(90);
    expect(name.rect.width).toBeGreaterThan(100);
    // Put in, they are a form; found again, none is left to find.
    let next = pdf;
    for (const field of found) next = addField(next, field);
    expect(await detectFields(next)).toEqual([]);
    const back = await openPdf(await savePdf(next));
    expect(back.fields.map((f) => f.name)).toEqual(['Name', 'Date_of_birth', 'I_agree_to_the_terms']);
  });
});
