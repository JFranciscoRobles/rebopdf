// What a page draws, read operator by operator, and the text it draws in
// some boxes taken out of it: each glyph placed as a reader places it (by
// the matrices, the font and its widths, the spacings), and those in a box
// taken from the strings that show them, with the room they took kept, so
// that what follows stays where it was. The text is gone from the file, not
// covered: it is neither seen nor found. Text drawn in forms (XObjects) of
// the page, and fonts of codes of more bytes than Identity's, are left.

import { Font } from '@cantoo/pdf-lib/standard-fonts';
import { decodePDFRawStream, PDFArray, PDFDict, PDFName, PDFNumber, type PDFObject, type PDFPage, PDFRawStream } from '@cantoo/pdf-lib';
import { WIN_ANSI } from './pdfa';
import type { Rect } from './types';

type Matrix = [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
const multiply = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[1] * n[2],
  m[0] * n[1] + m[1] * n[3],
  m[2] * n[0] + m[3] * n[2],
  m[2] * n[1] + m[3] * n[3],
  m[4] * n[0] + m[5] * n[2] + n[4],
  m[4] * n[1] + m[5] * n[3] + n[5],
];
const apply = (m: Matrix, x: number, y: number) => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] });

// --- Tokens -------------------------------------------------------------------------

type Token =
  | { kind: 'number'; value: number; start: number; end: number }
  | { kind: 'string'; value: Uint8Array; start: number; end: number }
  | { kind: 'name'; value: string; start: number; end: number }
  | { kind: 'op'; value: string; start: number; end: number }
  | { kind: '['; start: number; end: number }
  | { kind: ']'; start: number; end: number }
  | { kind: 'other'; start: number; end: number }
  | { kind: 'array'; items: Token[]; start: number; end: number };

const WHITE = new Set([0, 9, 10, 12, 13, 32]);
const DELIMITER = new Set([40, 41, 60, 62, 91, 93, 123, 125, 47, 37]);

/** The tokens of a content stream, each with where it is in it. */
function* tokens(b: Uint8Array): Generator<Token> {
  let i = 0;
  while (i < b.length) {
    const c = b[i];
    if (WHITE.has(c)) {
      i++;
      continue;
    }
    const start = i;
    if (c === 37) {
      // A comment, to the end of its line.
      while (i < b.length && b[i] !== 10 && b[i] !== 13) i++;
      continue;
    }
    if (c === 40) {
      // A string: (…), with nested parentheses and escapes.
      const out: number[] = [];
      let depth = 1;
      i++;
      while (i < b.length && depth > 0) {
        const x = b[i++];
        if (x === 92) {
          const e = b[i++];
          if (e === 110) out.push(10);
          else if (e === 114) out.push(13);
          else if (e === 116) out.push(9);
          else if (e === 98) out.push(8);
          else if (e === 102) out.push(12);
          else if (e >= 48 && e <= 55) {
            let octal = e - 48;
            for (let k = 0; k < 2 && b[i] >= 48 && b[i] <= 55; k++) octal = octal * 8 + (b[i++] - 48);
            out.push(octal & 0xff);
          } else if (e === 13) {
            if (b[i] === 10) i++;
          } else if (e !== 10) out.push(e);
        } else if (x === 40) {
          depth++;
          out.push(x);
        } else if (x === 41) {
          if (--depth > 0) out.push(x);
        } else out.push(x);
      }
      yield { kind: 'string', value: Uint8Array.from(out), start, end: i };
      continue;
    }
    if (c === 60 && b[i + 1] === 60) {
      i += 2;
      yield { kind: 'other', start, end: i };
      continue;
    }
    if (c === 62 && b[i + 1] === 62) {
      i += 2;
      yield { kind: 'other', start, end: i };
      continue;
    }
    if (c === 60) {
      // A string in hex.
      let hex = '';
      i++;
      while (i < b.length && b[i] !== 62) {
        if (!WHITE.has(b[i])) hex += String.fromCharCode(b[i]);
        i++;
      }
      i++;
      if (hex.length % 2) hex += '0';
      const out = new Uint8Array(hex.length / 2);
      for (let k = 0; k < out.length; k++) out[k] = Number.parseInt(hex.slice(k * 2, k * 2 + 2), 16);
      yield { kind: 'string', value: out, start, end: i };
      continue;
    }
    if (c === 91 || c === 93) {
      i++;
      yield { kind: c === 91 ? '[' : ']', start, end: i };
      continue;
    }
    if (c === 123 || c === 125) {
      i++;
      yield { kind: 'other', start, end: i };
      continue;
    }
    if (c === 47) {
      i++;
      while (i < b.length && !WHITE.has(b[i]) && !DELIMITER.has(b[i])) i++;
      yield { kind: 'name', value: new TextDecoder('latin1').decode(b.subarray(start + 1, i)), start, end: i };
      continue;
    }
    while (i < b.length && !WHITE.has(b[i]) && !DELIMITER.has(b[i])) i++;
    if (i === start) {
      i++;
      continue;
    }
    const word = new TextDecoder('latin1').decode(b.subarray(start, i));
    const n = Number(word);
    if (word !== '' && !Number.isNaN(n) && /^[+-]?(\d+\.?\d*|\.\d+)$/.test(word)) yield { kind: 'number', value: n, start, end: i };
    else if (word === 'BI') {
      // An image in the stream: its bytes, after ID, to EI between spaces.
      let at = i;
      while (at < b.length - 1 && !(b[at] === 73 && b[at + 1] === 68 && WHITE.has(b[at - 1]) && WHITE.has(b[at + 2]))) at++;
      at += 3;
      while (at < b.length - 2 && !(WHITE.has(b[at - 1]) && b[at] === 69 && b[at + 1] === 73 && (at + 2 >= b.length || WHITE.has(b[at + 2])))) at++;
      i = Math.min(b.length, at + 2);
      yield { kind: 'other', start, end: i };
    } else yield { kind: 'op', value: word, start, end: i };
  }
}

