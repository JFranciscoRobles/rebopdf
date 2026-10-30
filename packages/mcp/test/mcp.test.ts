import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';
import { openPdf, pageText, readerOf, samplePdfBytes } from '@rebopdf/core';
import { describe, expect, it } from 'vitest';
import { createPdfServer, imageSize } from '../src/server';
import { pagesOf } from '../src/tools';

/** A PNG of a width and a height, every pixel dark blue. */
function png(width: number, height: number): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc32(body), 8 + data.length);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, Buffer.from([11, 31, 77]))]);
  const pixels = deflateSync(Buffer.concat(Array.from({ length: height }, () => row)));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', pixels), chunk('IEND', Buffer.alloc(0))]);
}

const PNG = png(4, 2);

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), 'rebopdf-'));
  await writeFile(join(dir, 'contract.pdf'), await samplePdfBytes('en'));
  await writeFile(join(dir, 'contrato.pdf'), await samplePdfBytes('es'));
  await writeFile(join(dir, 'signature.png'), PNG);
  const server = createPdfServer({ roots: [dir], cwd: dir });
  let id = 0;
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const answer = (await server.handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })) as { result: { content: { text: string }[]; isError?: boolean } };
    return { text: answer.result.content[0].text, error: !!answer.result.isError };
  };
  return { dir, server, call };
}

