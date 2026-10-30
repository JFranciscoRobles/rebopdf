// The editor: the viewer, with tools in its bar to highlight text, put notes,
// draw, write and sign on the pages, the fields of a form to fill, the
// thumbnails to turn, delete, move and take pages out by, PDFs opened and
// joined by dropping them, every change undone and done again, and the PDF
// saved or downloaded. Every change is a new Pdf of the engine.

import {
  addField,
  addMark,
  detectFields,
  type Field,
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
  removeField,
  removeMark,
  removePages,
  rotatePages,
  type SaveOptions,
  savePdf,
  type SignatureCheck,
  signPdf,
  attachFile,
  detachFile,
  outlineOf,
  type OutlineItem,
  setOutline,
  addValidationData,
  authorityAt,
  checkSignatures,
  savesIncrementally,
  whyNotIncremental,
  updateField,
  updateMark,
  pageText,
  type TextMark,
} from '@rebopdf/core';
import { fill, type Geometry, type IconName, icon, makeOption, type MenuEntry, type MenuSection, mountComparison, mountViewer, type PageView, pathData, type Viewer, type Zoom } from '@rebopdf/viewer';
import { type EditorStrings, editorStringsFor } from './i18n';
import { askCertificate } from './certificate';
import { askProtection } from './protect';
import { askSignature, type Signature } from './signature';
import { injectEditorStyles } from './styles';

export type Tool = 'select' | 'highlight' | 'note' | 'ink' | 'text' | 'edit' | 'sign' | 'redact' | 'field';

/** The kinds of fields made with the tool of fields. */
export type FieldTool = 'text' | 'checkbox' | 'choice' | 'signature';

export interface EditorOptions {
  /** The PDF to work on; without one, the editor asks for a file. */
  pdf?: Pdf;
  /** "en" or "es"; English when left out. */
  locale?: string;
  /** Whether the menu offers English and Spanish, to change to at once. It does unless false. */
  languages?: boolean;
  /** Told the language chosen in the menu, once the editor speaks it. */
  onLocale?: (locale: 'en' | 'es') => void;
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
  /**
   * Reads the text of pictures of pages: `recognizeText` of @rebopdf/ocr, to
   * offer Recognize text in the menu. Without it, the menu has it not.
   */
  recognize?: (pdf: Pdf, options: { onProgress?: (done: number, total: number) => void; languages?: string[] }) => Promise<Pdf>;
  /**
   * Signing digitally: the time-stamping authority the dialog offers, and what
   * asks it and the authorities of certificates (a fetch through a server of
   * the application's, as most do not answer pages of other sites).
   */
  signing?: { timestamp?: string; fetch?: typeof fetch };
  /** Items of the application's own in the menu of the editor, after its own. */
  menu?: { icon: IconName; label: string; hint?: string; run: () => void }[];
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
  { tool: 'edit', icon: 'editText', key: 'e' },
  { tool: 'sign', icon: 'signature', key: 's' },
  { tool: 'redact', icon: 'redact', key: 'r' },
  { tool: 'field', icon: 'form', key: 'f' },
];

const HISTORY = 100;

/** The languages offered to recognize text in, as Tesseract names them, each by its own name. */
const OCR_LANGUAGES: [string, string][] = [
  ['eng', 'English'],
  ['spa', 'Español'],
  ['fra', 'Français'],
  ['deu', 'Deutsch'],
  ['por', 'Português'],
  ['ita', 'Italiano'],
  ['nld', 'Nederlands'],
  ['pol', 'Polski'],
  ['tur', 'Türkçe'],
  ['rus', 'Русский'],
  ['ukr', 'Українська'],
  ['ell', 'Ελληνικά'],
  ['jpn', '日本語'],
  ['chi_sim', '简体中文'],
  ['kor', '한국어'],
];

export class Editor {
  t: EditorStrings;
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
  private colors: Record<Tool, ColorName> = { select: 'yellow', highlight: 'yellow', note: 'yellow', ink: 'blue', text: 'black', edit: 'black', sign: 'black', redact: 'black', field: 'black' };
  /** The kind of field the tool of fields makes, and the field chosen. */
  private fieldKind: FieldTool = 'text';
  private chosenField = '';
  private kindButton?: HTMLButtonElement;
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

  private start(pdf: Pdf, again = false, at?: { page: string; theme?: string; side: boolean }) {
    this.empty?.remove();
    this.empty = undefined;
    this.current = pdf;
    const t = this.t;
    const viewer = mountViewer(this.host, {
      pdf,
      locale: this.options.locale,
      theme: (at?.theme as 'light' | 'dark' | undefined) ?? (at ? undefined : this.options.theme),
      thumbnails: at ? at.side : this.options.thumbnails,
      ...(at?.page ? { page: at.page } : {}),
      zoom: this.options.zoom,
      download: false,
      fill: true,
      font: this.options.font,
      onChange: (next) => this.commit(next, 'fields', false),
      decorateThumb: (li, page) => this.decorateThumb(li, page),
      decoratePage: (view) => this.design(view),
      onPage: (id) => {
        for (const listener of this.pageListeners) listener(id);
      },
      onSign: (field, rect) => void this.signField(field, rect),
      menuSections: () => this.menuSections(),
      ...(this.options.languages !== false ? { setLocale: (locale: 'en' | 'es') => this.setLocale(locale) } : {}),
      panels: true,
      decorateOutline: (row, path, item) => this.decorateBookmark(row, path, item),
      decorateFile: (row, file) => {
        row.append(this.button('trash', fill(t.detachFile, { name: file.name }), () => this.commit(detachFile(this.current!, file.name)), 16));
      },
    });
    this.viewer = viewer;
    viewer.slots.outline.append(this.textButton('plus', t.addBookmark, () => void this.addBookmarkHere()));
    viewer.slots.files.append(this.textButton('filePlus', t.attachFile, () => this.attachFiles()));
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
      const label = { select: t.select, highlight: t.highlight, note: t.note, ink: t.draw, text: t.text, edit: t.editText, sign: t.sign, redact: t.redact, field: t.fields }[tool];
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
    const kind = this.doc.createElement('button');
    kind.type = 'button';
    kind.className = 'rp-button';
    kind.setAttribute('aria-haspopup', 'true');
    kind.addEventListener('click', () => this.kindMenu(kind));
    this.kindButton = kind;
    tools.append(color, kind);

    const save = this.doc.createElement('button');
    save.type = 'button';
    save.className = 'rp-button rp-primary';
    const saveLabel = this.doc.createElement('span');
    saveLabel.className = 'rp-hide-narrow';
    saveLabel.textContent = this.options.onSave ? t.save : t.download;
    save.setAttribute('aria-label', saveLabel.textContent);
    save.append(icon(this.doc, this.options.onSave ? 'check' : 'download', 16), saveLabel);
    save.addEventListener('click', () => void this.saveOrDownload());
    const end = this.doc.createElement('div');
    end.className = 'rp-sep';
    viewer.slots.end.append(end, save);

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
    if (!again) this.tellSigned(pdf);
  }

