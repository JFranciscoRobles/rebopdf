// What the viewer says, in English and Spanish.

const en = {
  viewer: 'PDF viewer',
  pages: 'Pages',
  showPages: 'Show pages',
  hidePages: 'Hide pages',
  page: 'Page',
  pageOf: 'of {n}',
  pageNumber: 'Page number',
  pageLabel: 'Page {n}',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  zoom: 'Zoom',
  fitWidth: 'Fit width',
  fitPage: 'Fit page',
  automatic: 'Automatic',
  search: 'Search',
  searchPlaceholder: 'Find in the document',
  previous: 'Previous result',
  next: 'Next result',
  close: 'Close',
  noResults: 'No results',
  results: '{i} of {n}',
  download: 'Download',
  print: 'Print',
  loading: 'Loading the PDF…',
  failed: 'This page could not be drawn.',
  note: 'Note',
  signature: 'Signature',
};

export type Strings = typeof en;

const es: Strings = {
  viewer: 'Visor de PDF',
  pages: 'Páginas',
  showPages: 'Mostrar páginas',
  hidePages: 'Ocultar páginas',
  page: 'Página',
  pageOf: 'de {n}',
  pageNumber: 'Número de página',
  pageLabel: 'Página {n}',
  zoomIn: 'Acercar',
  zoomOut: 'Alejar',
  zoom: 'Zoom',
  fitWidth: 'Ajustar al ancho',
  fitPage: 'Página completa',
  automatic: 'Automático',
  search: 'Buscar',
  searchPlaceholder: 'Buscar en el documento',
  previous: 'Resultado anterior',
  next: 'Resultado siguiente',
  close: 'Cerrar',
  noResults: 'Sin resultados',
  results: '{i} de {n}',
  download: 'Descargar',
  print: 'Imprimir',
  loading: 'Cargando el PDF…',
  failed: 'Esta página no se pudo dibujar.',
  note: 'Nota',
  signature: 'Firma',
};

export const STRINGS = { en, es };
export type Locale = keyof typeof STRINGS;

/** The strings of a locale: Spanish for any "es", English for the rest. */
export const stringsFor = (locale = 'en'): Strings => (locale.toLowerCase().startsWith('es') ? es : en);

/** Puts the values in: "{n} pages" with { n: 3 }. */
export const fill = (text: string, values: Record<string, string | number>) => text.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? ''));
