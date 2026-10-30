// What an assistant can do to a PDF, as tools: each has a name, a
// description, the shape of its arguments, and a function that reads the Pdf
// or makes a new one, and says what it did. They use nothing of Node or the
// browser: the server runs them on files, and a page could run them on the
// PDF open in it.
//
// Pages go by their number, from 1, as a person counts them; several as
// "1,3-5". Places on a page are in points (1/72 of an inch) from its top left
// corner, as it is before it is turned; read_pdf says how big each page is.

import {
  addMark,
  type Field,
  findField,
  type Mark,
  type Match,
  marksOn,
  movePages,
  type Page,
  type Pdf,
  PdfError,
  type Rect,
  readText,
  removeMark,
  removePages,
  rotatePages,
  searchPdf,
  setField,
} from '@rebopdf/core';

export type Args = Record<string, unknown>;

export interface Tool {
  name: string;
  title: string;
  description: string;
  properties: Record<string, unknown>;
  required?: string[];
  /** Whether it changes the PDF. */
  writes: boolean;
  run(pdf: Pdf, args: Args, files: Files): Promise<{ text: string; pdf?: Pdf }>;
}

/** What the tools are given of the files around them: a picture read, for a signature. */
export interface Files {
  image(path: string): Promise<{ dataUrl: string; width: number; height: number }>;
}

/** What the assistant asked wrong: said to it as the result, for it to put right. */
export class ToolError extends Error {}

export const fail = (message: string): never => {
  throw new ToolError(message);
};

const COLORS: Record<string, { ink: string; light: string }> = {
  yellow: { ink: '#f08c00', light: '#ffe066' },
  green: { ink: '#2f9e44', light: '#b2f2bb' },
  blue: { ink: '#1c5fd6', light: '#a5d8ff' },
  pink: { ink: '#d6336c', light: '#fcc2d7' },
  red: { ink: '#e03131', light: '#ffa8a8' },
  black: { ink: '#1b1b1b', light: '#ced4da' },
};

const PAGES = { type: 'string', description: 'Pages by number, from 1: "3", "1,3-5", or "all".' };
const PAGE = { type: 'integer', minimum: 1, description: 'The page, by number from 1.' };
const COLOR = { type: 'string', enum: Object.keys(COLORS), description: 'Its colour. Yellow when left out.' };
const NEAR = { type: 'string', description: 'Text of the page to put it by, as it reads there; the first place it is, or the one `occurrence` says.' };
const OCCURRENCE = { type: 'integer', minimum: 1, description: 'Which of the places the text is, from 1, in the order of the pages.' };
const X = { type: 'number', description: 'Points from the left edge of the page.' };
const Y = { type: 'number', description: 'Points from the top edge of the page.' };

/** The pages a text names, in their order, as ids. */
export function pagesOf(pdf: Pdf, spec: unknown): string[] {
  const text = String(spec ?? '').trim();
  if (!text) fail('Say which pages, as "3" or "1,3-5".');
  if (text === 'all') return pdf.pages.map((p) => p.id);
  const ids = new Set<string>();
  for (const part of text.split(',').map((s) => s.trim())) {
    const range = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(part);
    if (!range) fail(`"${part}" is not pages: write them as "3" or "1,3-5".`);
    const [from, to] = [Number(range![1]), Number(range![2] ?? range![1])];
    if (from < 1 || to > pdf.pages.length || from > to) fail(`There are pages 1 to ${pdf.pages.length}; "${part}" is not among them.`);
    for (let n = from; n <= to; n++) ids.add(pdf.pages[n - 1].id);
  }
  return pdf.pages.filter((p) => ids.has(p.id)).map((p) => p.id);
}

const pageAt = (pdf: Pdf, n: unknown): Page => {
  const number = Number(n);
  const page = pdf.pages[number - 1];
  if (!Number.isInteger(number) || !page) fail(`There are pages 1 to ${pdf.pages.length}; ${n} is not one.`);
  return page!;
};

const numberOf = (pdf: Pdf, id: string) => pdf.pages.findIndex((p) => p.id === id) + 1;
const round = (n: number) => Math.round(n * 10) / 10;

