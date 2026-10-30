// @vitest-environment happy-dom
import { samplePdf } from '@rebopdf/core';
import { describe, expect, it } from 'vitest';
import { mergeLines, mountEditor, normalize } from '../src';

describe('the editor', () => {
  it('is put in the page with its tools, and taken out', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const editor = mountEditor(host, { pdf: await samplePdf('es'), locale: 'es' });
    const labels = [...host.querySelectorAll('button')].map((b) => b.getAttribute('aria-label'));
    expect(labels).toEqual(expect.arrayContaining(['Seleccionar y rellenar', 'Resaltar', 'Nota', 'Dibujar', 'Texto', 'Firmar', 'Deshacer', 'Rehacer', 'Más', 'Eliminar páginas']));
    expect(host.querySelectorAll('.rp-page')).toHaveLength(2);
    expect(host.querySelector<HTMLButtonElement>('[aria-label="Deshacer"]')!.disabled).toBe(true);
    editor.destroy();
    expect(host.children).toHaveLength(0);
  });

  it('asks for a PDF when it has none', () => {
    const host = document.createElement('div');
    mountEditor(host, {});
    expect(host.querySelector('h2')?.textContent).toBe('Open a PDF');
  });
});

describe('a selection', () => {
  it('makes a box a line', () => {
    const rects = mergeLines([
      { x: 10, y: 100, width: 50, height: 12 },
      { x: 60, y: 101, width: 40, height: 12 },
      { x: 10, y: 80, width: 30, height: 12 },
    ]);
    expect(rects).toEqual([
      { x: 10, y: 100, width: 90, height: 13 },
      { x: 10, y: 80, width: 30, height: 12 },
    ]);
  });
});

describe('a signature drawn', () => {
  it('is kept from 0 to 1 in its box, as wide as it was for how tall', () => {
    const made = normalize([
      [
        { x: 10, y: 10 },
        { x: 110, y: 60 },
      ],
    ]);
    expect(made.aspect).toBeCloseTo(106 / 56);
    expect(made.paths![0][0].x).toBeCloseTo(3 / 106, 3);
    expect(made.paths![0][1].y).toBeCloseTo(53 / 56, 3);
  });
});
