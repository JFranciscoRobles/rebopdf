import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { openPdf, readerOf, samplePdfBytes } from '@rebopdf/core';

/** What the editor holds, as a test reads it. */
const state = (page: Page) =>
  page.evaluate(() => {
    const pdf = (window as unknown as { editor: { pdf: import('@rebopdf/core').Pdf } }).editor.pdf;
    return {
      pages: pdf.pages.map((p) => ({ id: p.id, rotation: p.rotation, index: p.index })),
      fields: Object.fromEntries(pdf.fields.map((f) => [f.name, f.value])),
      marks: pdf.marks.map((m) => ({ id: m.id, kind: m.kind, page: m.page, ...('text' in m ? { text: m.text } : {}), ...('paths' in m && m.paths ? { strokes: m.paths.length } : {}) })),
    };
  });

/** The PDF the Download button gives, opened by the engine. */
async function downloaded(page: Page, menu = false) {
  const waiting = page.waitForEvent('download');
  if (menu) {
    await page.getByRole('button', { name: 'More' }).click();
    await page.getByRole('menuitem', { name: /Download flattened/ }).click();
  } else await page.getByRole('button', { name: 'Download', exact: true }).click();
  const file = await waiting;
  const bytes = new Uint8Array(await (await file.createReadStream()).toArray().then((chunks) => Buffer.concat(chunks)));
  return { name: file.suggestedFilename(), pdf: await openPdf(bytes), bytes };
}

const pageEl = (page: Page, n: number) => page.locator('.rp-page').nth(n - 1);

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(pageEl(page, 1).locator('canvas')).toHaveCount(1);
  await expect(pageEl(page, 1).locator('.textLayer span').first()).toBeVisible();
  // The keys of the editor are its own while it has the focus.
  await page.locator('.rp-scroll').focus();
});

test('a form is filled in the page and saved as a form', async ({ page }) => {
  await page.getByRole('textbox', { name: 'Full name' }).fill('Ana García');
  await page.getByRole('combobox', { name: 'Plan' }).selectOption('Professional');
  await page.getByRole('radio', { name: 'Billing: Yearly' }).click();
  await page.getByRole('checkbox', { name: 'I have read and accept the terms of this agreement.' }).click();
  await expect(page.getByRole('checkbox', { name: 'I have read and accept the terms of this agreement.' })).toHaveAttribute('aria-checked', 'true');
  expect((await state(page)).fields).toMatchObject({ 'client.name': 'Ana García', plan: 'Professional', billing: 'Yearly', accept: true });
  // The typing of a field is one step back.
  await page.getByRole('button', { name: 'Undo' }).click();
  expect((await state(page)).fields.accept).toBe(false);
  await page.getByRole('button', { name: 'Redo' }).click();

  const { name, pdf } = await downloaded(page);
  expect(name).toBe('Service agreement.pdf');
  expect(Object.fromEntries(pdf.fields.map((f) => [f.name, f.value]))).toMatchObject({ 'client.name': 'Ana García', plan: 'Professional', billing: 'Yearly', accept: true });
});