// --- Fonts --------------------------------------------------------------------------

interface FontInfo {
  /** How many bytes each code takes. */
  bytes: 1 | 2;
  /** The width of the glyph of a code, in thousandths of the size. */
  width(code: number): number;
}

const STANDARD: Record<string, string> = {
  Helvetica: 'Helvetica',
  Arial: 'Helvetica',
  'Helvetica-Bold': 'Helvetica-Bold',
  'Arial-Bold': 'Helvetica-Bold',
  'Arial,Bold': 'Helvetica-Bold',
  'Helvetica-Oblique': 'Helvetica-Oblique',
  'Helvetica-BoldOblique': 'Helvetica-BoldOblique',
  'Times-Roman': 'Times-Roman',
  TimesNewRoman: 'Times-Roman',
  'Times-Bold': 'Times-Bold',
  'Times-Italic': 'Times-Italic',
  'Times-BoldItalic': 'Times-BoldItalic',
  Courier: 'Courier',
  'Courier-Bold': 'Courier-Bold',
  'Courier-Oblique': 'Courier-Oblique',
  'Courier-BoldOblique': 'Courier-BoldOblique',
  Symbol: 'Symbol',
  ZapfDingbats: 'ZapfDingbats',
};

const num = (o: PDFObject | undefined, fallback = 0) => (o instanceof PDFNumber ? o.asNumber() : fallback);

/** What a font of a page says of its codes and their widths; undefined for one whose codes are not read here. */
function fontInfo(dict: PDFDict): FontInfo | undefined {
  const subtype = (dict.lookup(PDFName.of('Subtype')) as PDFName | undefined)?.decodeText();
  if (subtype === 'Type0') {
    const encoding = dict.lookup(PDFName.of('Encoding'));
    if (!(encoding instanceof PDFName) || !/^Identity-[HV]$/.test(encoding.decodeText())) return undefined;
    const descendant = (dict.lookup(PDFName.of('DescendantFonts')) as PDFArray | undefined)?.lookup(0);
    if (!(descendant instanceof PDFDict)) return undefined;
    const fallback = num(descendant.lookup(PDFName.of('DW')), 1000);
    const widths = new Map<number, number>();
    const w = descendant.lookup(PDFName.of('W'));
    if (w instanceof PDFArray) {
      for (let i = 0; i < w.size(); ) {
        const first = num(w.lookup(i));
        const next = w.lookup(i + 1);
        if (next instanceof PDFArray) {
          for (let k = 0; k < next.size(); k++) widths.set(first + k, num(next.lookup(k)));
          i += 2;
        } else {
          const last = num(next);
          const value = num(w.lookup(i + 2));
          for (let code = first; code <= last; code++) widths.set(code, value);
          i += 3;
        }
      }
    }
    return { bytes: 2, width: (code) => widths.get(code) ?? fallback };
  }
  const first = num(dict.lookup(PDFName.of('FirstChar')));
  const list = dict.lookup(PDFName.of('Widths'));
  const descriptor = dict.lookup(PDFName.of('FontDescriptor'));
  const missing = descriptor instanceof PDFDict ? num(descriptor.lookup(PDFName.of('MissingWidth'))) : 0;
  // A Type 3 font's widths are of its own space.
  const matrix = dict.lookup(PDFName.of('FontMatrix'));
  const scale = subtype === 'Type3' && matrix instanceof PDFArray ? num(matrix.lookup(0), 0.001) * 1000 : 1;
  if (list instanceof PDFArray) return { bytes: 1, width: (code) => (code >= first && code - first < list.size() ? num(list.lookup(code - first)) : missing) * scale };
  // One of the standard fonts, of no widths of its own: as their metrics say.
  const base = (dict.lookup(PDFName.of('BaseFont')) as PDFName | undefined)?.decodeText().replace(/^[A-Z]{6}\+/, '') ?? '';
  const standard = STANDARD[base];
  if (!standard) return { bytes: 1, width: () => missing || 500 };
  const metrics = Font.load(standard as never);
  return { bytes: 1, width: (code) => (code >= 32 && WIN_ANSI[code - 32] ? (metrics.getWidthOfGlyph(WIN_ANSI[code - 32]) ?? 500) : 0) };
}

