import { describe, expect, it } from 'vitest';
import { addBookmark, attachFile, detachFile, insertPdf, openPdf, outlineOf, samplePdf, savePdf, setOutline } from '../src';

describe('bookmarks and files carried', () => {
  it('writes bookmarks changed, to the pages as they are', async () => {
    const pdf = await samplePdf('en');
    const [one, two] = pdf.pages;
    const before = await outlineOf(pdf);
    expect(before.length).toBeGreaterThan(0);
    let next = setOutline(pdf, [
      { title: 'Front', to: { page: one.id, top: 800 }, items: [{ title: 'The client', to: { page: one.id, top: 600 }, items: [] }] },
      { title: 'Términos', to: { page: two.id }, items: [] },
    ]);
    next = addBookmark(next, next.outline!, { title: 'Signatures', to: { page: two.id, top: 300 } }, [1]);
    // Its pages turned around: the bookmarks lead to where those pages are now.
    next = { ...next, pages: [two, one] };
    const back = await openPdf(await savePdf(next));
    const read = await outlineOf(back);
    expect(read.map((i) => i.title)).toEqual(['Front', 'Términos']);
    expect(read[0].to?.page).toBe(back.pages[1].id);
    expect(read[0].to?.top).toBe(800);
    expect(read[0].items[0].title).toBe('The client');
    expect(read[1].items.map((i) => [i.title, i.to?.page === back.pages[0].id])).toEqual([['Signatures', true]]);
    // None at all.
    expect(await outlineOf(await openPdf(await savePdf(setOutline(pdf, []))))).toEqual([]);
  }, 60_000);

  it('carries files, and lets them go', async () => {
    const pdf = await samplePdf('en');
    expect(pdf.attachments).toEqual([]);
    const csv = new TextEncoder().encode('name,amount\nAna,1200\n');
    let next = attachFile(pdf, { name: 'cuentas.csv', data: csv, mime: 'text/csv', description: 'Las cuentas' });
    next = attachFile(next, { name: 'notas.txt', data: new TextEncoder().encode('ok') });
    const back = await openPdf(await savePdf(next));
    expect(back.attachments?.map((a) => a.name)).toEqual(['cuentas.csv', 'notas.txt']);
    expect(new TextDecoder().decode(back.attachments![0].data)).toBe('name,amount\nAna,1200\n');
    expect(back.attachments![0]).toMatchObject({ mime: 'text/csv', description: 'Las cuentas' });
    // Joined with another, they go with its pages; taken off, they are gone.
    const joined = insertPdf(await samplePdf('es'), back);
    expect(joined.attachments?.length).toBe(2);
    const fewer = await openPdf(await savePdf(detachFile(back, 'notas.txt')));
    expect(fewer.attachments?.map((a) => a.name)).toEqual(['cuentas.csv']);
    // Carrying files, a PDF/A is 3B.
    expect(new TextDecoder('latin1').decode(await savePdf(back, { pdfa: true }))).toMatch(/pdfaid:part[^0-9]*3/);
  }, 60_000);
});
