// What a PDF is to the engine: the files it was opened from, its pages in the
// order they go, its form fields with what they hold, and what has been put
// on it (marks). Nothing is written into the files until it is saved: the
// pages are those of the files, and the fields and the marks are kept beside
// them. Every change makes a new Pdf; the files are shared between them.
//
// Places on a page are in its own space, as the PDF has it: points (1/72 of
// an inch) from the bottom left of the page, before it is turned.

/** A point of a page, in points from its bottom left. */
export interface Point {
  x: number;
  y: number;
}

/** A box of a page, from its bottom left corner, in points. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A page: which page of which file it is, how big and how it is turned. */
export interface Page {
  id: string;
  /** The file it is from, by its id in `Pdf.sources`. */
  source: string;
  /** Its place in that file, from 0. */
  index: number;
  /** The box shown of it (its crop box), before it is turned. */
  box: Rect;
  /** Turned clockwise by this much. */
  rotation: 0 | 90 | 180 | 270;
}

/** A signature field is where a PDF is to be signed: it holds nothing to fill, and is signed by `signPdf`. */
export type FieldKind = 'text' | 'checkbox' | 'radio' | 'choice' | 'list' | 'signature';

/** A field of a form, with what it holds. */
export interface Field {
  /** The file and its name in it: `<source>/<name>`. */
  id: string;
  source: string;
  /** Its full name in the file, as "client.name". */
  name: string;
  /** What it is called for a person, when the PDF says so (as "First name"). */
  label?: string;
  kind: FieldKind;
  /** Text for text, a choice and a radio ('' for none); whether it is checked for a checkbox; the chosen for a list. */
  value: string | boolean | string[];
  /** The choices of a choice, a list or a radio. */
  options?: string[];
  multiline?: boolean;
  maxLength?: number;
  readOnly?: boolean;
  required?: boolean;
  /** Where it is shown: on which page, and, for a radio, which choice each one is. */
  widgets: { page: string; rect: Rect; option?: string }[];
  /** Made here, not in the file: put in its form when it is saved. */
  created?: boolean;
}

/** A colour, as "#rrggbb". */
export type Color = string;

interface MarkBase {
  id: string;
  /** The page it is on. */
  page: string;
  /** Who put it there, when it was. */
  author?: string;
  /** When it was put there or last changed, as an ISO date. */
  date?: string;
}

/** Text marked over, as a highlighter does: a box for each line. */
export interface HighlightMark extends MarkBase {
  kind: 'highlight';
  rects: Rect[];
  color: Color;
  /** The text under it, as it was when marked. */
  text?: string;
  /** What is said about it. */
  comment?: string;
}

/** A note at a point of the page. */
export interface NoteMark extends MarkBase {
  kind: 'note';
  at: Point;
  text: string;
  color: Color;
}

/** Lines drawn by hand. */
export interface InkMark extends MarkBase {
  kind: 'ink';
  paths: Point[][];
  color: Color;
  width: number;
}

/** Text written on the page, in a box: to fill a form that has no fields. */
export interface TextMark extends MarkBase {
  kind: 'text';
  rect: Rect;
  text: string;
  size: number;
  color: Color;
}

/**
 * A signature in a box: drawn (its lines, each point from 0 to 1 across the
 * box and down from its top) or a picture (a PNG or JPEG data URL).
 */
export interface SignatureMark extends MarkBase {
  kind: 'signature';
  rect: Rect;
  paths?: Point[][];
  image?: string;
  color: Color;
}

/**
 * What is to be blacked out, for good: when the PDF is saved, what is under
 * these boxes (text, pictures, drawings, what fields hold) is taken out of
 * the file, not only covered. The page is saved as a picture with the boxes
 * burnt in, and the text out of them is put back over it, unseen, to be
 * found and selected.
 */
export interface RedactionMark extends MarkBase {
  kind: 'redaction';
  rects: Rect[];
  /** The text under it, as it was when it was marked, for the person to see what goes. */
  text?: string;
}

export type Mark = HighlightMark | NoteMark | InkMark | TextMark | SignatureMark | RedactionMark;
export type MarkKind = Mark['kind'];

/** A mark of any kind but its id, which is given one when it is put on. */
export type NewMark = Mark extends infer M ? (M extends Mark ? Omit<M, 'id'> & { id?: string } : never) : never;

/** What can be changed of a mark of any kind. */
export type MarkPatch = Mark extends infer M ? (M extends Mark ? Partial<Omit<M, 'id' | 'kind'>> : never) : never;

export interface Pdf {
  /** Its name, as a file: "contract.pdf". */
  name: string;
  /** The bytes of each file it is made of, by id. Never changed. */
  sources: Record<string, Uint8Array>;
  pages: Page[];
  fields: Field[];
  marks: Mark[];
  /** What the first file says of itself. */
  info: { title?: string; author?: string; subject?: string };
  /**
   * The bytes PDF.js draws a file from, when they are not those it is saved
   * from: without the annotations taken as marks, which the viewer draws.
   */
  drawn?: Record<string, Uint8Array>;
  /** The annotations of each file taken as marks (and their popups), by reference, to be taken out when it is saved. */
  taken?: Record<string, string[]>;
  /** The digital signatures of the files, as they say who signed and when. */
  signatures?: Signature[];
}

/** A digital signature a file carries. */
export interface Signature {
  source: string;
  /** The name of its field. */
  field: string;
  /** Who signed, when the signature says. */
  name?: string;
  date?: string;
  reason?: string;
}

/** What could not be done to a PDF, said so a person can understand it. */
export class PdfError extends Error {
  constructor(
    readonly code: 'encrypted' | 'invalid' | 'empty' | 'not-found' | 'incremental',
    message: string,
  ) {
    super(message);
    this.name = 'PdfError';
  }
}