/** A point given from the top left of a page, as the engine has it: from its bottom left. */
const fromTop = (page: Page, x: number, y: number) => ({ x: page.box.x + x, y: page.box.y + page.box.height - y });

/** Where a text is, by the arguments `near` and `occurrence`, on a page if one is given. */
async function findNear(pdf: Pdf, near: unknown, occurrence: unknown, page?: Page): Promise<Match> {
  const text = String(near ?? '');
  const all = (await searchPdf(pdf, text)).filter((m) => !page || m.page === page.id);
  if (!all.length) fail(`"${text}" is not in ${page ? `page ${numberOf(pdf, page.id)}` : 'the PDF'}. Search with search_pdf to see how it reads.`);
  const n = Number(occurrence ?? 1);
  const match = all[n - 1];
  if (!match) fail(`"${text}" is there ${all.length} times; occurrence ${n} is not one of them.`);
  return match!;
}

const describeField = (pdf: Pdf, field: Field) => {
  const value =
    field.kind === 'checkbox'
      ? field.value
        ? 'checked'
        : 'not checked'
      : Array.isArray(field.value)
        ? field.value.join(', ') || '(none)'
        : field.value === ''
          ? '(empty)'
          : JSON.stringify(field.value);
  const options = field.options?.length ? ` · options: ${field.options.join(' | ')}` : '';
  const flags = [field.readOnly && 'read only', field.required && 'required', field.multiline && 'several lines', field.maxLength && `at most ${field.maxLength} letters`].filter(Boolean).join(', ');
  const pages = [...new Set(field.widgets.map((w) => numberOf(pdf, w.page)))].join(', ');
  return `- ${field.name}${field.label ? ` "${field.label}"` : ''} (${field.kind}, page ${pages}): ${value}${options}${flags ? ` · ${flags}` : ''}`;
};

const describeMark = (pdf: Pdf, mark: Mark) => {
  const what =
    mark.kind === 'highlight'
      ? `highlight of "${mark.text ?? ''}"${mark.comment ? ` — ${mark.comment}` : ''}`
      : mark.kind === 'note'
        ? `note: ${mark.text}`
        : mark.kind === 'text'
          ? `text: ${mark.text}`
          : mark.kind === 'ink'
            ? `drawing of ${mark.paths.length} lines`
            : mark.kind === 'redaction'
              ? `blacked out when saved${mark.text ? `: "${mark.text}"` : ''}`
              : 'signature';
  return `- ${mark.id} (page ${numberOf(pdf, mark.page)}${mark.author ? `, by ${mark.author}` : ''}): ${what}`;
};

