// The text of a PDF, as PDF.js reads it from its pages: each run of text with
// the box it takes, to be selected, found and marked. What is found is found
// without minding capitals or accents ("accion" finds "Acción"), across the
// end of a line.

import { pageById } from './edit';
import { outside, overlaps, redactedOn } from './geometry';
import { readerFor } from './pdfjs';
import { type Pdf, PdfError, type Rect, type TextMark, type Word } from './types';

/** A run of text on a page, from `start` in the text of the page. */
export interface TextRun {
  text: string;
  rect: Rect;
  start: number;
  /** How big its letters are, and of which family, as PDF.js reads them. */
  size?: number;
  family?: 'sans' | 'serif' | 'mono';
}

export interface PageText {
  page: string;
  /** All of it, a line a line. */
  text: string;
  runs: TextRun[];
}

/** The text of a page, with where each run of it is. */
export async function pageText(pdf: Pdf, id: string): Promise<PageText> {
  const page = pageById(pdf, id);
  if (!page) throw new PdfError('not-found', `There is no page ${id}.`);
  const reader = await readerFor(pdf, page.source);
  const content = await (await reader.getPage(page.index + 1)).getTextContent();
  // What is blacked out is not text of the page any more, before it is saved as after; nor what is written over, which reads as what is written in its place.
  const replacing = pdf.marks.filter((mark): mark is TextMark => mark.page === id && mark.kind === 'text' && !!mark.replaces);
  const redacted = [...redactedOn(pdf, id), ...replacing.map((mark) => mark.replaces!.rect)];
  const written = new Set<string>();
  const styles = (content as { styles?: Record<string, { fontFamily?: string }> }).styles ?? {};
  let text = '';
  const runs: TextRun[] = [];
  for (const item of content.items) {
    if (!('str' in item)) continue;
    const [, , c, d, e, f] = item.transform as number[];
    const size = Math.hypot(c, d) || item.height;
    if (item.str) {
      const box = { x: e, y: f - size * 0.22, width: item.width, height: size * 1.16 };
      const family = /mono|courier/i.test(styles[item.fontName]?.fontFamily ?? '') ? 'mono' : /serif/i.test((styles[item.fontName]?.fontFamily ?? '').replace(/sans-serif/i, '')) ? 'serif' : 'sans';
      const pieces = outside(item.str, box, redacted);
      pieces.forEach((piece, i) => {
        if (i) text += ' ';
        runs.push({ text: piece.text, start: text.length, rect: piece.rect, size, family });
        text += piece.text;
      });
      for (const mark of replacing) {
        if (written.has(mark.id) || !overlaps(mark.replaces!.rect, box)) continue;
        written.add(mark.id);
        if (text && !/\s$/.test(text)) text += ' ';
        runs.push({ text: mark.text, start: text.length, rect: mark.rect, size: mark.size, family: mark.family ?? 'sans' });
        text += mark.text;
      }
    }
    if (item.hasEOL) text += '\n';
  }
  // The words recognized in a picture of the page, a line at a time.
  const words = pdf.recognized?.[id];
  if (words?.length) {
    if (text && !text.endsWith('\n')) text += '\n';
    const lines: Word[][] = [];
    if (words.every((word) => word.line !== undefined)) {
      // As they were read, a line at a time.
      const byLine = new Map<number, Word[]>();
      for (const word of words) byLine.set(word.line!, [...(byLine.get(word.line!) ?? []), word]);
      lines.push(...[...byLine.entries()].sort(([a], [b]) => a - b).map(([, line]) => line));
    } else
      for (const word of [...words].sort((a, b) => b.rect.y + b.rect.height / 2 - (a.rect.y + a.rect.height / 2) || a.rect.x - b.rect.x)) {
        const line = lines.at(-1);
        const middle = word.rect.y + word.rect.height / 2;
        if (line && Math.abs(line[0].rect.y + line[0].rect.height / 2 - middle) < Math.min(line[0].rect.height, word.rect.height) / 2) line.push(word);
        else lines.push([word]);
      }
    for (const line of lines) {
      if (line[0].line === undefined) line.sort((a, b) => a.rect.x - b.rect.x);
      line.forEach((word, i) => {
        const pieces = outside(word.text, word.rect, redacted);
        pieces.forEach((piece, j) => {
          if (i || j) text += ' ';
          runs.push({ text: piece.text, start: text.length, rect: piece.rect });
          text += piece.text;
        });
      });
      text += '\n';
    }
  }
  return { page: id, text: text.trimEnd(), runs };
}

/** The text of these pages, or of all, in their order. */
export async function readText(pdf: Pdf, ids = pdf.pages.map((page) => page.id)): Promise<PageText[]> {
  const out: PageText[] = [];
  for (const id of ids) out.push(await pageText(pdf, id));
  return out;
}

/** Something found: on which page, the text as it is there, its boxes (one for each line), and the words around it. */
export interface Match {
  page: string;
  text: string;
  rects: Rect[];
  context: string;
}

/** Text as it is compared: no capitals, no accents, a space for every run of spaces or ends of line. Each letter says where it came from. */
function fold(text: string): { folded: string; from: number[] } {
  let folded = '';
  const from: number[] = [];
  let space = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (/\s/.test(char)) {
      if (!space) {
        folded += ' ';
        from.push(i);
      }
      space = true;
      continue;
    }
    space = false;
    for (const letter of char.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()) {
      folded += letter;
      from.push(i);
    }
  }
  return { folded, from };
}

/** The boxes of the text from `start` to `end` of a page: the part of each run in it. */
export function rectsOf(page: PageText, start: number, end: number): Rect[] {
  const rects: Rect[] = [];
  for (const run of page.runs) {
    const from = Math.max(start, run.start);
    const to = Math.min(end, run.start + run.text.length);
    if (from >= to) continue;
    const per = run.rect.width / Math.max(1, run.text.length);
    const rect = { ...run.rect, x: run.rect.x + (from - run.start) * per, width: (to - from) * per };
    // Runs side by side on one line make one box.
    const last = rects.at(-1);
    if (last && Math.abs(last.y - rect.y) < rect.height / 3 && rect.x - (last.x + last.width) < rect.height) {
      const right = Math.max(last.x + last.width, rect.x + rect.width);
      last.height = Math.max(last.height, rect.height);
      last.width = right - last.x;
    } else rects.push(rect);
  }
  return rects;
}

/** Finds the text in the PDF, page after page, up to `limit` times. */
export async function searchPdf(pdf: Pdf, query: string, limit = 500): Promise<Match[]> {
  const wanted = fold(query.trim()).folded;
  if (!wanted) return [];
  const matches: Match[] = [];
  for (const page of pdf.pages) {
    const text = await pageText(pdf, page.id);
    const { folded, from } = fold(text.text);
    for (let at = folded.indexOf(wanted); at >= 0 && matches.length < limit; at = folded.indexOf(wanted, at + wanted.length)) {
      const start = from[at];
      const end = from[at + wanted.length - 1] + 1;
      const before = text.text.slice(Math.max(0, start - 40), start).replace(/\s+/g, ' ');
      const after = text.text.slice(end, end + 40).replace(/\s+/g, ' ');
      matches.push({ page: page.id, text: text.text.slice(start, end), rects: rectsOf(text, start, end), context: `${before}[${text.text.slice(start, end)}]${after}`.trim() });
    }
    if (matches.length >= limit) break;
  }
  return matches;
}
