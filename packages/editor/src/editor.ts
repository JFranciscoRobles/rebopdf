// The editor: the viewer, with tools in its bar to highlight text, put notes,
// draw, write and sign on the pages, the fields of a form to fill, the
// thumbnails to turn, delete, move and take pages out by, PDFs opened and
// joined by dropping them, every change undone and done again, and the PDF
// saved or downloaded. Every change is a new Pdf of the engine.

import {
  addMark,
  extractPages,
  insertBlankPage,
  insertPdf,
  type Mark,
  markBounds,
  type MarkPatch,
  movePages,
  type NewMark,
  openPdf,
  type Page,
  type Pdf,
  PdfError,
  type Point,
  pageNumber,
  type Rect,
  removeMark,
  removePages,
  rotatePages,
  type SaveOptions,
  savePdf,
  savesIncrementally,
  whyNotIncremental,
  updateMark,
} from '@rebopdf/core';
import { fill, type Geometry, type IconName, icon, makeOption, mountViewer, pathData, type Viewer, type Zoom } from '@rebopdf/viewer';
import { type EditorStrings, editorStringsFor } from './i18n';
import { askSignature, type Signature } from './signature';
import { injectEditorStyles } from './styles';

export type Tool = 'select' | 'highlight' | 'note' | 'ink' | 'text' | 'sign' | 'redact';

export interface EditorOptions {
  /** The PDF to work on; without one, the editor asks for a file. */
  pdf?: Pdf;
  /** "en" or "es"; English when left out. */
  locale?: string;
  /** Light or dark; as the system when left out. */
  theme?: 'light' | 'dark';
  /** The name put on the notes and highlights, as their author. */
  author?: string;
  /** A TrueType or OpenType font to write text in, for letters the standard font of PDFs has not (Greek, Cyrillic, Chinese…). */
  font?: Uint8Array;
  thumbnails?: boolean;
  zoom?: Zoom;
  /** Whether PDFs can be opened and added from files (a button, and dropped). They can unless false. */
  files?: boolean;
  /** Told the Pdf after every change. */
  onChange?: (pdf: Pdf) => void;
  /** Given the bytes of the PDF when Save is pressed. Without it, the button downloads the PDF. */
  onSave?: (bytes: Uint8Array, pdf: Pdf) => void | Promise<void>;
}

/** The colours of the tools: what lines and notes are drawn in, and what highlights are. */
export const COLORS = [
  { name: 'yellow', ink: '#f08c00', light: '#ffe066' },
  { name: 'green', ink: '#2f9e44', light: '#b2f2bb' },
  { name: 'blue', ink: '#1c5fd6', light: '#a5d8ff' },
  { name: 'pink', ink: '#d6336c', light: '#fcc2d7' },
  { name: 'red', ink: '#e03131', light: '#ffa8a8' },
  { name: 'black', ink: '#1b1b1b', light: '#ced4da' },
] as const;

type ColorName = (typeof COLORS)[number]['name'];

const TOOLS: { tool: Tool; icon: IconName; key: string }[] = [
  { tool: 'select', icon: 'pointer', key: 'v' },
  { tool: 'highlight', icon: 'highlight', key: 'h' },
  { tool: 'note', icon: 'note', key: 'n' },
  { tool: 'ink', icon: 'pen', key: 'd' },
  { tool: 'text', icon: 'text', key: 't' },
  { tool: 'sign', icon: 'signature', key: 's' },
  { tool: 'redact', icon: 'redact', key: 'r' },
];

const HISTORY = 100;

export class Editor {
  readonly t: EditorStrings;
  /** The viewer the editor works in; none while there is no PDF. */
  viewer?: Viewer;
  private host: HTMLElement;
  private doc: Document;
  private options: EditorOptions;
  private current?: Pdf;
  private past: Pdf[] = [];
  private future: Pdf[] = [];
  private group = '';
  private groupTime = 0;
  private tool: Tool = 'select';
  private colors: Record<Tool, ColorName> = { select: 'yellow', highlight: 'yellow', note: 'yellow', ink: 'blue', text: 'black', sign: 'black', redact: 'black' };
  private chosen = '';
  private chosenPages = new Set<string>();
  private lastPage = '';
  private signature?: Signature;
  /** A mark copied, to be pasted. */
  private clipboard?: Mark;
  private buttons: Partial<Record<Tool | 'undo' | 'redo' | 'color', HTMLButtonElement>> = {};
  private swatch?: HTMLElement;
  private pop?: HTMLElement;
  private popClose?: () => void;
  private selbar?: HTMLElement;
  private toastEl?: HTMLElement;
  private toastTimer?: ReturnType<typeof setTimeout>;
  private live?: HTMLElement;
  private empty?: HTMLElement;
  private cleanup: (() => void)[] = [];

  constructor(host: HTMLElement, options: EditorOptions = {}) {
    this.host = host;
    this.doc = host.ownerDocument;
    this.options = options;
    this.t = editorStringsFor(options.locale);
    injectEditorStyles(this.doc);
    if (options.pdf) this.start(options.pdf);
    else this.showEmpty();
  }

  /** The PDF as it is now. */
  get pdf(): Pdf | undefined {
    return this.current;
  }

  /** Works on another PDF, from the start of its history. */
  setPdf(pdf: Pdf): void {
    this.past = [];
    this.future = [];
    this.group = '';
    this.chosen = '';
    this.chosenPages.clear();
    this.closePop();
    if (this.viewer) {
      this.current = pdf;
      this.viewer.setPdf(pdf);
      this.refresh();
      this.tellSigned(pdf);
    } else this.start(pdf);
  }

