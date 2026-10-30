// The pages of the documentation: Markdown files in `content/docs`, turned
// into HTML when the site is built. Nothing of this runs in the browser.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import MarkdownIt from 'markdown-it';
import anchor from 'markdown-it-anchor';
import { type Highlighter, createHighlighter } from 'shiki';
import { DEFAULT_LOCALE, type Locale } from './i18n';

// Its comments read at 4.5:1 and more on its ground, as the dimmed one's do not.
const THEME = 'github-dark-default';
/** The landing page shows its code on white. */
export const LIGHT_THEME = 'github-light';
const LANGS = ['ts', 'tsx', 'js', 'json', 'bash', 'html', 'css'];

let highlighter: Promise<Highlighter> | undefined;
const shiki = () => (highlighter ??= createHighlighter({ themes: [THEME, LIGHT_THEME], langs: LANGS }));

/** Code as HTML, coloured; as plain text when its language is not one of the few the site writes in. */
export async function highlight(code: string, lang: string, theme = THEME): Promise<string> {
  const lit = await shiki();
  return lit.codeToHtml(code.replace(/\n$/, ''), { lang: LANGS.includes(lang) ? lang : 'text', theme });
}

export interface DocPage {
  title: string;
  description: string;
  html: string;
  /** Its sections, for the box at its top. */
  headings: { id: string; text: string }[];
}

const slugify = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[`@]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** The Markdown of a page in a language: English in `content/docs`, Spanish in `content/docs/es`. */
function sourceOf(slug: string, locale: Locale): string {
  const folder = locale === DEFAULT_LOCALE ? 'content/docs' : `content/docs/${locale}`;
  return readFileSync(path.join(process.cwd(), folder, `${slug}.md`), 'utf8');
}

/** A heading written "## Título {#title}" keeps the id it has in English, so a link to a section works in both languages. */
function fixedIds(source: string): { body: string; ids: Map<string, string> } {
  const ids = new Map<string, string>();
  const body = source.replace(/^(#{2,3} )(.+?) \{#([\w-]+)\}$/gm, (_m, hashes: string, text: string, id: string) => {
    ids.set(text.replace(/`/g, ''), id);
    return hashes + text;
  });
  return { body, ids };
}

const headingsOf = (body: string, ids: Map<string, string>) =>
  [...body.matchAll(/^## (.+)$/gm)].map((match) => {
    const text = match[1].replace(/`/g, '');
    return { id: ids.get(text) ?? slugify(match[1]), text };
  });

async function renderer(ids: Map<string, string>): Promise<InstanceType<typeof MarkdownIt>> {
  const lit = await shiki();
  const md = new MarkdownIt({
    html: true,
    linkify: true,
    highlight: (code, lang) => lit.codeToHtml(code.replace(/\n$/, ''), { lang: LANGS.includes(lang) ? lang : 'text', theme: THEME }),
  }).use(anchor, { slugify: (text) => ids.get(text) ?? slugify(text), level: [2, 3], permalink: anchor.permalink.headerLink() });
  // A table wider than a phone scrolls by itself, and not the page with it.
  md.renderer.rules.table_open = () => '<div class="table"><table>';
  md.renderer.rules.table_close = () => '</table></div>';
  return md;
}

export async function loadDoc(slug: string, locale: Locale = DEFAULT_LOCALE): Promise<DocPage> {
  const { body: source, ids } = fixedIds(sourceOf(slug, locale));
  const md = await renderer(ids);
  const title = /^# (.+)$/m.exec(source)?.[1] ?? slug;
  const body = source.replace(/^# .+\n+/, '');
  // What the page is about: its first paragraph, as plain text.
  const description = (body.split(/\n\s*\n/)[0] ?? '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[`*_]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const html = md.render(body);
  return { title, description, html, headings: headingsOf(body, ids) };
}

/** The sections of every page, for the search box. */
export function outlineOf(slug: string, locale: Locale = DEFAULT_LOCALE): { id: string; text: string }[] {
  const { body, ids } = fixedIds(sourceOf(slug, locale));
  return headingsOf(body, ids);
}
