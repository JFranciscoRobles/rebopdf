// What the landing page says: one place for the version, the packages and the
// features, so the badge, the install picker and the table change together.

import { version } from '../package.json';
import type { L } from './i18n';

/** The version every package is at; the site moves with them. */
export const VERSION = version;

/** The six pastel pairs, background and text, that take turns on tags, icons and packages. */
export type Pastel = 'blue' | 'yellow' | 'green' | 'pink' | 'purple' | 'orange';
export const PASTELS: Pastel[] = ['pink', 'yellow', 'blue', 'green', 'purple', 'orange'];
/** Whole class names, so Tailwind finds them. */
export const PASTEL_CLASS: Record<Pastel, string> = {
  blue: 'bg-pastel-blue text-pastel-blue-fg',
  yellow: 'bg-pastel-yellow text-pastel-yellow-fg',
  green: 'bg-pastel-green text-pastel-green-fg',
  pink: 'bg-pastel-pink text-pastel-pink-fg',
  purple: 'bg-pastel-purple text-pastel-purple-fg',
  orange: 'bg-pastel-orange text-pastel-orange-fg',
};
export const pastelAt = (i: number) => PASTELS[i % PASTELS.length];

export const TAGS: L[] = [
  { en: 'Any PDF', es: 'Cualquier PDF' },
  { en: 'Thumbnails and zoom', es: 'Miniaturas y zoom' },
  { en: 'Search without accents', es: 'Búsqueda sin acentos' },
  { en: 'Links and contents', es: 'Enlaces e índice' },
  { en: 'Fill forms', es: 'Rellenar formularios' },
  { en: 'Make forms', es: 'Crear formularios' },
  { en: 'Highlights and notes', es: 'Resaltados y notas' },
  { en: 'Draw and write', es: 'Dibujar y escribir' },
  { en: 'Signatures', es: 'Firmas' },
  { en: 'Digital signatures', es: 'Firmas digitales' },
  { en: 'Black out for good', es: 'Tachar para siempre' },
  { en: 'Turn, move, join pages', es: 'Girar, mover, unir páginas' },
  { en: 'Compare versions', es: 'Comparar versiones' },
  { en: 'Text of scans (OCR)', es: 'Texto de escaneos (OCR)' },
  { en: 'Light & dark', es: 'Claro y oscuro' },
  { en: 'English & Spanish', es: 'Inglés y español' },
  { en: 'Real-time collaboration', es: 'Colaboración en tiempo real' },
  { en: 'React', es: 'React' },
  { en: 'MCP for AI assistants', es: 'MCP para asistentes de IA' },
];

export interface Package {
  name: string;
  what: L;
  tag: L;
  color: Pastel;
}

/** In the order of the table; the install picker shows them in this order too. */
export const PACKAGES: Package[] = [
  {
    name: '@rebopdf/react',
    what: {
      en: 'The viewer and the editor as React components (PdfViewer, PdfEditor), and usePdf to open a PDF.',
      es: 'El visor y el editor como componentes de React (PdfViewer, PdfEditor), y usePdf para abrir un PDF.',
    },
    tag: { en: 'Browser, SSR-safe', es: 'Navegador, seguro en SSR' },
    color: 'blue',
  },
  {
    name: '@rebopdf/editor',
    what: {
      en: 'The editor for any page, without a framework: highlights, notes, signatures, forms, pages, blacking out, comparing.',
      es: 'El editor para cualquier página, sin framework: resaltados, notas, firmas, formularios, páginas, tachados, comparación.',
    },
    tag: { en: 'Browser', es: 'Navegador' },
    color: 'pink',
  },
  {
    name: '@rebopdf/viewer',
    what: {
      en: 'The viewer alone: pages, thumbnails, contents, links, search and forms to fill.',
      es: 'El visor solo: páginas, miniaturas, índice, enlaces, búsqueda y formularios para rellenar.',
    },
    tag: { en: 'Browser', es: 'Navegador' },
    color: 'green',
  },
  {
    name: '@rebopdf/core',
    what: {
      en: 'The engine: a PDF opened, changed, signed, compared and saved, its text read and searched. No DOM.',
      es: 'El motor: un PDF abierto, cambiado, firmado, comparado y guardado, su texto leído y buscado. Sin DOM.',
    },
    tag: { en: 'Browser, Node', es: 'Navegador, Node' },
    color: 'yellow',
  },
  {
    name: '@rebopdf/mcp',
    what: {
      en: 'An MCP server for Claude and other assistants to read, fill, mark, black out, sign and compare PDF files.',
      es: 'Un servidor MCP para que Claude y otros asistentes lean, rellenen, marquen, tachen, firmen y comparen PDF.',
    },
    tag: { en: 'Node', es: 'Node' },
    color: 'purple',
  },
  {
    name: '@rebopdf/collab',
    what: {
      en: 'Several people on one PDF at once: the room server and its client, marks, notes and fields as they are made.',
      es: 'Varias personas en un PDF a la vez: el servidor de salas y su cliente, marcas, notas y campos al momento.',
    },
    tag: { en: 'Node + browser', es: 'Node + navegador' },
    color: 'orange',
  },
  {
    name: '@rebopdf/ocr',
    what: {
      en: 'The text of scanned pages recognized with Tesseract, to be found, selected and blacked out.',
      es: 'El texto de las páginas escaneadas reconocido con Tesseract, para buscarlo, seleccionarlo y tacharlo.',
    },
    tag: { en: 'Browser, Node', es: 'Navegador, Node' },
    color: 'blue',
  },
];
export const INSTALL_ORDER = PACKAGES.map((pkg) => pkg.name);