  /**
   * Speaks another language, at once: the editor is made again in it, with
   * the PDF, its history, the page in view and its look as they were.
   */
  setLocale(locale: 'en' | 'es'): void {
    this.options = { ...this.options, locale };
    this.t = editorStringsFor(locale);
    const viewer = this.viewer;
    if (viewer && this.current) {
      const at = { page: viewer.page, theme: viewer.root.dataset.theme, side: !!viewer.root.querySelector('.rp-side:not([hidden])') };
      this.closePop();
      clearTimeout(this.toastTimer);
      for (const run of this.cleanup) run();
      this.cleanup = [];
      viewer.destroy();
      this.viewer = undefined;
      this.peersEl = undefined;
      this.buttons = {};
      this.start(this.current, true, at);
      if (this.role !== 'edit') this.setRole(this.role);
      if (this.pagesLocked) this.lockPages(true);
      if (this.peers.length) this.setPeers(this.peers);
      // The focus was in what is gone (the menu, as a rule): to where the menu is opened, as it was.
      if (!this.doc.activeElement || this.doc.activeElement === this.doc.body) (this.viewer as Viewer | undefined)?.menuButton.focus();
    } else if (this.empty) {
      this.empty.remove();
      this.empty = undefined;
      this.showEmpty();
    }
    this.options.onLocale?.(locale);
  }

  /** Says a PDF is signed, by whom, and that what is changed is added after the signature. */
  private tellSigned(pdf: Pdf) {
    const [first] = pdf.signatures ?? [];
    if (!first) return;
    this.toast(fill(this.t.signedBy, { name: first.name ?? this.t.someone }));
    // Then whether what was signed is as it was signed.
    void checkSignatures(pdf.sources[first.source]).then((checks) => {
      if (this.current !== pdf || !checks.length) return;
      const broken = checks.find((c) => !c.intact);
      const name = (c: SignatureCheck) => c.signer ?? c.name ?? this.t.someone;
      if (broken) this.toast(fill(this.t.signatureNotHolding, { name: name(broken) }));
      else if (checks.some((c) => !c.whole)) this.toast(fill(this.t.signatureHoldsChanged, { names: checks.map(name).join(', ') }));
      else this.toast(fill(this.t.signatureIntact, { names: checks.map(name).join(', ') }));
    });
  }

  /** Reads the text of the pages that are pictures (scans), to be found, selected and blacked out. */
  async recognizeText(languages = this.ocrLanguages): Promise<void> {
    const pdf = this.current;
    if (!pdf || !this.options.recognize) return;
    this.toast(this.t.recognizing);
    const read = await this.options.recognize(pdf, { languages, onProgress: (done, total) => this.toast(fill(this.t.recognizingPages, { done, total })) });
    if (read === pdf) {
      this.toast(this.t.nothingToRecognize);
      return;
    }
    this.commit(read);
    const pages = Object.keys(read.recognized ?? {}).length;
    this.toast(fill(this.t.recognized, { n: pages }));
  }

  /** The languages text is recognized in: those of the editor's language first, until others are chosen. */
  private ocrChosen?: string[];
  private get ocrLanguages(): string[] {
    return this.ocrChosen ?? (this.options.locale?.startsWith('es') ? ['spa', 'eng'] : ['eng', 'spa']);
  }

  /** Asks which languages the scanned pages are in, and reads them. */
  private askLanguages(anchor: DOMRect) {
    const t = this.t;
    const box = this.doc.createElement('fieldset');
    box.className = 'rp-languages';
    const legend = this.doc.createElement('legend');
    legend.textContent = t.ocrLanguages;
    box.append(legend);
    const boxes = OCR_LANGUAGES.map(([code, name]) => {
      const input = Object.assign(this.doc.createElement('input'), { type: 'checkbox', value: code, checked: this.ocrLanguages.includes(code) });
      const label = this.doc.createElement('label');
      label.append(input, name);
      box.append(label);
      return input;
    });
    const read = this.doc.createElement('button');
    read.type = 'button';
    read.className = 'rp-button rp-primary';
    read.textContent = t.readNow;
    read.addEventListener('click', () => {
      const chosen = boxes.filter((b) => b.checked).map((b) => b.value);
      if (!chosen.length) return;
      this.ocrChosen = chosen;
      this.closePop();
      void this.recognizeText(chosen);
    });
    this.openPop(anchor, [box, this.row([], [read])]);
    boxes[0]?.focus();
  }

  /** Compares the PDF with another version of it, from a file: what changed, side by side. */
  async compareWith(file?: File): Promise<void> {
    const chosen =
      file ??
      (await new Promise<File | undefined>((resolve) => {
        const input = this.doc.createElement('input');
        input.type = 'file';
        input.accept = 'application/pdf,.pdf';
        input.addEventListener('change', () => resolve(input.files?.[0]));
        input.click();
      }));
    if (!chosen || !this.current || !this.viewer) return;
    const other = await this.read(chosen);
    if (!other) return;
    const layer = this.doc.createElement('div');
    layer.className = 'rp-compare-layer';
    this.viewer.root.append(layer);
    const view = await mountComparison(layer, {
      before: other,
      after: this.current,
      locale: this.options.locale,
      theme: this.options.theme,
      onClose: () => {
        view.destroy();
        layer.remove();
        this.viewer?.scroll.focus({ preventScroll: true });
      },
    });
    if (view.comparison.text.length) view.show(0);
  }

  /** Signs the PDF with a certificate of the person, and saves or downloads it signed. */
  async signDigitally(): Promise<void> {
    const pdf = this.current;
    if (!pdf || !this.viewer) return;
    const fields = pdf.fields.filter((f) => f.kind === 'signature').map((f) => f.name);
    const asked = await askCertificate(this.viewer.root, this.t, fields, this.options.signing?.timestamp);
    if (!asked) return;
    const { timestamp, longTerm, ...certificate } = asked;
    const fetcher = this.options.signing?.fetch;
    let bytes: Uint8Array;
    try {
      bytes = await signPdf(pdf, { ...certificate, font: this.options.font, ...(timestamp ? { timestamp: authorityAt(timestamp, fetcher) } : {}) });
      if (longTerm) bytes = await addValidationData(bytes, fetcher ? { fetch: fetcher } : {});
    } catch (error) {
      this.toast(error instanceof Error ? error.message : String(error));
      return;
    }
    if (this.options.onSave) await this.options.onSave(bytes, pdf);
    else this.give(bytes, pdf.name);
    const signed = await openPdf(bytes, { name: pdf.name });
    this.setPdf(signed);
    const last = signed.signatures?.at(-1);
    const [check] = timestamp ? (await checkSignatures(bytes)).filter((c) => c.kind === 'signature').slice(-1) : [];
    this.toast(
      check?.timestamp
        ? fill(this.t.signedTimestamped, { name: last?.name ?? this.t.someone, authority: check.timestamp.authority ?? '' })
        : fill(this.t.signedDigitally, { name: last?.name ?? this.t.someone }),
    );
  }

