// What ⌘K finds: every page, its sections, and the packages. Made when the
// site is built; the browser only filters it.

import { outlineOf } from '@/lib/docs';
import { PACKAGES } from '@/lib/home';
import { type Locale, translator } from '@/lib/i18n';
import { PAGES, groupOf, hrefOf } from '@/lib/site';

export interface SearchEntry {
  kind: 'Page' | 'Section' | 'Function' | 'Package';
  title: string;
  /** The page it is on, what it is about, or, for a page, the group of the menu it is in. */
  detail: string;
  href: string;
}

/** What ⌘K finds on the pages of a language: their titles and sections in it, and the addresses of its pages. */
export function searchIndex(locale: Locale): SearchEntry[] {
  const t = translator(locale);
  const entries: SearchEntry[] = [];
  for (const page of PAGES) {
    const href = hrefOf(page.slug);
    const group = groupOf(page.slug);
    entries.push({ kind: 'Page', title: t(page.title), detail: group ? t(group.title) : '', href });
    for (const heading of outlineOf(page.slug, locale)) entries.push({ kind: 'Section', title: heading.text, detail: t(page.title), href: `${href}#${heading.id}` });
  }
  for (const pkg of PACKAGES) entries.push({ kind: 'Package', title: pkg.name, detail: t(pkg.what), href: hrefOf('getting-started') });
  return entries;
}
