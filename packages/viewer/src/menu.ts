// The menu of the PDF, as Rebodocs has the menu of its document: a screen of
// its own over the viewer, opened from the first button of its bar, with its
// parts down one side (the document, what is done with it, the appearance)
// and the one chosen beside them. What is in each part is given by whoever
// opens it, the viewer or the editor: this only lays them out.

import { fill, STRINGS, type Strings } from './i18n';
import { type IconName, icon } from './icons';

/** One thing the menu does. */
export interface MenuEntry {
  icon: IconName;
  label: string;
  /** Said under it, in a part of rows. */
  hint?: string;
  run: () => void;
}

/** A part of the menu: its entries as tiles (a few, each a word) or as rows (each with what it does said). */
export interface MenuSection {
  id: string;
  icon: IconName;
  label: string;
  intro?: string;
  look: 'tiles' | 'rows';
  entries: MenuEntry[];
}

export type Theme = 'light' | 'dark' | undefined;

/** What the menu asks of the viewer. */
export interface MenuHost {
  readonly root: HTMLElement;
  readonly t: Strings;
  name(): string;
  pages(): number;
  sections(): MenuSection[];
  theme(): Theme;
  setTheme(theme: Theme): void;
  /** Given, the menu has the choice of language: what puts the viewer in the one chosen. */
  setLocale?: (locale: 'en' | 'es') => void;
  /** Where the focus goes when it closes. */
  focus(): void;
}

export interface MenuScreen {
  open(): void;
  close(): void;
  isOpen(): boolean;
  destroy(): void;
}

