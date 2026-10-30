// The dialog a PDF is signed digitally from: the files of a certificate (a
// .p12 or .pfx, or a .cer and its .key, as Mexico's e.firma comes), its
// password, why it is signed, and in which signature field, when the PDF
// has some.

import type { SignOptions } from '@rebopdf/core';
import { makeOption } from '@rebopdf/viewer';
import type { EditorStrings } from './i18n';

export type Certificate = Pick<SignOptions, 'p12' | 'certificate' | 'key' | 'password' | 'reason' | 'field'>;

/** Asks for a certificate to sign with; nothing when the dialog is closed without one. */
export function askCertificate(host: HTMLElement, t: EditorStrings, fields: string[]): Promise<Certificate | null> {
  const doc = host.ownerDocument;
  const opener = doc.activeElement as HTMLElement | null;
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') => {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  };
  const labelled = (text: string, control: HTMLElement) => {
    const label = el('label', 'rp-dialog-field');
    label.append(el('span', '', text), control);
    return label;
  };

  return new Promise((resolve) => {
    const back = el('div', 'rp-dialog-back');
    const dialog = el('div', 'rp-dialog');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    const title = el('h2', '', t.signDigitallyTitle);
    title.id = `rp-cert-${Math.random().toString(36).slice(2)}`;
    dialog.setAttribute('aria-labelledby', title.id);
    const hint = el('p', 'rp-pop-info', t.signDigitallyHint);

    const files = el('input');
    files.type = 'file';
    files.multiple = true;
    files.accept = '.p12,.pfx,.cer,.crt,.pem,.key';
    const password = el('input', 'rp-input');
    password.type = 'password';
    password.autocomplete = 'off';
    const reason = el('input', 'rp-input');
    reason.placeholder = t.reasonHint;
    const where = el('select', 'rp-input');
    where.append(makeOption(doc, t.signatureNotSeen, ''));
    for (const name of fields) where.append(makeOption(doc, name));
    if (fields.length) where.value = fields[0];
    const problem = el('p', 'rp-dialog-problem');
    problem.setAttribute('role', 'alert');

    const cancel = el('button', 'rp-button', t.cancel);
    cancel.type = 'button';
    const sign = el('button', 'rp-button rp-primary', t.signNow);
    sign.type = 'button';
    const actions = el('div', 'rp-dialog-actions');
    actions.append(cancel, sign);
    dialog.append(title, hint, labelled(t.certificateFiles, files), labelled(t.certificatePassword, password), labelled(t.reason, reason));
    if (fields.length) dialog.append(labelled(t.signIn, where));
    dialog.append(problem, actions);
    back.append(dialog);
    host.append(back);

    const close = (value: Certificate | null) => {
      back.remove();
      opener?.focus();
      resolve(value);
    };
    cancel.addEventListener('click', () => close(null));
    dialog.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        close(null);
      }
    });
    sign.addEventListener('click', async () => {
      const chosen = [...(files.files ?? [])];
      const read = async (pattern: RegExp) => {
        const file = chosen.find((f) => pattern.test(f.name));
        return file ? new Uint8Array(await file.arrayBuffer()) : undefined;
      };
      const p12 = await read(/\.(p12|pfx)$/i);
      const certificate = await read(/\.(cer|crt|pem)$/i);
      const key = await read(/\.key$/i);
      if (!p12 && !(certificate && key)) {
        problem.textContent = t.certificateMissing;
        return;
      }
      close({ ...(p12 ? { p12 } : { certificate, key }), password: password.value, ...(reason.value.trim() ? { reason: reason.value.trim() } : {}), ...(where.value ? { field: where.value } : {}) });
    });
    files.focus();
  });
}
