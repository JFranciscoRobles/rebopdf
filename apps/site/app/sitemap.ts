import type { MetadataRoute } from 'next';
import { LOCALES, localize } from '@/lib/i18n';
import { languageAlternates } from '@/lib/seo';
import { PAGES, SITE, hrefOf } from '@/lib/site';

export const dynamic = 'force-static';

/** Every page in every language, each with its others. */
export default function sitemap(): MetadataRoute.Sitemap {
  const paths = ['/', '/demo/', ...PAGES.map((page) => hrefOf(page.slug))];
  return paths.flatMap((path) => LOCALES.map((locale) => ({ url: `${SITE}${localize(path, locale)}`, alternates: { languages: languageAlternates(path) } })));
}
