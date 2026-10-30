import { PDFDocument, StandardFonts } from '@cantoo/pdf-lib';
import { describe, expect, it } from 'vitest';
import { comparePdfs, openPdf, samplePdf, setField } from '../src';

/** A PDF of lines of text, a page for each list. */
async function lines(...pages: string[][]) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const list of pages) {
    const page = doc.addPage([400, 400]);
    list.forEach((line, i) => page.drawText(line, { x: 40, y: 360 - i * 20, size: 12, font }));
  }
  return openPdf(await doc.save());
}

describe('comparing', () => {
  it('finds the words taken out, put in and changed, and where each is', async () => {
    const a = await lines(['The client pays within thirty days.', 'Either party may end it.']);
    const b = await lines(['The client pays within sixty days.', 'Either party may end it at once.']);
    const { text, pages } = await comparePdfs(a, b);
    expect(pages).toEqual([1, 1]);
    expect(text.map((c) => [c.kind, c.before, c.after])).toEqual([
      ['changed', 'thirty', 'sixty'],
      ['changed', 'it.', 'it at once.'],
    ]);
    const [first] = text;
    expect(first.in?.[0].page).toBe(a.pages[0].id);
    expect(first.out?.[0].page).toBe(b.pages[0].id);
    expect(first.in?.[0].rects[0].y).toBeGreaterThan(300);
  });

  it('does not take text moved to the next page for a change', async () => {
    const a = await lines(['One two three', 'four five six'], ['seven eight']);
    const b = await lines(['One two three'], ['four five six', 'seven eight', 'nine']);
    const { text } = await comparePdfs(a, b);
    expect(text.map((c) => [c.kind, c.before, c.after])).toEqual([['added', undefined, 'nine']]);
    expect(text[0].out?.[0].page).toBe(b.pages[1].id);
  });

  it('says nothing changed of the same PDF, and what the forms hold that changed', async () => {
    const pdf = await samplePdf('en');
    expect(await comparePdfs(pdf, pdf)).toEqual({ text: [], fields: [], pages: [2, 2] });
    const filled = setField(setField(pdf, 'client.name', 'Ana'), 'accept', true);
    expect((await comparePdfs(pdf, filled)).fields).toEqual([
      { name: 'client.name', before: '', after: 'Ana' },
      { name: 'accept', before: false, after: true },
    ]);
    const es = await samplePdf('es');
    const { text } = await comparePdfs(pdf, es);
    expect(text.length).toBeGreaterThan(10);
  });
});
