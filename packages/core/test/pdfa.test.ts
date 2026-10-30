import { type PDFArray, PDFDict, PDFDocument, PDFName, type PDFNumber, type PDFRawStream, StandardFonts } from '@cantoo/pdf-lib';
import { describe, expect, it } from 'vitest';
import { addMark, openPdf, pageText, PdfError, samplePdf, savePdf, setField } from '../src';

/** Every font dictionary of a file, and whether it carries its font. */
async function fontsOf(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes);
  return doc.context
    .enumerateIndirectObjects()
    .flatMap(([, o]) => (o instanceof PDFDict && o.get(PDFName.of('Type')) === PDFName.of('Font') ? [o] : []))
    .map((font) => {
      const descriptor = font.lookup(PDFName.of('FontDescriptor'));
      const subtype = (font.get(PDFName.of('Subtype')) as PDFName).decodeText();
      return {
        base: (font.get(PDFName.of('BaseFont')) as PDFName | undefined)?.decodeText(),
        subtype,
        carried: subtype === 'Type0' || subtype === 'Type3' || (descriptor instanceof PDFDict && ['FontFile', 'FontFile2', 'FontFile3'].some((k) => descriptor.has(PDFName.of(k)))),
        widths: font.lookup(PDFName.of('Widths')) as PDFArray | undefined,
      };
    });
}

describe('PDF/A', () => {
  it('makes a PDF/A-2B of a form filled and noted, every font carried', async () => {
    let pdf = setField(await samplePdf('en'), 'client.name', 'Ana García');
    pdf = addMark(pdf, { kind: 'note', page: pdf.pages[0].id, at: { x: 500, y: 700 }, text: 'Revisar', color: '#f08c00' });
    const bytes = await savePdf(pdf, { pdfa: true });
    const doc = await PDFDocument.load(bytes);
    const xmp = new TextDecoder().decode((doc.catalog.lookup(PDFName.of('Metadata')) as PDFRawStream).getContents());
    expect(xmp).toMatch(/pdfaid:part[^0-9]*2/);
    expect(xmp).toMatch(/pdfaid:conformance[^A-Z]*B/);
    expect(doc.catalog.has(PDFName.of('OutputIntents'))).toBe(true);
    expect(doc.context.trailerInfo.ID).toBeDefined();
    expect((await fontsOf(bytes)).filter((f) => !f.carried)).toEqual([]);
    const back = await openPdf(bytes);
    expect(back.fields.find((f) => f.name === 'client.name')?.value).toBe('Ana García');
    expect((await pageText(back, back.pages[0].id)).text).toContain('Service agreement');
  }, 60_000);

  it('carries the standard fonts a PDF names, with their widths as the fonts have them', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([595, 842]);
    const fonts = [StandardFonts.Helvetica, StandardFonts.TimesRoman, StandardFonts.CourierBold, StandardFonts.ZapfDingbats];
    for (const [i, name] of fonts.entries()) page.drawText(name === StandardFonts.ZapfDingbats ? '✓✗' : `${name}: Año, “citas”`, { x: 50, y: 780 - i * 40, size: 16, font: await doc.embedFont(name) });
    const bytes = await savePdf(await openPdf(await doc.save()), { pdfa: true });
    const carried = await fontsOf(bytes);
    expect(carried.filter((f) => !f.carried)).toEqual([]);
    // Times's A is 722 wide, Courier's letters 600, as their standard metrics say.
    const times = carried.find((f) => /Serif/.test(f.base ?? ''))!;
    expect((times.widths!.get(65) as PDFNumber).asNumber()).toBe(722);
    const courier = carried.find((f) => /Fixed/.test(f.base ?? ''))!;
    expect((courier.widths!.get(77) as PDFNumber).asNumber()).toBe(600);
    const back = await openPdf(bytes);
    expect((await pageText(back, back.pages[0].id)).text).toContain('Times-Roman: Año');
  }, 60_000);

  it('is not protected by a password', async () => {
    await expect(savePdf(await samplePdf('en'), { pdfa: true, protect: { password: 'x' } })).rejects.toThrow(PdfError);
  });
});
