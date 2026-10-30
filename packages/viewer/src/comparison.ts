// Two PDFs side by side, what changed from one to the other shown on both:
// what was taken out in red on the first, what was put in in green on the
// second, the changes listed beside them, and the one chosen brought into
// view on both. What their forms hold that changed is listed too.

import { type Comparison, comparePdfs, type Pdf, type Place, type TextChange } from '@rebopdf/core';
import { fill, stringsFor } from './i18n';
import { icon } from './icons';
import { injectViewerStyles } from './styles';
import { mountViewer, type Region, type Viewer } from './viewer';

export interface ComparisonOptions {
  /** The PDF as it was, and as it is now. */
  before: Pdf;
  after: Pdf;
  locale?: string;
  theme?: 'light' | 'dark';
  /** What is done when the comparison is closed; without it, it has no button to close. */
  onClose?: () => void;
}

export interface ComparisonView {
  comparison: Comparison;
  /** Brings a change into view, by its number in the list, from 0. */
  show(index: number): void;
  destroy(): void;
}

const placeOf = (places?: { page: string; rects: { y: number; height: number }[] }[]): Place | undefined =>
  places?.[0] ? { page: places[0].page, top: Math.max(...places[0].rects.map((r) => r.y + r.height)) + 60 } : undefined;

/** Compares two PDFs in the element. */
export async function mountComparison(element: HTMLElement, options: ComparisonOptions): Promise<ComparisonView> {
  const doc = element.ownerDocument;
  injectViewerStyles(doc);
  const t = stringsFor(options.locale);
  const comparison = await comparePdfs(options.before, options.after);
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') => {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  };

  const root = el('div', 'rp-root rp-compare');
  root.setAttribute('role', 'region');
  root.setAttribute('aria-label', t.comparison);
  if (options.theme) root.dataset.theme = options.theme;
  const bar = el('div', 'rp-bar');
  const title = el('div', 'rp-title', `${options.before.name.replace(/\.pdf$/i, '')} → ${options.after.name.replace(/\.pdf$/i, '')}`);
  const count = el('span', 'rp-compare-count', comparison.text.length || comparison.fields.length ? fill(t.changesFound, { n: comparison.text.length + comparison.fields.length }) : t.noChanges);
  count.setAttribute('aria-live', 'polite');
  const button = (name: Parameters<typeof icon>[1], label: string, run: () => void) => {
    const b = el('button', 'rp-button');
    b.type = 'button';
    b.title = label;
    b.setAttribute('aria-label', label);
    b.append(icon(doc, name));
    b.addEventListener('click', run);
    return b;
  };
  let current = -1;
  const prev = button('chevronUp', t.previousChange, () => show(Math.max(0, current - 1)));
  const next = button('chevronDown', t.nextChange, () => show(Math.min(comparison.text.length - 1, current + 1)));
  bar.append(title, el('div', 'rp-spacer'), count, prev, next);
  if (options.onClose) bar.append(button('close', t.close, options.onClose));

  const body = el('div', 'rp-compare-body');
  const list = el('ol', 'rp-compare-list');
  list.setAttribute('aria-label', t.changes);
  const panes = el('div', 'rp-compare-panes');
  const left = el('div', 'rp-compare-pane');
  const right = el('div', 'rp-compare-pane');
  left.setAttribute('aria-label', options.before.name);
  right.setAttribute('aria-label', options.after.name);
  panes.append(left, right);
  body.append(list, panes);
  root.append(bar, body);
  element.append(root);

  const common = { locale: options.locale, theme: options.theme, toolbar: false, thumbnails: false, fill: false, download: false, print: false, zoom: 'fit-width' as const };
  const before: Viewer = mountViewer(left, { ...common, pdf: options.before });
  const after: Viewer = mountViewer(right, { ...common, pdf: options.after });

  const describe = (change: TextChange) =>
    change.kind === 'changed'
      ? fill(t.changedFromTo, { before: change.before ?? '', after: change.after ?? '' })
      : change.kind === 'removed'
        ? fill(t.removedText, { text: change.before ?? '' })
        : fill(t.addedText, { text: change.after ?? '' });
  const items = comparison.text.map((change, i) => {
    const li = el('li', `rp-compare-item rp-compare-${change.kind}`);
    const b = el('button', '', describe(change));
    b.type = 'button';
    b.addEventListener('click', () => show(i));
    li.append(b);
    return li;
  });
  for (const field of comparison.fields) {
    const li = el('li', 'rp-compare-item rp-compare-field', fill(t.fieldChanged, { name: field.name, before: JSON.stringify(field.before ?? ''), after: JSON.stringify(field.after ?? '') }));
    items.push(li);
  }
  list.replaceChildren(...items);

  const paint = () => {
    const regions = (side: 'in' | 'out', tone: Region['tone']) =>
      comparison.text.flatMap((change, i) =>
        (change[side] ?? []).flatMap((place) => [{ page: place.page, rects: place.rects, tone }, ...(i === current ? [{ page: place.page, rects: place.rects, tone: 'current' as const }] : [])]),
      );
    before.setRegions(regions('in', 'removed'));
    after.setRegions(regions('out', 'added'));
  };
  function show(index: number) {
    const change = comparison.text[index];
    if (!change) return;
    current = index;
    paint();
    items.forEach((li, i) => li.toggleAttribute('aria-current', i === index));
    items[index]?.scrollIntoView({ block: 'nearest' });
    count.textContent = fill(t.changeOf, { i: index + 1, n: comparison.text.length });
    // Each side to where the change is, or, where it has none there, to where the other is.
    const there = placeOf(change.in);
    const here = placeOf(change.out);
    if (there) before.goToPlace({ ...there, top: there.top });
    if (here) after.goToPlace(here);
  }
  paint();
  prev.disabled = next.disabled = !comparison.text.length;

  return {
    comparison,
    show,
    destroy() {
      before.destroy();
      after.destroy();
      root.remove();
    },
  };
}
