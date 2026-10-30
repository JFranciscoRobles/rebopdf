// A PDF to try things on: a service agreement of two pages, in English or
// Spanish, with a form to fill (text, a choice, a checkbox, a pair of radio
// buttons), clauses to read, highlight and search, and lines to sign on.
// Made here with pdf-lib, the same every time.

import { PDFDocument, type PDFFont, type PDFPage, StandardFonts, rgb } from '@cantoo/pdf-lib';
import { openPdf } from './open';
import { wrap } from './save';
import type { Pdf } from './types';

const TEXT = {
  en: {
    file: 'Service agreement.pdf',
    title: 'Service agreement',
    subtitle: 'Rebo Studio · No. 2026-042',
    intro: 'This agreement is made between Rebo Studio ("the provider") and the client named below, who engages the provider for the design and building of a website, on the terms that follow.',
    client: 'The client',
    name: 'Full name',
    email: 'Email',
    start: 'Start date',
    plan: 'Plan',
    plans: ['Basic', 'Professional', 'Business'],
    billing: 'Billing',
    monthly: 'Monthly',
    yearly: 'Yearly',
    accept: 'I have read and accept the terms of this agreement.',
    clauses: [
      ['1. The work', 'The provider designs and builds the website described in the proposal attached, in three rounds of review. What is asked beyond it is quoted apart before it is done.'],
      ['2. Payment', 'The client pays the fee of the plan chosen, half when this agreement is signed and half on delivery. An invoice not paid within thirty days bears no further work until it is.'],
      ['3. Confidentiality', 'Each party keeps to itself what it learns of the other in the course of the work, during this agreement and for two years after it ends.'],
      ['4. Ownership', 'Once paid in full, the website and its design belong to the client. The provider may show it among its work, unless the client asks it not to.'],
      ['5. Ending', 'Either party may end this agreement with thirty days of notice in writing. The work done until then is paid for at the rates of the plan.'],
    ],
    signHere: 'Signed in agreement',
    clientSign: 'The client',
    providerSign: 'For Rebo Studio',
    page: 'Page',
  },
  es: {
    file: 'Contrato de servicios.pdf',
    title: 'Contrato de servicios',
    subtitle: 'Rebo Studio · N.º 2026-042',
    intro:
      'Este contrato se celebra entre Rebo Studio («el proveedor») y el cliente que se indica abajo, que contrata al proveedor para el diseño y la construcción de un sitio web, en los términos siguientes.',
    client: 'El cliente',
    name: 'Nombre completo',
    email: 'Correo',
    start: 'Fecha de inicio',
    plan: 'Plan',
    plans: ['Básico', 'Profesional', 'Empresa'],
    billing: 'Facturación',
    monthly: 'Mensual',
    yearly: 'Anual',
    accept: 'He leído y acepto los términos de este contrato.',
    clauses: [
      ['1. El trabajo', 'El proveedor diseña y construye el sitio web descrito en la propuesta adjunta, en tres rondas de revisión. Lo que se pida fuera de ella se cotiza aparte antes de hacerse.'],
      [
        '2. Pago',
        'El cliente paga la tarifa del plan elegido, la mitad al firmar este contrato y la mitad a la entrega. Mientras una factura lleve más de treinta días sin pagarse, el trabajo se detiene.',
      ],
      ['3. Confidencialidad', 'Cada parte guarda para sí lo que conozca de la otra durante el trabajo, mientras dure este contrato y dos años después de que termine.'],
      ['4. Propiedad', 'Una vez pagado por completo, el sitio y su diseño pertenecen al cliente. El proveedor puede mostrarlo entre sus trabajos, salvo que el cliente le pida no hacerlo.'],
      [
        '5. Terminación',
        'Cualquiera de las partes puede terminar este contrato avisando por escrito con treinta días de anticipación. El trabajo hecho hasta entonces se paga según las tarifas del plan.',
      ],
    ],
    signHere: 'Firmado de conformidad',
    clientSign: 'El cliente',
    providerSign: 'Por Rebo Studio',
    page: 'Página',
  },
};

const INK = rgb(0.18, 0.18, 0.17);
const MUTED = rgb(0.42, 0.41, 0.39);
const LINE = rgb(0.83, 0.82, 0.78);
const BRAND = rgb(0.706, 0.137, 0.094);
const [WIDTH, HEIGHT] = [595.28, 841.89];
const MARGIN = 64;