  private start(pdf: Pdf) {
    this.empty?.remove();
    this.empty = undefined;
    this.current = pdf;
    const t = this.t;
    const viewer = mountViewer(this.host, {
      pdf,
      locale: this.options.locale,
      theme: this.options.theme,
      thumbnails: this.options.thumbnails,
      zoom: this.options.zoom,
      download: false,
      fill: true,
      font: this.options.font,
      onChange: (next) => this.commit(next, 'fields', false),
      decorateThumb: (li, page) => this.decorateThumb(li, page),
    });
    this.viewer = viewer;
    const root = viewer.root;
    root.setAttribute('aria-label', t.editor);
    root.dataset.tool = this.tool;

    // The bar: undo and redo after the title, the tools in the middle, saving at the end.
    const undo = this.button('undo', t.undo, () => this.undo());
    const redo = this.button('redo', t.redo, () => this.redo());
    this.buttons.undo = undo;
    this.buttons.redo = redo;
    const sep = this.doc.createElement('div');
    sep.className = 'rp-sep';
    viewer.slots.start.append(sep, undo, redo);

    const tools = viewer.slots.tools;
    tools.setAttribute('role', 'group');
    tools.setAttribute('aria-label', t.tools);
    for (const { tool, icon: name, key } of TOOLS) {
      const label = { select: t.select, highlight: t.highlight, note: t.note, ink: t.draw, text: t.text, sign: t.sign, redact: t.redact }[tool];
      const b = this.button(name, `${label} (${key.toUpperCase()})`, () => void this.setTool(tool));
      b.setAttribute('aria-label', label);
      b.setAttribute('aria-pressed', String(tool === this.tool));
      b.setAttribute('aria-keyshortcuts', key);
      this.buttons[tool] = b;
      tools.append(b);
    }
    const color = this.doc.createElement('button');
    color.type = 'button';
    color.className = 'rp-button rp-swatch-button';
    color.setAttribute('aria-haspopup', 'true');
    this.swatch = this.doc.createElement('span');
    this.swatch.className = 'rp-swatch';
    color.append(this.swatch);
    color.addEventListener('click', () => this.colorMenu(color));
    this.buttons.color = color;
    tools.append(color);

    const save = this.doc.createElement('button');
    save.type = 'button';
    save.className = 'rp-button rp-primary';
    const saveLabel = this.doc.createElement('span');
    saveLabel.className = 'rp-hide-narrow';
    saveLabel.textContent = this.options.onSave ? t.save : t.download;
    save.setAttribute('aria-label', saveLabel.textContent);
    save.append(icon(this.doc, this.options.onSave ? 'check' : 'download', 16), saveLabel);
    save.addEventListener('click', () => void this.saveOrDownload());
    const more = this.button('more', t.more, () => this.moreMenu(more));
    more.setAttribute('aria-haspopup', 'true');
    const end = this.doc.createElement('div');
    end.className = 'rp-sep';
    viewer.slots.end.append(end, save, more);

    // Over the thumbnails: what is done to the pages chosen, or to the page in view.
    viewer.slots.side.append(
      this.button('rotateBack', t.rotateLeft, () => this.turnPages(-90), 15),
      this.button('rotate', t.rotateRight, () => this.turnPages(90), 15),
      this.button('pagePlus', t.blankPage, () => void this.blankPage(), 15),
      this.button('scissors', t.extract, () => void this.extract(), 15),
      this.button('trash', t.deletePages, () => this.deletePages(), 15),
    );

    this.live = this.doc.createElement('div');
    this.live.className = 'rp-sr';
    this.live.setAttribute('aria-live', 'polite');
    this.toastEl = this.doc.createElement('div');
    this.toastEl.className = 'rp-toast';
    this.toastEl.hidden = true;
    this.toastEl.setAttribute('role', 'status');
    this.selbar = this.doc.createElement('div');
    this.selbar.className = 'rp-selbar';
    this.selbar.hidden = true;
    const mark = this.button('highlight', t.highlightSelection, () => this.highlightSelection());
    const black = this.button('redact', t.redactSelection, () => this.highlightSelection('redaction'));
    this.selbar.append(mark, black);
    const zone = this.doc.createElement('div');
    zone.className = 'rp-dropzone';
    zone.textContent = t.dropHere;
    zone.hidden = true;
    root.append(this.live, this.toastEl, this.selbar, zone);

    this.listen(viewer.pagesEl, 'pointerdown', (event) => this.pointerDown(event as PointerEvent));
    this.listen(viewer.pagesEl, 'pointerup', () => this.tool === 'highlight' && setTimeout(() => this.highlightSelection(), 0));
    this.listen(viewer.pagesEl, 'dblclick', (event) => {
      const id = (event.target as Element).closest<HTMLElement>('[data-mark]')?.dataset.mark;
      if (id && this.tool === 'select') this.markMenu(id, true);
    });
    this.listen(root, 'keydown', (event) => this.key(event as KeyboardEvent));
    this.listen(this.doc, 'selectionchange', () => this.selectionChanged());
    this.listen(viewer.scroll, 'scroll', () => {
      this.selbar!.hidden = true;
      this.placePop();
    });
    if (this.options.files !== false) this.dropping(root, zone);
    this.refresh();
    this.tellSigned(pdf);
  }

  /** Says a PDF is signed, by whom, and that what is changed is added after the signature. */
  private tellSigned(pdf: Pdf) {
    const [first] = pdf.signatures ?? [];
    if (first) this.toast(fill(this.t.signedBy, { name: first.name ?? this.t.someone }));
  }

  private listen(target: EventTarget, type: string, handler: (event: Event) => void) {
    target.addEventListener(type, handler);
    this.cleanup.push(() => target.removeEventListener(type, handler));
  }

  private button(name: IconName, label: string, run: () => void, size = 18): HTMLButtonElement {
    const b = this.doc.createElement('button');
    b.type = 'button';
    b.className = 'rp-button';
    b.title = label;
    b.setAttribute('aria-label', label);
    b.append(icon(this.doc, name, size));
    b.addEventListener('click', run);
    return b;
  }

  /** Makes a change: kept in the history (changes of one group, close together, as one), shown, and told. */
  private commit(next: Pdf, group = '', show = true) {
    const before = this.current;
    if (!before || next === before) return;
    const now = Date.now();
    if (!group || group !== this.group || now - this.groupTime > 1500) {
      this.past.push(before);
      if (this.past.length > HISTORY) this.past.shift();
    }
    this.group = group;
    this.groupTime = now;
    this.future = [];
    this.current = next;
    if (show) this.viewer?.setPdf(next);
    if (this.chosen && !next.marks.some((m) => m.id === this.chosen)) this.choose('');
    this.refresh();
    this.options.onChange?.(next);
  }

  undo(): void {
    const before = this.past.pop();
    if (!before || !this.current) return;
    this.future.push(this.current);
    this.restore(before);
  }

  redo(): void {
    const after = this.future.pop();
    if (!after || !this.current) return;
    this.past.push(this.current);
    this.restore(after);
  }

  private restore(pdf: Pdf) {
    this.group = '';
    this.current = pdf;
    this.viewer?.setPdf(pdf);
    if (!pdf.marks.some((m) => m.id === this.chosen)) this.choose('');
    this.closePop();
    this.refresh();
    this.options.onChange?.(pdf);
  }

  /** Puts the state of the editor on its controls: history, tool, colour, what is chosen. */
  private refresh() {
    const { undo, redo, color } = this.buttons;
    if (undo) undo.disabled = !this.past.length;
    if (redo) redo.disabled = !this.future.length;
    for (const { tool } of TOOLS) this.buttons[tool]?.setAttribute('aria-pressed', String(tool === this.tool));
    if (this.viewer) this.viewer.root.dataset.tool = this.tool;
    const name = this.colors[this.tool];
    const entry = COLORS.find((c) => c.name === name)!;
    if (this.swatch) this.swatch.style.background = this.tool === 'highlight' ? entry.light : entry.ink;
    if (color) {
      const label = fill(this.t.colorNamed, { name: this.t.colors[name] });
      color.title = label;
      color.setAttribute('aria-label', label);
      color.hidden = this.tool === 'select' || this.tool === 'sign' || this.tool === 'redact';
    }
    this.showChosen();
    for (const li of this.viewer?.root.querySelectorAll<HTMLElement>('.rp-thumb') ?? []) li.setAttribute('aria-selected', String(this.chosenPages.has(li.dataset.page!)));
  }

  async setTool(tool: Tool): Promise<void> {
    this.closePop();
    this.choose('');
    if (tool === 'sign') {
      const made = await askSignature(this.viewer!.root, this.t);
      if (!made) {
        this.tool = 'select';
        this.refresh();
        return;
      }
      this.signature = made;
      this.toast(this.t.signPlaceHint);
    }
    this.tool = tool;
    this.refresh();
    if (tool === 'note' || tool === 'text') this.say(this.t.placeHint);
  }

  private color(kind: 'ink' | 'light' = 'ink') {
    return COLORS.find((c) => c.name === this.colors[this.tool])![kind];
  }