// --- Removing ------------------------------------------------------------------------

/** What a page draws, as one run of bytes. */
function contentsOf(page: PDFPage): Uint8Array {
  const contents = page.node.Contents();
  const streams: PDFObject[] = contents instanceof PDFArray ? contents.asArray().map((ref) => page.doc.context.lookup(ref)!) : contents ? [contents] : [];
  const parts: Uint8Array[] = streams.flatMap((stream) => {
    if (stream instanceof PDFRawStream) return [decodePDFRawStream(stream).decode()];
    const own = stream as unknown as { getUnencodedContents?: () => Uint8Array };
    return own?.getUnencodedContents ? [own.getUnencodedContents()] : [];
  });
  const all = new Uint8Array(parts.reduce((n, p) => n + p.length + 1, 0));
  let at = 0;
  for (const part of parts) {
    all.set(part, at);
    at += part.length;
    all[at++] = 10;
  }
  return all;
}

const hex = (codes: number[], bytes: 1 | 2) => `<${codes.map((c) => c.toString(16).padStart(bytes * 2, '0')).join('')}>`;

/**
 * Takes out of what a page draws the glyphs whose middle is in one of the
 * boxes (of the page's space): how many were taken out.
 */
export function removeText(page: PDFPage, boxes: Rect[]): number {
  if (!boxes.length) return 0;
  const bytes = contentsOf(page);
  const resources = page.node.Resources();
  const fontsDict = resources?.lookup(PDFName.of('Font'));
  const fonts = new Map<string, FontInfo | undefined>();
  const fontOf = (name: string) => {
    if (!fonts.has(name)) {
      const dict = fontsDict instanceof PDFDict ? fontsDict.lookup(PDFName.of(name)) : undefined;
      fonts.set(name, dict instanceof PDFDict ? fontInfo(dict) : undefined);
    }
    return fonts.get(name);
  };
  const inside = (p: { x: number; y: number }) => boxes.some((r) => p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height);

  type State = { ctm: Matrix; font?: FontInfo; size: number; tc: number; tw: number; th: number; tl: number; rise: number };
  let state: State = { ctm: IDENTITY, size: 0, tc: 0, tw: 0, th: 1, tl: 0, rise: 0 };
  const saved: State[] = [];
  let tm: Matrix = IDENTITY;
  let tlm: Matrix = IDENTITY;
  let operands: Token[] = [];
  let array: Token[] | undefined;
  let arrayStart = 0;
  let removed = 0;
  const edits: { start: number; end: number; text: string }[] = [];

  /** Shows strings and spacings as a reader would, and says how to show them without the glyphs in the boxes, or nothing when none is. */
  const show = (items: (Uint8Array | number)[]): string | undefined => {
    const font = state.font;
    if (!font) return undefined;
    const out: (number[] | number)[] = [];
    let changed = false;
    for (const item of items) {
      if (typeof item === 'number') {
        tm = multiply([1, 0, 0, 1, (-item / 1000) * state.size * state.th, 0], tm);
        out.push(item);
        continue;
      }
      let kept: number[] = [];
      for (let i = 0; i + font.bytes <= item.length; i += font.bytes) {
        const code = font.bytes === 2 ? (item[i] << 8) | item[i + 1] : item[i];
        const w = font.width(code);
        const advance = ((w / 1000) * state.size + state.tc + (font.bytes === 1 && code === 32 ? state.tw : 0)) * state.th;
        const trm = multiply(multiply([state.size * state.th, 0, 0, state.size, 0, state.rise], tm), state.ctm);
        if (inside(apply(trm, w / 2000, 0.3))) {
          // Its room kept, its glyph not shown.
          changed = true;
          removed++;
          if (kept.length) out.push(kept);
          kept = [];
          out.push(state.size && state.th ? (-advance * 1000) / (state.size * state.th) : 0);
        } else kept.push(code);
        tm = multiply([1, 0, 0, 1, advance, 0], tm);
      }
      if (kept.length) out.push(kept);
    }
    if (!changed) return undefined;
    const parts = out.map((part) => (typeof part === 'number' ? String(Math.round(part * 1000) / 1000) : hex(part, font.bytes)));
    return `[${parts.join(' ')}] TJ`;
  };

  for (const token of tokens(bytes)) {
    if (token.kind === '[') {
      array = [];
      arrayStart = token.start;
      continue;
    }
    if (token.kind === ']') {
      if (array) operands.push({ kind: 'array', items: array, start: arrayStart, end: token.end });
      array = undefined;
      continue;
    }
    if (array) {
      array.push(token);
      continue;
    }
    if (token.kind !== 'op') {
      operands.push(token);
      continue;
    }
    const n = (i: number) => {
      const t = operands[operands.length - 1 - i];
      return t?.kind === 'number' ? t.value : 0;
    };
    const at = operands[0]?.start ?? token.start;
    switch (token.value) {
      case 'q':
        saved.push({ ...state });
        break;
      case 'Q':
        state = saved.pop() ?? state;
        break;
      case 'cm':
        state.ctm = multiply([n(5), n(4), n(3), n(2), n(1), n(0)], state.ctm);
        break;
      case 'BT':
        tm = tlm = IDENTITY;
        break;
      case 'Tf': {
        const name = operands[operands.length - 2];
        state.font = name?.kind === 'name' ? fontOf(name.value) : undefined;
        state.size = n(0);
        break;
      }
      case 'Tc':
        state.tc = n(0);
        break;
      case 'Tw':
        state.tw = n(0);
        break;
      case 'Tz':
        state.th = n(0) / 100;
        break;
      case 'TL':
        state.tl = n(0);
        break;
      case 'Ts':
        state.rise = n(0);
        break;
      case 'Td':
        tm = tlm = multiply([1, 0, 0, 1, n(1), n(0)], tlm);
        break;
      case 'TD':
        state.tl = -n(0);
        tm = tlm = multiply([1, 0, 0, 1, n(1), n(0)], tlm);
        break;
      case 'Tm':
        tm = tlm = [n(5), n(4), n(3), n(2), n(1), n(0)];
        break;
      case 'T*':
        tm = tlm = multiply([1, 0, 0, 1, 0, -state.tl], tlm);
        break;
      case 'Tj':
      case "'":
      case '"': {
        let prefix = '';
        if (token.value !== 'Tj') {
          if (token.value === '"') {
            prefix = `${n(2)} Tw ${n(1)} Tc `;
            state.tw = n(2);
            state.tc = n(1);
          }
          prefix += 'T* ';
          tm = tlm = multiply([1, 0, 0, 1, 0, -state.tl], tlm);
        }
        const string = operands[operands.length - 1];
        const replaced = string?.kind === 'string' ? show([string.value]) : undefined;
        if (replaced) edits.push({ start: at, end: token.end, text: prefix + replaced });
        break;
      }
      case 'TJ': {
        const last = operands[operands.length - 1];
        const list = last?.kind === 'array' ? last.items : [];
        const replaced = show(list.flatMap((t): (Uint8Array | number)[] => (t.kind === 'string' ? [t.value] : t.kind === 'number' ? [t.value] : [])));
        if (replaced) edits.push({ start: at, end: token.end, text: replaced });
        break;
      }
    }
    operands = [];
  }
  if (!edits.length) return 0;

  // What the page draws, written again with the strings changed.
  const parts: Uint8Array[] = [];
  let last = 0;
  for (const edit of edits.sort((a, b) => a.start - b.start)) {
    parts.push(bytes.subarray(last, edit.start), new TextEncoder().encode(edit.text));
    last = edit.end;
  }
  parts.push(bytes.subarray(last));
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  const { context } = page.doc;
  page.node.set(PDFName.of('Contents'), context.register(context.flateStream(out)));
  return removed;
}
