// What people working on a PDF together send each other: what changed of
// it, as operations. A mark put on or changed (whole, by its id), a mark
// taken off, a field filled. Pages go by their number and fields by their
// name: each person opens the same file, with ids of their own.

import { type Field, findField, type Mark, type Pdf, setField } from '@rebopdf/core';

export type Op =
  /** A mark put on, or changed: the whole of it, on the page of this number (from 0). */
  { kind: 'mark'; page: number; mark: Omit<Mark, 'page'> } | { kind: 'unmark'; id: string } | { kind: 'field'; name: string; value: Field['value'] };

/** Where the server is, under the address of an application: /collab. */
export const PREFIX = '/collab';

/** What changed from one Pdf to another, as operations. Pages are not: they are the same for everyone in a room. */
export function diffPdfs(before: Pdf, after: Pdf): Op[] {
  const ops: Op[] = [];
  const was = new Map(before.marks.map((m) => [m.id, m]));
  for (const mark of after.marks) {
    const old = was.get(mark.id);
    if (old && JSON.stringify(old) === JSON.stringify(mark)) continue;
    const page = after.pages.findIndex((p) => p.id === mark.page);
    if (page < 0) continue;
    const { page: _, ...rest } = mark;
    ops.push({ kind: 'mark', page, mark: rest });
  }
  const now = new Set(after.marks.map((m) => m.id));
  for (const mark of before.marks) if (!now.has(mark.id)) ops.push({ kind: 'unmark', id: mark.id });
  for (const field of after.fields) {
    const old = before.fields.find((f) => f.name === field.name);
    if (old && JSON.stringify(old.value) !== JSON.stringify(field.value)) ops.push({ kind: 'field', name: field.name, value: field.value });
  }
  return ops;
}

/** A Pdf with these operations made on it. What cannot be made (a page or a field it has not) is passed over. */
export function applyOps(pdf: Pdf, ops: Op[]): Pdf {
  let next = pdf;
  for (const op of ops) {
    if (op.kind === 'mark') {
      const page = next.pages[op.page];
      if (!page) continue;
      const mark = { ...op.mark, page: page.id } as Mark;
      const at = next.marks.findIndex((m) => m.id === mark.id);
      next = { ...next, marks: at < 0 ? [...next.marks, mark] : next.marks.map((m, i) => (i === at ? mark : m)) };
    } else if (op.kind === 'unmark') {
      next = { ...next, marks: next.marks.filter((m) => m.id !== op.id) };
    } else if (findField(next, op.name)) {
      try {
        next = setField(next, op.name, op.value);
      } catch {
        // A value the field cannot hold, from a PDF that is not quite this one: passed over.
      }
    }
  }
  return next;
}

/** A person in a room: who, in which colour, and on which page (by number, from 0). */
export interface Peer {
  client: string;
  name: string;
  color: string;
  page?: number;
}