  /** Where a pointer is on a page: the page, its geometry and the point of the page. */
  private at(event: { clientX: number; clientY: number; target: EventTarget | null }) {
    const el = (event.target as Element | null)?.closest<HTMLElement>('.rp-page');
    const id = el?.dataset.page;
    const geo = id ? this.viewer?.geometry(id) : undefined;
    if (!el || !id || !geo) return undefined;
    const box = el.getBoundingClientRect();
    const screen = { x: event.clientX - box.left, y: event.clientY - box.top };
    return { id, el, geo, screen, point: geo.toPage(screen) };
  }

  private pointerDown(event: PointerEvent) {
    if (event.button !== 0 || !this.current) return;
    const at = this.at(event);
    if (!at) return;
    this.selbar!.hidden = true;
    if (this.tool !== 'select' && this.tool !== 'highlight') event.preventDefault();
    this.useTool(event, at);
  }

  /** What the tool does at a place of a page: by the pointer, or by Enter in the middle of the view. */
  private useTool(event: { clientX: number; clientY: number; target: EventTarget | null; pointerId?: number } & Partial<PointerEvent>, at: NonNullable<ReturnType<Editor['at']>>) {
    switch (this.tool) {
      case 'select': {
        const markEl = (event.target as Element).closest<HTMLElement | SVGElement>('[data-mark]');
        if ((event.target as Element).closest('.rp-field, .rp-handle')) return;
        if (!markEl) {
          if (this.chosen) this.choose('');
          this.closePop();
          return;
        }
        event.preventDefault?.();
        this.choose(markEl.dataset.mark!);
        this.drag(event as PointerEvent, at);
        return;
      }
      case 'note':
      case 'text':
        this.writeAt(this.tool, at.id, at.point, { x: event.clientX, y: event.clientY });
        return;
      case 'ink':
        this.drawInk(event as PointerEvent, at);
        return;
      case 'sign':
        this.placeSignature(at.id, at.point, at.geo);
        return;
      case 'redact':
        this.drawBox(event as PointerEvent, at);
        return;
      default:
    }
  }

