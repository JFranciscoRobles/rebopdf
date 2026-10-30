import { PDFDocument, PDFName } from '@cantoo/pdf-lib';
import { describe, expect, it } from 'vitest';
import { openPdf, pageText, samplePdfBytes } from '../src';
import { loadDocument } from '../src/open';
import { writeDocument, writeIncrement } from '../src/writer';

const latin1 = (bytes: Uint8Array) => new TextDecoder('latin1').decode(bytes);

describe('writing a PDF', () => {
  it('writes a whole document, its objects packed in streams, as readers read it', async () => {
    const doc = await PDFDocument.load(await samplePdfBytes('en'));
    const bytes = await writeDocument(doc);
    const text = latin1(bytes);
    expect(text.startsWith('%PDF-1.7')).toBe(true);
    expect(text).toContain('/Type /ObjStm');
    expect(text).toContain('/Type /XRef');
    const back = await openPdf(bytes);
    expect(back.pages).toHaveLength(2);
    expect((await pageText(back, back.pages[0].id)).text).toContain('Service agreement');
    expect(back.fields.map((f) => f.name)).toContain('client.name');
  });

  it('writes many objects in a time that grows as they do', async () => {
    const doc = await PDFDocument.create();
    for (let i = 0; i < 20_000; i++) doc.context.register(doc.context.obj({ N: i }));
    doc.addPage();
    const started = performance.now();
    const bytes = await writeDocument(doc);
    expect(performance.now() - started).toBeLessThan(3000);
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });

  for (const kind of ['table', 'stream'] as const) {
    it(`adds what changed after a file, where it has its places in a ${kind}`, async () => {
      const source = await (await PDFDocument.load(await samplePdfBytes('en'))).save({ useObjectStreams: kind === 'stream' });
      const doc = await loadDocument(source, undefined, true);
      doc.getPage(0).node.set(PDFName.of('Rotate'), doc.context.obj(90));
      doc.setTitle('Added to');
      const bytes = await writeIncrement(doc);
      // The file as it was, then what was added: the objects changed and their places.
      expect(bytes.subarray(0, source.length)).toEqual(source);
      const added = latin1(bytes.subarray(source.length));
      expect(added).toContain('/Rotate 90');
      expect(added).toContain('/Title');
      expect(added).toContain(`/Prev ${latin1(source).match(/startxref\s+(\d+)\s+%%EOF\s*$/)![1]}`);
      expect(added).toContain(kind === 'table' ? 'trailer' : '/Type /XRef');
      const back = await PDFDocument.load(bytes);
      expect(back.getPage(0).getRotation().angle).toBe(90);
      expect(back.getTitle()).toBe('Added to');
    });
  }
});
