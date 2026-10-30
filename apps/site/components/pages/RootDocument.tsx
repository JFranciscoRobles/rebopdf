import type { Metadata, Viewport } from 'next';
import { Caveat, Inter, JetBrains_Mono, Plus_Jakarta_Sans } from 'next/font/google';
import type { ReactNode } from 'react';
import { LocaleProvider } from '@/components/i18n';
import { LANGUAGES, type Locale, translator } from '@/lib/i18n';
import { SITE } from '@/lib/site';
import '../../app/globals.css';

// The fonts of the landing page, as CSS variables: `globals.css` turns them into
// `font-display`, `font-text`, `font-code` and `font-hand`.
const jakarta = Plus_Jakarta_Sans({ subsets: ['latin'], weight: ['700', '800'], variable: '--font-jakarta' });
const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const jetbrains = JetBrains_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-jetbrains' });
const caveat = Caveat({ subsets: ['latin'], weight: '600', variable: '--font-caveat' });

/** What every page of a language has: its title template, its description, and where the site is. */
export function rootMetadata(locale: Locale): Metadata {
  const t = translator(locale);
  return {
    metadataBase: new URL(SITE),
    title: {
      default: t({ en: 'ReboPDF: PDFs you read, fill, sign and edit inside your app', es: 'ReboPDF: PDF que lees, rellenas, firmas y editas dentro de tu aplicación' }),
      template: '%s · ReboPDF',
    },
    description: t({
      en: 'PDFs in the browser and in your app: read, search, fill and make forms, annotate, sign with a certificate, black out for good, put pages in order, compare versions, read scans, work together, and an MCP server for AI assistants. Open source.',
      es: 'PDF en el navegador y en tu aplicación: lee, busca, rellena y crea formularios, anota, firma con certificado, tacha para siempre, ordena páginas, compara versiones, lee escaneos, trabaja en equipo, y un servidor MCP para asistentes de IA. Código abierto.',
    }),
    applicationName: 'ReboPDF',
    keywords: t({
      en: ['pdf', 'pdf editor', 'pdf viewer', 'react pdf', 'fill pdf forms', 'digital signature', 'redaction', 'ocr', 'open source'],
      es: ['pdf', 'editor de pdf', 'visor de pdf', 'pdf react', 'rellenar formularios pdf', 'firma digital', 'e.firma', 'tachado', 'ocr', 'código abierto'],
    }),
    icons: { icon: '/logo.svg' },
    openGraph: { type: 'website', siteName: 'ReboPDF', url: SITE, locale: LANGUAGES[locale].og },
    formatDetection: { telephone: false },
  };
}
export const viewport: Viewport = { themeColor: '#c2255c' };

/**
 * What every page has: the document in its language. The header and the
 * footer of the site are in the frame of the documentation and in the landing
 * page itself: a demo takes the whole window, and has neither.
 */
export function RootDocument({ locale, children }: { locale: Locale; children: ReactNode }) {
  return (
    <html lang={LANGUAGES[locale].tag} className={`${jakarta.variable} ${inter.variable} ${jetbrains.variable} ${caveat.variable}`}>
      <body className="font-sans antialiased">
        <LocaleProvider locale={locale}>{children}</LocaleProvider>
      </body>
    </html>
  );
}
