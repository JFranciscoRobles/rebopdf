// Two PDFs compared: what of the text of one is not in the other, word by
// word, across the whole of each (a paragraph moved to the next page is not
// a change), and what their forms hold. Each change says where it is in
// each: its page and the boxes of its words, to be shown over the pages.

import { findField } from './edit';
import { type PageText, readText, rectsOf } from './text';
import type { Field, Pdf, Rect } from './types';

/** Words of a PDF, each with where it is: its page, and its letters in the text of that page. */
interface Word {
  text: string;
  key: string;
  page: number;
  start: number;
  end: number;
}

/** A place of a change in one of the PDFs: the page (by id) and the boxes of its words. */
export interface ChangePlace {
  page: string;
  rects: Rect[];
}

export interface TextChange {
  kind: 'removed' | 'added' | 'changed';
  /** The words before, and after. */
  before?: string;
  after?: string;
  /** Where they are in the first PDF and in the second. */
  in?: ChangePlace[];
  out?: ChangePlace[];
}

export interface FieldChange {
  name: string;
  before?: Field['value'];
  after?: Field['value'];
}

export interface Comparison {
  text: TextChange[];
  fields: FieldChange[];
  /** How many pages each has. */
  pages: [number, number];
}

const fold = (word: string) => word.normalize('NFC').replace(/[‘’]/g, "'").replace(/[“”]/g, '"');

function wordsOf(texts: PageText[]): Word[] {
  const words: Word[] = [];
  texts.forEach((page, n) => {
    for (const match of page.text.matchAll(/\S+/g)) words.push({ text: match[0], key: fold(match[0]), page: n, start: match.index, end: match.index + match[0].length });
  });
  return words;
}

/** The longest common run of words, by Myers' way of finding the fewest words to take out and put in: which of each are kept. */
function common(a: Word[], b: Word[]): [boolean[], boolean[]] {
  const n = a.length;
  const m = b.length;
  const max = n + m;
  const offset = max + 1;
  const v = new Int32Array(2 * max + 3);
  const trace: Int32Array[] = [];
  outer: for (let d = 0; d <= max; d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1]) ? v[offset + k + 1] : v[offset + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[x].key === b[y].key) {
        x++;
        y++;
      }
      v[offset + k] = x;
      if (x >= n && y >= m) break outer;
    }
  }
  // Walked back: the words that are kept in both.
  const keepA = new Array<boolean>(n).fill(false);
  const keepB = new Array<boolean>(m).fill(false);
  let x = n;
  let y = m;
  for (let d = trace.length - 1; d >= 0 && (x > 0 || y > 0); d--) {
    const t = trace[d];
    const k = x - y;
    const prev = k === -d || (k !== d && t[offset + k - 1] < t[offset + k + 1]) ? k + 1 : k - 1;
    const px = t[offset + prev];
    const py = px - prev;
    while (x > px && y > py) {
      keepA[--x] = true;
      keepB[--y] = true;
    }
    if (d > 0) {
      x = px;
      y = py;
    }
  }
  return [keepA, keepB];
}

/** The places of a run of words: a box for each line of each page. */
function placesOf(words: Word[], texts: PageText[], ids: string[]): ChangePlace[] {
  const places: ChangePlace[] = [];
  for (const word of words) {
    const rects = rectsOf(texts[word.page], word.start, word.end);
    const last = places.at(-1);
    if (last && last.page === ids[word.page]) last.rects.push(...rects);
    else places.push({ page: ids[word.page], rects });
  }
  // Boxes of one line, side by side, made one.
  for (const place of places) {
    const merged: Rect[] = [];
    for (const r of place.rects) {
      const m = merged.at(-1);
      if (m && Math.abs(m.y - r.y) < r.height / 2 && r.x - (m.x + m.width) < r.height) {
        const right = Math.max(m.x + m.width, r.x + r.width);
        m.height = Math.max(m.height, r.height);
        m.width = right - m.x;
      } else merged.push({ ...r });
    }
    place.rects = merged;
  }
  return places;
}

/** Compares the text and the forms of two PDFs: what the first has the second has not, and what the second has the first had not. */
export async function comparePdfs(first: Pdf, second: Pdf): Promise<Comparison> {
  const [ta, tb] = await Promise.all([readText(first), readText(second)]);
  const [ia, ib] = [first.pages.map((p) => p.id), second.pages.map((p) => p.id)];
  const a = wordsOf(ta);
  const b = wordsOf(tb);
  const [keepA, keepB] = common(a, b);
  const text: TextChange[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && keepA[i] && keepB[j]) {
      i++;
      j++;
      continue;
    }
    const gone: Word[] = [];
    const come: Word[] = [];
    while (i < a.length && !keepA[i]) gone.push(a[i++]);
    while (j < b.length && !keepB[j]) come.push(b[j++]);
    if (!gone.length && !come.length) {
      // A word kept on one side only, as the walk back has it: passed over.
      if (i < a.length && keepA[i] && !(j < b.length && keepB[j])) j++;
      else i++;
      continue;
    }
    text.push({
      kind: gone.length && come.length ? 'changed' : gone.length ? 'removed' : 'added',
      ...(gone.length ? { before: gone.map((w) => w.text).join(' '), in: placesOf(gone, ta, ia) } : {}),
      ...(come.length ? { after: come.map((w) => w.text).join(' '), out: placesOf(come, tb, ib) } : {}),
    });
  }
  const fields: FieldChange[] = [];
  const names = [...new Set([...first.fields, ...second.fields].map((f) => f.name))];
  for (const name of names) {
    const before = findField(first, name)?.value;
    const after = findField(second, name)?.value;
    if (JSON.stringify(before) !== JSON.stringify(after)) fields.push({ name, ...(before !== undefined ? { before } : {}), ...(after !== undefined ? { after } : {}) });
  }
  return { text, fields, pages: [first.pages.length, second.pages.length] };
}
