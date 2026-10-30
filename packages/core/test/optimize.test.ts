import { createRequire } from 'node:module';
import { PDFDocument, PDFName, type PDFNumber, PDFRawStream } from '@cantoo/pdf-lib';
import { describe, expect, it } from 'vitest';
import { openPdf, pageText, savePdf } from '../src';

const napi = createRequire(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'))('@napi-rs/canvas');

/** A PDF of two pages, each with the same photograph, far bigger than the page shows it, and a drawing of its own. */
async function heavy(): Promise<Uint8Array> {
  const photo = napi.createCanvas(3000, 2000);
  const c = photo.getContext('2d');
  for (let i = 0; i < 3000; i++) {
    c.fillStyle = `hsl(${i % 360} 70% 50%)`;
    c.fillRect((i * 37) % 3000, (i * 53) % 2000, 40, 40);
  }
  const drawing = napi.createCanvas(2400, 1600);
  const d = drawing.getContext('2d');
  d.fillStyle = '#fff';
  d.fillRect(0, 0, 2400, 1600);
  d.lineWidth = 8;
  for (let i = 0; i < 30; i++) {
    d.beginPath();
    d.moveTo(i * 80, 0);
    d.lineTo(2400 - i * 80, 1600);
    d.stroke();
  }
  const doc = await PDFDocument.create();
  for (let i = 0; i < 2; i++) {
    const page = doc.addPage([595, 842]);
    page.drawImage(await doc.embedJpg(photo.toBuffer('image/jpeg', 95)), { x: 40, y: 450, width: 515, height: 343 });
    page.drawImage(await doc.embedPng(drawing.toBuffer('image/png')), { x: 40, y: 60, width: 515, height: 343 });
    page.drawText(`Page ${i + 1}`, { x: 40, y: 820, size: 14 });
  }
  return doc.save();
}

describe('a PDF made smaller', () => {
  it('has its pictures no bigger than its pages show them, and what it had twice once', async () => {
    const pdf = await openPdf(await heavy());
    const plain = await savePdf(pdf);
    const small = await savePdf(pdf, { optimize: { dpi: 150 } });
    expect(small.length).toBeLessThan(plain.length / 3);
    const doc = await PDFDocument.load(small);
    const images = doc.context.enumerateIndirectObjects().filter(([, o]) => o instanceof PDFRawStream && o.dict.get(PDFName.of('Subtype')) === PDFName.of('Image'));
    // The photograph once, and the drawing, each small enough for an A4 page at 150 dots to the inch.
    expect(images.length).toBeLessThanOrEqual(3);
    for (const [, image] of images) expect((image as PDFRawStream).dict.get(PDFName.of('Width')) as PDFNumber).toSatisfy((w: PDFNumber) => w.asNumber() <= 1755);
    const back = await openPdf(small);
    expect((await pageText(back, back.pages[1].id)).text).toContain('Page 2');
  }, 120_000);

  it('is written whole', async () => {
    const pdf = await openPdf(await heavy());
    await expect(savePdf(pdf, { incremental: true, optimize: true })).rejects.toThrow(/made smaller/);
  }, 120_000);
});