  // --- Bookmarks and files carried ---------------------------------------------

  /** A button with its words beside its icon. */
  private textButton(name: IconName, label: string, run: () => void): HTMLButtonElement {
    const b = this.button(name, label, run, 16);
    b.classList.add('rp-text-button');
    b.append(Object.assign(this.doc.createElement('span'), { textContent: label }));
    return b;
  }

  /** Changes the bookmarks: as they are now (of the files, until changed), given to be changed. */
  private async changeOutline(change: (items: OutlineItem[]) => void) {
    if (!this.current) return;
    const items = structuredClone(await outlineOf(this.current));
    change(items);
    this.commit(setOutline(this.current, items));
  }

  /** A bookmark to the place in view, named by its page, to be renamed at once. */
  private async addBookmarkHere() {
    const place = this.viewer?.placeInView();
    if (!place || !this.current) return;
    const n = this.current.pages.findIndex((p) => p.id === place.page) + 1;
    let at = 0;
    await this.changeOutline((items) => {
      items.push({ title: fill(this.t.pageN, { n }), to: place, items: [] });
      at = items.length - 1;
    });
    await this.renameBookmark([at]);
  }

  /** The list a bookmark is in, by its path, and its index in it. */
  private static siblings(items: OutlineItem[], path: number[]): [OutlineItem[], number] {
    let list = items;
    for (const i of path.slice(0, -1)) list = list[i].items;
    return [list, path[path.length - 1]];
  }

  /** What the editor adds to a bookmark: renamed, moved up, down, in and out, and taken away. */
  /**
   * What is done to a bookmark: from one button at the end of its row, which
   * opens them as a menu, or from the keyboard on the bookmark (F2, Delete,
   * Alt and the arrows), so that the list stays one stop of Tab.
   */
  private decorateBookmark(row: HTMLElement, path: number[], item: OutlineItem) {
    const t = this.t;
    const actions = this.bookmarkActions(path, item);
    const more = this.button('more', fill(t.bookmarkActions, { title: item.title }), () => this.bookmarkMenu(more, actions), 14);
    more.classList.add('rp-outline-more');
    more.tabIndex = -1;
    more.setAttribute('aria-haspopup', 'menu');
    row.append(more);
    const go = row.querySelector<HTMLElement>('.rp-outline-item');
    go?.setAttribute('aria-keyshortcuts', 'F2 Delete Alt+ArrowUp Alt+ArrowDown Alt+ArrowRight Alt+ArrowLeft Shift+F10');
    go?.addEventListener('keydown', (event) => {
      const action = actions.find((a) => a.keys.includes(event.key) && (a.key.startsWith('Alt') ? event.altKey : !event.altKey));
      if ((event.key === 'F10' && event.shiftKey) || event.key === 'ContextMenu') {
        event.preventDefault();
        this.bookmarkMenu(more, actions);
      } else if (action) {
        event.preventDefault();
        event.stopPropagation();
        action.run();
      }
    });
  }

  /** What can be done to a bookmark, with the key that does it, each going back to the bookmark where it is then. */
  private bookmarkActions(path: number[], item: OutlineItem) {
    const t = this.t;
    const title = item.title;
    /** Changes the bookmarks, and gives the keyboard back to this one, where it is now. */
    // Where it is among the others, as they are drawn: what may be done to it.
    const li = () => this.viewer?.root.querySelector(`.rp-outline .rp-outline-row[data-path="${path.join('.')}"]`)?.closest('li');
    const first = () => !li()?.previousElementSibling;
    const last = () => !li()?.nextElementSibling;
    const change = (label: string, key: string, keys: string[], name: IconName, can: () => boolean, move: (items: OutlineItem[]) => number[] | undefined) => ({
      label: fill(label, { title }),
      key,
      keys,
      icon: name,
      can,
      run: () =>
        void (async () => {
          if (!can()) return;
          let to: number[] | undefined;
          let after: OutlineItem[] = [];
          await this.changeOutline((items) => {
            to = move(items);
            after = items;
          });
          // The one at that place then: this one, or, taken away, the one in its place.
          const there = to?.reduce<OutlineItem | undefined>((at, i, n) => (n === 0 ? after[i] : at?.items[i]), undefined);
          if (to && there) await this.focusBookmark(to, there.title);
        })(),
    });
    const parent = path.slice(0, -1);
    const i = path[path.length - 1];
    return [
      { label: fill(t.renameBookmark, { title }), key: 'F2', keys: ['F2'], icon: 'pen' as IconName, can: () => true, run: () => void this.renameBookmark(path) },
      change(
        t.bookmarkUp,
        'Alt+↑',
        ['ArrowUp'],
        'chevronUp',
        () => !first(),
        (items) => {
          const [list] = Editor.siblings(items, path);
          if (i === 0) return undefined;
          [list[i - 1], list[i]] = [list[i], list[i - 1]];
          return [...parent, i - 1];
        },
      ),
      change(
        t.bookmarkDown,
        'Alt+↓',
        ['ArrowDown'],
        'chevronDown',
        () => !last(),
        (items) => {
          const [list] = Editor.siblings(items, path);
          if (i >= list.length - 1) return undefined;
          [list[i], list[i + 1]] = [list[i + 1], list[i]];
          return [...parent, i + 1];
        },
      ),
      // Under the bookmark before it.
      change(
        t.bookmarkIn,
        'Alt+→',
        ['ArrowRight'],
        'chevronRight',
        () => !first(),
        (items) => {
          const [list] = Editor.siblings(items, path);
          if (i === 0) return undefined;
          const [moved] = list.splice(i, 1);
          list[i - 1].items.push(moved);
          return [...parent, i - 1, list[i - 1].items.length - 1];
        },
      ),
      // After the bookmark it is under.
      change(
        t.bookmarkOut,
        'Alt+←',
        ['ArrowLeft'],
        'chevronLeft',
        () => path.length > 1,
        (items) => {
          if (path.length < 2) return undefined;
          const [list] = Editor.siblings(items, path);
          const [moved] = list.splice(i, 1);
          const [outer, j] = Editor.siblings(items, parent);
          outer.splice(j + 1, 0, moved);
          return [...parent.slice(0, -1), j + 1];
        },
      ),
      change(
        t.removeBookmark,
        t.deleteKey,
        ['Delete', 'Backspace'],
        'trash',
        () => true,
        (items) => {
          const [list] = Editor.siblings(items, path);
          list.splice(i, 1);
          // To the one that takes its place, or the one before it, or the one it was under.
          return list.length ? [...parent, Math.min(i, list.length - 1)] : parent.length ? parent : undefined;
        },
      ),
    ];
  }