test('text selected is highlighted, as a highlight any reader shows', async ({ page }) => {
  await page.keyboard.press('h');
  await expect(page.getByRole('button', { name: 'Highlight' })).toHaveAttribute('aria-pressed', 'true');
  const span = pageEl(page, 1).locator('.textLayer span', { hasText: 'This agreement is made' });
  const box = (await span.boundingBox())!;
  await page.mouse.move(box.x + 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(pageEl(page, 1).locator('.rp-mark-highlight')).toHaveCount(1);
  const [mark] = (await state(page)).marks;
  expect(mark.kind).toBe('highlight');

  const { bytes } = await downloaded(page);
  const reader = await readerOf(bytes);
  const annots = await (await reader.getPage(1)).getAnnotations();
  expect(annots.filter((a) => a.subtype === 'Highlight')).toHaveLength(1);
});

test('notes, ink, text and a signature go on the pages', async ({ page }) => {
  const one = (await pageEl(page, 1).boundingBox())!;
  // A note.
  await page.keyboard.press('n');
  await page.mouse.click(one.x + one.width - 60, one.y + 120);
  await page.getByRole('textbox', { name: 'What the note says' }).fill('Check the dates');
  await page.getByRole('button', { name: 'Add' }).click();
  await expect(page.getByRole('button', { name: 'Note: Check the dates' })).toBeVisible();

  // Two strokes close together: one drawing.
  await page.keyboard.press('Escape');
  await page.keyboard.press('d');
  for (const y of [300, 330]) {
    await page.mouse.move(one.x + 100, one.y + y);
    await page.mouse.down();
    await page.mouse.move(one.x + 220, one.y + y + 20, { steps: 10 });
    await page.mouse.up();
  }
  await expect(pageEl(page, 1).locator('.rp-mark-ink path')).toHaveCount(2);

  // Text.
  await page.keyboard.press('t');
  await page.mouse.click(one.x + 120, one.y + 60);
  await page.getByRole('textbox', { name: 'The text' }).fill('Received 29 Oct');
  await page.getByRole('button', { name: 'Add' }).click();
  await expect(pageEl(page, 1).locator('.rp-mark-text')).toHaveText('Received 29 Oct');

  // A signature, drawn.
  await page.keyboard.press('Escape');
  await page.keyboard.press('s');
  const pad = page.locator('.rp-pad');
  const p = (await pad.boundingBox())!;
  await page.mouse.move(p.x + 40, p.y + 120);
  await page.mouse.down();
  await page.mouse.move(p.x + 120, p.y + 40, { steps: 6 });
  await page.mouse.move(p.x + 200, p.y + 130, { steps: 6 });
  await page.mouse.up();
  await page.getByRole('button', { name: 'Place it' }).click();
  await pageEl(page, 2).scrollIntoViewIfNeeded();
  const two = (await pageEl(page, 2).boundingBox())!;
  await page.mouse.click(two.x + 120, two.y + two.height * 0.45);
  await expect(pageEl(page, 2).locator('.rp-mark-signature')).toHaveCount(1);

  const marks = (await state(page)).marks;
  expect(marks.map((m) => m.kind)).toEqual(['note', 'ink', 'text', 'signature']);
  expect(marks[1].strokes).toBe(2);

  const { bytes, pdf } = await downloaded(page);
  const reader = await readerOf(bytes);
  expect((await (await reader.getPage(1)).getAnnotations()).map((a) => a.subtype).filter((s) => s !== 'Widget')).toEqual(['Text', 'Ink']);
  const { pageText } = await import('@rebopdf/core');
  expect((await pageText(pdf, pdf.pages[0].id)).text).toContain('Received 29 Oct');
});

test('a mark is chosen, moved by the arrows, coloured and taken off, and comes back with undo', async ({ page }) => {
  const one = (await pageEl(page, 1).boundingBox())!;
  await page.keyboard.press('n');
  await page.mouse.click(one.x + 400, one.y + 200);
  await page.getByRole('textbox', { name: 'What the note says' }).fill('Hello');
  await page.keyboard.press('ControlOrMeta+Enter');
  const note = page.getByRole('button', { name: 'Note: Hello' });
  const before = (await note.boundingBox())!;
  // Chosen when made: the arrows move it.
  await page.locator('.rp-scroll').focus();
  await page.keyboard.press('Shift+ArrowRight');
  await expect.poll(async () => (await note.boundingBox())!.x).toBeGreaterThan(before.x + 5);
  await note.click();
  await page.getByRole('button', { name: 'Blue' }).click();
  await page.getByRole('textbox', { name: 'What the note says' }).fill('Hello there');
  await expect(page.getByRole('button', { name: 'Note: Hello there' })).toBeVisible();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.locator('.rp-mark-note')).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.getByRole('button', { name: 'Note: Hello there' })).toBeVisible();
});

test('pages are turned, moved, deleted and taken out, and the undo brings them back', async ({ page }) => {
  const thumbs = page.locator('.rp-thumb');
  await expect(thumbs).toHaveCount(2);
  const [first, second] = (await state(page)).pages.map((p) => p.id);
  await thumbs.nth(1).click();
  await page.getByRole('button', { name: 'Turn right' }).click();
  expect((await state(page)).pages[1].rotation).toBe(90);
  await expect(pageEl(page, 2)).toHaveCSS('width', /.*/);
  const size = (await pageEl(page, 2).boundingBox())!;
  expect(size.width).toBeGreaterThan(size.height);

  // Moved with the keyboard.
  await thumbs.nth(1).focus();
  await page.keyboard.press('Alt+ArrowUp');
  expect((await state(page)).pages.map((p) => p.id)).toEqual([second, first]);

  // Taken out as a PDF of its own.
  const waiting = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save as a new PDF' }).click();
  const part = await waiting;
  expect(part.suggestedFilename()).toBe('Service agreement (pages).pdf');

  await page.getByRole('button', { name: 'Delete pages' }).click();
  await expect(thumbs).toHaveCount(1);
  await expect(page.getByRole('status')).toHaveText('Deleted 1 pages');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(thumbs).toHaveCount(2);

  const { pdf } = await downloaded(page);
  expect(pdf.pages.map((p) => p.rotation)).toEqual([90, 0]);
});