/** The project in four numbers. */
export const METRICS: { value: string; label: L; note: L }[] = [
  { value: '0', label: { en: 'Bytes sent anywhere', es: 'Bytes enviados a otro lado' }, note: { en: 'The PDF stays in the browser', es: 'El PDF no sale del navegador' } },
  { value: '6', label: { en: 'Kinds of mark', es: 'Tipos de marca' }, note: { en: 'Highlights to blacking out', es: 'De resaltados a tachados' } },
  { value: '29', label: { en: 'Tools for assistants', es: 'Herramientas para asistentes' }, note: { en: 'An MCP server', es: 'Un servidor MCP' } },
  { value: '300', label: { en: 'Pages opened in a second', es: 'Páginas abiertas en un segundo' }, note: { en: 'Drawn as they come into view', es: 'Dibujadas al entrar en vista' } },
];

/** Each feature: its title, a line or two on it, and the path of its icon on a 20 grid. */
export const FEATURES: [L, L, string][] = [
  [
    { en: 'Read any PDF', es: 'Lee cualquier PDF' },
    {
      en: 'Pages drawn as they come into view, thumbnails, the table of contents, links that lead where they lead, and search that finds “accion” in “Acción”.',
      es: 'Páginas dibujadas al entrar en vista, miniaturas, el índice, enlaces que llevan a su lugar, y una búsqueda que encuentra «accion» en «Acción».',
    },
    'M5.25 2.75h6.25l3.25 3.25v11.25h-9.5zM11.5 2.75V6h3.25M7.75 10h4.5M7.75 13h4.5',
  ],
  [
    { en: 'Forms, filled and made', es: 'Formularios, rellenados y creados' },
    {
      en: 'Fill the fields a PDF has, or draw new ones on a PDF that has none, or let them be found: every “Name: ______” a field.',
      es: 'Rellena los campos de un PDF, o dibuja nuevos en uno que no tiene, o deja que se encuentren solos: cada «Nombre: ______» un campo.',
    },
    'M3.25 4.25h13.5v4H3.25zM3.25 11.75h13.5v4H3.25zM6 6.25h4M6 13.75h2.5',
  ],
  [
    { en: 'Highlight, note, sign', es: 'Resalta, anota, firma' },
    {
      en: 'Highlights, notes, ink, text and signatures (drawn, typed or a picture), saved as annotations any reader shows; those a PDF came with, changed too.',
      es: 'Resaltados, notas, trazos, texto y firmas (dibujadas, escritas o en imagen), guardados como anotaciones que cualquier lector muestra; las que el PDF ya traía, editables también.',
    },
    'M3.5 14.5c2 0 3-7 5-7s-1 6.5 1.25 6.5 2-3 3.25-3 .75 2.5 2.5 2.5M3.5 17.25h13',
  ],
  [
    { en: 'Digital signatures', es: 'Firmas digitales' },
    {
      en: 'Sign with your certificate (.p12, or .cer and .key as e.firma), as Acrobat checks it. Signed PDFs are saved after their signature, which still holds.',
      es: 'Firma con tu certificado (.p12, o .cer y .key como la e.firma), como Acrobat lo verifica. Los PDF firmados se guardan después de su firma, que sigue valiendo.',
    },
    'M10 2.75l6 2.5v4.5c0 3.75-2.5 6.5-6 7.5-3.5-1-6-3.75-6-7.5v-4.5zM7.25 10l2 2 3.5-3.75',
  ],
  [
    { en: 'Black out, for good', es: 'Tacha, para siempre' },
    {
      en: 'What is blacked out is taken out of the file, not only covered: the page saved as a picture with the boxes burnt in, its other text kept to find.',
      es: 'Lo tachado sale del archivo, no solo se cubre: la página se guarda como imagen con los recuadros quemados, y su otro texto se conserva para buscarlo.',
    },
    'M3.25 7.25h13.5v5.5H3.25zM6 10h8',
  ],
  [
    { en: 'Pages in order', es: 'Páginas en orden' },
    {
      en: 'Turn, move, delete and take out pages, put in blank ones, join PDFs by dropping them, and compare two versions word by word.',
      es: 'Gira, mueve, borra y extrae páginas, añade en blanco, une PDF soltándolos, y compara dos versiones palabra por palabra.',
    },
    'M5.25 3.25h7l2.5 2.5v11h-9.5zM8 9.5h4M10 7.5v4',
  ],
  [
    { en: 'Together, live', es: 'En equipo, en vivo' },
    {
      en: 'Several people on one PDF: each one’s notes, highlights and what they fill in seen by the others as they make them, and who is on which page.',
      es: 'Varias personas en un PDF: las notas, resaltados y lo que rellena cada quien, vistos por los demás al momento, y quién está en qué página.',
    },
    'M7 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM3 16c0-2.5 2-4 4-4s4 1.5 4 4M13.5 9a2 2 0 1 0 0-4M14 12c1.8.3 3 1.7 3 4',
  ],
  [
    { en: 'AI assistants', es: 'Asistentes de IA' },
    {
      en: 'An MCP server with 29 tools: read and search PDFs, fill forms, highlight, black out, sign digitally, compare versions, read scans.',
      es: 'Un servidor MCP con 29 herramientas: leer y buscar PDF, rellenar formularios, resaltar, tachar, firmar digitalmente, comparar versiones, leer escaneos.',
    },
    'M10 3.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM7.5 9h.01M12.5 9h.01M7.5 12.5s1 1 2.5 1 2.5-1 2.5-1',
  ],
];

