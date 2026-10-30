// The languages of the site. English is at the root (/docs/react/); Spanish
// under its code (/es/docs/react/). Every text the site says is written once
// in each, side by side where it is used, so a page changed in one language
// shows what to change in the other: `t({ en: 'Save', es: 'Guardar' })`.

export const LOCALES = ['en', 'es'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';

/** A text, or anything else that changes with the language, in each language of the site. */
export type L<T = string> = Record<Locale, T>;

export const isLocale = (value: unknown): value is Locale => LOCALES.includes(value as Locale);

/** What each language is, as the page, the search engines and the social networks say it. */
export const LANGUAGES: Record<Locale, { tag: string; og: string; name: string; short: string }> = {
  en: { tag: 'en', og: 'en_US', name: 'English', short: 'EN' },
  es: { tag: 'es', og: 'es_ES', name: 'Español', short: 'ES' },
};

/** The address of a page of the site in a language: `/docs/` is `/es/docs/` in Spanish. Addresses of other sites, anchors and files are left as they are. */
export function localize(href: string, locale: Locale): string {
  if (locale === DEFAULT_LOCALE || !href.startsWith('/') || href.startsWith('//')) return href;
  if (/\.(md|txt|xml|svg|png|jpg|zip)$/.test(href.split(/[?#]/)[0])) return href;
  if (isLocale(href.split('/')[1])) return href;
  return `/${locale}${href}`;
}

/** The language of an address of the site, and the address without it. */
export function delocalize(path: string): { locale: Locale; path: string } {
  const first = path.split('/')[1];
  if (isLocale(first) && first !== DEFAULT_LOCALE) return { locale: first, path: path.slice(first.length + 1) || '/' };
  return { locale: DEFAULT_LOCALE, path };
}

/** A function that takes a text in each language and gives the one of `locale`. */
export const translator =
  (locale: Locale) =>
  <T>(text: L<T>): T =>
    text[locale];

/** A number written as the language writes it. */
export const formatNumber = (n: number, locale: Locale) => n.toLocaleString(LANGUAGES[locale].tag);
