// The viewer: a bar (the pages, the page in view, the zoom, search,
// download), the thumbnails of the pages at the side, and the pages one
// under another, each drawn by PDF.js when it comes near the view, with its
// text over it to select, and the fields and marks of the engine over that.
// It is given a Pdf, and given it again as it changes: the pages already
// drawn stay as they are.

import {
  type Field,
  linksOf,
  type Match,
  marksOn,
  type OutlineItem,
  outlineOf,
  type Page,
  type PageLink,
  type Pdf,
  type Place,
  pageNumber,
  pageSize,
  pdfjs,
  readerOf,
  savePdf,
  searchPdf,
  setField,
} from '@rebopdf/core';
import { fill, type Strings, stringsFor } from './i18n';
import { type IconName, icon } from './icons';
import { type Geometry, geometryOf, makeOption, renderFields, renderMarks } from './layers';
import { injectViewerStyles } from './styles';

/** How big the pages are: 1 is as big as they are printed; or as wide as the view, as all the page, or as wide as the view up to 125%. */
export type Zoom = number | 'fit-width' | 'fit-page' | 'auto';

export interface ViewerOptions {
  pdf: Pdf;
  /** "en" or "es"; English when left out. */
  locale?: string;
  /** Light or dark; as the system when left out. */
  theme?: 'light' | 'dark';
  /** The bar over the pages. Shown unless false. */
  toolbar?: boolean;
  /** The thumbnails at the side, open at first. Open when there is room, when left out. */
  thumbnails?: boolean;
  zoom?: Zoom;
  /** The page shown first, by its id. */
  page?: string;
  /** The button to download the PDF. Shown unless false. */
  download?: boolean;
  /** The button to print the PDF. Shown unless false. */
  print?: boolean;
  /** A TrueType or OpenType font to write text marks in, when the PDF is saved: see `SaveOptions` of the core. */
  font?: Uint8Array;
  /** Whether the fields of a form can be filled. They can unless false. */
  fill?: boolean;
  /** Told the Pdf after a field is filled. */
  onChange?: (pdf: Pdf) => void;
  /** Told the page in view, as it changes. */
  onPage?: (id: string) => void;
  /** @internal What the editor adds to the thumbnail of each page. */
  decorateThumb?: (item: HTMLLIElement, page: Page) => void;
}

/** @internal What is kept of each page on the screen. */
export interface PageView {
  page: Page;
  el: HTMLElement;
  canvas: HTMLCanvasElement;
  text: HTMLElement;
  hits: HTMLElement;
  marks: HTMLElement;
  fields: HTMLElement;
  links: HTMLElement;
  /** The links of the page, once read, and of which page of which file they were read. */
  linkData?: PageLink[];
  linksOf?: string;
  geo: Geometry;
  /** What it was drawn as: its file, its place, how it is turned and how big. */
  drawn?: string;
  drawing?: { cancel(): void };
}

const POINT = 96 / 72;
const ZOOMS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];
const MAX_PIXELS = 16_000_000;

export class Viewer {
  readonly root: HTMLElement;
  readonly t: Strings;
  /** @internal Where the editor puts its tools: in the bar after the title, in its middle and at its end, and over the thumbnails. */
  readonly slots: { start: HTMLElement; tools: HTMLElement; end: HTMLElement; side: HTMLElement };
  /** @internal */
  readonly scroll: HTMLElement;
  /** @internal */
  readonly pagesEl: HTMLElement;
  /** @internal */
  readonly views = new Map<string, PageView>();
  pdf: Pdf;
  private options: ViewerOptions;
  private doc: Document;
  private side: HTMLElement;
  private thumbs: HTMLOListElement;
  private heading: HTMLElement;
  private tabs: HTMLElement;
  private outlineEl: HTMLElement;
  /** The files the outline was read from, in their order. */
  private outlineSources = '';
  private sideButton?: HTMLButtonElement;
  private titleEl: HTMLElement;
  private pageInput: HTMLInputElement;
  private pageCount: HTMLElement;
  private zoomSelect: HTMLSelectElement;
  private find: HTMLElement;
  private findInput: HTMLInputElement;
  private findCount: HTMLElement;
  private zoom: Zoom;
  private scale = 1;
  private current = '';
  private near = new Set<string>();
  private queue: string[] = [];
  private busy = false;
  private observer: IntersectionObserver;
  private thumbObserver: IntersectionObserver;
  private thumbDrawn = new Map<string, string>();
  private resize: ResizeObserver;
  private matches: Match[] = [];
  private match = -1;
  private searching = 0;
  private cleanup: (() => void)[] = [];
  private destroyed = false;

  constructor(host: HTMLElement, options: ViewerOptions) {
    this.doc = host.ownerDocument;
    injectViewerStyles(this.doc);
    this.options = options;
    this.pdf = options.pdf;
    this.t = stringsFor(options.locale);
    this.zoom = options.zoom ?? 'auto';
    const t = this.t;
    const make = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '') => {
      const el = this.doc.createElement(tag);
      if (className) el.className = className;
      return el;
    };

