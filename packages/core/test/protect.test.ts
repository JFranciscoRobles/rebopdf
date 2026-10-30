import { describe, expect, it } from 'vitest';
import { openPdf, pageText, PdfError, samplePdf, savePdf, setField } from '../src';

describe('a PDF protected by a password', () => {
  it('is opened by its password alone, and holds what it held', async () => {
    const pdf = setField({ ...(await samplePdf('en')), info: { title: 'Contrato de servicios' } }, 'client.name', 'Ana García');
    const bytes = await savePdf(pdf, { protect: { password: 'abre', permissions: { copying: false, printing: 'lowResolution' } } });
    expect(new TextDecoder('latin1').decode(bytes)).toContain('/Encrypt');
    await expect(openPdf(bytes)).rejects.toThrow(PdfError);
    const back = await openPdf(bytes, { password: 'abre' });
    expect(back.fields.find((f) => f.name === 'client.name')?.value).toBe('Ana García');
    expect(back.info.title).toBe('Contrato de servicios');
    expect((await pageText(back, back.pages[0].id)).text).toContain('Service agreement');
  }, 60_000);

  it('is written whole, not added to a signed file', async () => {
    const pdf = await samplePdf('en');
    await expect(savePdf(pdf, { incremental: true, protect: { password: 'x' } })).rejects.toThrow(/protected by a password/);
  });
});