test('the pages of another PDF are added after the page in view', async ({ page }) => {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'More' }).click();
  await page.getByRole('menuitem', { name: 'Add pages from a PDF…' }).click();
  await (await chooser).setFiles({ name: 'Contrato.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await samplePdfBytes('es')) });
  await expect(page.locator('.rp-thumb')).toHaveCount(4);
  await expect(page.getByRole('status')).toHaveText('Added 2 pages from Contrato.pdf');
  await expect(page.getByRole('textbox', { name: 'Page number' })).toBeVisible();
  const chooser2 = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'More' }).click();
  await page.getByRole('menuitem', { name: 'Add pages from a PDF…' }).click();
  await (await chooser2).setFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
  await expect(page.getByRole('status')).toHaveText('notes.txt is not a PDF that can be opened.');
});

test('text is found, every place it is shown, the next and the one before', async ({ page }) => {
  await page.locator('.rp-scroll').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('ControlOrMeta+f');
  await page.getByRole('searchbox', { name: 'Search' }).fill('THE PROVIDER');
  await expect(page.locator('.rp-find-count')).toHaveText(/1 of \d+/);
  const count = Number((await page.locator('.rp-find-count').textContent())!.split(' of ')[1]);
  expect(count).toBeGreaterThan(3);
  await page.keyboard.press('Enter');
  await expect(page.locator('.rp-find-count')).toHaveText(`2 of ${count}`);
  await page.keyboard.press('Shift+Enter');
  await expect(page.locator('.rp-find-count')).toHaveText(`1 of ${count}`);
  await expect(page.locator('.rp-hit-current')).toHaveCount(1);
  await page.getByRole('searchbox', { name: 'Search' }).fill('zzzz');
  await expect(page.locator('.rp-find-count')).toHaveText('No results');
  await page.keyboard.press('Escape');
  await expect(page.locator('.rp-hit')).toHaveCount(0);
});

test('flattened, the fields and the marks are drawn into the pages', async ({ page }) => {
  await page.getByRole('textbox', { name: 'Full name' }).fill('Luis');
  const { pdf, bytes } = await downloaded(page, true);
  expect(pdf.fields).toEqual([]);
  const { pageText } = await import('@rebopdf/core');
  expect((await pageText(pdf, pdf.pages[0].id)).text).toContain('Luis');
  expect(bytes.length).toBeGreaterThan(1000);
});

test('the zoom changes the size of the pages and keeps the page in view', async ({ page }) => {
  const before = (await pageEl(page, 1).boundingBox())!.width;
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await expect.poll(async () => (await pageEl(page, 1).boundingBox())!.width).toBeGreaterThan(before);
  await page.getByRole('combobox', { name: 'Zoom' }).selectOption('fit-page');
  await expect.poll(async () => (await pageEl(page, 1).boundingBox())!.height).toBeLessThan(860);
  await page.getByRole('textbox', { name: 'Page number' }).fill('2');
  await page.getByRole('textbox', { name: 'Page number' }).press('Enter');
  await expect(page.locator('.rp-thumb').nth(1)).toHaveAttribute('aria-current', 'page');
});

for (const scheme of ['light', 'dark'] as const) {
  test(`nothing an accessibility check finds, ${scheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.getByRole('textbox', { name: 'Full name' }).click();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  });
}

test('with no PDF, one is asked for and opened', async ({ page }) => {
  await page.goto('/?empty');
  await expect(page.getByRole('heading', { name: 'Open a PDF' })).toBeVisible();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Pick a PDF' }).click();
  await (await chooser).setFiles({ name: 'Contrato.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await samplePdfBytes('es')) });
  await expect(page.locator('.rp-thumb')).toHaveCount(2);
  await expect(page.locator('.rp-title')).toHaveText('Contrato');
});
