// Where things are, and the pages of the documentation in the order they are read.

import type { Pastel } from './home';
import type { L } from './i18n';

export const REPO = 'https://github.com/JFranciscoRobles/rebopdf';
export const SITE = 'https://rebopdf.com';
export const NPM = 'https://www.npmjs.com/package/@rebopdf/react';
export const REBODOCS = 'https://rebodocs.com';

export interface NavItem {
  title: L;
  /** The file in `content/docs`, without `.md`; `index` is `/docs/`. */
  slug: string;
}

export const NAV: { title: L; color: Pastel; items: NavItem[] }[] = [
  {
    title: { en: 'Start', es: 'Empezar' },
    color: 'pink',
    items: [
      { title: { en: 'What is ReboPDF', es: 'Qué es ReboPDF' }, slug: 'index' },
      { title: { en: 'Getting started', es: 'Primeros pasos' }, slug: 'getting-started' },
      { title: { en: 'Working in the editor', es: 'Trabajar en el editor' }, slug: 'editing' },
    ],
  },
  {
    title: { en: 'Put it in your app', es: 'Ponlo en tu aplicación' },
    color: 'purple',
    items: [
      { title: { en: 'React components', es: 'Componentes de React' }, slug: 'react' },
      { title: { en: 'Without a framework', es: 'Sin framework' }, slug: 'vanilla' },
      { title: { en: 'Styling and themes', es: 'Estilos y temas' }, slug: 'styling' },
    ],
  },
  {
    title: { en: 'PDFs', es: 'PDF' },
    color: 'blue',
    items: [
      { title: { en: 'Forms', es: 'Formularios' }, slug: 'forms' },
      { title: { en: 'Signatures', es: 'Firmas' }, slug: 'signatures' },
      { title: { en: 'Blacking out', es: 'Tachado' }, slug: 'redaction' },
      { title: { en: 'Scanned pages (OCR)', es: 'Páginas escaneadas (OCR)' }, slug: 'ocr' },
      { title: { en: 'On a server', es: 'En un servidor' }, slug: 'server' },
    ],
  },
  {
    title: { en: 'Together', es: 'En equipo' },
    color: 'green',
    items: [
      { title: { en: 'Collaboration', es: 'Colaboración' }, slug: 'collaboration' },
      { title: { en: 'AI assistants (MCP)', es: 'Asistentes de IA (MCP)' }, slug: 'assistants' },
    ],
  },
  {
    title: { en: 'Reference', es: 'Referencia' },
    color: 'yellow',
    items: [
      { title: { en: 'Engine API', es: 'API del motor' }, slug: 'core-api' },
      { title: { en: 'Editor API', es: 'API del editor' }, slug: 'editor-api' },
      { title: { en: 'How it works', es: 'Cómo funciona' }, slug: 'architecture' },
      { title: { en: 'Status and roadmap', es: 'Estado y hoja de ruta' }, slug: 'status' },
    ],
  },
];

export const PAGES = NAV.flatMap((group) => group.items);
/** The group a page is in, for the line above its title. */
export const groupOf = (slug: string) => NAV.find((group) => group.items.some((item) => item.slug === slug));
export const hrefOf = (slug: string) => (slug === 'index' ? '/docs/' : `/docs/${slug}/`);
