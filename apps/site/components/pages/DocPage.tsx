import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { OnThisPage } from '@/components/docs/OnThisPage';
import { PageFooter } from '@/components/docs/PageFooter';
import { loadDoc } from '@/lib/docs';
import { type Locale, translator } from '@/lib/i18n';
import { setPageLocale } from '@/lib/locale';
import { pageMetadata } from '@/lib/seo';
import { PAGES, REPO, groupOf, hrefOf } from '@/lib/site';

/** The slug of a page from the segments of its address: none is the first page. */
export const slugOf = (slug?: string[]) => (slug?.length ? slug.join('/') : 'index');

/** Every page of the documentation, for each language to make. */
export function docParams() {
  return PAGES.map((page) => ({ slug: page.slug === 'index' ? [] : [page.slug] }));
}

export async function docMetadata(slug: string, locale: Locale): Promise<Metadata> {
  if (!PAGES.some((page) => page.slug === slug)) return {};
  const { title, description } = await loadDoc(slug, locale);
  return pageMetadata({ locale, path: hrefOf(slug), title, description });
}

/** A page of the documentation, in a language: its title, its sections, and the pages before and after it. */
export async function DocPage({ slug, locale }: { slug: string; locale: Locale }) {
  setPageLocale(locale);
  const t = translator(locale);
  const at = PAGES.findIndex((page) => page.slug === slug);
  if (at < 0) notFound();
  const doc = await loadDoc(slug, locale);
  const edit = `${REPO}/edit/main/apps/site/content/docs/${locale === 'en' ? '' : `${locale}/`}${slug}.md`;
  const group = groupOf(slug);

  return (
    <div className="flex gap-12">
      <main id="top" className="flex min-w-0 flex-1 flex-col pb-24 pt-9">
        <p className="m-0 text-[13px] text-muted">
          {group && t(group.title)} <span aria-hidden="true">/</span> <span className="text-ink">{t(PAGES[at].title)}</span>
        </p>
        <h1 className="mb-7 mt-3 font-display text-[clamp(36px,4vw,48px)] font-extrabold leading-[1.08] tracking-[-0.03em]">{doc.title}</h1>
        <article className="doc" dangerouslySetInnerHTML={{ __html: doc.html }} />
        <PageFooter previous={PAGES[at - 1]} next={PAGES[at + 1]} edit={edit} />
      </main>
      <OnThisPage headings={doc.headings} />
    </div>
  );
}