  /** The menu of what is done to a bookmark, under its button. */
  private bookmarkMenu(anchor: HTMLElement, actions: ReturnType<Editor['bookmarkActions']>) {
    const items = actions.map((action) => {
      const b = this.doc.createElement('button');
      b.type = 'button';
      b.className = 'rp-button';
      b.setAttribute('role', 'menuitem');
      // What does not apply here stays in its place, said so, and is passed over by the arrows.
      if (!action.can()) b.setAttribute('aria-disabled', 'true');
      const words = this.doc.createElement('span');
      words.textContent = action.label;
      const key = this.doc.createElement('kbd');
      key.textContent = action.key;
      key.setAttribute('aria-hidden', 'true');
      b.append(icon(this.doc, action.icon, 16), words, key);
      b.addEventListener('click', () => {
        if (!action.can()) return;
        this.closePop();
        action.run();
      });
      return b;
    });
    anchor.setAttribute('aria-expanded', 'true');
    this.openPop(anchor.getBoundingClientRect(), items);
    const close = this.popClose;
    this.popClose = () => {
      anchor.setAttribute('aria-expanded', 'false');
      close?.();
    };
    this.pop?.classList.add('rp-menu', 'rp-bookmark-menu');
    this.pop?.setAttribute('role', 'menu');
    this.pop?.setAttribute('aria-label', anchor.getAttribute('aria-label') ?? '');
    items[0]?.focus();
    this.pop?.addEventListener('keydown', (event) => {
      const at = items.indexOf(this.doc.activeElement as HTMLButtonElement);
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        items[(at + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        const go = anchor.closest('.rp-outline-row')?.querySelector<HTMLElement>('.rp-outline-item');
        this.closePop();
        go?.focus();
      }
    });
  }

  /** Gives the keyboard to a bookmark, by its path and title, once the bookmarks are drawn again (till then, another may be at that path). */
  private async focusBookmark(path: number[], title: string) {
    const key = path.join('.');
    for (let i = 0; i < 90; i++) {
      const go = this.viewer?.root.querySelector<HTMLElement>(`.rp-outline .rp-outline-row[data-path="${key}"] .rp-outline-item`);
      if (go?.isConnected && go.title === title) {
        for (const b of this.viewer?.root.querySelectorAll<HTMLElement>('.rp-outline-item[tabindex="0"]') ?? []) b.tabIndex = -1;
        go.tabIndex = 0;
        go.focus();
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 16));
    }
  }