    this.root = make('div', 'rp-root');
    this.root.setAttribute('role', 'region');
    this.root.setAttribute('aria-label', t.viewer);
    if (options.theme) this.root.dataset.theme = options.theme;

    // The bar.
    const bar = make('div', 'rp-bar');
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', t.viewer);
    this.slots = { start: make('div', 'rp-group'), tools: make('div', 'rp-group rp-tools'), end: make('div', 'rp-group'), side: make('div', 'rp-group') };
    this.sideButton = this.button('sidebar', t.showPages, () => this.toggleThumbnails());
    this.sideButton.setAttribute('aria-expanded', 'false');
    this.titleEl = make('div', 'rp-title');
    const pagebox = make('div', 'rp-pagebox rp-group');
    this.pageInput = make('input', 'rp-input');
    this.pageInput.inputMode = 'numeric';
    this.pageInput.setAttribute('aria-label', t.pageNumber);
    this.pageInput.addEventListener('change', () => {
      const page = this.pdf.pages[Number.parseInt(this.pageInput.value, 10) - 1];
      if (page) this.goTo(page.id);
      else this.pageInput.value = String(pageNumber(this.pdf, this.current) || 1);
    });
    this.pageCount = make('span');
    pagebox.append(this.pageInput, this.pageCount);
    this.zoomSelect = make('select', 'rp-input rp-zoom rp-hide-narrow');
    this.zoomSelect.setAttribute('aria-label', t.zoom);
    for (const [value, label] of [['auto', t.automatic], ['fit-width', t.fitWidth], ['fit-page', t.fitPage], ...ZOOMS.map((z) => [String(z), `${Math.round(z * 100)}%`])]) {
      this.zoomSelect.append(makeOption(this.doc, label, value));
    }
    this.zoomSelect.addEventListener('change', () => {
      const value = this.zoomSelect.value;
      this.setZoom(Number.isNaN(Number(value)) ? (value as Zoom) : Number(value));
    });
    const zoomGroup = make('div', 'rp-group rp-hide-narrow');
    zoomGroup.append(
      this.button('minus', t.zoomOut, () => this.step(-1)),
      this.zoomSelect,
      this.button('plus', t.zoomIn, () => this.step(1)),
    );
    const searchButton = this.button('search', t.search, () => this.openSearch());
    const right = make('div', 'rp-group');
    right.append(searchButton);
    if (options.print !== false) {
      const print = this.button('print', t.print, () => void this.print());
      print.classList.add('rp-hide-narrow');
      right.append(print);
    }
    if (options.download !== false) right.append(this.button('download', t.download, () => void this.download()));
    const start = make('div', 'rp-group');
    start.append(this.sideButton, this.titleEl);
    bar.append(
      start,
      this.slots.start,
      make('div', 'rp-spacer'),
      this.slots.tools,
      make('div', 'rp-spacer'),
      pagebox,
      make('div', 'rp-sep rp-hide-narrow'),
      zoomGroup,
      make('div', 'rp-sep rp-hide-narrow'),
      right,
      this.slots.end,
    );
    if (options.toolbar === false) bar.hidden = true;

    // The thumbnails.
    const body = make('div', 'rp-body');
    this.side = make('nav', 'rp-side');
    this.side.setAttribute('aria-label', t.pages);
    const head = make('div', 'rp-side-head');
    this.heading = make('span');
    this.heading.textContent = t.pages;
    // Pages and contents, when the PDF has a table of contents.
    this.tabs = make('div', 'rp-side-tabs');
    this.tabs.setAttribute('role', 'tablist');
    this.tabs.hidden = true;
    const tab = (label: string, panel: 'pages' | 'contents') => {
      const b = make('button', 'rp-side-tab');
      b.type = 'button';
      b.textContent = label;
      b.setAttribute('role', 'tab');
      b.dataset.panel = panel;
      b.addEventListener('click', () => this.showPanel(panel));
      b.addEventListener('keydown', (event) => {
        if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
        event.preventDefault();
        const other = panel === 'pages' ? 'contents' : 'pages';
        this.showPanel(other);
        this.tabs.querySelector<HTMLElement>(`[data-panel="${other}"]`)?.focus();
      });
      return b;
    };
    this.tabs.append(tab(t.pages, 'pages'), tab(t.contents, 'contents'));
    head.append(this.heading, this.tabs, this.slots.side);
    this.outlineEl = make('div', 'rp-outline');
    this.outlineEl.setAttribute('role', 'tabpanel');
    this.outlineEl.hidden = true;
    this.thumbs = make('ol', 'rp-thumbs');
    this.thumbs.setAttribute('role', 'listbox');
    this.thumbs.setAttribute('aria-label', t.pages);
    if (options.decorateThumb) this.thumbs.setAttribute('aria-multiselectable', 'true');
    this.side.append(head, this.thumbs, this.outlineEl);
    this.side.hidden = true;