/** The examples beside "For developers": a name for the tab, the language of the code, and the code. */
export const SAMPLES: [L, string, string][] = [
  [
    { en: 'React and Next.js', es: 'React y Next.js' },
    'tsx',
    `'use client';
import { PdfEditor, usePdf } from '@rebopdf/react';

export default function Contract() {
  const { pdf } = usePdf('/contract.pdf');
  return pdf ? (
    <div style={{ height: '100vh' }}>
      <PdfEditor pdf={pdf} locale="es" onSave={(bytes) => upload(bytes)} />
    </div>
  ) : null;
}`,
  ],
  [
    { en: 'Any page', es: 'Cualquier página' },
    'ts',
    `import { openPdf } from '@rebopdf/core';
import { mountEditor } from '@rebopdf/editor';

const bytes = new Uint8Array(await (await fetch('/contract.pdf')).arrayBuffer());
const editor = mountEditor(document.querySelector('#pdf')!, {
  pdf: await openPdf(bytes, { name: 'contract.pdf' }),
  onSave: (bytes) => upload(bytes),
});`,
  ],
  [
    { en: 'On a server', es: 'En un servidor' },
    'ts',
    `import { openPdf, savePdf, setField, signPdf } from '@rebopdf/core';

let pdf = await openPdf(await readFile('form.pdf'));
pdf = setField(pdf, 'client.name', 'Ana García');
const signed = await signPdf(pdf, { p12, password, reason: 'Agreed' });
await writeFile('signed.pdf', signed);`,
  ],
  [
    { en: 'AI assistants', es: 'Asistentes de IA' },
    'json',
    `{
  "mcpServers": {
    "rebopdf": {
      "command": "npx",
      "args": ["@rebopdf/mcp", "--root", "~/Documents"]
    }
  }
}`,
  ],
];
