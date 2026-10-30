// The dialog a PDF is downloaded with a password from: the password, twice,
// and what may be done with it opened: printed, copied, changed.

import type { Permissions } from '@rebopdf/core';
import type { EditorStrings } from './i18n';

export interface Protection {
  password: string;
  permissions: Permissions;
}

/** Asks for a password and what it lets; nothing when the dialog is closed without one. */
export function askProtection(host: HTMLElement, t: EditorStrings): Promise<Protection | null> {
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
  const box = (text: string, checked: boolean) => {
    const input = el('input');
    input.type = 'checkbox';
    input.checked = checked;
    const label = el('label', 'rp-dialog-check');
    label.append(input, el('span', '', text));
    return { input, label };
  };

  return new Promise((resolve) => {
    const back = el('div', 'rp-dialog-back');
    const dialog = el('div', 'rp-dialog');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    const title = el('h2', '', t.protectTitle);
    title.id = `rp-protect-${Math.random().toString(36).slice(2)}`;
    dialog.setAttribute('aria-labelledby', title.id);
    const hint = el('p', 'rp-pop-info', t.protectHint);
    const password = el('input', 'rp-input');
    password.type = 'password';
    password.autocomplete = 'new-password';
    const again = el('input', 'rp-input');
    again.type = 'password';
    again.autocomplete = 'new-password';
    const printing = box(t.allowPrinting, true);
    const copying = box(t.allowCopying, true);
    const changing = box(t.allowChanging, true);
    const problem = el('p', 'rp-dialog-problem');
    problem.setAttribute('role', 'alert');
    const cancel = el('button', 'rp-button', t.cancel);
    cancel.type = 'button';
    const done = el('button', 'rp-button rp-primary', t.protectNow);
    done.type = 'button';
    const actions = el('div', 'rp-dialog-actions');
    actions.append(cancel, done);
    dialog.append(title, hint, labelled(t.protectPassword, password), labelled(t.protectAgain, again), printing.label, copying.label, changing.label, problem, actions);
    back.append(dialog);
    host.append(back);

    const close = (value: Protection | null) => {
      back.remove();
      opener?.focus();
      resolve(value);
    };
    cancel.addEventListener('click', () => close(null));
    dialog.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        close(null);
      } else if (event.key === 'Enter' && event.target instanceof HTMLInputElement && event.target.type === 'password') done.click();
    });
    done.addEventListener('click', () => {
      if (!password.value) problem.textContent = t.protectEmpty;
      else if (password.value !== again.value) problem.textContent = t.protectMismatch;
      else {
        const changes = changing.input.checked;
        close({
          password: password.value,
          permissions: { printing: printing.input.checked, copying: copying.input.checked, modifying: changes, annotating: changes, fillingForms: changes, documentAssembly: changes },
        });
      }
    });
    password.focus();
  });
}
