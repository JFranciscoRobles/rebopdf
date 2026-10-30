// The fields a PDF with no form asks for, found in its text: a line of
// underscores to write on ("Name: __________") is a text field, a box drawn
// with a letter ("☐ I agree") a checkbox, each named by the words before it
// on its line. What is found is offered, not put in: `addField` puts it.

import type { NewField } from './edit';
import { overlaps } from './geometry';
import { pageText, rectsOf } from './text';
import type { Pdf } from './types';

const LINE = /_{4,}/g;
const BOX = /[☐□❏▢◻]/g;

/** What is before a place on its line, as a person would name the field there. */
function labelBefore(text: string, at: number): string {
  const start = text.lastIndexOf('\n', at - 1) + 1;
  return text
    .slice(start, at)
    .replace(/_{2,}.*$/, '')
    .replace(/[\s:._–—-]+$/, '')
    .trim();
}

/** The fields the text of these pages (or of all) asks for, out of those the PDF has. */
export async function detectFields(pdf: Pdf, pages = pdf.pages.map((page) => page.id)): Promise<NewField[]> {
  const found: NewField[] = [];
  for (const id of pages) {
    const text = await pageText(pdf, id);
    const taken = pdf.fields.flatMap((field) => field.widgets.filter((w) => w.page === id).map((w) => w.rect));
    const free = (rect: NewField['rect']) => !taken.some((r) => overlaps(r, rect)) && !found.some((f) => f.page === id && overlaps(f.rect, rect));
    for (const match of text.text.matchAll(LINE)) {
      const [box] = rectsOf(text, match.index, match.index + match[0].length);
      if (!box) continue;
      const height = Math.max(box.height, 14);
      // Over the line, as text is written on it.
      const rect = { x: box.x, y: box.y + box.height * 0.15, width: box.width, height };
      const label = labelBefore(text.text, match.index);
      if (free(rect)) found.push({ kind: 'text', page: id, rect, ...(label ? { label, name: label } : {}) });
    }
    for (const match of text.text.matchAll(BOX)) {
      const [box] = rectsOf(text, match.index, match.index + 1);
      if (!box) continue;
      const size = Math.min(box.width, box.height) * 0.9 || 10;
      const rect = { x: box.x + (box.width - size) / 2, y: box.y + (box.height - size) / 2, width: size, height: size };
      // Named by the words after it, to the end of its line.
      const end = text.text.indexOf('\n', match.index);
      const label = text.text
        .slice(match.index + 1, end < 0 ? undefined : end)
        .replace(/[☐□❏▢◻].*$/, '')
        .trim();
      if (free(rect)) found.push({ kind: 'checkbox', page: id, rect, ...(label ? { label, name: label.slice(0, 40) } : {}) });
    }
  }
  return found;
}