describe('the MCP server', () => {
  it('says who it is and what it offers', async () => {
    const { server } = await setup();
    const init = (await server.handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } })) as {
      result: { protocolVersion: string; serverInfo: { name: string } };
    };
    expect(init.result).toMatchObject({ protocolVersion: '2025-06-18', serverInfo: { name: 'rebopdf' } });
    const list = (await server.handle({ jsonrpc: '2.0', id: 2, method: 'tools/list' })) as { result: { tools: { name: string }[] } };
    expect(list.result.tools.map((t) => t.name)).toEqual(
      expect.arrayContaining([
        'open_pdf',
        'save_pdf',
        'read_pdf',
        'search_pdf',
        'fill_fields',
        'highlight_text',
        'add_note',
        'add_text',
        'sign',
        'rotate_pages',
        'merge_pdfs',
        'extract_pages',
        'undo',
      ]),
    );
    expect(await server.handle({ jsonrpc: '2.0', method: 'notifications/initialized' })).toBeUndefined();
  });

  it('reads, fills, marks, signs and saves a PDF', async () => {
    const { dir, call } = await setup();
    expect((await call('open_pdf', { file: 'contract.pdf' })).text).toMatch(/2 pages, 6 form fields, title "Service agreement"/);
    const read = (await call('read_pdf', { pages: '2' })).text;
    expect(read).toContain('## Page 2 (595.3 × 841.9 pt)');
    expect(read).toContain('3. Confidentiality');
    expect((await call('search_pdf', { text: 'thirty days' })).text).toMatch(/^2 found:\n1\. page 1: …/);
    expect((await call('list_fields')).text).toContain('- plan "Plan" (choice, page 1): (empty) · options: Basic | Professional | Business');

    expect((await call('fill_fields', { values: { 'client.name': 'Ana García', plan: 'Business', accept: true, billing: 'Yearly' } })).text).toMatch(
      /- accept "I have read.*" \(checkbox, page 1\): checked/,
    );
    const wrong = await call('fill_fields', { values: { plan: 'Gold' } });
    expect(wrong).toMatchObject({ error: true, text: 'plan takes one of: Basic, Professional, Business.' });
    expect((await call('fill_fields', { values: { nobody: 'x' } })).text).toMatch(/^There is no field "nobody"/);

    expect((await call('highlight_text', { text: 'thirty days', comment: 'Too short?' })).text).toBe('Highlighted 2 places: page 1, page 2.');
    expect((await call('add_note', { near: 'Ownership', text: 'Ask about the portfolio' })).text).toMatch(/^Added a note on page 2/);
    expect((await call('add_text', { near: 'Signed in agreement', position: 'below', text: 'Madrid, 29 October 2026' })).text).toMatch(/^Wrote on page 2/);
    expect((await call('sign', { image: 'signature.png', near: 'The client', page: 2 })).text).toMatch(/^Signed on page 2/);
    expect((await call('list_marks')).text.split('\n')).toHaveLength(5);

    expect((await call('save_pdf')).text).toMatch(/^Wrote .*contract \(edited\)\.pdf/);
    const saved = await openPdf(new Uint8Array(await readFile(join(dir, 'contract (edited).pdf'))), { marks: false });
    expect(Object.fromEntries(saved.fields.map((f) => [f.name, f.value]))).toMatchObject({ 'client.name': 'Ana García', plan: 'Business', accept: true, billing: 'Yearly' });
    expect((await pageText(saved, saved.pages[1].id)).text).toContain('Madrid, 29 October 2026');
    const reader = await readerOf(Object.values(saved.sources)[0]);
    const annots = [...(await (await reader.getPage(1)).getAnnotations()), ...(await (await reader.getPage(2)).getAnnotations())].filter((a) => a.subtype !== 'Widget' && a.subtype !== 'Link');
    expect(annots.map((a) => a.subtype).sort()).toEqual(['Highlight', 'Highlight', 'Text']);
  });

  it('turns, moves, deletes, joins and takes out pages, and undoes', async () => {
    const { dir, call } = await setup();
    await call('open_pdf', { file: 'contract.pdf' });
    expect((await call('merge_pdfs', { file: 'contrato.pdf', before: 2 })).text).toBe('Put in the 2 pages of contrato.pdf: 4 pages now.');
    expect((await call('rotate_pages', { pages: '1,3', degrees: 90 })).text).toBe('Turned 2 pages by 90°.');
    expect((await call('move_pages', { pages: '4', before: 1 })).text).toBe('Moved. The pages are now, by their old numbers: 4, 1, 2, 3.');
    expect((await call('delete_pages', { pages: '2-3' })).text).toBe('Deleted 2 pages: 2 left.');
    expect((await call('undo')).text).toBe('Undone.');
    expect((await call('delete_pages', { pages: 'all' })).text).toBe('A PDF keeps one page at least.');
    expect((await call('rotate_pages', { pages: '9', degrees: 90 })).text).toBe('There are pages 1 to 4; "9" is not among them.');
    expect((await call('extract_pages', { pages: '2-3', file: 'part.pdf' })).text).toMatch(/^Wrote 2 pages to .*part\.pdf/);
    const part = await openPdf(new Uint8Array(await readFile(join(dir, 'part.pdf'))));
    expect(part.pages.map((p) => p.rotation)).toEqual([90, 0]);
    expect((await call('list_pdfs')).text).toMatch(/contract\.pdf: 4 pages, changes not saved/);
    expect((await call('close_pdf')).text).toMatch(/without saving its changes/);
    expect((await call('read_pdf')).text).toBe('No PDF is open: open one with open_pdf.');
  });

  it('writes in the font it is given, letters Helvetica has not', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'rebopdf-'));
    await writeFile(join(dir, 'contract.pdf'), await samplePdfBytes('en'));
    const font = new URL('../../../node_modules/pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf', import.meta.url).pathname;
    const server = createPdfServer({ cwd: dir, font });
    const call = (name: string, args: Record<string, unknown>) => server.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } });
    await call('open_pdf', { file: 'contract.pdf' });
    await call('add_text', { page: 1, x: 64, y: 760, text: 'Москва' });
    await call('save_pdf', { file: 'out.pdf' });
    const saved = await openPdf(new Uint8Array(await readFile(join(dir, 'out.pdf'))));
    expect((await pageText(saved, saved.pages[0].id)).text).toContain('Москва');
  });

  it('says a page with no text may be a scanned picture, and finds nothing in it', async () => {
    const { PDFDocument } = await import('@cantoo/pdf-lib');
    const doc = await PDFDocument.create();
    const image = await doc.embedPng(png(200, 280));
    doc.addPage([200, 280]).drawImage(image, { x: 0, y: 0, width: 200, height: 280 });
    const dir = await mkdtemp(join(tmpdir(), 'rebopdf-'));
    await writeFile(join(dir, 'scan.pdf'), await doc.save());
    const server = createPdfServer({ cwd: dir });
    const call = async (name: string, args: Record<string, unknown>) =>
      ((await server.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } })) as { result: { content: { text: string }[] } }).result.content[0].text;
    await call('open_pdf', { file: 'scan.pdf' });
    expect(await call('read_pdf', {})).toContain('(no text: it may be a scanned image)');
    expect(await call('search_pdf', { text: 'contract' })).toBe('"contract" is not in scan.pdf.');
    // A note and a signature go on it all the same.
    expect(await call('add_note', { page: 1, text: 'Unreadable', x: 20, y: 20 })).toMatch(/^Added a note on page 1/);
  });

  it('blacks out text and parts of pages for good, and says so', async () => {
    const { dir, call } = await setup();
    await call('open_pdf', { file: 'contract.pdf' });
    expect((await call('redact_text', { text: 'thirty days' })).text).toBe('Blacked out 2 places (page 1, page 2), for good when the PDF is saved.');
    expect((await call('search_pdf', { text: 'thirty days' })).text).toBe('"thirty days" is not in contract.pdf.');
    expect((await call('redact_text', { text: 'thirty days' })).error).toBe(true);
    expect((await call('redact_area', { page: 2, x: 64, y: 700, width: 200, height: 80 })).text).toBe('Blacked out a box of page 2, for good when the PDF is saved.');
    expect((await call('list_marks')).text).toContain('blacked out when saved: "thirty days"');
    expect((await call('save_pdf', { file: 'redacted.pdf' })).text).toMatch(/3 parts blacked out for good: what was under them is not in the file\.$/);
    const saved = await openPdf(new Uint8Array(await readFile(join(dir, 'redacted.pdf'))));
    const text = (await Promise.all(saved.pages.map((p) => pageText(saved, p.id)))).map((t) => t.text).join('\n');
    expect(text).not.toContain('thirty');
    expect(text).toContain('Confidentiality');
  });

  it('keeps to its folders', async () => {
    const { call } = await setup();
    const outside = await call('open_pdf', { file: '/etc/hosts' });
    expect(outside.error).toBe(true);
    expect(outside.text).toMatch(/outside the folders this server may use/);
    expect((await call('open_pdf', { file: 'missing.pdf' })).text).toMatch(/^There is no file/);
    expect((await call('open_pdf', { file: 'signature.png' })).text).toMatch(/signature\.png: This is not a PDF/);
  });
});

describe('pages and pictures', () => {
  it('are read as a person writes them', async () => {
    const pdf = await openPdf(await samplePdfBytes('en'));
    expect(pagesOf(pdf, '2,1')).toEqual(pdf.pages.map((p) => p.id));
    expect(() => pagesOf(pdf, 'first')).toThrow(/"first" is not pages/);
    expect(imageSize(PNG)).toEqual({ width: 4, height: 2, type: 'png' });
  });
});
