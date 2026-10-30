import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { PDFDocument, rgb } from '@cantoo/pdf-lib';
import { describe, expect, it } from 'vitest';
import { addMark, openPdf, pageText, samplePdf, savePdf, searchPdf } from '../src';

describe('text of a page written again', () => {
  it('takes out of what the page draws the glyphs of a word, the rest of its line where it was', async () => {
    const pdf = await samplePdf('en');
    const [match] = await searchPdf(pdf, 'Rebo Studio ("the provider")');
    // Search places words by their share of a line's letters: the box a little in, to fall in the spaces around them.
    const rect = { ...match.rects[0], x: match.rects[0].x + 3, width: match.rects[0].width - 6 };
    const before = (await pageText(pdf, pdf.pages[0].id)).runs.find((r) => r.text.includes('This agreement is made between'))!;
    const next = addMark(pdf, { kind: 'text', page: pdf.pages[0].id, rect, text: 'Estudio Rebo ("el proveedor")', size: before.size!, color: '#000000', replaces: { rect, text: match.text } });
    const back = await openPdf(await savePdf(next));
    const text = (await pageText(back, back.pages[0].id)).text;
    expect(text).toContain('Estudio Rebo ("el proveedor")');
    expect(text).not.toContain('Rebo Studio ("the provider")');
    expect(text).toContain('This agreement is made between');
    expect(text).toContain('and the client named below');
    // What follows on the line is where it was.
    const after = (await pageText(back, back.pages[0].id)).runs.find((r) => r.text.includes('and the client named below'))!;
    const original = (await pageText(pdf, pdf.pages[0].id)).runs;
    const [was] = await searchPdf(pdf, 'and the client named below');
    expect(Math.abs(after.rect.y - was.rects[0].y)).toBeLessThan(1);
    expect(original.length).toBeGreaterThan(0);
  }, 60_000);

  it('reads fonts of two bytes a code, as pdf-lib embeds them', async () => {
    const fontkit = (await import('@cantoo/fontkit')).default;
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);
    const dir = dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'));
    const font = await doc.embedFont(readFileSync(join(dir, 'standard_fonts/LiberationSans-Regular.ttf')), { subset: true });
    const page = doc.addPage([595, 842]);
    page.drawText('Precio: 1200 pesos al mes', { x: 50, y: 760, size: 14, font, color: rgb(0, 0, 0) });
    page.drawText('Otra línea que se queda', { x: 50, y: 730, size: 14, font });
    const pdf = await openPdf(await doc.save());
    const [match] = await searchPdf(pdf, '1200 pesos');
    const next = addMark(pdf, { kind: 'text', page: pdf.pages[0].id, rect: match.rects[0], text: '1500 pesos', size: 14, color: '#000000', replaces: { rect: match.rects[0], text: match.text } });
    const back = await openPdf(await savePdf(next));
    const text = (await pageText(back, back.pages[0].id)).text;
    expect(text).not.toContain('1200');
    expect(text).toContain('1500 pesos');
    expect(text).toContain('Precio:');
    expect(text).toContain('Otra línea que se queda');
  }, 60_000);
});