export function createMenuScreen(host: MenuHost): MenuScreen {
  const { t } = host;
  const doc = host.root.ownerDocument;
  const make = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') => {
    const el = doc.createElement(tag);
    if (className) el.className = className;
    if (text) el.textContent = text;
    return el;
  };
  const button = (className: string, ...children: (Node | string)[]) => {
    const b = make('button', className);
    b.type = 'button';
    b.append(...children);
    return b;
  };

  const screen = make('div', 'rp-ms');
  screen.setAttribute('role', 'dialog');
  screen.setAttribute('aria-modal', 'true');
  screen.setAttribute('aria-label', t.menu);
  screen.hidden = true;
  const nav = make('nav', 'rp-ms-nav');
  nav.setAttribute('aria-label', t.menu);
  const back = button('rp-ms-back', icon(doc, 'chevronLeft', 16), t.backToDocument);
  back.addEventListener('click', () => close());
  const list = make('div', 'rp-ms-list');
  list.setAttribute('role', 'tablist');
  list.setAttribute('aria-orientation', 'vertical');
  const navCard = make('div', 'rp-ms-doc');
  nav.append(back, list, navCard);
  const main = make('div', 'rp-ms-main');
  const x = button('rp-ms-x', icon(doc, 'close'));
  x.title = t.close;
  x.setAttribute('aria-label', t.close);
  x.addEventListener('click', () => close());
  screen.append(nav, main);
  host.root.append(screen);

  let tabs: HTMLButtonElement[] = [];
  let panes: HTMLElement[] = [];
  const show = (index: number) => {
    tabs.forEach((tab, i) => {
      tab.setAttribute('aria-selected', String(i === index));
      tab.tabIndex = i === index ? 0 : -1;
    });
    panes.forEach((pane, i) => {
      pane.hidden = i !== index;
    });
  };

  /** The document: its name and how many pages. */
  const card = (into: HTMLElement, withIcon: boolean) => {
    into.replaceChildren();
    if (withIcon) {
      const glyph = make('span', 'rp-ms-icon');
      glyph.append(icon(doc, 'file', 20));
      into.append(glyph);
    }
    const words = make('div');
    const n = host.pages();
    words.append(make('b', '', host.name()), make('small', '', n === 1 ? t.onePage : fill(t.manyPages, { n })));
    into.append(words);
  };

  /** An entry that closes the menu and then does what it says. */
  const entry = (look: MenuSection['look'], { icon: name, label, hint, run }: MenuEntry) => {
    const b =
      look === 'tiles'
        ? button('rp-ms-tile', icon(doc, name, 20), make('span', '', label))
        : (() => {
            const glyph = make('span', 'rp-ms-icon');
            glyph.append(icon(doc, name, 20));
            const words = make('span');
            words.append(make('b', '', label));
            if (hint) words.append(make('small', '', hint));
            return button('rp-ms-row', glyph, words);
          })();
    b.addEventListener('click', () => {
      close();
      run();
    });
    return b;
  };

  const pane = (id: string, name: IconName, label: string, intro: string | undefined, ...content: HTMLElement[]) => {
    const index = tabs.length;
    const tab = button('rp-ms-tab', icon(doc, name, 18), label);
    tab.id = `rp-ms-tab-${id}`;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', `rp-ms-pane-${id}`);
    tab.addEventListener('click', () => show(index));
    list.append(tab);
    tabs.push(tab);
    const node = make('section', 'rp-ms-pane');
    node.id = `rp-ms-pane-${id}`;
    node.setAttribute('role', 'tabpanel');
    node.setAttribute('aria-labelledby', tab.id);
    node.append(make('h2', '', label));
    if (intro) node.append(make('p', '', intro));
    node.append(...content);
    main.append(node);
    panes.push(node);
  };

  /** Lays out the parts as they are now: what the menu offers changes with the document. */
  const build = () => {
    list.replaceChildren();
    main.replaceChildren(x);
    tabs = [];
    panes = [];
    host.sections().forEach((section, i) => {
      const entries = make('div', section.look === 'tiles' ? 'rp-ms-tiles' : 'rp-ms-rows');
      entries.append(...section.entries.map((e) => entry(section.look, e)));
      const head: HTMLElement[] = [];
      if (i === 0) {
        const top = make('div', 'rp-ms-doc');
        card(top, true);
        head.push(top);
      }
      pane(section.id, section.icon, section.label, section.intro, ...head, entries);
    });
    const choices = make('div', 'rp-ms-choices');
    choices.setAttribute('role', 'radiogroup');
    choices.setAttribute('aria-label', t.appearance);
    for (const [value, label] of [
      [undefined, t.themeSystem],
      ['light', t.themeLight],
      ['dark', t.themeDark],
    ] as const) {
      const choice = button('rp-ms-choice', make('span', 'rp-ms-dot'), label);
      choice.setAttribute('role', 'radio');
      choice.setAttribute('aria-checked', String(host.theme() === value));
      choice.addEventListener('click', () => {
        host.setTheme(value);
        for (const c of choices.children) c.setAttribute('aria-checked', String(c === choice));
      });
      choices.append(choice);
    }
    const setLocale = host.setLocale;
    if (setLocale) {
      const languages = make('div', 'rp-ms-choices');
      languages.setAttribute('role', 'radiogroup');
      languages.setAttribute('aria-label', t.language);
      for (const [value, label, lang] of [
        ['es', 'Español', 'es'],
        ['en', 'English', 'en'],
      ] as const) {
        const choice = button('rp-ms-choice', make('span', 'rp-ms-dot'), label);
        choice.lang = lang;
        choice.setAttribute('role', 'radio');
        choice.setAttribute('aria-checked', String(t.language === STRINGS[value].language));
        choice.addEventListener('click', () => {
          if (t.language === STRINGS[value].language) return;
          close();
          setLocale(value);
        });
        languages.append(choice);
      }
      pane('language', 'language', t.language, t.languageText, languages);
    }
    pane('appearance', 'contrast', t.appearance, t.appearanceText, choices);
    card(navCard, false);
  };

  const onKey = (event: KeyboardEvent) => {
    if (screen.hidden) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === 'Tab') {
      // Round the menu: from its last control to its first, and back.
      const stops = [...screen.querySelectorAll<HTMLElement>('button:not([tabindex="-1"]), [tabindex="0"]')].filter((el) => el.offsetParent !== null);
      const at = stops.indexOf(doc.activeElement as HTMLElement);
      const next = event.shiftKey ? (at <= 0 ? stops.at(-1) : undefined) : at === stops.length - 1 || at < 0 ? stops[0] : undefined;
      if (next) {
        event.preventDefault();
        next.focus();
      }
    } else if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && tabs.includes(doc.activeElement as HTMLButtonElement)) {
      event.preventDefault();
      const at = tabs.indexOf(doc.activeElement as HTMLButtonElement);
      const next = (at + (event.key === 'ArrowDown' ? 1 : tabs.length - 1)) % tabs.length;
      show(next);
      tabs[next].focus();
    }
  };
  // On the document: in Safari a click does not give a button the focus, which may stay outside the menu.
  doc.addEventListener('keydown', onKey, true);

  /** What is under the menu, kept from the keyboard and from screen readers while it is open, as under any dialog. */
  let under: HTMLElement[] = [];
  function open(): void {
    build();
    show(0);
    screen.hidden = false;
    under = [...host.root.children].filter((el): el is HTMLElement => el !== screen && el instanceof HTMLElement && !el.inert);
    for (const el of under) el.inert = true;
    tabs[0]?.focus();
  }
  function close(): void {
    if (screen.hidden) return;
    screen.hidden = true;
    for (const el of under) el.inert = false;
    under = [];
    host.focus();
  }
  return {
    open,
    close,
    isOpen: () => !screen.hidden,
    destroy() {
      doc.removeEventListener('keydown', onKey, true);
      screen.remove();
    },
  };
}