  /** Draws a box with the pointer, to be blacked out. */
  private drawBox(event: PointerEvent, at: NonNullable<ReturnType<Editor['at']>>) {
    const box = this.doc.createElement('div');
    box.className = 'rp-boxing';
    at.el.append(box);
    let end = at.screen;
    const place = () => {
      Object.assign(box.style, {
        left: `${Math.min(at.screen.x, end.x)}px`,
        top: `${Math.min(at.screen.y, end.y)}px`,
        width: `${Math.abs(end.x - at.screen.x)}px`,
        height: `${Math.abs(end.y - at.screen.y)}px`,
      });
    };
    place();
    at.el.setPointerCapture(event.pointerId);
    const move = (e: PointerEvent) => {
      const r = at.el.getBoundingClientRect();
      end = { x: Math.max(0, Math.min(r.width, e.clientX - r.left)), y: Math.max(0, Math.min(r.height, e.clientY - r.top)) };
      place();
    };
    const up = () => {
      at.el.removeEventListener('pointermove', move);
      at.el.removeEventListener('pointerup', up);
      at.el.removeEventListener('pointercancel', up);
      box.remove();
      if (!this.current) return;
      const a = at.geo.toPage(at.screen);
      const b = at.geo.toPage(end);
      const rect = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) };
      if (rect.width < 3 || rect.height < 3) return;
      this.commit(addMark(this.current, { kind: 'redaction', page: at.id, rects: [rect], author: this.options.author }));
      this.say(this.t.redactInfo);
    };
    at.el.addEventListener('pointermove', move);
    at.el.addEventListener('pointerup', up);
    at.el.addEventListener('pointercancel', up);
  }

  /** Puts a note, a text or the signature in the middle of the page in view, for those who do not point. */
  private placeByKey() {
    const viewer = this.viewer;
    const view = viewer?.views.get(viewer.page);
    if (!viewer || !view) return;
    const page = view.el.getBoundingClientRect();
    const sight = viewer.scroll.getBoundingClientRect();
    const x = page.left + page.width * (this.tool === 'sign' ? 0.35 : 0.4);
    const y = Math.max(page.top + 24, Math.min(page.bottom - 80, sight.top + sight.height / 2));
    const event = { clientX: x, clientY: y, target: view.el };
    const at = this.at(event);
    if (at) this.useTool(event, at);
  }

  /** Moves the mark chosen with the pointer; a click without moving shows what can be done to it. */
  private drag(event: PointerEvent, at: NonNullable<ReturnType<Editor['at']>>) {
    const mark = this.current!.marks.find((m) => m.id === this.chosen);
    if (!mark) return;
    const start = at.point;
    const from = this.current!;
    let moved = false;
    const target = event.target as Element;
    target.setPointerCapture?.(event.pointerId);
    const move = (e: PointerEvent) => {
      const now = at.geo.toPage({ x: e.clientX - at.el.getBoundingClientRect().left, y: e.clientY - at.el.getBoundingClientRect().top });
      const d = { x: now.x - start.x, y: now.y - start.y };
      if (!moved && Math.hypot(e.clientX - event.clientX, e.clientY - event.clientY) < 4) return;
      if (mark.kind === 'highlight') return;
      moved = true;
      this.current = updateMark(from, mark.id, moveBy(mark, d));
      this.viewer?.setPdf(this.current);
      this.showChosen();
    };
    const up = () => {
      target.removeEventListener('pointermove', move as EventListener);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', up);
      if (moved) {
        const after = this.current!;
        this.current = from;
        this.commit(after, '', false);
      } else this.markMenu(mark.id, false);
    };
    target.addEventListener('pointermove', move as EventListener);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
  }

  /** Chooses a mark (or none), as what Delete, the arrows and its menu act on. */
  private choose(id: string) {
    this.chosen = id;
    this.showChosen();
    if (id) {
      const mark = this.current?.marks.find((m) => m.id === id);
      if (mark) this.say(fill(this.t.markSelected, { kind: this.kindName(mark) }));
    }
  }

  private kindName(mark: Mark) {
    return { highlight: this.t.highlight, note: this.t.note, ink: this.t.draw, text: this.t.text, signature: this.t.sign, redaction: this.t.redact }[mark.kind];
  }

  private showChosen() {
    const root = this.viewer?.root;
    if (!root) return;
    for (const el of root.querySelectorAll('.rp-chosen')) el.classList.remove('rp-chosen');
    for (const el of root.querySelectorAll('.rp-handle')) el.remove();
    if (!this.chosen) return;
    const els = root.querySelectorAll<HTMLElement>(`[data-mark="${CSS.escape(this.chosen)}"]`);
    for (const el of els) el.classList.add('rp-chosen');
    const mark = this.current?.marks.find((m) => m.id === this.chosen);
    const geo = mark && this.viewer?.geometry(mark.page);
    // A box can be made bigger or smaller by its corner, on a page that is not turned.
    if (!mark || !geo || geo.rotation || (mark.kind !== 'text' && mark.kind !== 'signature')) return;
    const rect = geo.toScreenRect(mark.rect);
    const handle = this.doc.createElement('div');
    handle.className = 'rp-handle';
    handle.style.left = `${rect.x + rect.width}px`;
    handle.style.top = `${rect.y + rect.height}px`;
    handle.addEventListener('pointerdown', (event) => this.resize(event, mark, geo));
    this.viewer!.views.get(mark.page)?.marks.after(handle);
  }

  private resize(event: PointerEvent, mark: Extract<Mark, { rect: Rect }>, geo: Geometry) {
    event.preventDefault();
    event.stopPropagation();
    const handle = event.currentTarget as HTMLElement;
    handle.setPointerCapture(event.pointerId);
    const pageEl = handle.closest<HTMLElement>('.rp-page')!;
    const from = this.current!;
    const top = mark.rect.y + mark.rect.height;
    const aspect = mark.rect.width / mark.rect.height;
    const move = (e: PointerEvent) => {
      const box = pageEl.getBoundingClientRect();
      const p = geo.toPage({ x: e.clientX - box.left, y: e.clientY - box.top });
      let width = Math.max(24, p.x - mark.rect.x);
      let height = Math.max(12, top - p.y);
      if (mark.kind === 'signature') height = width / aspect;
      else width = Math.max(width, mark.size);
      if (mark.kind === 'signature') width = height * aspect;
      this.current = updateMark(from, mark.id, { rect: { x: mark.rect.x, y: top - height, width, height } });
      this.viewer?.setPdf(this.current);
      this.showChosen();
    };
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      const after = this.current!;
      this.current = from;
      this.commit(after, '', false);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
  }

  /** Asks what a note or a text says, and puts it at the point. */
  private writeAt(kind: 'note' | 'text', page: string, point: Point, client: Point) {
    const t = this.t;
    const area = this.doc.createElement('textarea');
    area.className = 'rp-input';
    area.setAttribute('aria-label', kind === 'note' ? t.noteText : t.textContent);
    area.placeholder = kind === 'note' ? t.noteText : t.textContent;
    let size = 12;
    const sizes = this.doc.createElement('select');
    sizes.className = 'rp-input';
    for (const s of [8, 10, 12, 14, 18, 24, 32]) sizes.append(makeOption(this.doc, `${s} pt`, String(s), s === 12));
    sizes.addEventListener('change', () => {
      size = Number(sizes.value);
    });
    const add = this.doc.createElement('button');
    add.type = 'button';
    add.className = 'rp-button rp-primary';
    add.textContent = t.add;
    const cancel = this.doc.createElement('button');
    cancel.type = 'button';
    cancel.className = 'rp-button';
    cancel.textContent = t.cancel;
    const done = () => {
      const text = kind === 'note' ? area.value.trim() : area.value.replace(/\s+$/, '');
      this.closePop();
      if (!text || !this.current) return;
      const color = this.color();
      const mark: NewMark =
        kind === 'note'
          ? { kind: 'note', page, at: point, text, color, author: this.options.author }
          : { kind: 'text', page, rect: textRect(this.doc, text, size, point, this.current.pages.find((p) => p.id === page)!), text, size, color: this.colors.text === 'yellow' ? '#000000' : color };
      const next = addMark(this.current, mark);
      this.commit(next);
      this.tool = 'select';
      this.choose(next.marks.at(-1)!.id);
      this.refresh();
    };
    add.addEventListener('click', done);
    cancel.addEventListener('click', () => this.closePop());
    area.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        done();
      }
    });
    const row = this.row(kind === 'text' ? [this.labelled(t.size, sizes)] : [], [cancel, add]);
    this.openPop({ x: client.x, y: client.y, width: 0, height: 0 }, [area, row]);
    area.focus();
  }

  private labelled(text: string, control: HTMLElement) {
    const label = this.doc.createElement('label');
    label.append(text, control);
    return label;
  }

  private row(start: HTMLElement[], end: HTMLElement[]) {
    const row = this.doc.createElement('div');
    row.className = 'rp-pop-row';
    const a = this.doc.createElement('div');
    a.className = 'rp-group';
    a.append(...start);
    const b = this.doc.createElement('div');
    b.className = 'rp-group';
    b.append(...end);
    row.append(a, b);
    return row;
  }

  /** Draws a line with the pointer, and puts it on the page as ink: lines drawn one after another make one mark. */
  private drawInk(event: PointerEvent, at: NonNullable<ReturnType<Editor['at']>>) {
    const svg = this.doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'rp-drawing');
    svg.setAttribute('width', String(at.geo.width));
    svg.setAttribute('height', String(at.geo.height));
    const path = this.doc.createElementNS('http://www.w3.org/2000/svg', 'path');
    const color = this.color();
    const width = 2;
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', color);
    path.setAttribute('stroke-width', String(width * at.geo.scale));
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    svg.append(path);
    at.el.append(svg);
    const screen: Point[] = [at.screen];
    at.el.setPointerCapture(event.pointerId);
    const move = (e: PointerEvent) => {
      const box = at.el.getBoundingClientRect();
      for (const ev of e.getCoalescedEvents?.() ?? [e]) screen.push({ x: ev.clientX - box.left, y: ev.clientY - box.top });
      path.setAttribute('d', pathData(screen));
    };
    const up = () => {
      at.el.removeEventListener('pointermove', move);
      at.el.removeEventListener('pointerup', up);
      at.el.removeEventListener('pointercancel', up);
      svg.remove();
      if (!this.current) return;
      const points = thin(screen.map(at.geo.toPage), 0.6);
      const last = this.current.marks.at(-1);
      // Close after the last, on the same page in the same colour: one mark.
      if (last?.kind === 'ink' && last.page === at.id && last.color === color && this.group === `ink:${last.id}` && Date.now() - this.groupTime < 1500) {
        this.commit(updateMark(this.current, last.id, { paths: [...last.paths, points] }), `ink:${last.id}`);
      } else {
        const next = addMark(this.current, { kind: 'ink', page: at.id, paths: [points], color, width, author: this.options.author });
        this.commit(next, `ink:${next.marks.at(-1)!.id}`);
      }
    };
    at.el.addEventListener('pointermove', move);
    at.el.addEventListener('pointerup', up);
    at.el.addEventListener('pointercancel', up);
  }

  private placeSignature(page: string, point: Point, geo: Geometry) {
    const made = this.signature;
    if (!made || !this.current) return;
    let height = Math.min(64, 170 / made.aspect);
    let width = height * made.aspect;
    // Within the page.
    const box = this.current.pages.find((p) => p.id === page)!.box;
    width = Math.min(width, box.x + box.width - point.x);
    height = width / made.aspect;
    void geo;
    const next = addMark(this.current, {
      kind: 'signature',
      page,
      rect: { x: point.x, y: point.y - height, width, height },
      ...(made.image ? { image: made.image } : { paths: made.paths }),
      color: '#0b1f4d',
    });
    this.commit(next);
    this.tool = 'select';
    this.choose(next.marks.at(-1)!.id);
    this.refresh();
  }

  /** Highlights the text selected in the pages, a mark for each page it is on. */
  highlightSelection(kind: 'highlight' | 'redaction' = 'highlight'): void {
    const selection = this.doc.getSelection();
    if (!selection || selection.isCollapsed || !this.current || !this.viewer) return;
    const range = selection.getRangeAt(0);
    if (!this.viewer.pagesEl.contains(range.commonAncestorContainer)) return;
    const byPage = new Map<string, Rect[]>();
    for (const r of range.getClientRects()) {
      if (r.width < 1 || r.height < 1) continue;
      for (const [id, view] of this.viewer.views) {
        const box = view.el.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        if (cx < box.left || cx > box.right || cy < box.top || cy > box.bottom) continue;
        const a = view.geo.toPage({ x: r.left - box.left, y: r.top - box.top });
        const b = view.geo.toPage({ x: r.right - box.left, y: r.bottom - box.top });
        const rects = byPage.get(id) ?? [];
        rects.push({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) });
        byPage.set(id, rects);
      }
    }
    if (!byPage.size) return;
    const text = selection.toString().replace(/\s+/g, ' ').trim();
    const color = COLORS.find((c) => c.name === this.colors.highlight)!.light;
    let next = this.current;
    for (const [page, rects] of byPage)
      next = addMark(
        next,
        kind === 'redaction' ? { kind, page, rects: mergeLines(rects), text, author: this.options.author } : { kind, page, rects: mergeLines(rects), color, text, author: this.options.author },
      );
    selection.removeAllRanges();
    this.selbar!.hidden = true;
    this.commit(next);
  }

  private selectionChanged() {
    const bar = this.selbar;
    if (!bar || !this.viewer) return;
    const selection = this.doc.getSelection();
    if (this.tool !== 'select' || !selection || selection.isCollapsed || !this.viewer.pagesEl.contains(selection.anchorNode)) {
      bar.hidden = true;
      return;
    }
    const rects = selection.getRangeAt(0).getClientRects();
    const last = rects[rects.length - 1];
    if (!last) return;
    const root = this.viewer.root.getBoundingClientRect();
    bar.hidden = false;
    bar.style.left = `${Math.min(root.width - 60, Math.max(8, last.right - root.left - 20))}px`;
    bar.style.top = `${last.bottom - root.top + 8}px`;
  }

  /** What can be done to a mark: its colour, what it says, take it off. */
  private markMenu(id: string, focus: boolean) {
    const mark = this.current?.marks.find((m) => m.id === id);
    const view = mark && this.viewer?.views.get(mark.page);
    if (!mark || !view) return;
    const t = this.t;
    const items: HTMLElement[] = [];
    let area: HTMLTextAreaElement | undefined;
    if (mark.kind === 'note' || mark.kind === 'highlight' || mark.kind === 'text') {
      area = this.doc.createElement('textarea');
      area.className = 'rp-input';
      const label = mark.kind === 'note' ? t.noteText : mark.kind === 'highlight' ? t.comment : t.textContent;
      area.setAttribute('aria-label', label);
      area.placeholder = label;
      area.value = mark.kind === 'highlight' ? (mark.comment ?? '') : mark.text;
      area.addEventListener('input', () => {
        if (!this.current) return;
        const value = area!.value;
        if (mark.kind === 'text' && !value.trim()) return;
        const patch =
          mark.kind === 'highlight'
            ? { comment: value }
            : mark.kind === 'text'
              ? { text: value, rect: { ...mark.rect, height: textRect(this.doc, value, mark.size, { x: mark.rect.x, y: mark.rect.y + mark.rect.height }, view.page, mark.rect.width).height } }
              : { text: value };
        const at = mark.kind === 'text' ? { ...patch, rect: { ...patch.rect!, y: mark.rect.y + mark.rect.height - patch.rect!.height } } : patch;
        this.commit(updateMark(this.current, mark.id, at as never), `text:${mark.id}`);
      });
      items.push(area);
    }
    const swatches = this.doc.createElement('div');
    swatches.className = 'rp-swatches';
    swatches.setAttribute('role', 'group');
    swatches.setAttribute('aria-label', t.color);
    if (mark.kind !== 'signature' && mark.kind !== 'redaction') {
      for (const c of COLORS) {
        const value = mark.kind === 'highlight' ? c.light : c.ink;
        const b = this.doc.createElement('button');
        b.type = 'button';
        b.className = 'rp-button';
        b.setAttribute('aria-label', t.colors[c.name]);
        b.title = t.colors[c.name];
        b.setAttribute('aria-pressed', String(mark.color === value));
        const dot = this.doc.createElement('span');
        dot.className = 'rp-swatch';
        dot.style.background = value;
        b.append(dot);
        b.addEventListener('click', () => {
          if (!this.current) return;
          this.commit(updateMark(this.current, mark.id, { color: value }));
          for (const other of swatches.children) other.setAttribute('aria-pressed', String(other === b));
        });
        swatches.append(b);
      }
    }
    const remove = this.doc.createElement('button');
    remove.type = 'button';
    remove.className = 'rp-button';
    remove.append(icon(this.doc, 'trash', 16), t.remove);
    remove.addEventListener('click', () => this.removeChosen());
    const actions: HTMLElement[] = [];
    if (mark.kind !== 'highlight' && mark.kind !== 'redaction') {
      const twin = this.doc.createElement('button');
      twin.type = 'button';
      twin.className = 'rp-button';
      twin.append(icon(this.doc, 'copy', 16), t.duplicate);
      twin.addEventListener('click', () => this.duplicate());
      actions.push(twin);
    }
    if ((mark.kind === 'signature' || mark.kind === 'text') && (this.current?.pages.length ?? 0) > 1) {
      const every = this.doc.createElement('button');
      every.type = 'button';
      every.className = 'rp-button';
      every.append(icon(this.doc, 'layers', 16), t.everyPage);
      every.addEventListener('click', () => this.onEveryPage());
      actions.push(every);
    }
    if (actions.length) items.push(this.row([], actions));
    if (mark.kind === 'redaction') {
      const info = this.doc.createElement('p');
      info.className = 'rp-pop-info';
      info.textContent = mark.text ? `${t.redactInfo} «${mark.text}»` : t.redactInfo;
      items.unshift(info);
    }
    items.push(this.row(mark.kind === 'signature' || mark.kind === 'redaction' ? [] : [swatches], [remove]));
    const el = view.el.querySelector(`[data-mark="${CSS.escape(id)}"]`);
    const anchor = el?.getBoundingClientRect() ?? view.el.getBoundingClientRect();
    this.openPop(anchor, items, () => el);
    if (focus) area?.focus();
  }

  /** Puts a copy of a mark on the page in view: a little down and right of it when that is its page, where it was on another. */
  private paste(mark: Mark, page = this.viewer?.page ?? mark.page) {
    if (!this.current?.pages.some((p) => p.id === page)) return;
    const where = JSON.stringify(markBounds(mark));
    const shift = page === mark.page && this.current.marks.some((m) => m.page === page && JSON.stringify(markBounds(m)) === where) ? 12 : 0;
    const { id: _, ...rest } = { ...mark, ...moveBy(mark, { x: shift, y: -shift }), page } as Mark;
    const next = addMark(this.current, rest as NewMark);
    this.commit(next);
    this.choose(next.marks.at(-1)!.id);
    this.clipboard = next.marks.at(-1);
  }

  private duplicate() {
    const mark = this.current?.marks.find((m) => m.id === this.chosen);
    if (!mark || mark.kind === 'highlight') return;
    this.closePop();
    this.paste(mark, mark.page);
  }

  /** The text or signature chosen, on every other page at the same place: initials, a page number, a stamp. */
  private onEveryPage() {
    const mark = this.current?.marks.find((m) => m.id === this.chosen);
    if (!mark || !this.current) return;
    let next = this.current;
    for (const page of this.current.pages) {
      if (page.id === mark.page) continue;
      const { id: _, ...rest } = { ...mark, page: page.id } as Mark;
      next = addMark(next, rest as NewMark);
    }
    this.closePop();
    this.commit(next);
    this.toast(fill(this.t.onPages, { n: this.current.pages.length }));
  }

  private removeChosen() {
    if (!this.chosen || !this.current) return;
    const id = this.chosen;
    this.closePop();
    this.choose('');
    this.commit(removeMark(this.current, id));
  }

  /** Opens a popover by a box of the screen (or the element it follows), with these in it. */
  private openPop(anchor: DOMRect | Rect, children: HTMLElement[], follow?: () => Element | null | undefined) {
    this.closePop();
    const root = this.viewer!.root;
    const pop = this.doc.createElement('div');
    pop.className = 'rp-pop';
    pop.setAttribute('role', 'dialog');
    pop.append(...children);
    root.append(pop);
    this.pop = pop;
    const box = 'left' in anchor ? { x: anchor.left, y: anchor.top, width: anchor.width, height: anchor.height } : anchor;
    let at = box;
    const place = () => {
      const now = follow?.()?.getBoundingClientRect();
      if (now) at = { x: now.left, y: now.top, width: now.width, height: now.height };
      const r = root.getBoundingClientRect();
      const width = pop.offsetWidth;
      const height = pop.offsetHeight;
      let top = at.y + at.height + 8 - r.top;
      if (top + height > r.height - 8) top = Math.max(8, at.y - height - 8 - r.top);
      pop.style.left = `${Math.max(8, Math.min(r.width - width - 8, at.x - r.left))}px`;
      pop.style.top = `${top}px`;
    };
    place();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        this.closePop();
        this.viewer?.scroll.focus({ preventScroll: true });
      }
    };
    pop.addEventListener('keydown', key);
    const outside = (event: PointerEvent) => {
      if (!pop.contains(event.target as Node) && !(event.target as Element).closest?.('[data-mark], [aria-haspopup]')) this.closePop();
    };
    setTimeout(() => this.doc.addEventListener('pointerdown', outside, true), 0);
    this.popClose = () => {
      this.doc.removeEventListener('pointerdown', outside, true);
      pop.remove();
    };
    this.placeCurrent = place;
  }

  private placeCurrent?: () => void;

  private placePop() {
    if (this.pop) this.placeCurrent?.();
  }

  private closePop() {
    // The focus that was in it goes back to the pages, not out of the editor.
    if (this.pop?.contains(this.doc.activeElement)) this.viewer?.scroll.focus({ preventScroll: true });
    this.popClose?.();
    this.popClose = undefined;
    this.pop = undefined;
    this.placeCurrent = undefined;
  }

  private colorMenu(anchor: HTMLElement) {
    const t = this.t;
    const wrap = this.doc.createElement('div');
    wrap.className = 'rp-swatches';
    wrap.setAttribute('role', 'group');
    wrap.setAttribute('aria-label', t.color);
    for (const c of COLORS) {
      const b = this.doc.createElement('button');
      b.type = 'button';
      b.className = 'rp-button';
      b.title = t.colors[c.name];
      b.setAttribute('aria-label', t.colors[c.name]);
      b.setAttribute('aria-pressed', String(this.colors[this.tool] === c.name));
      const dot = this.doc.createElement('span');
      dot.className = 'rp-swatch';
      dot.style.background = this.tool === 'highlight' ? c.light : c.ink;
      b.append(dot);
      b.addEventListener('click', () => {
        this.colors[this.tool] = c.name;
        this.closePop();
        this.refresh();
        anchor.focus();
      });
      wrap.append(b);
    }
    this.openPop(anchor.getBoundingClientRect(), [wrap]);
    (wrap.querySelector('[aria-pressed="true"]') as HTMLElement | null)?.focus();
  }

  private moreMenu(anchor: HTMLElement) {
    const t = this.t;
    const item = (name: IconName, text: string, hint: string, run: () => void) => {
      const b = this.doc.createElement('button');
      b.type = 'button';
      b.className = 'rp-button';
      b.setAttribute('role', 'menuitem');
      const words = this.doc.createElement('span');
      words.textContent = text;
      if (hint) {
        const small = this.doc.createElement('small');
        small.textContent = hint;
        words.append(small);
      }
      b.append(icon(this.doc, name, 16), words);
      b.addEventListener('click', () => {
        this.closePop();
        run();
      });
      return b;
    };
    const items = [
      ...(this.options.files !== false ? [item('open', t.open, '', () => void this.pick(false)), item('filePlus', t.insert, '', () => void this.pick(true))] : []),
      item('print', t.print, '', () => void this.viewer?.print()),
      item('download', t.download, '', () => void this.saveOrDownload()),
      item('flatten', t.downloadFlat, t.downloadFlatHint, () => void this.downloadFlat()),
    ];
    this.openPop(anchor.getBoundingClientRect(), items);
    this.pop?.classList.add('rp-menu');
    this.pop?.setAttribute('role', 'menu');
    items[0]?.focus();
    this.pop?.addEventListener('keydown', (event) => {
      const at = items.indexOf(this.doc.activeElement as HTMLButtonElement);
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        items[(at + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
      }
    });
  }

  private async downloadFlat() {
    await this.saveOrDownload(true);
  }

  private give(bytes: Uint8Array, name: string) {
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
    const a = this.doc.createElement('a');
    a.href = url;
    a.download = name.endsWith('.pdf') ? name : `${name}.pdf`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }

  /** The bytes of the PDF as it is now. */
  async save(options?: SaveOptions): Promise<Uint8Array> {
    if (!this.current) throw new PdfError('empty', 'There is no PDF.');
    return savePdf(this.current, { font: this.options.font, ...options });
  }

  /** Saves (with onSave) or downloads the PDF, and says what saving it did: to its signature, to what was blacked out. */
  private async saveOrDownload(flatten = false) {
    const pdf = this.current;
    if (!pdf) return;
    const incremental = savesIncrementally(pdf);
    const bytes = await savePdf(pdf, { font: this.options.font, flatten });
    if (this.options.onSave && !flatten) await this.options.onSave(bytes, pdf);
    else this.give(bytes, pdf.name);
    const t = this.t;
    const blacked = pdf.marks.filter((m) => m.kind === 'redaction').length;
    const signed = pdf.signatures?.length;
    const why = whyNotIncremental(pdf);
    let notice = this.options.onSave && !flatten ? t.saved : '';
    if (signed) notice = incremental ? t.signatureHolds : fill(t.signatureBroken, { why: why?.includes('blacked') ? t.becauseBlacked : t.becausePages });
    if (blacked) {
      // What is shown is what was saved: what was under the boxes is gone from it, as from the file.
      const saved = await openPdf(bytes, { name: pdf.name });
      this.setPdf(saved);
      notice = `${fill(t.redactedSaved, { n: blacked })}${signed ? ` ${notice}` : ''}`;
    }
    if (notice) this.toast(notice);
  }

  /** The pages the thumbnails act on: those chosen, or the page in view. */
  private targetPages(): string[] {
    const chosen = this.current?.pages.filter((p) => this.chosenPages.has(p.id)).map((p) => p.id) ?? [];
    return chosen.length ? chosen : this.viewer?.page ? [this.viewer.page] : [];
  }

  private turnPages(by: number) {
    const ids = this.targetPages();
    if (ids.length && this.current) this.commit(rotatePages(this.current, ids, by));
  }

  private deletePages() {
    const ids = this.targetPages();
    if (!ids.length || !this.current) return;
    try {
      this.commit(removePages(this.current, ids));
      this.chosenPages.clear();
      this.refresh();
      this.toast(fill(this.t.deleted, { n: ids.length }));
    } catch {
      this.toast(this.t.cantDeleteAll);
    }
  }

  /** A blank page after the page in view, as big as it. */
  private async blankPage() {
    if (!this.current) return;
    const at = this.viewer?.page ? pageNumber(this.current, this.viewer.page) : this.current.pages.length;
    const next = await insertBlankPage(this.current, at);
    this.commit(next);
    this.viewer?.goTo(next.pages[at].id);
  }

  private async extract() {
    const ids = this.targetPages();
    if (!ids.length || !this.current) return;
    const part = extractPages(this.current, ids);
    this.give(await savePdf(part, { font: this.options.font }), part.name);
  }

  /** Makes a thumbnail one that is chosen by a click (with Shift or ⌘ for more), moved by dragging or by Alt and the arrows. */
  private decorateThumb(li: HTMLLIElement, page: Page) {
    const n = this.current ? pageNumber(this.current, page.id) : 0;
    li.setAttribute('aria-label', fill(this.t.movePage, { n }));
    li.setAttribute('aria-selected', String(this.chosenPages.has(page.id)));
    if (li.dataset.decorated) return;
    li.dataset.decorated = '';
    li.tabIndex = 0;
    li.draggable = true;
    li.addEventListener('click', (event) => {
      const id = li.dataset.page!;
      const pages = this.current?.pages.map((p) => p.id) ?? [];
      if (event.shiftKey && this.lastPage) {
        const [a, b] = [pages.indexOf(this.lastPage), pages.indexOf(id)].sort((x, y) => x - y);
        for (const p of pages.slice(a, b + 1)) this.chosenPages.add(p);
      } else if (event.metaKey || event.ctrlKey) {
        if (this.chosenPages.has(id)) this.chosenPages.delete(id);
        else this.chosenPages.add(id);
      } else {
        this.chosenPages.clear();
        this.chosenPages.add(id);
      }
      this.lastPage = id;
      this.refresh();
    });
    li.addEventListener('keydown', (event) => {
      const id = li.dataset.page!;
      if (!this.current) return;
      const pages = this.current.pages;
      const at = pages.findIndex((p) => p.id === id);
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        li.click();
      } else if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && event.altKey) {
        event.preventDefault();
        const to = event.key === 'ArrowDown' ? at + 2 : at - 1;
        if (to < 0 || to > pages.length) return;
        this.commit(movePages(this.current, [id], pages[to]?.id ?? null));
        this.say(fill(this.t.movedPage, { n: pageNumber(this.current, id) }));
        this.viewer?.thumbFor(id)?.focus();
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const next = pages[at + (event.key === 'ArrowDown' ? 1 : -1)];
        if (next) this.viewer?.thumbFor(next.id)?.focus();
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        if (!this.chosenPages.size) this.chosenPages.add(id);
        this.deletePages();
      }
    });
    li.addEventListener('dragstart', (event) => {
      const id = li.dataset.page!;
      if (!this.chosenPages.has(id)) {
        this.chosenPages.clear();
        this.chosenPages.add(id);
        this.refresh();
      }
      event.dataTransfer?.setData('application/x-rebopdf-pages', [...this.chosenPages].join(','));
      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
      li.classList.add('rp-dragging');
    });
    li.addEventListener('dragend', () => {
      li.classList.remove('rp-dragging');
      for (const el of li.parentElement?.querySelectorAll('.rp-drop-before, .rp-drop-after') ?? []) el.classList.remove('rp-drop-before', 'rp-drop-after');
    });
    li.addEventListener('dragover', (event) => {
      if (!event.dataTransfer?.types.includes('application/x-rebopdf-pages')) return;
      event.preventDefault();
      const box = li.getBoundingClientRect();
      const after = event.clientY > box.top + box.height / 2;
      li.classList.toggle('rp-drop-after', after);
      li.classList.toggle('rp-drop-before', !after);
    });
    li.addEventListener('dragleave', () => li.classList.remove('rp-drop-before', 'rp-drop-after'));
    li.addEventListener('drop', (event) => {
      const ids = event.dataTransfer?.getData('application/x-rebopdf-pages');
      if (!ids || !this.current) return;
      event.preventDefault();
      event.stopPropagation();
      const after = li.classList.contains('rp-drop-after');
      li.classList.remove('rp-drop-before', 'rp-drop-after');
      const pages = this.current.pages;
      const at = pages.findIndex((p) => p.id === li.dataset.page);
      const before = after ? (pages[at + 1]?.id ?? null) : li.dataset.page!;
      const moving = ids.split(',');
      if (before && moving.includes(before)) return;
      this.commit(movePages(this.current, moving, before));
    });
  }

  /** Files dropped on the editor: their pages are added after the page in view. */
  private dropping(root: HTMLElement, zone: HTMLElement) {
    let depth = 0;
    const files = (event: DragEvent) => !!event.dataTransfer?.types.includes('Files');
    this.listen(root, 'dragenter', (event) => {
      if (!files(event as DragEvent)) return;
      depth++;
      zone.hidden = false;
    });
    this.listen(root, 'dragleave', (event) => {
      if (!files(event as DragEvent)) return;
      if (--depth <= 0) zone.hidden = true;
    });
    this.listen(root, 'dragover', (event) => files(event as DragEvent) && event.preventDefault());
    this.listen(root, 'drop', (event) => {
      if (!files(event as DragEvent)) return;
      event.preventDefault();
      depth = 0;
      zone.hidden = true;
      void this.add([...((event as DragEvent).dataTransfer?.files ?? [])]);
    });
  }

  /** Opens a PDF of a file, asking for its password if it has one; says so if it cannot. */
  private async read(file: File): Promise<Pdf | undefined> {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let password: string | undefined;
    for (;;) {
      try {
        return await openPdf(bytes, { name: file.name, password });
      } catch (error) {
        if (error instanceof PdfError && error.code === 'encrypted') {
          const asked = this.doc.defaultView?.prompt(fill(this.t.passwordAsk, { name: file.name }));
          if (asked) {
            password = asked;
            continue;
          }
          this.toast(fill(this.t.password, { name: file.name }));
        } else this.toast(fill(this.t.notPdf, { name: file.name }));
        return undefined;
      }
    }
  }

  /** Adds the pages of these files after the page in view; the first is opened when there is no PDF. */
  private async add(files: File[]) {
    for (const file of files) {
      const pdf = await this.read(file);
      if (!pdf) continue;
      if (!this.current) {
        this.setPdf(pdf);
        continue;
      }
      const at = this.viewer?.page ? pageNumber(this.current, this.viewer.page) : this.current.pages.length;
      this.commit(insertPdf(this.current, pdf, at));
      this.toast(fill(this.t.added, { n: pdf.pages.length, name: file.name }));
    }
  }

  private pick(insert: boolean): Promise<void> {
    return new Promise((resolve) => {
      const input = this.doc.createElement('input');
      input.type = 'file';
      input.accept = 'application/pdf,.pdf';
      input.multiple = insert;
      input.addEventListener('change', async () => {
        const files = [...(input.files ?? [])];
        if (!insert && files[0]) {
          const pdf = await this.read(files[0]);
          if (pdf) this.setPdf(pdf);
        } else await this.add(files);
        resolve();
      });
      input.click();
    });
  }

  private showEmpty() {
    const t = this.t;
    const root = this.doc.createElement('div');
    root.className = 'rp-root';
    if (this.options.theme) root.dataset.theme = this.options.theme;
    const empty = this.doc.createElement('div');
    empty.className = 'rp-empty';
    const inner = this.doc.createElement('div');
    const title = this.doc.createElement('h2');
    title.textContent = t.emptyTitle;
    const text = this.doc.createElement('p');
    text.textContent = t.emptyText;
    const pick = this.doc.createElement('button');
    pick.type = 'button';
    pick.className = 'rp-button rp-primary';
    pick.append(icon(this.doc, 'open', 16), t.pick);
    pick.addEventListener('click', () => void this.pick(false));
    inner.append(icon(this.doc, 'filePlus', 40), title, text, pick);
    empty.append(inner);
    root.append(empty);
    root.addEventListener('dragover', (event) => event.preventDefault());
    root.addEventListener('drop', (event) => {
      event.preventDefault();
      void this.add([...(event.dataTransfer?.files ?? [])]);
    });
    this.host.append(root);
    // The viewer takes its place.
    const start = this.start.bind(this);
    this.start = (pdf: Pdf) => {
      root.remove();
      this.start = start;
      start(pdf);
    };
    this.empty = root;
  }

  private key(event: KeyboardEvent) {
    const target = event.target as HTMLElement;
    const typing = target.closest('input, textarea, select, [contenteditable="true"]');
    const mod = event.metaKey || event.ctrlKey;
    if (mod && event.key.toLowerCase() === 'z' && !typing) {
      event.preventDefault();
      if (event.shiftKey) this.redo();
      else this.undo();
      return;
    }
    if (mod && event.key.toLowerCase() === 'y' && !typing) {
      event.preventDefault();
      this.redo();
      return;
    }
    // A mark chosen is copied, pasted and duplicated; text selected is copied as text is.
    const selected = !this.doc.getSelection()?.isCollapsed;
    if (mod && !typing && !event.shiftKey && !event.altKey) {
      const key = event.key.toLowerCase();
      if (key === 'c' && this.chosen && !selected) {
        const mark = this.current?.marks.find((m) => m.id === this.chosen);
        if (mark && mark.kind !== 'highlight') {
          event.preventDefault();
          this.clipboard = mark;
          this.say(this.t.copied);
        }
        return;
      }
      if (key === 'v' && this.clipboard) {
        event.preventDefault();
        this.paste(this.clipboard);
        return;
      }
      if (key === 'd' && this.chosen) {
        event.preventDefault();
        this.duplicate();
        return;
      }
    }
    if (typing || mod || event.altKey || target.closest('.rp-thumb')) return;
    if (event.key === 'Escape') {
      if (this.chosen) this.choose('');
      else if (this.tool !== 'select') void this.setTool('select');
      return;
    }
    if (event.key === 'Enter' && (this.tool === 'note' || this.tool === 'text' || this.tool === 'sign') && !target.closest('button')) {
      event.preventDefault();
      this.placeByKey();
      return;
    }
    if ((event.key === 'Delete' || event.key === 'Backspace') && this.chosen) {
      event.preventDefault();
      this.removeChosen();
      return;
    }
    const arrows: Record<string, Point> = { ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 }, ArrowUp: { x: 0, y: 1 }, ArrowDown: { x: 0, y: -1 } };
    const mark = this.current?.marks.find((m) => m.id === this.chosen);
    if (arrows[event.key] && mark && mark.kind !== 'highlight') {
      event.preventDefault();
      const step = event.shiftKey ? 10 : 1;
      this.commit(updateMark(this.current!, mark.id, moveBy(mark, { x: arrows[event.key].x * step, y: arrows[event.key].y * step })), `move:${mark.id}`);
      return;
    }
    const tool = TOOLS.find((entry) => entry.key === event.key.toLowerCase());
    if (tool) {
      event.preventDefault();
      void this.setTool(tool.tool);
    }
  }

  private toast(text: string) {
    if (!this.toastEl) return;
    this.toastEl.textContent = text;
    this.toastEl.hidden = false;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      if (this.toastEl) this.toastEl.hidden = true;
    }, 3200);
  }

  /** Says something to a screen reader. */
  private say(text: string) {
    if (this.live) this.live.textContent = text;
  }

  destroy(): void {
    this.closePop();
    clearTimeout(this.toastTimer);
    for (const run of this.cleanup) run();
    this.viewer?.destroy();
    this.empty?.remove();
  }
}

