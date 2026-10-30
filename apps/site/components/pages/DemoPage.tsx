import type { Metadata } from 'next';
import { DemoApp } from '@/components/DemoApp';
import { type Locale, translator } from '@/lib/i18n';
import { setPageLocale } from '@/lib/locale';
import { pageMetadata } from '@/lib/seo';

export function demoMetadata(locale: Locale): Metadata {
  const t = translator(locale);
  return pageMetadata({
    locale,
    path: '/demo/',
    title: 'Demo',
    description: t({
      en: 'ReboPDF on the whole window: fill, highlight, note, sign, black out and put in order a PDF, or one of yours. Nothing leaves the browser.',
      es: 'ReboPDF en toda la ventana: rellena, resalta, anota, firma, tacha y ordena un PDF, o uno tuyo. Nada sale del navegador.',
    }),
  });
}

/** The PDF on the whole window, under the bar of the demo: no header, no footer. */
export function DemoPage({ locale }: { locale: Locale }) {
  setPageLocale(locale);
  return (
    <main>
      <DemoApp />
    </main>
  );
}