  /** The name of a bookmark written in its place, kept with Enter, left with Escape. */
  private async renameBookmark(path: number[]) {
    // The bookmarks are drawn again after a change, a moment after: the row is waited for.
    const find = () => [...(this.viewer?.root.querySelectorAll<HTMLElement>('.rp-outline .rp-outline-row') ?? [])].find((r) => r.dataset.path === path.join('.'));
    let row = find();
    for (let i = 0; i < 60 && !row?.isConnected; i++) {
      await new Promise((resolve) => setTimeout(resolve, 16));
      row = find();
    }
    const go = row?.querySelector<HTMLButtonElement>('.rp-outline-item');
    if (!row || !go) return;
    const input = this.doc.createElement('input');
    input.className = 'rp-input rp-outline-name';
    input.value = go.title || (go.textContent ?? '');
    input.setAttribute('aria-label', this.t.bookmarkName);
    go.replaceWith(input);
    input.focus();
    input.select();
    let done = false;
    const finish = (keep: boolean) => {
      if (done) return;
      done = true;
      const title = input.value.trim();
      if (keep && title && title !== go.title)
        void this.changeOutline((items) => {
          const [list, i] = Editor.siblings(items, path);
          list[i].title = title;
        }).then(() => this.focusBookmark(path, title));
      else {
        input.replaceWith(go);
        if (!keep) go.focus();
      }
    };
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') finish(true);
      else if (event.key === 'Escape') {
        event.stopPropagation();
        finish(false);
      }
    });
    input.addEventListener('blur', () => finish(true));
  }

  /** Files chosen, carried by the PDF. */
  private attachFiles() {
    const input = Object.assign(this.doc.createElement('input'), { type: 'file', multiple: true });
    input.addEventListener('change', async () => {
      let next = this.current;
      if (!next) return;
      for (const file of input.files ?? [])
        next = attachFile(next, { name: file.name, data: new Uint8Array(await file.arrayBuffer()), ...(file.type ? { mime: file.type } : {}), modified: new Date(file.lastModified).toISOString() });
      if (next !== this.current) this.commit(next);
    });
    input.click();
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
    // Who comments changes notes alone; who sees, nothing.
    if (this.role !== 'edit' && !(this.role === 'comment' && Editor.notesAlone(before, next))) {
      this.toast(this.role === 'view' ? this.t.viewOnly : this.t.commentOnly);
      if (show) this.viewer?.setPdf(before);
      return;
    }
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
    this.tell(next, false);
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
    this.tell(pdf, false);
  }

  private listeners = new Set<(pdf: Pdf, remote: boolean) => void>();
  private pageListeners = new Set<(page: string) => void>();
  private pagesLocked = false;
  private peersEl?: HTMLElement;
  private peers: { name: string; color: string; page?: string }[] = [];

  private tell(pdf: Pdf, remote: boolean) {
    for (const listener of this.listeners) listener(pdf, remote);
  }

  /** Told the PDF after every change: whether it came from elsewhere (`applyRemote`) or from here. */
  subscribe(listener: (pdf: Pdf, remote: boolean) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Told the page in view, as it changes. */
  onPage(listener: (page: string) => void): () => void {
    this.pageListeners.add(listener);
    return () => this.pageListeners.delete(listener);
  }

  /**
   * Makes a change that came from elsewhere (another person in a room):
   * shown, and made on the history too, so that undo takes back what was
   * done here and not what others did.
   */
  applyRemote(change: (pdf: Pdf) => Pdf): void {
    if (!this.current) return;
    const was = this.current.marks.find((m) => m.id === this.chosen);
    this.current = change(this.current);
    this.past = this.past.map(change);
    this.future = this.future.map(change);
    this.viewer?.setPdf(this.current);
    const now = this.current.marks.find((m) => m.id === this.chosen);
    if (this.chosen && !now) this.choose('');
    // The menu of a note open as a reply to it comes: shown again, unless its person is writing in it.
    else if (now && was !== now && now.kind === 'note' && this.pop && !this.pop.contains(this.doc.activeElement)) this.markMenu(now.id, false);
    this.refresh();
    this.options.onChange?.(this.current);
    this.tell(this.current, true);
  }

  /** Shows who else is working on the PDF, and on which page (by id). */
  setPeers(peers: { name: string; color: string; page?: string }[]): void {
    this.peers = peers;
    if (!this.viewer) return;
    if (!this.peersEl) {
      this.peersEl = this.doc.createElement('div');
      this.peersEl.className = 'rp-peers';
      this.peersEl.setAttribute('role', 'list');
      this.peersEl.setAttribute('aria-label', this.t.people);
      this.viewer.slots.end.prepend(this.peersEl);
    }
    this.peersEl.replaceChildren(
      ...peers.map((peer) => {
        const el = this.doc.createElement('span');
        el.className = 'rp-peer';
        el.setAttribute('role', 'listitem');
        el.style.background = peer.color;
        el.textContent = peer.name.trim().slice(0, 1).toUpperCase() || '?';
        const n = peer.page && this.current ? pageNumber(this.current, peer.page) : 0;
        const label = n ? fill(this.t.personOnPage, { name: peer.name, n }) : peer.name;
        el.title = label;
        el.setAttribute('aria-label', label);
        return el;
      }),
    );
  }

  /** Whether pages can be turned, moved, deleted and put in: in a room they cannot, so that they are the same for everyone. */
  /** What its person may do: everything, notes alone (comment), or nothing but read and move about (view). In a room, as the room says. */
  setRole(role: 'edit' | 'comment' | 'view'): void {
    this.role = role;
    const root = this.viewer?.root;
    if (root) root.dataset.role = role;
    for (const { tool } of TOOLS) {
      const allowed = role === 'edit' || tool === 'select' || (role === 'comment' && tool === 'note');
      if (this.buttons[tool]) this.buttons[tool].hidden = !allowed;
    }
    if (!this.mayUse(this.tool)) void this.setTool('select');
    this.viewer?.setFillable(role === 'edit');
    this.viewer?.root.classList.toggle('rp-pages-locked', role !== 'edit' || this.pagesLocked);
  }

  private role: 'edit' | 'comment' | 'view' = 'edit';
  private history: { by: string; color: string; at: string; what: (locale: string) => string }[] = [];

  /** Who did what in the room it is in, and when: offered in the menu. */
  setHistory(entries: { by: string; color: string; at: string; what: (locale: string) => string }[]): void {
    this.history = entries;
  }

  /** The history of the room, the last first. */
  private showHistory(anchor: DOMRect) {
    const t = this.t;
    const list = this.doc.createElement('ol');
    list.className = 'rp-history';
    list.setAttribute('aria-label', t.history);
    for (const entry of [...this.history].reverse().slice(0, 200)) {
      const li = this.doc.createElement('li');
      const dot = this.doc.createElement('span');
      dot.className = 'rp-swatch';
      dot.style.background = entry.color;
      const who = this.doc.createElement('strong');
      who.textContent = entry.by;
      const when = this.doc.createElement('time');
      when.dateTime = entry.at;
      when.textContent = new Date(entry.at).toLocaleTimeString(this.options.locale ?? 'en', { hour: '2-digit', minute: '2-digit' });
      li.append(dot, who, ` ${entry.what(this.options.locale ?? 'en')} `, when);
      list.append(li);
    }
    this.openPop(anchor, [list]);
  }

  /** Whether one Pdf is another with its notes changed, and nothing else. */
  private static notesAlone(before: Pdf, after: Pdf): boolean {
    if (before.pages !== after.pages || JSON.stringify(before.fields.map((f) => f.value)) !== JSON.stringify(after.fields.map((f) => f.value))) return false;
    const others = (pdf: Pdf) => JSON.stringify(pdf.marks.filter((m) => m.kind !== 'note'));
    return others(before) === others(after);
  }

  /** Whether a tool is one its person may use. */
  private mayUse(tool: Tool): boolean {
    return this.role === 'edit' || tool === 'select' || (this.role === 'comment' && tool === 'note');
  }

  lockPages(locked: boolean): void {
    this.pagesLocked = locked;
    // A class of the root, not `hidden`: the viewer shows its actions again as it shows the thumbnails.
    this.viewer?.root.classList.toggle('rp-pages-locked', locked);
    for (const li of this.viewer?.root.querySelectorAll<HTMLElement>('.rp-thumb') ?? []) li.draggable = !locked;
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
      color.hidden = this.tool === 'select' || this.tool === 'sign' || this.tool === 'redact' || this.tool === 'field';
    }
    if (this.kindButton) {
      this.kindButton.hidden = this.tool !== 'field';
      const label = `${this.t.fieldKinds[this.fieldKind]} ▾`;
      this.kindButton.textContent = label;
      this.kindButton.setAttribute('aria-label', `${this.t.fieldKind}: ${this.t.fieldKinds[this.fieldKind]}`);
    }
    for (const view of this.viewer?.views.values() ?? []) this.design(view);
    this.showChosen();
    for (const li of this.viewer?.root.querySelectorAll<HTMLElement>('.rp-thumb') ?? []) li.setAttribute('aria-selected', String(this.chosenPages.has(li.dataset.page!)));
  }

  async setTool(tool: Tool): Promise<void> {
    if (!this.mayUse(tool)) return;
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
    if (tool === 'edit') this.say(this.t.editTextHint);
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
      case 'edit':
        void this.editTextAt(at.id, at.point, { x: event.clientX, y: event.clientY });
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
      case 'field': {
        const box = (event.target as Element).closest<HTMLElement>('.rp-design-box');
        if (box) this.moveField(event as PointerEvent, at, box.dataset.field!, !!(event.target as Element).closest('.rp-handle'));
        else this.drawBox(event as PointerEvent, at, (rect) => this.makeField(at.id, rect));
        return;
      }
      default:
    }
  }

  /** Draws a box with the pointer: to be blacked out, or, given what to do with it, a field. */
  private drawBox(event: PointerEvent, at: NonNullable<ReturnType<Editor['at']>>, done?: (rect: Rect) => void) {
    const box = this.doc.createElement('div');
    box.className = done ? 'rp-boxing rp-boxing-field' : 'rp-boxing';
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
      if (done) return done(rect);
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

  /**
   * The text of the page at a point, written again: what is written goes in
   * its place, and, when the PDF is saved, the page's text is taken out.
   */
  private async editTextAt(page: string, point: Point, client: Point) {
    if (!this.current) return;
    const t = this.t;
    const pdf = this.current;
    // Written over already: that is what is changed.
    const over = pdf.marks.find(
      (m): m is TextMark =>
        m.kind === 'text' && m.page === page && !!m.replaces && point.x >= m.rect.x && point.x <= m.rect.x + m.rect.width && point.y >= m.rect.y && point.y <= m.rect.y + m.rect.height,
    );
    const { runs } = await pageText(pdf, page);
    const run = over ? undefined : runs.find((r) => point.x >= r.rect.x - 1 && point.x <= r.rect.x + r.rect.width + 1 && point.y >= r.rect.y - 1 && point.y <= r.rect.y + r.rect.height + 1);
    if (!over && !run) {
      this.say(t.editTextHint);
      return;
    }
    const input = this.doc.createElement('input');
    input.className = 'rp-input';
    input.value = over?.text ?? run!.text;
    input.setAttribute('aria-label', t.textContent);
    const family = this.doc.createElement('select');
    family.className = 'rp-input';
    family.setAttribute('aria-label', t.fontFamily);
    for (const [value, label] of [
      ['sans', t.familySans],
      ['serif', t.familySerif],
      ['mono', t.familyMono],
    ] as const)
      family.append(makeOption(this.doc, label, value, value === (over?.family ?? run?.family ?? 'sans')));
    const bold = Object.assign(this.doc.createElement('input'), { type: 'checkbox', checked: !!over?.bold });
    const boldLabel = this.labelled(t.bold, bold);
    const done = this.doc.createElement('button');
    done.type = 'button';
    done.className = 'rp-button rp-primary';
    done.textContent = t.replace;
    const cancel = this.doc.createElement('button');
    cancel.type = 'button';
    cancel.className = 'rp-button';
    cancel.textContent = t.cancel;
    const finish = () => {
      const text = input.value;
      this.closePop();
      if (!this.current) return;
      const look = { family: family.value as TextMark['family'], bold: bold.checked || undefined };
      if (over) {
        if (text !== over.text || look.family !== over.family || look.bold !== over.bold) this.commit(updateMark(this.current, over.id, { text, ...look }));
        return;
      }
      if (text === run!.text && look.family === run!.family && !look.bold) return;
      const size = run!.size ?? run!.rect.height / 1.16;
      const width = Math.max(run!.rect.width, textRect(this.doc, text, size, { x: run!.rect.x, y: run!.rect.y }, pdf.pages.find((p) => p.id === page)!).width);
      this.commit(addMark(this.current, { kind: 'text', page, rect: { ...run!.rect, width }, text, size, color: '#000000', ...look, replaces: { rect: run!.rect, text: run!.text } }));
    };
    done.addEventListener('click', finish);
    cancel.addEventListener('click', () => this.closePop());
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        finish();
      }
    });
    this.openPop({ x: client.x, y: client.y, width: 0, height: 0 }, [input, this.row([this.labelled(t.fontFamily, family), boldLabel], [cancel, done])]);
    input.focus();
    input.select();
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

  /** Lays the fields of a page over it as boxes to move, resize and change, while the tool of fields is in hand. */
  private design(view: PageView) {
    let layer = view.el.querySelector<HTMLElement>(':scope > .rp-design');
    if (this.tool !== 'field' || !this.current) {
      layer?.remove();
      return;
    }
    if (!layer) {
      layer = this.doc.createElement('div');
      layer.className = 'rp-layer rp-design';
      view.el.append(layer);
    }
    const boxes: HTMLElement[] = [];
    for (const field of this.current.fields) {
      field.widgets.forEach((widget) => {
        if (widget.page !== view.page.id) return;
        const box = this.doc.createElement('div');
        box.className = 'rp-design-box';
        box.dataset.field = field.id;
        box.dataset.kind = field.kind;
        box.setAttribute('role', 'button');
        box.tabIndex = 0;
        box.setAttribute('aria-label', `${this.t.fieldKinds[field.kind as FieldTool] ?? field.kind}: ${field.label ?? field.name}`);
        if (field.id === this.chosenField) box.setAttribute('aria-pressed', 'true');
        const s = view.geo.toScreenRect(widget.rect);
        Object.assign(box.style, { left: `${s.x}px`, top: `${s.y}px`, width: `${s.width}px`, height: `${s.height}px` });
        const name = this.doc.createElement('span');
        name.textContent = field.label ?? field.name;
        box.append(name);
        if (field.id === this.chosenField && field.widgets.length === 1 && !view.geo.rotation) {
          const handle = this.doc.createElement('div');
          handle.className = 'rp-handle';
          Object.assign(handle.style, { left: '100%', top: '100%' });
          box.append(handle);
        }
        box.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            this.chooseField(field.id);
            this.fieldMenu(field.id, true);
          }
        });
        boxes.push(box);
      });
    }
    layer.replaceChildren(...boxes);
  }

  private chooseField(id: string) {
    this.chosenField = id;
    for (const view of this.viewer?.views.values() ?? []) this.design(view);
  }

  /** A field made where a box was drawn, or, for a click, as big as its kind is by default. */
  private makeField(page: string, drawn: Rect) {
    if (!this.current) return;
    const size = { text: [180, 18], checkbox: [12, 12], choice: [140, 18], signature: [180, 50] }[this.fieldKind];
    const rect = drawn.width < 4 || drawn.height < 4 ? { x: drawn.x, y: drawn.y + drawn.height - size[1], width: size[0], height: size[1] } : drawn;
    const t = this.t;
    const next = addField(this.current, {
      kind: this.fieldKind,
      page,
      rect,
      label: { text: t.fieldKinds.text, checkbox: t.fieldKinds.checkbox, choice: t.fieldKinds.choice, signature: t.fieldKinds.signature }[this.fieldKind],
      ...(this.fieldKind === 'choice' ? { options: [t.option(1), t.option(2)] } : {}),
    });
    this.commit(next);
    const made = next.fields.at(-1)!;
    this.chooseField(made.id);
    this.fieldMenu(made.id, true);
  }

  /** Moves a field with the pointer, or resizes it by its corner; a click without moving shows what can be changed of it. */
  private moveField(event: PointerEvent, at: NonNullable<ReturnType<Editor['at']>>, id: string, resizing: boolean) {
    event.preventDefault();
    const from = this.current!;
    const field = from.fields.find((f) => f.id === id);
    if (!field) return;
    this.chooseField(id);
    const start = at.point;
    const rect = field.widgets.find((w) => w.page === at.id)?.rect ?? field.widgets[0].rect;
    let moved = false;
    at.el.setPointerCapture(event.pointerId);
    const move = (e: PointerEvent) => {
      if (!moved && Math.hypot(e.clientX - event.clientX, e.clientY - event.clientY) < 4) return;
      moved = true;
      const box = at.el.getBoundingClientRect();
      const now = at.geo.toPage({ x: e.clientX - box.left, y: e.clientY - box.top });
      const [dx, dy] = [now.x - start.x, now.y - start.y];
      const next = resizing
        ? { x: rect.x, y: rect.y + Math.min(dy, rect.height - 6), width: Math.max(6, rect.width + dx), height: Math.max(6, rect.height - dy) }
        : { ...rect, x: rect.x + dx, y: rect.y + dy };
      if (field.widgets.length !== 1) return;
      this.current = updateField(from, id, { rect: next });
      this.viewer?.setPdf(this.current);
    };
    const up = () => {
      at.el.removeEventListener('pointermove', move);
      at.el.removeEventListener('pointerup', up);
      at.el.removeEventListener('pointercancel', up);
      if (moved) {
        const after = this.current!;
        this.current = from;
        this.commit(after, '', false);
      } else this.fieldMenu(id, false);
    };
    at.el.addEventListener('pointermove', move);
    at.el.addEventListener('pointerup', up);
    at.el.addEventListener('pointercancel', up);
  }

  /** What can be changed of a field: what it is called, whether it must be filled, its choices; or delete it. */
  private fieldMenu(id: string, focus: boolean) {
    const field = this.current?.fields.find((f) => f.id === id);
    if (!field || !this.viewer) return;
    const t = this.t;
    let key = field.id;
    const change = (patch: Parameters<typeof updateField>[2]) => {
      if (!this.current) return;
      const next = updateField(this.current, key, patch);
      key = next.fields.find((f) => f.widgets === this.current!.fields.find((g) => g.id === key)?.widgets)?.id ?? key;
      this.commit(next, `field:${field.id}`);
      this.chosenField = key;
    };
    const items: HTMLElement[] = [];
    const name = this.doc.createElement('input');
    name.className = 'rp-input';
    name.value = field.label ?? field.name;
    name.setAttribute('aria-label', t.fieldName);
    name.placeholder = t.fieldName;
    name.addEventListener('input', () => name.value.trim() && change({ label: name.value.trim(), name: name.value.trim() }));
    items.push(this.labelled(t.fieldName, name));
    if (field.kind === 'choice' || field.kind === 'list') {
      const options = this.doc.createElement('textarea');
      options.className = 'rp-input';
      options.value = (field.options ?? []).join('\n');
      options.setAttribute('aria-label', t.fieldOptions);
      options.addEventListener('input', () => {
        const list = options.value
          .split('\n')
          .map((o) => o.trim())
          .filter(Boolean);
        if (list.length) change({ options: list });
      });
      items.push(this.labelled(t.fieldOptions, options));
    }
    const toggles: HTMLElement[] = [];
    const toggle = (text: string, on: boolean, set: (on: boolean) => void) => {
      const box = this.doc.createElement('input');
      box.type = 'checkbox';
      box.checked = on;
      box.addEventListener('change', () => set(box.checked));
      toggles.push(this.labelled(text, box));
    };
    if (field.kind !== 'signature') toggle(t.fieldRequired, !!field.required, (on) => change({ required: on }));
    if (field.kind === 'text') toggle(t.fieldMultiline, !!field.multiline, (on) => change({ multiline: on }));
    const remove = this.doc.createElement('button');
    remove.type = 'button';
    remove.className = 'rp-button';
    remove.append(icon(this.doc, 'trash', 16), t.remove);
    remove.addEventListener('click', () => this.removeChosenField());
    items.push(this.row(toggles, [remove]));
    const box = this.viewer.root.querySelector(`.rp-design-box[data-field="${CSS.escape(id)}"]`);
    this.openPop(box?.getBoundingClientRect() ?? this.viewer.scroll.getBoundingClientRect(), items, () =>
      this.viewer?.root.querySelector(`.rp-design-box[data-field="${CSS.escape(this.chosenField)}"]`),
    );
    if (focus) name.select();
  }

  private removeChosenField() {
    if (!this.current || !this.chosenField) return;
    const id = this.chosenField;
    this.closePop();
    this.chosenField = '';
    this.commit(removeField(this.current, id));
  }

  /** The kind of field the tool makes, and finding the fields a PDF with no form asks for. */
  private kindMenu(anchor: HTMLElement) {
    const t = this.t;
    const items = (['text', 'checkbox', 'choice', 'signature'] as FieldTool[]).map((kind) => {
      const b = this.doc.createElement('button');
      b.type = 'button';
      b.className = 'rp-button';
      b.setAttribute('role', 'menuitemradio');
      b.setAttribute('aria-checked', String(kind === this.fieldKind));
      b.textContent = t.fieldKinds[kind];
      b.addEventListener('click', () => {
        this.fieldKind = kind;
        this.closePop();
        this.refresh();
        anchor.focus();
      });
      return b;
    });
    const detect = this.doc.createElement('button');
    detect.type = 'button';
    detect.className = 'rp-button';
    detect.setAttribute('role', 'menuitem');
    detect.append(icon(this.doc, 'search', 16), t.detectFields);
    detect.addEventListener('click', () => {
      this.closePop();
      void this.detect();
    });
    this.openPop(anchor.getBoundingClientRect(), [...items, detect]);
    this.pop?.classList.add('rp-menu');
    this.pop?.setAttribute('role', 'menu');
    (items.find((b) => b.getAttribute('aria-checked') === 'true') ?? items[0]).focus();
  }

  /** Makes fields of the lines to write on and the boxes to tick the text of the PDF has. */
  async detect(): Promise<number> {
    if (!this.current) return 0;
    const found = await detectFields(this.current);
    let next = this.current;
    for (const field of found) next = addField(next, field);
    if (found.length) this.commit(next);
    this.toast(found.length ? fill(this.t.detected, { n: found.length }) : this.t.noneDetected);
    return found.length;
  }

  /** Signs a signature field: the signature of the person, put in its box. */
  private async signField(field: Field, rect: Rect) {
    const made = this.signature ?? (await askSignature(this.viewer!.root, this.t));
    if (!made || !this.current) return;
    this.signature = made;
    const page = field.widgets.find((w) => w.rect === rect)?.page ?? field.widgets[0].page;
    // As big as it fits in the box, in its middle.
    const fit = Math.min(rect.width / made.aspect, rect.height);
    const [width, height] = [fit * made.aspect, fit];
    const box = { x: rect.x + (rect.width - width) / 2, y: rect.y + (rect.height - height) / 2, width, height };
    this.commit(addMark(this.current, { kind: 'signature', page, rect: box, ...(made.image ? { image: made.image } : { paths: made.paths }), color: '#0b1f4d' }));
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

  /** The replies of a note, each with who and when, one to take off, and a box to reply in. */
  private replies(note: Extract<Mark, { kind: 'note' }>): HTMLElement {
    const t = this.t;
    const box = this.doc.createElement('div');
    box.className = 'rp-replies';
    const list = this.doc.createElement('ol');
    list.setAttribute('aria-label', t.replies);
    for (const reply of note.replies ?? []) {
      const li = this.doc.createElement('li');
      const who = this.doc.createElement('strong');
      who.textContent = reply.author ?? t.someone;
      const when = this.doc.createElement('time');
      if (reply.date) {
        when.dateTime = reply.date;
        when.textContent = new Date(reply.date).toLocaleString(this.options.locale ?? 'en', { dateStyle: 'short', timeStyle: 'short' });
      }
      const said = this.doc.createElement('p');
      said.textContent = reply.text;
      const off = this.button(
        'trash',
        fill(t.removeReply, { name: reply.author ?? t.someone }),
        () => {
          if (!this.current) return;
          this.commit(updateMark(this.current, note.id, { replies: (note.replies ?? []).filter((r) => r.id !== reply.id) }));
          this.markMenu(note.id, false);
        },
        14,
      );
      li.append(who, when, off, said);
      list.append(li);
    }
    const input = this.doc.createElement('input');
    input.className = 'rp-input';
    input.placeholder = t.replyHint;
    input.setAttribute('aria-label', t.reply);
    input.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || !input.value.trim() || !this.current) return;
      event.preventDefault();
      const reply = { id: `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, author: this.options.author, text: input.value.trim(), date: new Date().toISOString() };
      this.commit(updateMark(this.current, note.id, { replies: [...(note.replies ?? []), reply] }));
      this.markMenu(note.id, false);
      this.viewer?.root.querySelector<HTMLInputElement>('.rp-replies input')?.focus();
    });
    if (note.replies?.length) box.append(list);
    box.append(input);
    return box;
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
    // What was said to a note, and a reply to it.
    if (mark.kind === 'note') items.push(this.replies(mark));
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
    // Heard from the next turn, not to take the click that opened it; and not at all once it is closed by then.
    let open = true;
    setTimeout(() => open && this.doc.addEventListener('pointerdown', outside, true), 0);
    this.popClose = () => {
      open = false;
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

  /** The parts of the menu: the document, how it is exported, signing it, and the rest. */
  private menuSections(): MenuSection[] {
    const t = this.t;
    // What opens a popover of its own is placed by the button of the menu, the menu being closed by then.
    const by = () => this.viewer!.menuButton.getBoundingClientRect();
    const files = this.options.files !== false;
    const tools: MenuEntry[] = [
      ...(files ? [{ icon: 'layers' as const, label: t.compareWith, hint: t.compareHint, run: () => void this.compareWith() }] : []),
      ...(this.options.recognize ? [{ icon: 'text' as const, label: t.recognize, hint: t.recognizeHint, run: () => this.askLanguages(by()) }] : []),
      ...(this.history.length ? [{ icon: 'undo' as const, label: t.history, hint: fill(t.historyHint, { n: this.history.length }), run: () => this.showHistory(by()) }] : []),
      ...(this.options.menu ?? []).map((own) => ({ icon: own.icon, label: own.label, hint: own.hint, run: own.run })),
    ];
    return [
      {
        id: 'document',
        icon: 'file',
        label: t.menuDocument,
        look: 'tiles',
        entries: [
          ...(files
            ? [
                { icon: 'open' as const, label: t.open, run: () => void this.pick(false) },
                { icon: 'filePlus' as const, label: t.insert, run: () => void this.pick(true) },
              ]
            : []),
          { icon: this.options.onSave ? 'check' : 'download', label: this.options.onSave ? t.save : t.download, run: () => void this.saveOrDownload() },
          { icon: 'print', label: t.print, run: () => void this.viewer?.print() },
        ],
      },
      {
        id: 'export',
        icon: 'download',
        label: t.menuExport,
        intro: t.menuExportText,
        look: 'rows',
        entries: [
          { icon: 'flatten', label: t.downloadFlat, hint: t.downloadFlatHint, run: () => void this.downloadFlat() },
          { icon: 'download', label: t.downloadSmaller, hint: t.downloadSmallerHint, run: () => void this.downloadSmaller() },
          { icon: 'check', label: t.downloadPdfA, hint: t.downloadPdfAHint, run: () => void this.downloadAs({ pdfa: true }) },
          { icon: 'lock', label: t.downloadProtected, hint: t.downloadProtectedHint, run: () => void this.downloadProtected() },
        ],
      },
      {
        id: 'sign',
        icon: 'signature',
        label: t.menuSign,
        intro: t.menuSignText,
        look: 'rows',
        entries: [{ icon: 'signature', label: t.signDigitally, hint: t.signDigitallyHint, run: () => void this.signDigitally() }],
      },
      ...(tools.length ? [{ id: 'tools', icon: 'tools' as const, label: t.menuTools, look: 'rows' as const, entries: tools }] : []),
    ];
  }

  private async downloadFlat() {
    await this.saveOrDownload(true);
  }

  /** The PDF downloaded as asked (PDF/A…), or what kept it from it said. */
  private async downloadAs(options: SaveOptions) {
    const pdf = this.current;
    if (!pdf) return;
    try {
      this.give(await savePdf(pdf, { font: this.options.font, ...options }), pdf.name);
    } catch (error) {
      this.toast(error instanceof Error ? error.message : String(error));
    }
  }

  /** The PDF downloaded smaller, and how much. */
  private async downloadSmaller() {
    const pdf = this.current;
    if (!pdf) return;
    const size = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
    try {
      const before = (await savePdf(pdf, { font: this.options.font, incremental: false })).length;
      const bytes = await savePdf(pdf, { font: this.options.font, optimize: true });
      this.give(bytes, pdf.name);
      this.toast(fill(this.t.madeSmaller, { before: size(before), after: size(Math.min(before, bytes.length)) }));
    } catch (error) {
      this.toast(error instanceof Error ? error.message : String(error));
    }
  }

  /** The PDF downloaded encrypted, opened only by a password asked for. */
  private async downloadProtected() {
    const pdf = this.current;
    if (!pdf || !this.viewer) return;
    const asked = await askProtection(this.viewer.root, this.t);
    if (!asked) return;
    try {
      this.give(await savePdf(pdf, { font: this.options.font, protect: asked }), pdf.name);
    } catch (error) {
      this.toast(error instanceof Error ? error.message : String(error));
    }
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
    if (this.pagesLocked) return;
    const ids = this.targetPages();
    if (ids.length && this.current) this.commit(rotatePages(this.current, ids, by));
  }

  private deletePages() {
    if (this.pagesLocked) return;
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
    if (this.pagesLocked) return;
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
      } else if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && event.altKey && !this.pagesLocked) {
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
      } else if ((event.key === 'Delete' || event.key === 'Backspace') && !this.pagesLocked) {
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
      void this.addFiles([...((event as DragEvent).dataTransfer?.files ?? [])]);
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
  async addFiles(files: File[]): Promise<void> {
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
        } else await this.addFiles(files);
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
      void this.addFiles([...(event.dataTransfer?.files ?? [])]);
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
    if ((event.key === 'Delete' || event.key === 'Backspace') && this.tool === 'field' && this.chosenField) {
      event.preventDefault();
      this.removeChosenField();
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

  /** Says something to the person, as the editor says what it did. */
  notify(text: string): void {
    this.toast(text);
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
