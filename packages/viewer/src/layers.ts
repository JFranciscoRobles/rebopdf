// What is laid over a page as it is drawn: the marks of the engine
// (highlights, notes, ink, text, signatures) and the fields of its form, put
// where the page has them, turned as it is turned. A place of the page (in
// points, from its bottom left) is a place of the screen by the geometry of
// the page at its zoom, the same PDF.js draws it by.

import { type Field, markBounds, NOTE_SIZE, type Mark, type Page, type Point, type Rect } from '@rebopdf/core';
import type { Strings } from './i18n';
import { icon } from './icons';

/** Where a page is on the screen: points of the page to pixels of its element and back. */
export interface Geometry {
  /** Pixels for a point. */
  scale: number;
  /** The size of the page on the screen, turned. */
  width: number;
  height: number;
  rotation: Page['rotation'];
  toScreen(point: Point): Point;
  toPage(point: Point): Point;
  /** A box of the page as a box of the screen (turned with it). */
  toScreenRect(rect: Rect): Rect;
}

export function geometryOf(page: Page, scale: number): Geometry {
  const { box, rotation } = page;
  const w = box.width * scale;
  const h = box.height * scale;
  const across = rotation === 90 || rotation === 270;
  const toScreen = ({ x, y }: Point): Point => {
    // As the page lies before it is turned, from its top left.
    const u = (x - box.x) * scale;
    const v = (box.y + box.height - y) * scale;
    switch (rotation) {
      case 90:
        return { x: h - v, y: u };
      case 180:
        return { x: w - u, y: h - v };
      case 270:
        return { x: v, y: w - u };
      default:
        return { x: u, y: v };
    }
  };
  const toPage = ({ x, y }: Point): Point => {
    let u = x;
    let v = y;
    if (rotation === 90) [u, v] = [y, h - x];
    else if (rotation === 180) [u, v] = [w - x, h - y];
    else if (rotation === 270) [u, v] = [w - y, x];
    return { x: box.x + u / scale, y: box.y + box.height - v / scale };
  };
  const toScreenRect = (rect: Rect): Rect => {
    const a = toScreen({ x: rect.x, y: rect.y });
    const b = toScreen({ x: rect.x + rect.width, y: rect.y + rect.height });
    return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) };
  };
  return { scale, width: across ? h : w, height: across ? w : h, rotation, toScreen, toPage, toScreenRect };
}

const place = (el: HTMLElement | SVGElement, rect: Rect) => {
  el.style.left = `${rect.x}px`;
  el.style.top = `${rect.y}px`;
  el.style.width = `${rect.width}px`;
  el.style.height = `${rect.height}px`;
};

/** Places an element that turns with the page: as big as the box before it is turned, about its middle. */
const placeTurned = (el: HTMLElement, rect: Rect, geo: Geometry) => {
  const screen = geo.toScreenRect(rect);
  const width = rect.width * geo.scale;
  const height = rect.height * geo.scale;
  place(el, { x: screen.x + (screen.width - width) / 2, y: screen.y + (screen.height - height) / 2, width, height });
  el.style.transform = geo.rotation ? `rotate(${geo.rotation}deg)` : '';
};

const SVG = 'http://www.w3.org/2000/svg';