    // The pages.
    this.scroll = make('div', 'rp-scroll');
    this.scroll.tabIndex = 0;
    this.scroll.setAttribute('aria-label', t.pages);
    this.pagesEl = make('div', 'rp-pages');
    this.scroll.append(this.pagesEl);

    // Search.
    this.find = make('div', 'rp-find');
    this.find.setAttribute('role', 'search');
    this.find.hidden = true;
    this.findInput = make('input', 'rp-input');
    this.findInput.type = 'search';
    this.findInput.placeholder = t.searchPlaceholder;
    this.findInput.setAttribute('aria-label', t.search);
    this.findCount = make('span', 'rp-find-count');
    this.findCount.setAttribute('aria-live', 'polite');
    let timer: ReturnType<typeof setTimeout> | undefined;
    this.findInput.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => void this.search(this.findInput.value), 220);
    });
    this.findInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        this.nextMatch(event.shiftKey ? -1 : 1);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        this.closeSearch();
      }
    });
    this.find.append(
      this.findInput,
      this.findCount,
      this.button('chevronUp', t.previous, () => this.nextMatch(-1)),
      this.button('chevronDown', t.next, () => this.nextMatch(1)),
      this.button('close', t.close, () => this.closeSearch()),
    );

    body.append(this.side, this.scroll, this.find);
    this.root.append(bar, body);
    host.append(this.root);

    this.observer = new IntersectionObserver((entries) => this.seen(entries), { root: this.scroll, rootMargin: '900px 0px' });
    this.thumbObserver = new IntersectionObserver((entries) => this.thumbsSeen(entries), { root: this.thumbs, rootMargin: '300px 0px' });
    let width = 0;
    this.resize = new ResizeObserver(() => {
      const now = this.scroll.clientWidth;
      if (now === width) return;
      width = now;
      if (typeof this.zoom === 'string') this.layout(true);
    });
    this.resize.observe(this.scroll);
    const onScroll = () => this.track();
    this.scroll.addEventListener('scroll', onScroll, { passive: true });
    const onKey = (event: KeyboardEvent) => this.key(event);
    this.root.addEventListener('keydown', onKey);
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      this.setZoom(Math.max(0.1, Math.min(6, this.scale * Math.exp(-event.deltaY / 300))));
    };
    this.scroll.addEventListener('wheel', onWheel, { passive: false });
    this.pinching();
    this.cleanup.push(
      () => this.scroll.removeEventListener('scroll', onScroll),
      () => this.root.removeEventListener('keydown', onKey),
    );

    const room = host.clientWidth || this.doc.defaultView?.innerWidth || 1024;
    this.build();
    if (options.thumbnails ?? room >= 900) this.toggleThumbnails(true);
    this.layout(false);
    if (options.page) this.goTo(options.page);
    this.track();
  }

  /** Two fingers apart or together on the pages zoom them, as on a phone everything is zoomed. */
  private pinching() {
    let start = 0;
    let from = 1;
    let frame = 0;
    const apart = (touches: TouchList) => Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
    this.scroll.addEventListener('touchstart', (event) => {
      if (event.touches.length !== 2) return;
      start = apart(event.touches);
      from = this.zoomLevel;
    });
    this.scroll.addEventListener(
      'touchmove',
      (event) => {
        if (event.touches.length !== 2 || !start) return;
        event.preventDefault();
        const ratio = apart(event.touches) / start;
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => this.setZoom(Math.max(0.25, Math.min(4, from * ratio))));
      },
      { passive: false },
    );
    this.scroll.addEventListener('touchend', (event) => {
      if (event.touches.length < 2) start = 0;
    });
  }

  private button(name: IconName, label: string, run: () => void): HTMLButtonElement {
    const el = this.doc.createElement('button');
    el.type = 'button';
    el.className = 'rp-button';
    el.title = label;
    el.setAttribute('aria-label', label);
    el.append(icon(this.doc, name));
    el.addEventListener('click', run);
    return el;
  }

  /** Shows another Pdf, or the same as it is now: the pages already drawn as they were stay drawn. */
  setPdf(pdf: Pdf): void {
    const before = this.pdf;
    this.pdf = pdf;
    if (before.pages !== pdf.pages) {
      this.build();
      this.layout(true);
    } else this.overlays();
    if (before !== pdf && this.matches.length && before.pages !== pdf.pages) void this.search(this.findInput.value);
  }

  /** @internal The geometry of a page as it is shown now. */
  geometry(id: string): Geometry | undefined {
    return this.views.get(id)?.geo;
  }

  /** The id of the page in view. */
  get page(): string {
    return this.current;
  }

  /** How big the pages are shown: 1 as they are printed. */
  get zoomLevel(): number {
    return this.scale / POINT;
  }

  /** Brings a page into view. */
  goTo(id: string, at?: { y: number }): void {
    const view = this.views.get(id);
    if (!view) return;
    this.scroll.scrollTop = view.el.offsetTop - 16 + (at?.y ?? 0);
    this.setCurrent(id);
  }

  setZoom(zoom: Zoom): void {
    this.zoom = zoom;
    this.layout(true);
  }

  private step(by: number) {
    const now = this.zoomLevel;
    const next = by > 0 ? (ZOOMS.find((z) => z > now + 0.01) ?? ZOOMS.at(-1)!) : ([...ZOOMS].reverse().find((z) => z < now - 0.01) ?? ZOOMS[0]);
    this.setZoom(next);
  }

  setTheme(theme: 'light' | 'dark' | 'system'): void {
    if (theme === 'system') delete this.root.dataset.theme;
    else this.root.dataset.theme = theme;
  }

  toggleThumbnails(open = this.side.hidden): void {
    this.side.hidden = !open;
    this.sideButton?.setAttribute('aria-expanded', String(open));
    const label = open ? this.t.hidePages : this.t.showPages;
    this.sideButton?.setAttribute('aria-label', label);
    if (this.sideButton) this.sideButton.title = label;
    if (open) this.doc.defaultView?.requestAnimationFrame(() => this.thumbFor(this.current)?.scrollIntoView({ block: 'nearest' }));
  }

  /** @internal The item of a page among the thumbnails. */
  thumbFor(id: string): HTMLLIElement | undefined {
    return this.thumbs.querySelector<HTMLLIElement>(`[data-page="${CSS.escape(id)}"]`) ?? undefined;
  }

  /** Makes the elements of the pages that are new, puts all in their order, and takes out those gone. */
  private build() {
    const ids = new Set(this.pdf.pages.map((page) => page.id));
    for (const [id, view] of this.views) {
      if (ids.has(id)) continue;
      view.drawing?.cancel();
      this.observer.unobserve(view.el);
      view.el.remove();
      this.views.delete(id);
    }
    for (const page of this.pdf.pages) {
      const view = this.views.get(page.id);
      if (view) {
        view.page = page;
        continue;
      }
      const el = this.doc.createElement('div');
      el.className = 'rp-page';
      el.dataset.page = page.id;
      el.setAttribute('role', 'group');
      const canvas = this.doc.createElement('canvas');
      canvas.className = 'rp-canvas';
      canvas.setAttribute('aria-hidden', 'true');
      const layer = (className: string) => {
        const div = this.doc.createElement('div');
        div.className = `rp-layer ${className}`;
        return div;
      };
      const text = layer('textLayer');
      const hits = layer('rp-hits');
      const marks = layer('rp-marks');
      const links = layer('rp-links');
      const fields = layer('rp-fields');
      el.append(canvas, text, hits, links, marks, fields);
      this.views.set(page.id, { page, el, canvas, text, hits, marks, fields, links, geo: geometryOf(page, this.scale) });
      this.observer.observe(el);
    }
    this.pagesEl.replaceChildren(...this.pdf.pages.map((page) => this.views.get(page.id)!.el));
    this.pdf.pages.forEach((page, i) => this.views.get(page.id)!.el.setAttribute('aria-label', fill(this.t.pageLabel, { n: i + 1 })));
    this.pageCount.textContent = fill(this.t.pageOf, { n: this.pdf.pages.length });
    this.titleEl.textContent = this.pdf.name.replace(/\.pdf$/i, '');
    this.titleEl.title = this.pdf.name;
    this.buildThumbs();
    const sources = [...new Set(this.pdf.pages.map((p) => p.source))].join(',');
    if (sources !== this.outlineSources) {
      this.outlineSources = sources;
      void this.buildOutline();
    } else if (this.outlineEl.childElementCount) void this.buildOutline();
    if (!this.views.has(this.current)) this.current = '';
  }

  private buildThumbs() {
    const before = new Map([...this.thumbs.children].map((li) => [(li as HTMLElement).dataset.page!, li as HTMLLIElement]));
    const items = this.pdf.pages.map((page, i) => {
      let li = before.get(page.id);
      if (!li) {
        li = this.doc.createElement('li');
        li.className = 'rp-thumb';
        li.dataset.page = page.id;
        li.setAttribute('role', 'option');
        li.setAttribute('aria-selected', 'false');
        li.tabIndex = -1;
        const sheet = this.doc.createElement('div');
        sheet.className = 'rp-thumb-sheet';
        const number = this.doc.createElement('span');
        number.className = 'rp-thumb-number';
        li.append(sheet, number);
        li.addEventListener('click', (event) => {
          if ((event.target as Element).closest('button') || event.shiftKey || event.metaKey || event.ctrlKey) return;
          this.goTo(li!.dataset.page!);
          // On a phone the thumbnails lie over the pages: they go once one is chosen.
          if (this.doc.defaultView?.matchMedia('(max-width: 640px)').matches) this.toggleThumbnails(false);
        });
        this.thumbObserver.observe(li);
      }
      const { width, height } = pageSize(page);
      const sheet = li.querySelector<HTMLElement>('.rp-thumb-sheet')!;
      const across = 132;
      sheet.style.width = `${width >= height ? across : (across * width) / height}px`;
      sheet.style.height = `${width >= height ? (across * height) / width : across}px`;
      li.querySelector('.rp-thumb-number')!.textContent = String(i + 1);
      li.setAttribute('aria-label', fill(this.t.pageLabel, { n: i + 1 }));
      this.options.decorateThumb?.(li, page);
      if (this.thumbDrawn.has(page.id) && this.thumbDrawn.get(page.id) !== `${page.source}:${page.index}:${page.rotation}`) this.thumbObserver.unobserve(li), this.thumbObserver.observe(li);
      return li;
    });
    for (const [id, li] of before) if (!this.pdf.pages.some((p) => p.id === id)) this.thumbObserver.unobserve(li), this.thumbDrawn.delete(id);
    this.thumbs.replaceChildren(...items);
  }

  private thumbsSeen(entries: IntersectionObserverEntry[]) {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const li = entry.target as HTMLLIElement;
      const page = this.pdf.pages.find((p) => p.id === li.dataset.page);
      if (!page) continue;
      const key = `${page.source}:${page.index}:${page.rotation}`;
      if (this.thumbDrawn.get(page.id) === key) continue;
      this.thumbDrawn.set(page.id, key);
      void this.drawThumb(li, page);
    }
  }

  private async drawThumb(li: HTMLLIElement, page: Page) {
    try {
      const proxy = await (await readerOf(this.pdf.sources[page.source])).getPage(page.index + 1);
      const sheet = li.querySelector<HTMLElement>('.rp-thumb-sheet')!;
      const ratio = Math.min(2, this.doc.defaultView?.devicePixelRatio ?? 1);
      const width = Number.parseFloat(sheet.style.width);
      const viewport = proxy.getViewport({ scale: (width / pageSize(page).width) * ratio, rotation: page.rotation });
      const canvas = this.doc.createElement('canvas');
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.setAttribute('aria-hidden', 'true');
      await proxy.render({ canvas, viewport }).promise;
      sheet.replaceChildren(canvas);
    } catch {
      this.thumbDrawn.delete(page.id);
    }
  }

  /** How big a point is now, for the zoom asked for. */
  private scaleFor(zoom: Zoom): number {
    if (typeof zoom === 'number') return zoom * POINT;
    const sizes = this.pdf.pages.map(pageSize);
    const widest = Math.max(...sizes.map((s) => s.width));
    const tallest = Math.max(...sizes.map((s) => s.height));
    const narrow = this.scroll.clientWidth < 640;
    const room = Math.max(120, this.scroll.clientWidth - (narrow ? 16 : 32) - 2);
    const width = room / widest;
    if (zoom === 'fit-width') return width;
    if (zoom === 'fit-page') return Math.min(width, Math.max(120, this.scroll.clientHeight - 48) / tallest);
    return Math.min(width, 1.25 * POINT);
  }

  /** Sizes the pages for the zoom, keeping in view the place of the page that was. */
  private layout(keep: boolean) {
    const anchor = keep ? this.anchor() : undefined;
    this.scale = this.scaleFor(this.zoom);
    for (const view of this.views.values()) {
      view.geo = geometryOf(view.page, this.scale);
      view.el.style.width = `${view.geo.width}px`;
      view.el.style.height = `${view.geo.height}px`;
      view.el.style.setProperty('--total-scale-factor', String(this.scale));
    }
    const value = typeof this.zoom === 'number' ? String(this.zoom) : this.zoom;
    if (![...this.zoomSelect.options].some((o) => o.value === value)) {
      this.zoomSelect.querySelector('[data-custom]')?.remove();
      const custom = makeOption(this.doc, `${Math.round(this.zoomLevel * 100)}%`, value);
      custom.dataset.custom = '';
      this.zoomSelect.append(custom);
    }
    this.zoomSelect.value = value;
    this.overlays();
    if (anchor) this.goTo(anchor.id, { y: anchor.fraction * (this.views.get(anchor.id)?.geo.height ?? 0) });
    this.queue = this.pdf.pages.map((p) => p.id).filter((id) => this.near.has(id));
    this.next();
  }

  private anchor() {
    const view = this.views.get(this.current);
    if (!view) return undefined;
    const fraction = (this.scroll.scrollTop + 16 - view.el.offsetTop) / Math.max(1, view.el.offsetHeight);
    return { id: this.current, fraction: Math.max(0, Math.min(1, fraction)) };
  }

  /** Lays the marks, the fields and what was found over every page. */
  private overlays() {
    for (const view of this.views.values()) this.overlay(view);
  }

  /** @internal */
  overlay(view: PageView) {
    this.drawLinks(view);
    renderMarks(view.marks, marksOn(this.pdf, view.page.id), view.geo, this.t);
    renderFields(view.fields, this.pdf.fields, view.page.id, view.geo, {
      editable: this.options.fill !== false,
      onChange: (field, value) => this.fillField(field, value),
    });
    this.drawHits(view);
  }

  private fillField(field: Field, value: Field['value']) {
    try {
      this.setPdf(setField(this.pdf, field.id, value));
      this.options.onChange?.(this.pdf);
    } catch {
      // A value the field cannot hold is not kept.
    }
  }

  private seen(entries: IntersectionObserverEntry[]) {
    for (const entry of entries) {
      const id = (entry.target as HTMLElement).dataset.page!;
      if (entry.isIntersecting) this.near.add(id);
      else this.near.delete(id);
    }
    this.queue = this.pdf.pages.map((p) => p.id).filter((id) => this.near.has(id));
    this.next();
  }

  /** Draws the pages near the view, one at a time, those in view first. */
  private next() {
    if (this.busy || this.destroyed) return;
    const top = this.scroll.scrollTop;
    const bottom = top + this.scroll.clientHeight;
    const order = this.queue
      .map((id) => this.views.get(id))
      .filter((view): view is PageView => !!view && view.drawn !== this.keyOf(view))
      .sort((a, b) => distance(a.el, top, bottom) - distance(b.el, top, bottom));
    const view = order[0];
    if (!view) return;
    this.busy = true;
    void this.draw(view).finally(() => {
      this.busy = false;
      this.next();
    });
  }

  private keyOf(view: PageView) {
    return `${view.page.source}:${view.page.index}:${view.page.rotation}:${this.scale.toFixed(4)}`;
  }

  private async draw(view: PageView) {
    const key = this.keyOf(view);
    const { page } = view;
    try {
      const reader = await readerOf(this.pdf.sources[page.source]);
      const proxy = await reader.getPage(page.index + 1);
      if (this.keyOf(view) !== key || this.destroyed) return;
      const viewport = proxy.getViewport({ scale: this.scale, rotation: page.rotation });
      const ratio = Math.min(this.doc.defaultView?.devicePixelRatio ?? 1, Math.sqrt(MAX_PIXELS / (viewport.width * viewport.height)));
      const canvas = this.doc.createElement('canvas');
      canvas.className = 'rp-canvas';
      canvas.setAttribute('aria-hidden', 'true');
      canvas.width = Math.floor(viewport.width * ratio);
      canvas.height = Math.floor(viewport.height * ratio);
      const lib = await pdfjs();
      // The fields are drawn by the viewer: PDF.js leaves them out, and the looks of checkboxes (checked and not) go to canvases of their own, not over the page.
      const task = proxy.render({
        canvas,
        viewport,
        transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
        annotationMode: lib.AnnotationMode.ENABLE_FORMS,
        annotationCanvasMap: new Map(),
      });
      view.drawing = task;
      await task.promise;
      if (this.keyOf(view) !== key) return;
      view.canvas.replaceWith(canvas);
      view.canvas = canvas;
      view.el.querySelector('.rp-page-state')?.remove();
      // The text, laid over the page to be selected.
      const text = this.doc.createElement('div');
      text.className = 'rp-layer textLayer';
      const layer = new lib.TextLayer({ textContentSource: proxy.streamTextContent(), container: text, viewport });
      await layer.render();
      if (this.keyOf(view) !== key) return;
      view.text.replaceWith(text);
      view.text = text;
      view.drawn = key;
      // Its links, read once for each page of each file.
      const of = `${page.source}:${page.index}`;
      if (view.linksOf !== of) {
        view.linkData = await linksOf(this.pdf, page.id).catch(() => []);
        view.linksOf = of;
        this.drawLinks(view);
      }
    } catch (error) {
      if ((error as Error)?.name === 'RenderingCancelledException') return;
      if (!view.el.querySelector('.rp-page-state')) {
        const state = this.doc.createElement('div');
        state.className = 'rp-page-state';
        state.textContent = this.t.failed;
        view.el.append(state);
      }
      view.drawn = key;
    } finally {
      view.drawing = undefined;
    }
  }

  /** Lays the links of a page over it: an address of the web opens apart, a place of the PDF is gone to. */
  private drawLinks(view: PageView) {
    view.links.replaceChildren(
      ...(view.linkData ?? []).map((link) => {
        const a = this.doc.createElement('a');
        a.className = 'rp-link';
        const s = view.geo.toScreenRect(link.rect);
        Object.assign(a.style, { left: `${s.x}px`, top: `${s.y}px`, width: `${s.width}px`, height: `${s.height}px` });
        if (link.url) {
          a.href = link.url;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          a.setAttribute('aria-label', link.url);
          a.title = link.url;
        } else if (link.to) {
          const to = link.to;
          a.href = '#';
          const n = pageNumber(this.pdf, to.page);
          a.setAttribute('aria-label', fill(this.t.goToPage, { n }));
          a.title = fill(this.t.goToPage, { n });
          a.addEventListener('click', (event) => {
            event.preventDefault();
            this.goToPlace(to);
          });
        }
        return a;
      }),
    );
  }

  /** Brings a place of the PDF into view: its page, at its height when the PDF says it. */
  goToPlace(place: Place): void {
    const view = this.views.get(place.page);
    if (!view) return;
    const y = place.top === undefined ? 0 : Math.max(0, view.geo.toScreen({ x: view.page.box.x, y: place.top }).y - 8);
    this.goTo(place.page, { y });
  }

  private showPanel(panel: 'pages' | 'contents') {
    const contents = panel === 'contents';
    this.thumbs.hidden = contents;
    this.outlineEl.hidden = !contents;
    this.slots.side.hidden = contents;
    for (const b of this.tabs.querySelectorAll<HTMLElement>('[role="tab"]')) {
      const on = b.dataset.panel === panel;
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
    }
  }

  /** The table of contents, a tab beside the pages when the PDF has one. */
  private async buildOutline() {
    const items = await outlineOf(this.pdf).catch(() => [] as OutlineItem[]);
    const has = items.length > 0;
    this.tabs.hidden = !has;
    this.heading.hidden = has;
    if (!has) {
      this.outlineEl.replaceChildren();
      this.showPanel('pages');
      return;
    }
    const list = (entries: OutlineItem[], depth: number): HTMLUListElement => {
      const ul = this.doc.createElement('ul');
      for (const item of entries) {
        const li = this.doc.createElement('li');
        const row = this.doc.createElement('div');
        row.className = 'rp-outline-row';
        row.style.setProperty('--depth', String(depth));
        const go = this.doc.createElement('button');
        go.type = 'button';
        go.className = 'rp-outline-item';
        go.textContent = item.title;
        go.disabled = !item.to;
        go.addEventListener('click', () => {
          if (!item.to) return;
          this.goToPlace(item.to);
          if (this.doc.defaultView?.matchMedia('(max-width: 640px)').matches) this.toggleThumbnails(false);
        });
        if (item.items.length) {
          const inner = list(item.items, depth + 1);
          inner.hidden = depth > 0;
          const toggle = this.doc.createElement('button');
          toggle.type = 'button';
          toggle.className = 'rp-outline-toggle';
          toggle.setAttribute('aria-expanded', String(!inner.hidden));
          toggle.setAttribute('aria-label', fill(this.t.sectionsOf, { title: item.title }));
          toggle.append(icon(this.doc, 'chevronRight', 14));
          toggle.addEventListener('click', () => {
            inner.hidden = !inner.hidden;
            toggle.setAttribute('aria-expanded', String(!inner.hidden));
          });
          row.append(toggle, go);
          li.append(row, inner);
        } else {
          row.append(go);
          li.append(row);
        }
        ul.append(li);
      }
      return ul;
    };
    this.outlineEl.replaceChildren(list(items, 0));
    if (!this.outlineEl.hidden || this.thumbs.hidden) this.showPanel('contents');
    else this.showPanel('pages');
  }

  /** Follows the page in view as the pages scroll. */
  private track() {
    const middle = this.scroll.scrollTop + this.scroll.clientHeight / 3;
    let found = this.pdf.pages[0]?.id ?? '';
    for (const page of this.pdf.pages) {
      const el = this.views.get(page.id)?.el;
      if (!el) continue;
      if (el.offsetTop <= middle) found = page.id;
      else break;
    }
    this.setCurrent(found);
  }

  private setCurrent(id: string) {
    if (!id || id === this.current) {
      if (id) this.pageInput.value = String(pageNumber(this.pdf, id));
      return;
    }
    const was = this.thumbFor(this.current);
    was?.removeAttribute('aria-current');
    this.current = id;
    const thumb = this.thumbFor(id);
    thumb?.setAttribute('aria-current', 'page');
    // Without the editor, the page chosen among the thumbnails is the one in view.
    if (!this.options.decorateThumb) {
      was?.setAttribute('aria-selected', 'false');
      thumb?.setAttribute('aria-selected', 'true');
    }
    if (thumb && !this.side.hidden) {
      const list = this.thumbs.getBoundingClientRect();
      const box = thumb.getBoundingClientRect();
      if (box.top < list.top || box.bottom > list.bottom) thumb.scrollIntoView({ block: 'nearest' });
    }
    this.pageInput.value = String(pageNumber(this.pdf, id));
    this.options.onPage?.(id);
  }

  private key(event: KeyboardEvent) {
    const mod = event.ctrlKey || event.metaKey;
    if (mod && event.key.toLowerCase() === 'f') {
      event.preventDefault();
      this.openSearch();
    } else if (mod && (event.key === '+' || event.key === '=')) {
      event.preventDefault();
      this.step(1);
    } else if (mod && event.key === '-') {
      event.preventDefault();
      this.step(-1);
    } else if (mod && event.key === '0') {
      event.preventDefault();
      this.setZoom('auto');
    }
  }

  openSearch(): void {
    this.find.hidden = false;
    this.findInput.focus();
    this.findInput.select();
  }

  closeSearch(): void {
    this.find.hidden = true;
    this.findInput.value = '';
    this.matches = [];
    this.match = -1;
    this.findCount.textContent = '';
    for (const view of this.views.values()) this.drawHits(view);
    this.scroll.focus({ preventScroll: true });
  }

  /** Finds the text, shows every place it is, and brings the first into view. */
  async search(query: string): Promise<Match[]> {
    const run = ++this.searching;
    const matches = query.trim() ? await searchPdf(this.pdf, query) : [];
    if (run !== this.searching) return matches;
    this.matches = matches;
    this.match = -1;
    for (const view of this.views.values()) this.drawHits(view);
    if (matches.length) {
      // The first after the page in view.
      const from = pageNumber(this.pdf, this.current);
      const index = matches.findIndex((m) => pageNumber(this.pdf, m.page) >= from);
      this.show(index < 0 ? 0 : index);
    } else this.findCount.textContent = query.trim() ? this.t.noResults : '';
    return matches;
  }

  private nextMatch(by: number) {
    if (!this.matches.length) return;
    this.show((this.match + by + this.matches.length) % this.matches.length);
  }

  private show(index: number) {
    const previous = this.matches[this.match];
    this.match = index;
    const match = this.matches[index];
    this.findCount.textContent = fill(this.t.results, { i: index + 1, n: this.matches.length });
    if (previous) this.drawHits(this.views.get(previous.page)!);
    const view = this.views.get(match.page);
    if (!view) return;
    this.drawHits(view);
    const rect = view.geo.toScreenRect(match.rects[0]);
    const top = view.el.offsetTop + rect.y;
    if (top < this.scroll.scrollTop + 40 || top > this.scroll.scrollTop + this.scroll.clientHeight - 80) this.scroll.scrollTop = top - this.scroll.clientHeight / 3;
    const left = view.el.offsetLeft + rect.x;
    if (left < this.scroll.scrollLeft || left > this.scroll.scrollLeft + this.scroll.clientWidth - 40) this.scroll.scrollLeft = left - 40;
  }

  private drawHits(view: PageView) {
    const current = this.matches[this.match];
    view.hits.replaceChildren(
      ...this.matches
        .filter((m) => m.page === view.page.id)
        .flatMap((m) =>
          m.rects.map((r) => {
            const el = this.doc.createElement('div');
            el.className = m === current ? 'rp-hit rp-hit-current' : 'rp-hit';
            const s = view.geo.toScreenRect(r);
            Object.assign(el.style, { left: `${s.x}px`, top: `${s.y}px`, width: `${s.width}px`, height: `${s.height}px` });
            return el;
          }),
        ),
    );
  }

  /** Saves the PDF as it is now and gives it to the person as a file. */
  async download(): Promise<void> {
    const bytes = await savePdf(this.pdf, { font: this.options.font });
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
    const a = this.doc.createElement('a');
    a.href = url;
    a.download = this.pdf.name.endsWith('.pdf') ? this.pdf.name : `${this.pdf.name}.pdf`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }

  /** Prints the PDF as it is now, as the browser prints a PDF. */
  async print(): Promise<void> {
    const bytes = await savePdf(this.pdf, { font: this.options.font });
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
    const frame = this.doc.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.tabIndex = -1;
    Object.assign(frame.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
    frame.addEventListener('load', () => {
      try {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
      } catch {
        // A browser that does not print a PDF in a frame opens it to be printed from there.
        this.doc.defaultView?.open(url, '_blank');
      }
      setTimeout(() => {
        frame.remove();
        URL.revokeObjectURL(url);
      }, 60_000);
    });
    frame.src = url;
    this.doc.body.append(frame);
  }

  destroy(): void {
    this.destroyed = true;
    for (const view of this.views.values()) view.drawing?.cancel();
    this.observer.disconnect();
    this.thumbObserver.disconnect();
    this.resize.disconnect();
    for (const run of this.cleanup) run();
    this.root.remove();
  }
}

/** How far an element is from the part of the scroll in view. */
const distance = (el: HTMLElement, top: number, bottom: number) => {
  const a = el.offsetTop;
  const b = a + el.offsetHeight;
  return b < top ? top - b : a > bottom ? a - bottom : 0;
};

/** Shows a PDF in the element. */
export function mountViewer(element: HTMLElement, options: ViewerOptions): Viewer {
  return new Viewer(element, options);
}