export const TOOLS: Tool[] = [
  {
    name: 'read_pdf',
    title: 'Read a PDF',
    writes: false,
    description: 'Gives the text of pages of a PDF, a page after another, with how big each is (in points, as wide × as tall) and how it is turned. Long PDFs are best read some pages at a time.',
    properties: { pages: { ...PAGES, description: `${PAGES.description} All when left out.` } },
    async run(pdf, args) {
      const ids = args.pages ? pagesOf(pdf, args.pages) : pdf.pages.map((p) => p.id);
      const texts = await readText(pdf, ids);
      const out = texts.map((t) => {
        const page = pdf.pages.find((p) => p.id === t.page)!;
        const { width, height } = page.box;
        return `## Page ${numberOf(pdf, page.id)} (${round(width)} × ${round(height)} pt${page.rotation ? `, turned ${page.rotation}°` : ''})\n\n${t.text || '(no text: it may be a scanned image)'}`;
      });
      return { text: `${pdf.name}: ${pdf.pages.length} pages, ${pdf.fields.length} form fields, ${pdf.marks.length} marks (see list_marks).\n\n${out.join('\n\n')}` };
    },
  },
  {
    name: 'search_pdf',
    title: 'Search a PDF',
    writes: false,
    description: 'Finds text in a PDF without minding capitals or accents, across the end of a line. Gives each place: its page and the words around it.',
    properties: { text: { type: 'string', description: 'What to find.' } },
    required: ['text'],
    async run(pdf, args) {
      const matches = await searchPdf(pdf, String(args.text ?? ''), 200);
      if (!matches.length) return { text: `"${args.text}" is not in ${pdf.name}.` };
      return { text: `${matches.length} found:\n${matches.map((m, i) => `${i + 1}. page ${numberOf(pdf, m.page)}: …${m.context}…`).join('\n')}` };
    },
  },
  {
    name: 'list_fields',
    title: 'List the fields of a form',
    writes: false,
    description: 'Gives the fields of the form of a PDF: their names, kinds (text, checkbox, radio, choice, list), what they hold, their options and their pages.',
    properties: {},
    async run(pdf) {
      if (!pdf.fields.length) return { text: `${pdf.name} has no form fields. To write on it, use add_text.` };
      return { text: `${pdf.fields.length} fields:\n${pdf.fields.map((f) => describeField(pdf, f)).join('\n')}` };
    },
  },
  {
    name: 'fill_fields',
    title: 'Fill a form',
    writes: true,
    description:
      'Fills fields of the form of a PDF, by name as list_fields gives them. Text fields take text; checkboxes true or false; radios and choices one of their options; lists some of them, as an array. An empty text, or false, clears a field.',
    properties: { values: { type: 'object', description: 'The value of each field, by its name: {"client.name": "Ana", "accept": true}.', additionalProperties: true } },
    required: ['values'],
    async run(pdf, args) {
      const values = args.values;
      if (!values || typeof values !== 'object' || Array.isArray(values)) fail('Give `values` as an object of field names and values.');
      let next = pdf;
      const done: string[] = [];
      for (const [name, value] of Object.entries(values as Record<string, unknown>)) {
        const field = findField(next, name);
        if (!field) fail(`There is no field "${name}". The fields are: ${pdf.fields.map((f) => f.name).join(', ')}.`);
        if (field!.readOnly) fail(`${name} is read only.`);
        try {
          next = setField(next, name, (typeof value === 'boolean' || Array.isArray(value) ? value : String(value ?? '')) as Field['value']);
        } catch (error) {
          fail(error instanceof Error ? error.message : String(error));
        }
        done.push(describeField(next, findField(next, name)!));
      }
      return { text: `Filled:\n${done.join('\n')}`, pdf: next };
    },
  },
  {
    name: 'highlight_text',
    title: 'Highlight text',
    writes: true,
    description: 'Highlights text where it is in the PDF, as a highlighter does, with a comment if one is given: a highlight any reader shows. Every place it is, or the one `occurrence` says.',
    properties: {
      text: { type: 'string', description: 'The text, as it reads in the PDF.' },
      occurrence: OCCURRENCE,
      comment: { type: 'string', description: 'What is said about it.' },
      color: COLOR,
      page: { ...PAGE, description: 'Only on this page.' },
    },
    required: ['text'],
    async run(pdf, args) {
      const page = args.page === undefined ? undefined : pageAt(pdf, args.page);
      let matches = (await searchPdf(pdf, String(args.text ?? ''))).filter((m) => !page || m.page === page.id);
      if (!matches.length) fail(`"${args.text}" is not in ${page ? `page ${args.page}` : 'the PDF'}. Search with search_pdf to see how it reads.`);
      if (args.occurrence !== undefined) matches = [await findNear(pdf, args.text, args.occurrence, page)];
      const color = COLORS[String(args.color ?? 'yellow')]?.light ?? COLORS.yellow.light;
      let next = pdf;
      for (const m of matches) next = addMark(next, { kind: 'highlight', page: m.page, rects: m.rects, color, text: m.text, ...(args.comment ? { comment: String(args.comment) } : {}) });
      return { text: `Highlighted ${matches.length} ${matches.length === 1 ? 'place' : 'places'}: ${matches.map((m) => `page ${numberOf(pdf, m.page)}`).join(', ')}.`, pdf: next };
    },
  },
  {
    name: 'add_note',
    title: 'Add a note',
    writes: true,
    description: 'Puts a note (a comment readers show as an icon) on a page: by a text of the page, or at a place of it.',
    properties: { page: PAGE, text: { type: 'string', description: 'What the note says.' }, near: NEAR, occurrence: OCCURRENCE, x: X, y: Y, color: COLOR },
    required: ['text'],
    async run(pdf, args) {
      let page: Page;
      let at: { x: number; y: number };
      if (args.near) {
        const m = await findNear(pdf, args.near, args.occurrence, args.page === undefined ? undefined : pageAt(pdf, args.page));
        page = pdf.pages.find((p) => p.id === m.page)!;
        const last = m.rects.at(-1)!;
        // To the right of the end of the text, within the page.
        at = { x: Math.min(last.x + last.width + 4, page.box.x + page.box.width - 22), y: last.y + last.height + 2 };
      } else {
        page = pageAt(pdf, args.page ?? 1);
        at = args.x === undefined ? { x: page.box.x + page.box.width - 40, y: page.box.y + page.box.height - 20 } : fromTop(page, Number(args.x), Number(args.y ?? 0));
      }
      const color = COLORS[String(args.color ?? 'yellow')]?.ink ?? COLORS.yellow.ink;
      const next = addMark(pdf, { kind: 'note', page: page.id, at, text: String(args.text), color });
      return { text: `Added a note on page ${numberOf(pdf, page.id)}: ${next.marks.at(-1)!.id}.`, pdf: next };
    },
  },
  {
    name: 'add_text',
    title: 'Write on a page',
    writes: true,
    description:
      'Writes text on a page, drawn into it as printed text: to fill in a form that has no fields, or to add a date or a name. Put by a text of the page (after it on its line, or under it), or at a place of it. Letters the standard PDF font has (Latin ones) are written; others are left out.',
    properties: {
      page: PAGE,
      text: { type: 'string', description: 'What to write. New lines start new lines.' },
      near: NEAR,
      occurrence: OCCURRENCE,
      position: { type: 'string', enum: ['after', 'below'], description: 'With `near`: after the text on its line, or under it. After when left out.' },
      x: X,
      y: Y,
      width: { type: 'number', description: 'How wide the box of the text is, in points: lines longer than it are broken. As wide as the text when left out.' },
      size: { type: 'number', description: 'The size of the letters in points. 11 when left out.' },
      color: { type: 'string', description: 'Its colour, as "#rrggbb". Black when left out.' },
    },
    required: ['text'],
    async run(pdf, args) {
      const size = Number(args.size ?? 11);
      const text = String(args.text ?? '');
      let page: Page;
      let top: { x: number; y: number };
      if (args.near) {
        const m = await findNear(pdf, args.near, args.occurrence, args.page === undefined ? undefined : pageAt(pdf, args.page));
        page = pdf.pages.find((p) => p.id === m.page)!;
        const r = m.rects.at(-1)!;
        top = args.position === 'below' ? { x: m.rects[0].x, y: r.y - 2 } : { x: r.x + r.width + size * 0.4, y: r.y + r.height };
      } else {
        page = pageAt(pdf, args.page ?? 1);
        if (args.x === undefined || args.y === undefined) fail('Say where: `near` a text of the page, or `x` and `y`.');
        top = fromTop(page, Number(args.x), Number(args.y));
      }
      const lines = text.split('\n');
      // Helvetica is about half as wide as it is big.
      const guess = Math.max(...lines.map((l) => l.length)) * size * 0.56 + 4;
      const width = Math.min(Number(args.width ?? guess), page.box.x + page.box.width - top.x - 4);
      const perLine = Math.max(1, Math.floor(width / (size * 0.52)));
      const count = lines.reduce((n, l) => n + Math.max(1, Math.ceil(l.length / perLine)), 0);
      const height = count * size * 1.25 + size * 0.35;
      const rect: Rect = { x: top.x, y: top.y - height, width, height };
      const next = addMark(pdf, { kind: 'text', page: page.id, rect, text, size, color: /^#[0-9a-f]{6}$/i.test(String(args.color)) ? String(args.color) : '#000000' });
      return { text: `Wrote on page ${numberOf(pdf, page.id)}: ${next.marks.at(-1)!.id}.`, pdf: next };
    },
  },
  {
    name: 'sign',
    title: 'Sign',
    writes: true,
    description:
      'Puts a picture of a signature (a PNG or JPEG file) on a page, drawn into it: over a text of the page (as the name under a line to sign on), or at a place of it. Only when the person whose signature it is asks for it.',
    properties: {
      image: { type: 'string', description: 'The path of the picture of the signature.' },
      page: PAGE,
      near: { ...NEAR, description: 'Text of the page the signature goes over, as the name or the word under the line to sign on.' },
      occurrence: OCCURRENCE,
      x: X,
      y: { ...Y, description: 'Points from the top edge of the page to the top of the signature.' },
      width: { type: 'number', description: 'How wide it is, in points. 150 when left out.' },
    },
    required: ['image'],
    async run(pdf, args, files) {
      const picture = await files.image(String(args.image));
      const width = Number(args.width ?? 150);
      const height = Math.min(width * (picture.height / picture.width), 70);
      const fit = height * (picture.width / picture.height);
      let page: Page;
      let rect: Rect;
      if (args.near) {
        const m = await findNear(pdf, args.near, args.occurrence, args.page === undefined ? undefined : pageAt(pdf, args.page));
        page = pdf.pages.find((p) => p.id === m.page)!;
        const r = m.rects[0];
        // Over the line that is over the text.
        rect = { x: r.x, y: r.y + r.height + 6, width: fit, height };
      } else {
        page = pageAt(pdf, args.page ?? 1);
        if (args.x === undefined || args.y === undefined) fail('Say where: `near` a text of the page, or `x` and `y`.');
        const top = fromTop(page, Number(args.x), Number(args.y));
        rect = { x: top.x, y: top.y - height, width: fit, height };
      }
      const next = addMark(pdf, { kind: 'signature', page: page.id, rect, image: picture.dataUrl, color: '#000000' });
      return { text: `Signed on page ${numberOf(pdf, page.id)}: ${next.marks.at(-1)!.id}.`, pdf: next };
    },
  },
  {
    name: 'redact_text',
    title: 'Black out text',
    writes: true,
    description:
      'Blacks out text for good where it is in the PDF: names, numbers, anything private. When the PDF is saved, what is under the boxes is taken out of the file (the pages with them are saved as pictures with the boxes burnt in, their other text kept unseen to be found), not only covered. Every place it is, or the one `occurrence` says. Read the PDF after to see that it is gone.',
    properties: { text: { type: 'string', description: 'The text, as it reads in the PDF.' }, occurrence: OCCURRENCE, page: { ...PAGE, description: 'Only on this page.' } },
    required: ['text'],
    async run(pdf, args) {
      const page = args.page === undefined ? undefined : pageAt(pdf, args.page);
      let matches = (await searchPdf(pdf, String(args.text ?? ''))).filter((m) => !page || m.page === page.id);
      if (!matches.length) fail(`"${args.text}" is not in ${page ? `page ${args.page}` : 'the PDF'}, or it is blacked out already.`);
      if (args.occurrence !== undefined) matches = [await findNear(pdf, args.text, args.occurrence, page)];
      let next = pdf;
      for (const m of matches)
        next = addMark(next, { kind: 'redaction', page: m.page, rects: m.rects.map((r) => ({ x: r.x - 0.5, y: r.y - 0.5, width: r.width + 1, height: r.height + 1 })), text: m.text });
      return {
        text: `Blacked out ${matches.length} ${matches.length === 1 ? 'place' : 'places'} (${matches.map((m) => `page ${numberOf(pdf, m.page)}`).join(', ')}), for good when the PDF is saved.`,
        pdf: next,
      };
    },
  },
  {
    name: 'redact_area',
    title: 'Black out a part of a page',
    writes: true,
    description: 'Blacks out a box of a page for good, as redact_text does text: a picture, a signature, a part with no text to find. In points from the top left of the page.',
    properties: { page: PAGE, x: X, y: Y, width: { type: 'number', description: 'How wide, in points.' }, height: { type: 'number', description: 'How tall, in points.' } },
    required: ['page', 'x', 'y', 'width', 'height'],
    async run(pdf, args) {
      const page = pageAt(pdf, args.page);
      const [width, height] = [Number(args.width), Number(args.height)];
      if (!(width > 0 && height > 0)) fail('Give it a width and a height greater than 0.');
      const top = fromTop(page, Number(args.x), Number(args.y));
      const next = addMark(pdf, { kind: 'redaction', page: page.id, rects: [{ x: top.x, y: top.y - height, width, height }] });
      return { text: `Blacked out a box of page ${numberOf(pdf, page.id)}, for good when the PDF is saved.`, pdf: next };
    },
  },
  {
    name: 'list_marks',
    title: 'List the marks',
    writes: false,
    description:
      'Gives the marks on the PDF, with their ids, to take one off with remove_mark: the highlights, notes and drawings it came with (by whom, when the PDF says), and what has been put on it since (highlights, notes, text, drawings, signatures).',
    properties: { page: { ...PAGE, description: 'Only those on this page.' } },
    async run(pdf, args) {
      const marks = args.page === undefined ? pdf.marks : marksOn(pdf, pageAt(pdf, args.page).id);
      return { text: marks.length ? marks.map((m) => describeMark(pdf, m)).join('\n') : 'There are no marks.' };
    },
  },
  {
    name: 'remove_mark',
    title: 'Remove a mark',
    writes: true,
    description: 'Takes off a mark, by its id as list_marks gives it: one the PDF came with, or one put on since.',
    properties: { id: { type: 'string', description: 'The id of the mark.' } },
    required: ['id'],
    async run(pdf, args) {
      const mark = pdf.marks.find((m) => m.id === args.id);
      if (!mark) fail(`There is no mark ${args.id}. The marks are: ${pdf.marks.map((m) => m.id).join(', ') || 'none'}.`);
      return { text: `Removed ${describeMark(pdf, mark!).slice(2)}.`, pdf: removeMark(pdf, String(args.id)) };
    },
  },
  {
    name: 'rotate_pages',
    title: 'Turn pages',
    writes: true,
    description: 'Turns pages clockwise by 90, 180 or 270 degrees; -90 turns them back.',
    properties: { pages: PAGES, degrees: { type: 'integer', enum: [90, 180, 270, -90], description: 'How far to turn them, clockwise.' } },
    required: ['pages', 'degrees'],
    async run(pdf, args) {
      const ids = pagesOf(pdf, args.pages);
      const by = Number(args.degrees);
      if (![90, 180, 270, -90].includes(by)) fail('Turn them by 90, 180, 270 or -90 degrees.');
      return { text: `Turned ${ids.length} ${ids.length === 1 ? 'page' : 'pages'} by ${by}°.`, pdf: rotatePages(pdf, ids, by) };
    },
  },
  {
    name: 'delete_pages',
    title: 'Delete pages',
    writes: true,
    description: 'Takes pages out of the PDF, with what was on them. One page at least stays. The pages after them are numbered again.',
    properties: { pages: PAGES },
    required: ['pages'],
    async run(pdf, args) {
      const ids = pagesOf(pdf, args.pages);
      try {
        const next = removePages(pdf, ids);
        return { text: `Deleted ${ids.length} ${ids.length === 1 ? 'page' : 'pages'}: ${next.pages.length} left.`, pdf: next };
      } catch (error) {
        return fail(error instanceof PdfError ? error.message : String(error));
      }
    },
  },
  {
    name: 'move_pages',
    title: 'Move pages',
    writes: true,
    description: 'Moves pages, in the order they are in, to before another page, or to the end.',
    properties: { pages: PAGES, before: { type: 'integer', minimum: 1, description: 'The number of the page they go before, as the pages are numbered now. The end when left out.' } },
    required: ['pages'],
    async run(pdf, args) {
      const ids = pagesOf(pdf, args.pages);
      const before = args.before === undefined ? null : pageAt(pdf, args.before).id;
      const next = movePages(pdf, ids, before);
      return { text: `Moved. The pages are now, by their old numbers: ${next.pages.map((p) => numberOf(pdf, p.id)).join(', ')}.`, pdf: next };
    },
  },
];

export const findTool = (name: string) => TOOLS.find((tool) => tool.name === name);
