// The dialog a signature is made in: drawn on a pad (kept as its lines, to be
// drawn in the PDF as lines), typed as a name (drawn in a hand of the
// system, kept as a picture), or a picture of it.

import type { Point } from '@rebopdf/core';
import type { EditorStrings } from './i18n';

/** A signature made: its lines (from 0 to 1 across its box and down from its top) or a picture, and how wide it is for how tall. */
export interface Signature {
  paths?: Point[][];
  image?: string;
  aspect: number;
}

const HAND = '"Segoe Script", "Snell Roundhand", "Brush Script MT", "Apple Chancery", cursive';

/** Asks for a signature; nothing when the dialog is closed without one. */
export function askSignature(host: HTMLElement, t: EditorStrings): Promise<Signature | null> {
  const doc = host.ownerDocument;
  const opener = doc.activeElement as HTMLElement | null;
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') => {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  };
  const button = (text: string, className = 'rp-button') => {
    const b = el('button', className, text);
    b.type = 'button';
    return b;
  };

  return new Promise((resolve) => {
    const back = el('div', 'rp-dialog-back');
    const dialog = el('div', 'rp-dialog');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    const title = el('h2', '', t.signTitle);
    title.id = `rp-sign-${Math.random().toString(36).slice(2)}`;
    dialog.setAttribute('aria-labelledby', title.id);

    const tabs = el('div', 'rp-tabs');
    tabs.setAttribute('role', 'tablist');
    const panels = el('div');
    const kinds = [
      ['draw', t.signDraw],
      ['type', t.signType],
      ['upload', t.signUpload],
    ] as const;
    let kind: (typeof kinds)[number][0] = 'draw';

    // Drawn.
    const pad = el('div', 'rp-pad');
    const canvas = el('canvas');
    canvas.setAttribute('aria-label', t.signDrawHint);
    canvas.setAttribute('role', 'img');
    pad.append(el('div', 'rp-pad-line'), el('div', 'rp-pad-hint', t.signDrawHint), canvas);
    const strokes: Point[][] = [];
    let ctx: CanvasRenderingContext2D | null = null;
    const ratio = doc.defaultView?.devicePixelRatio ?? 1;
    const sizePad = () => {
      const box = pad.getBoundingClientRect();
      canvas.width = Math.max(1, box.width * ratio);
      canvas.height = Math.max(1, box.height * ratio);
      ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.scale(ratio, ratio);
      ctx.lineWidth = 2.6;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#0b1f4d';
      for (const stroke of strokes) drawStroke(stroke);
    };
    const drawStroke = (stroke: Point[]) => {
      if (!ctx || !stroke.length) return;
      ctx.beginPath();
      ctx.moveTo(stroke[0].x, stroke[0].y);
      for (const p of stroke.slice(1)) ctx.lineTo(p.x, p.y);
      if (stroke.length === 1) ctx.lineTo(stroke[0].x + 0.1, stroke[0].y);
      ctx.stroke();
    };
    pad.addEventListener('pointerdown', (event) => {
      pad.setPointerCapture(event.pointerId);
      const box = pad.getBoundingClientRect();
      const stroke = [{ x: event.clientX - box.left, y: event.clientY - box.top }];
      strokes.push(stroke);
      pad.querySelector('.rp-pad-hint')?.remove();
      const move = (e: PointerEvent) => {
        for (const ev of e.getCoalescedEvents?.() ?? [e]) stroke.push({ x: ev.clientX - box.left, y: ev.clientY - box.top });
        drawStroke(stroke.slice(-3));
      };
      const up = () => {
        pad.removeEventListener('pointermove', move);
        pad.removeEventListener('pointerup', up);
        pad.removeEventListener('pointercancel', up);
        drawStroke(stroke);
        refresh();
      };
      pad.addEventListener('pointermove', move);
      pad.addEventListener('pointerup', up);
      pad.addEventListener('pointercancel', up);
    });
    const clear = button(t.signClear, 'rp-button rp-quiet');
    clear.addEventListener('click', () => {
      strokes.length = 0;
      sizePad();
      refresh();
    });
    const drawPanel = el('div');
    drawPanel.append(pad);

    // Typed.
    const typed = el('div', 'rp-typed');
    const name = el('input', 'rp-input');
    name.placeholder = t.signTypeHint;
    name.setAttribute('aria-label', t.signTypeHint);
    name.addEventListener('input', () => {
      typed.textContent = name.value;
      refresh();
    });
    const typePanel = el('div');
    typePanel.style.display = 'grid';
    typePanel.style.gap = '10px';
    typePanel.append(name, typed);

    // A picture.
    const file = el('input');
    file.type = 'file';
    file.accept = 'image/png,image/jpeg';
    file.setAttribute('aria-label', t.signUploadHint);
    const preview = el('div', 'rp-upload-preview', t.signUploadHint);
    let picture: { image: string; aspect: number } | null = null;
    file.addEventListener('change', () => {
      const chosen = file.files?.[0];
      if (!chosen) return;
      const reader = new FileReader();
      reader.onload = () => {
        const image = String(reader.result);
        const img = new Image();
        img.onload = () => {
          picture = { image, aspect: img.naturalWidth / Math.max(1, img.naturalHeight) };
          preview.replaceChildren(img);
          refresh();
        };
        img.src = image;
        img.alt = '';
      };
      reader.readAsDataURL(chosen);
    });
    const uploadPanel = el('div');
    uploadPanel.style.display = 'grid';
    uploadPanel.style.gap = '10px';
    uploadPanel.append(file, preview);

    const panelOf = { draw: drawPanel, type: typePanel, upload: uploadPanel };
    const tabButtons = kinds.map(([id, label]) => {
      const b = button(label);
      b.setAttribute('role', 'tab');
      b.addEventListener('click', () => choose(id));
      tabs.append(b);
      return b;
    });
    const choose = (id: typeof kind) => {
      kind = id;
      kinds.forEach(([k], i) => {
        tabButtons[i].setAttribute('aria-selected', String(k === id));
        tabButtons[i].tabIndex = k === id ? 0 : -1;
      });
      panels.replaceChildren(panelOf[id]);
      clear.hidden = id !== 'draw';
      if (id === 'draw') sizePad();
      if (id === 'type') name.focus();
      refresh();
    };

    const cancel = button(t.cancel);
    const place = button(t.signPlace, 'rp-button rp-primary');
    const actions = el('div', 'rp-dialog-actions');
    const left = el('div', 'rp-spacer');
    actions.append(clear, left, cancel, place);
    dialog.append(title, tabs, panels, actions);
    back.append(dialog);
    host.append(back);

    const refresh = () => {
      place.disabled = !(kind === 'draw' ? strokes.length : kind === 'type' ? name.value.trim() : picture);
    };
    const close = (value: Signature | null) => {
      back.remove();
      opener?.focus();
      resolve(value);
    };
    cancel.addEventListener('click', () => close(null));
    back.addEventListener('pointerdown', (event) => event.target === back && close(null));
    dialog.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        close(null);
      } else if (event.key === 'Tab') {
        // The focus stays in the dialog.
        const focusable = [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]), input')].filter((e) => !e.hidden && e.offsetParent !== null && e.tabIndex >= 0);
        const first = focusable[0];
        const last = focusable.at(-1);
        if (event.shiftKey && doc.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && doc.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    });
    place.addEventListener('click', () => {
      if (kind === 'draw') close(normalize(strokes));
      else if (kind === 'type') close(typedImage(doc, name.value.trim()));
      else if (picture) close(picture);
    });

    choose('draw');
    tabButtons[0].focus();
  });
}

