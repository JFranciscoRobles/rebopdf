// @vitest-environment happy-dom
import { samplePdf } from '@rebopdf/core';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { PdfEditor, PdfViewer } from '../src';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('the components', () => {
  it('show the PDF given, and the one given after', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const [en, es] = [await samplePdf('en'), await samplePdf('es')];
    await act(async () => root.render(createElement(PdfViewer, { pdf: en })));
    expect(host.querySelector('.rp-title')?.textContent).toBe('Service agreement');
    await act(async () => root.render(createElement(PdfViewer, { pdf: es })));
    expect(host.querySelector('.rp-title')?.textContent).toBe('Contrato de servicios');
    await act(async () => root.unmount());
    expect(host.querySelector('.rp-root')).toBeNull();
  });

  it('give the editor, which tells its changes', async () => {
    const host = document.createElement('div');
    const root = createRoot(host);
    const pdf = await samplePdf('en');
    let ref: import('@rebopdf/editor').Editor | undefined;
    await act(async () =>
      root.render(
        createElement(PdfEditor, {
          pdf,
          ref: (e) => {
            ref = e ?? undefined;
          },
        }),
      ),
    );
    expect(ref?.pdf).toBe(pdf);
    expect(host.querySelector('[aria-label="Highlight"]')).not.toBeNull();
    await act(async () => root.unmount());
  });
});
