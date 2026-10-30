// Where a PDF leads: the links of its pages (to an address of the web, or to
// a place of the PDF) and its outline, the table of contents a book or a
// paper has. Read by PDF.js from the files, and put on the pages of the Pdf
// as they are now: a link to a page taken out leads nowhere.

import { pageById } from './edit';
import { overlaps, redactedOn } from './geometry';
import { readerFor } from './pdfjs';
import type { Pdf, Rect } from './types';

/** A place of the PDF: a page, and how far from its bottom the place is, in points, when the PDF says so. */
export interface Place {
  page: string;
  top?: number;
}

export interface PageLink {
  rect: Rect;
  /** An address of the web. */
  url?: string;
  /** A place of the PDF. */
  to?: Place;
}

export interface OutlineItem {
  title: string;
  to?: Place;
  items: OutlineItem[];
}

type Reader = Awaited<ReturnType<typeof readerFor>>;

/** The page of the Pdf a destination of a file leads to, and how high on it. */
async function placeOf(pdf: Pdf, source: string, reader: Reader, dest: unknown): Promise<Place | undefined> {
  try {
    const explicit = (typeof dest === 'string' ? await reader.getDestination(dest) : dest) as unknown[] | null;
    if (!Array.isArray(explicit) || !explicit.length) return undefined;
    const [target, kind] = explicit;
    const index = typeof target === 'number' ? target : await reader.getPageIndex(target as { num: number; gen: number });
    const page = pdf.pages.find((p) => p.source === source && p.index === index);
    if (!page) return undefined;
    // XYZ left top zoom; FitH and FitBH top.
    const name = (kind as { name?: string } | undefined)?.name;
    const top = name === 'XYZ' ? explicit[3] : name === 'FitH' || name === 'FitBH' ? explicit[2] : undefined;
    return { page: page.id, ...(typeof top === 'number' ? { top } : {}) };
  } catch {
    return undefined;
  }
}

/** The links of a page: where each is on it, and where it leads. */
export async function linksOf(pdf: Pdf, id: string): Promise<PageLink[]> {
  const page = pageById(pdf, id);
  if (!page) return [];
  const reader = await readerFor(pdf, page.source);
  const annotations = await (await reader.getPage(page.index + 1)).getAnnotations({ intent: 'display' });
  const links: PageLink[] = [];
  const redacted = redactedOn(pdf, id);
  for (const a of annotations) {
    if (a.subtype !== 'Link' || !Array.isArray(a.rect)) continue;
    const [x1, y1, x2, y2] = a.rect as number[];
    const rect = { x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) };
    // A link under what is blacked out goes with it.
    if (redacted.some((box) => overlaps(rect, box))) continue;
    if (typeof a.url === 'string' && /^(https?|mailto|tel):/i.test(a.url)) links.push({ rect, url: a.url });
    else if (a.dest) {
      const to = await placeOf(pdf, page.source, reader, a.dest);
      if (to) links.push({ rect, to });
    }
  }
  return links;
}

/** The outline of the PDF, of each of its files in the order their pages first come. */
export async function outlineOf(pdf: Pdf): Promise<OutlineItem[]> {
  const out: OutlineItem[] = [];
  for (const source of [...new Set(pdf.pages.map((p) => p.source))]) {
    const reader = await readerFor(pdf, source);
    const outline = await reader.getOutline().catch(() => null);
    const walk = async (items: { title: string; dest: unknown; items: unknown[] }[]): Promise<OutlineItem[]> =>
      Promise.all(items.map(async (item) => ({ title: item.title, ...(await placeOf(pdf, source, reader, item.dest).then((to) => (to ? { to } : {}))), items: await walk(item.items as never) })));
    out.push(...(await walk((outline ?? []) as never)));
  }
  return out;
}