/** The lines, from 0 to 1 within the box that holds them. */
export function normalize(strokes: Point[][]): Signature {
  const all = strokes.flat();
  const pad = 3;
  const x = Math.min(...all.map((p) => p.x)) - pad;
  const y = Math.min(...all.map((p) => p.y)) - pad;
  const width = Math.max(...all.map((p) => p.x)) + pad - x;
  const height = Math.max(...all.map((p) => p.y)) + pad - y;
  // Every few points of a stroke made by hand are enough.
  const thin = (points: Point[]) => points.filter((p, i) => i === 0 || i === points.length - 1 || Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y) > 1.2);
  return {
    paths: strokes.map((stroke) => thin(stroke).map((p) => ({ x: round((p.x - x) / width), y: round((p.y - y) / height) }))),
    aspect: width / height,
  };
}

const round = (n: number) => Math.round(n * 10000) / 10000;

/** A name written in a hand of the system, as a picture as wide as it is. */
function typedImage(doc: Document, name: string): Signature {
  const canvas = doc.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const size = 96;
  ctx.font = `${size}px ${HAND}`;
  const width = Math.ceil(ctx.measureText(name).width + size * 0.6);
  canvas.width = width;
  canvas.height = Math.ceil(size * 1.6);
  ctx.font = `${size}px ${HAND}`;
  ctx.fillStyle = '#0b1f4d';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, size * 0.3, canvas.height / 2);
  return { image: canvas.toDataURL('image/png'), aspect: canvas.width / canvas.height };
}