/** A line through points of the screen, smoothed as the engine smooths it in the PDF. */
export function pathData(points: Point[]): string {
  if (!points.length) return '';
  const [first] = points;
  if (points.length === 1) return `M${first.x} ${first.y}l0.01 0`;
  let d = `M${first.x} ${first.y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i];
    const next = points[i + 1];
    d += `Q${p.x} ${p.y} ${(p.x + next.x) / 2} ${(p.y + next.y) / 2}`;
  }
  const last = points[points.length - 1];
  return `${d}L${last.x} ${last.y}`;
}

/** The icon of a note, in its colour. */
export function noteIcon(doc: Document, color: string): SVGSVGElement {
  const svg = doc.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = `<path d="M2 2h16v11l-5 5H2z" fill="${color}"/><path d="M5 6.5h9M5 10h9M5 13.5h5" stroke="#fff" stroke-width="1.3" stroke-linecap="round"/>`;
  return svg;
}

/** Draws the marks of a page in its layer, each element with the id of its mark in data-mark. */
export function renderMarks(layer: HTMLElement, marks: Mark[], geo: Geometry, t: Strings): void {
  const doc = layer.ownerDocument;
  layer.replaceChildren();
  for (const mark of marks) {
    switch (mark.kind) {
      case 'highlight':
        for (const rect of mark.rects) {
          const el = doc.createElement('div');
          el.className = 'rp-mark rp-mark-highlight';
          el.dataset.mark = mark.id;
          el.style.background = mark.color;
          place(el, geo.toScreenRect(rect));
          if (mark.comment) el.title = mark.comment;
          layer.append(el);
        }
        break;
      case 'note': {
        const el = doc.createElement('button');
        el.type = 'button';
        el.className = 'rp-mark rp-mark-note';
        el.dataset.mark = mark.id;
        el.setAttribute('aria-label', `${t.note}: ${mark.text}`);
        el.title = mark.text;
        el.append(noteIcon(doc, mark.color));
        placeTurned(el, markBounds(mark), geo);
        // Its icon is drawn as big at any zoom, as readers draw it.
        const size = Math.max(18, Math.min(28, NOTE_SIZE * geo.scale));
        const left = Number.parseFloat(el.style.left) + (Number.parseFloat(el.style.width) - size) / 2;
        const top = Number.parseFloat(el.style.top) + (Number.parseFloat(el.style.height) - size) / 2;
        place(el, { x: left, y: top, width: size, height: size });
        layer.append(el);
        break;
      }
      case 'ink': {
        const svg = doc.createElementNS(SVG, 'svg');
        svg.setAttribute('class', 'rp-mark rp-mark-ink');
        svg.setAttribute('width', String(geo.width));
        svg.setAttribute('height', String(geo.height));
        svg.style.left = '0';
        svg.style.top = '0';
        for (const points of mark.paths) {
          const path = doc.createElementNS(SVG, 'path');
          path.setAttribute('d', pathData(points.map(geo.toScreen)));
          path.setAttribute('fill', 'none');
          path.setAttribute('stroke', mark.color);
          path.setAttribute('stroke-width', String(mark.width * geo.scale));
          path.setAttribute('stroke-linecap', 'round');
          path.setAttribute('stroke-linejoin', 'round');
          path.dataset.mark = mark.id;
          svg.append(path);
        }
        layer.append(svg);
        break;
      }
      case 'text': {
        const el = doc.createElement('div');
        el.className = 'rp-mark rp-mark-text';
        el.dataset.mark = mark.id;
        el.textContent = mark.text;
        el.style.color = mark.color;
        el.style.fontSize = `${mark.size * geo.scale}px`;
        placeTurned(el, mark.rect, geo);
        layer.append(el);
        break;
      }
      case 'signature': {
        const el = doc.createElement('div');
        el.className = 'rp-mark rp-mark-signature';
        el.dataset.mark = mark.id;
        el.setAttribute('role', 'img');
        el.setAttribute('aria-label', t.signature);
        placeTurned(el, mark.rect, geo);
        if (mark.image) {
          const img = doc.createElement('img');
          img.src = mark.image;
          img.alt = '';
          el.append(img);
        } else {
          const width = mark.rect.width * geo.scale;
          const height = mark.rect.height * geo.scale;
          const svg = doc.createElementNS(SVG, 'svg');
          svg.setAttribute('width', String(width));
          svg.setAttribute('height', String(height));
          for (const points of mark.paths ?? []) {
            const path = doc.createElementNS(SVG, 'path');
            path.setAttribute('d', pathData(points.map((p) => ({ x: p.x * width, y: p.y * height }))));
            path.setAttribute('fill', 'none');
            path.setAttribute('stroke', mark.color);
            path.setAttribute('stroke-width', String(Math.max(1, Math.min(mark.rect.width, mark.rect.height) / 40) * geo.scale));
            path.setAttribute('stroke-linecap', 'round');
            path.setAttribute('stroke-linejoin', 'round');
            svg.append(path);
          }
          el.append(svg);
        }
        layer.append(el);
        break;
      }
    }
  }
}

/** An option of a select, made in the document of the select (not the window's). */
export function makeOption(doc: Document, text: string, value = text, selected = false): HTMLOptionElement {
  const el = doc.createElement('option');
  el.textContent = text;
  el.value = value;
  el.selected = selected;
  return el;
}

/** A name for a field a person can read: "client.name" is "client name". */
export const fieldLabel = (field: Field) => field.name.replace(/[._[\]]+/g, ' ').trim();

export interface FieldEvents {
  /** Whether what they hold can be changed. */
  editable: boolean;
  onChange(field: Field, value: Field['value']): void;
}

/**
 * Puts the fields of a page in its layer as controls of the page, keeping
 * those already there (and the one being written in) as they are.
 */
export function renderFields(layer: HTMLElement, fields: Field[], page: string, geo: Geometry, events: FieldEvents): void {
  const doc = layer.ownerDocument;
  const before = new Map([...layer.children].map((el) => [(el as HTMLElement).dataset.key!, el as HTMLElement]));
  const now: HTMLElement[] = [];
  for (const field of fields) {
    field.widgets.forEach((widget, i) => {
      if (widget.page !== page) return;
      const key = `${field.id}#${i}#${field.kind}`;
      let el = before.get(key);
      if (!el) {
        el = makeControl(doc, field, widget.option, events);
        el.dataset.key = key;
      }
      update(el, field, widget.option, events.editable);
      placeTurned(el, widget.rect, geo);
      if (field.kind === 'text' || field.kind === 'choice' || field.kind === 'list') {
        const lines = field.kind === 'list' ? 4 : field.multiline ? 3 : 1;
        el.style.fontSize = `${Math.max(8, Math.min((widget.rect.height * geo.scale) / lines - 4, 13 * geo.scale))}px`;
      }
      now.push(el);
    });
  }
  layer.replaceChildren(...now);
}