/** The bytes of the sample PDF. */
export async function samplePdfBytes(locale: 'en' | 'es' = 'en'): Promise<Uint8Array> {
  const t = TEXT[locale];
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  doc.setTitle(t.title);
  doc.setAuthor('Rebo Studio');
  doc.setProducer('ReboPDF');
  doc.setCreator('ReboPDF');
  const fixed = new Date(Date.UTC(2026, 9, 29));
  doc.setCreationDate(fixed);
  doc.setModificationDate(fixed);
  const form = doc.getForm();

  const paragraph = (page: PDFPage, text: string, y: number, font: PDFFont = regular, size = 10.5) => {
    const lines = wrap(text, WIDTH - MARGIN * 2, (line) => font.widthOfTextAtSize(line, size));
    for (const line of lines) {
      page.drawText(line, { x: MARGIN, y, size, font, color: INK });
      y -= size * 1.5;
    }
    return y;
  };
  const footer = (page: PDFPage, n: number) => {
    page.drawLine({ start: { x: MARGIN, y: 52 }, end: { x: WIDTH - MARGIN, y: 52 }, thickness: 0.6, color: LINE });
    page.drawText(t.subtitle, { x: MARGIN, y: 38, size: 8.5, font: regular, color: MUTED });
    const label = `${t.page} ${n} / 2`;
    page.drawText(label, { x: WIDTH - MARGIN - regular.widthOfTextAtSize(label, 8.5), y: 38, size: 8.5, font: regular, color: MUTED });
  };
  const label = (page: PDFPage, text: string, x: number, y: number) => page.drawText(text, { x, y, size: 8.5, font: bold, color: MUTED });

  // The first page: who signs, and the form.
  const one = doc.addPage([WIDTH, HEIGHT]);
  one.drawRectangle({ x: 0, y: HEIGHT - 8, width: WIDTH, height: 8, color: BRAND });
  one.drawText(t.title, { x: MARGIN, y: HEIGHT - 96, size: 26, font: bold, color: INK });
  one.drawText(t.subtitle, { x: MARGIN, y: HEIGHT - 118, size: 10.5, font: regular, color: BRAND });
  let y = paragraph(one, t.intro, HEIGHT - 160);

  y -= 18;
  one.drawText(t.client, { x: MARGIN, y, size: 13, font: bold, color: INK });
  y -= 30;
  const full = WIDTH - MARGIN * 2;
  const half = (full - 20) / 2;
  const box = (name: string, text: string, x: number, top: number, width: number) => {
    label(one, text.toUpperCase(), x, top);
    const field = form.createTextField(name);
    field.addToPage(one, { x, y: top - 30, width, height: 22, borderWidth: 0.8, borderColor: LINE, backgroundColor: rgb(0.99, 0.99, 0.98), font: regular });
    field.setFontSize(10.5);
    return field;
  };
  box('client.name', t.name, MARGIN, y, full);
  y -= 52;
  box('client.email', t.email, MARGIN, y, half);
  box('start', t.start, MARGIN + half + 20, y, half);
  y -= 52;
  label(one, t.plan.toUpperCase(), MARGIN, y);
  const plan = form.createDropdown('plan');
  plan.addOptions(t.plans);
  plan.addToPage(one, { x: MARGIN, y: y - 30, width: half, height: 22, borderWidth: 0.8, borderColor: LINE, backgroundColor: rgb(0.99, 0.99, 0.98), font: regular });
  plan.setFontSize(10.5);
  label(one, t.billing.toUpperCase(), MARGIN + half + 20, y);
  const billing = form.createRadioGroup('billing');
  [t.monthly, t.yearly].forEach((option, i) => {
    const x = MARGIN + half + 20 + i * 110;
    billing.addOptionToPage(option, one, { x, y: y - 25, width: 13, height: 13, borderWidth: 0.8, borderColor: MUTED });
    one.drawText(option, { x: x + 20, y: y - 22, size: 10.5, font: regular, color: INK });
  });
  y -= 64;
  const accept = form.createCheckBox('accept');
  accept.addToPage(one, { x: MARGIN, y: y - 2, width: 13, height: 13, borderWidth: 0.8, borderColor: MUTED });
  one.drawText(t.accept, { x: MARGIN + 22, y: y + 1, size: 10.5, font: regular, color: INK });

  y -= 40;
  for (const [heading, body] of t.clauses.slice(0, 2)) {
    one.drawText(heading, { x: MARGIN, y, size: 11.5, font: bold, color: INK });
    y = paragraph(one, body, y - 18) - 10;
  }
  footer(one, 1);

  // The second page: the rest of the clauses, and where to sign.
  const two = doc.addPage([WIDTH, HEIGHT]);
  y = HEIGHT - 80;
  for (const [heading, body] of t.clauses.slice(2)) {
    two.drawText(heading, { x: MARGIN, y, size: 11.5, font: bold, color: INK });
    y = paragraph(two, body, y - 18) - 10;
  }
  y -= 30;
  two.drawText(t.signHere, { x: MARGIN, y, size: 13, font: bold, color: INK });
  y -= 110;
  for (const [i, who] of [t.clientSign, t.providerSign].entries()) {
    const x = MARGIN + i * (half + 20);
    two.drawLine({ start: { x, y }, end: { x: x + half, y }, thickness: 0.8, color: INK });
    two.drawText(who, { x, y: y - 16, size: 10, font: regular, color: MUTED });
  }
  footer(two, 2);

  return doc.save();
}

/** The sample PDF, opened. */
export async function samplePdf(locale: 'en' | 'es' = 'en'): Promise<Pdf> {
  return openPdf(await samplePdfBytes(locale), { name: TEXT[locale].file });
}