/** A mark moved by so many points. */
function moveBy(mark: Mark, d: Point): MarkPatch {
  switch (mark.kind) {
    case 'note':
      return { at: { x: mark.at.x + d.x, y: mark.at.y + d.y } };
    case 'ink':
      return { paths: mark.paths.map((points) => points.map((p) => ({ x: p.x + d.x, y: p.y + d.y }))) };
    case 'text':
    case 'signature':
      return { rect: { ...mark.rect, x: mark.rect.x + d.x, y: mark.rect.y + d.y } };
    default:
      return {};
  }
}

/** Points closer than `min` to the one before are left out. */
function thin(points: Point[], min: number): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const last = out.at(-1);
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) >= min) out.push({ x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 });
  }
  const end = points.at(-1);
  if (end && out.at(-1) !== end && out.length > 1) out.push(end);
  return out;
}

/** The boxes of the lines of a selection, those on one line put together. */
export function mergeLines(rects: Rect[]): Rect[] {
  const sorted = [...rects].sort((a, b) => b.y - a.y || a.x - b.x);
  const out: Rect[] = [];
  for (const r of sorted) {
    const last = out.at(-1);
    if (last && Math.abs(last.y - r.y) < Math.min(last.height, r.height) / 2 && r.x <= last.x + last.width + 2) {
      const right = Math.max(last.x + last.width, r.x + r.width);
      const top = Math.max(last.y + last.height, r.y + r.height);
      last.x = Math.min(last.x, r.x);
      last.y = Math.min(last.y, r.y);
      last.width = right - last.x;
      last.height = top - last.y;
    } else out.push({ ...r });
  }
  return out;
}

/** The box text takes from a point down, in Helvetica as the PDF writes it: as wide as its longest line, within the page. */
function textRect(doc: Document, text: string, size: number, from: Point, page: Page, width?: number): Rect {
  const ctx = doc.createElement('canvas').getContext('2d');
  const room = page.box.x + page.box.width - from.x - 8;
  let wide = width ?? 0;
  if (!width && ctx) {
    ctx.font = `${size}px Helvetica, Arial, sans-serif`;
    wide = Math.max(...text.split('\n').map((line) => ctx.measureText(line).width)) + 4;
  }
  wide = Math.max(size * 2, Math.min(wide || size * 12, room));
  const lines = text.split('\n').reduce((n, line) => {
    if (!ctx) return n + 1;
    ctx.font = `${size}px Helvetica, Arial, sans-serif`;
    return n + Math.max(1, Math.ceil(ctx.measureText(line).width / wide));
  }, 0);
  const height = lines * size * 1.25 + size * 0.35;
  return { x: from.x, y: from.y - height, width: wide, height };
}

/** Works on a PDF in the element. */
export function mountEditor(element: HTMLElement, options: EditorOptions = {}): Editor {
  return new Editor(element, options);
}
