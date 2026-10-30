// Boxes of a page, and what of a run of text is out of others: what is left
// of the text of a page once boxes of it are blacked out.

import type { Pdf, Rect } from './types';

/** Whether two boxes share more than a hair. */
export const overlaps = (a: Rect, b: Rect, hair = 0.25): boolean => a.x + hair < b.x + b.width && b.x + hair < a.x + a.width && a.y + hair < b.y + b.height && b.y + hair < a.y + a.height;

/** The boxes blacked out on a page. */
export const redactedOn = (pdf: Pdf, page: string): Rect[] => pdf.marks.flatMap((mark) => (mark.kind === 'redaction' && mark.page === page ? mark.rects : []));

/** A piece of a run of text: its letters, from which letter of the run, and the box it takes. */
export interface Piece {
  text: string;
  from: number;
  rect: Rect;
}

/**
 * What of a run of text (on one line, its letters as wide as each other) is
 * out of the boxes: the runs of its letters no box touches.
 */
export function outside(text: string, rect: Rect, boxes: Rect[]): Piece[] {
  if (!boxes.some((box) => overlaps(rect, box))) return [{ text, from: 0, rect }];
  const letters = [...text];
  const width = rect.width / Math.max(1, letters.length);
  const pieces: Piece[] = [];
  let piece: Piece | undefined;
  letters.forEach((letter, i) => {
    const box = { x: rect.x + i * width, y: rect.y, width, height: rect.height };
    if (boxes.some((b) => overlaps(box, b))) {
      piece = undefined;
      return;
    }
    if (piece) {
      piece.text += letter;
      piece.rect.width += width;
    } else {
      piece = { text: letter, from: i, rect: box };
      pieces.push(piece);
    }
  });
  return pieces;
}
