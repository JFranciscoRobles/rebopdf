import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PDFDocument } from '@cantoo/pdf-lib';
import { addMark, freshReaderOf, openPdf, pageText, png, samplePdfBytes, savePdf, searchPdf } from '@rebopdf/core';
import { describe, expect, it } from 'vitest';
import { recognizeText } from '../src';

/** A scan: the first page of the sample agreement as a picture, and nothing else; turned some degrees, as a page fed askew. */
async function scan(askew = 0): Promise<Uint8Array> {
  const reader = await freshReaderOf(await samplePdfBytes('en'));
  const page = await reader.getPage(1);
  const viewport = page.getViewport({ scale: 2.5 });
  const { canvas, context } = (reader as unknown as { canvasFactory: { create(w: number, h: number): { canvas: unknown; context: CanvasRenderingContext2D } } }).canvasFactory.create(
    viewport.width,
    viewport.height,
  );
  context.fillStyle = '#fff';
  context.fillRect(0, 0, viewport.width, viewport.height);
  await page.render({ canvas: canvas as HTMLCanvasElement, viewport }).promise;
  if (askew) {
    const factory = (reader as unknown as { canvasFactory: { create(w: number, h: number): { canvas: unknown; context: CanvasRenderingContext2D } } }).canvasFactory;
    const turned = factory.create(viewport.width, viewport.height);
    turned.context.fillStyle = '#fff';
    turned.context.fillRect(0, 0, viewport.width, viewport.height);
    turned.context.translate(viewport.width / 2, viewport.height / 2);
    turned.context.rotate((askew * Math.PI) / 180);
    turned.context.drawImage(canvas as CanvasImageSource, -viewport.width / 2, -viewport.height / 2);
    const doc = await PDFDocument.create();
    const image = await doc.embedPng(await png(turned.canvas));
    doc.addPage([595.28, 841.89]).drawImage(image, { x: 0, y: 0, width: 595.28, height: 841.89 });
    return doc.save();
  }
  const doc = await PDFDocument.create();
  const image = await doc.embedPng(await png(canvas));
  doc.addPage([595.28, 841.89]).drawImage(image, { x: 0, y: 0, width: 595.28, height: 841.89 });
  return doc.save();
}

describe('recognizing text', () => {
  it('reads a scanned page: its words found, blacked out, and written unseen when saved', async () => {
    const pdf = await openPdf(await scan());
    expect((await pageText(pdf, pdf.pages[0].id)).text).toBe('');
    let progress = '';
    const read = await recognizeText(pdf, { languages: ['eng'], cachePath: join(tmpdir(), 'rebopdf-tessdata'), onProgress: (done, total) => (progress = `${done}/${total}`) });
    expect(progress).toBe('1/1');
    const text = (await pageText(read, read.pages[0].id)).text;
    // The body of the page, and its big title under a dark band, which the layout of the whole page leaves out.
    expect(text).toContain('This agreement is made between Rebo Studio');
    expect(text.indexOf('Service agreement')).toBeGreaterThanOrEqual(0);
    expect(text.indexOf('Service agreement')).toBeLessThan(text.indexOf('This agreement'));
    const [title] = await searchPdf(read, 'Service agreement');
    expect(title.rects[0].y).toBeGreaterThan(740);
    expect(text).toMatch(/The client pays the fee/);
    const [provider] = await searchPdf(read, 'website');
    expect(provider.rects[0].y).toBeGreaterThan(100);
    // Saved, the words are in the file, unseen over the picture.
    const back = await openPdf(await savePdf(read));
    expect((await pageText(back, back.pages[0].id)).text).toContain('This agreement is made');
    // Blacked out, they go with what is under the box.
    const [words] = await searchPdf(read, 'thirty days');
    const blacked = await openPdf(await savePdf(addMark(read, { kind: 'redaction', page: read.pages[0].id, rects: words.rects })));
    const left = (await pageText(blacked, blacked.pages[0].id)).text;
    expect(left).not.toContain('thirty');
    expect(left).toContain('This agreement is made');
    // A page with text of its own is not read again.
    expect(await recognizeText(back, { languages: ['eng'], cachePath: join(tmpdir(), 'rebopdf-tessdata') })).toBe(back);
  }, 180_000);

  it('straightens a page scanned askew before it reads it', async () => {
    const cachePath = join(tmpdir(), 'rebopdf-tessdata');
    const pdf = await openPdf(await scan(3));
    const straight = await recognizeText(pdf, { languages: ['eng'], cachePath });
    const text = (await pageText(straight, straight.pages[0].id)).text;
    expect(text).toContain('This agreement is made between Rebo Studio');
    expect(text).toMatch(/The client pays the fee/);
    // The words where they are on the page as scanned: "website" lower on the left than the line's start.
    const [site] = await searchPdf(straight, 'website');
    expect(site.rects[0].y).toBeGreaterThan(100);
    const asIs = await recognizeText(pdf, { languages: ['eng'], cachePath, deskew: false });
    const words = (await pageText(asIs, asIs.pages[0].id)).text.split(/\s+/).length;
    expect(text.split(/\s+/).length).toBeGreaterThanOrEqual(words * 0.9);
  }, 180_000);
});