function makeControl(doc: Document, field: Field, option: string | undefined, events: FieldEvents): HTMLElement {
  const label = fieldLabel(field);
  switch (field.kind) {
    case 'checkbox':
    case 'radio': {
      const el = doc.createElement('button');
      el.type = 'button';
      el.className = `rp-field rp-check${field.kind === 'radio' ? ' rp-radio' : ''}`;
      el.setAttribute('role', field.kind);
      el.setAttribute('aria-label', field.kind === 'radio' ? `${label}: ${option ?? ''}` : label);
      el.append(icon(doc, 'check'));
      el.addEventListener('click', () => {
        if (el.getAttribute('aria-disabled') === 'true') return;
        const value = el.dataset.value;
        if (field.kind === 'checkbox') events.onChange(field, value !== 'true');
        else events.onChange(field, value === option ? '' : (option ?? ''));
      });
      return el;
    }
    case 'choice':
    case 'list': {
      const el = doc.createElement('select');
      el.className = 'rp-field';
      el.multiple = field.kind === 'list';
      el.setAttribute('aria-label', label);
      if (field.kind === 'choice') el.append(makeOption(doc, ''));
      for (const value of field.options ?? []) el.append(makeOption(doc, value));
      el.addEventListener('change', () => events.onChange(field, field.kind === 'list' ? [...el.selectedOptions].map((o) => o.value) : el.value));
      return el;
    }
    default: {
      const el = doc.createElement(field.multiline ? 'textarea' : 'input');
      el.className = 'rp-field';
      el.setAttribute('aria-label', label);
      if (field.maxLength) el.maxLength = field.maxLength;
      el.addEventListener('input', () => events.onChange(field, el.value));
      return el;
    }
  }
}

function update(el: HTMLElement, field: Field, option: string | undefined, editable: boolean) {
  const locked = !editable || !!field.readOnly;
  if (field.required) el.setAttribute('aria-required', 'true');
  if (el instanceof HTMLButtonElement) {
    const on = field.kind === 'checkbox' ? field.value === true : field.value === option;
    el.dataset.value = String(field.value);
    el.setAttribute('aria-checked', String(on));
    el.setAttribute('aria-disabled', String(locked));
    return;
  }
  const control = el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
  control.disabled = locked;
  // What is being written in is not written over.
  if (el.ownerDocument.activeElement === el) return;
  if (control instanceof HTMLSelectElement && control.multiple) {
    const chosen = new Set(field.value as string[]);
    for (const o of control.options) o.selected = chosen.has(o.value);
  } else control.value = String(field.value ?? '');
}
