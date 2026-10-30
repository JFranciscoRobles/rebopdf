// ReboPDF on the desktop: each window is a PDF, a file on the disk. Saving
// writes it back to that file (after its signatures, when it is signed, so
// that they still hold); Save As writes it elsewhere. Tauri adds the native
// menu, the dialogs, and the PDFs the system asks to open: the first in a
// window that has none yet, the others each in a window of its own. PDFs
// dropped on a window with one put their pages in it.

import { openPdf, type Pdf, PdfError, setPdfWorker } from '@rebopdf/core';
import { type Editor, mountEditor } from '@rebopdf/editor';
import { recognizeText } from '@rebopdf/ocr';
import { invoke } from '@tauri-apps/api/core';
import { Menu, MenuItem, PredefinedMenuItem, Submenu } from '@tauri-apps/api/menu';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { ask, message, open, save } from '@tauri-apps/plugin-dialog';
import worker from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

setPdfWorker(worker);
const win = getCurrentWebviewWindow();
const IS_MAC = /Mac/.test(navigator.platform);
const host = document.getElementById('app')!;

// --- Language -----------------------------------------------------------------

const LOCALE_KEY = 'pdf.locale';
const keep = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Nowhere to keep it.
  }
};
const kept = (key: string) => {
  try {
    return localStorage.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
};
let locale = kept(LOCALE_KEY) ?? (navigator.language.startsWith('es') ? 'es' : 'en');
const say = (es: string, en: string) => (locale === 'es' ? es : en);

// --- The PDF of the window ------------------------------------------------------

/** The file the PDF is saved to, once it has one. */
let path: string | undefined;
/** Changes not saved yet. */
let dirty = false;
let editor: Editor;

const baseName = (file: string) => file.split(/[\\/]/).pop() ?? file;
const failed = (what: string, error: unknown) => message(`${what}: ${error instanceof Error ? error.message : String(error)}`, { title: 'ReboPDF', kind: 'error' });

let shown = '';
function showTitle(): void {
  const name = path ? baseName(path) : (editor?.pdf?.name ?? 'ReboPDF');
  const next = `${name}${dirty ? (IS_MAC ? ' — ' : ' • ') + say('editado', 'edited') : ''}`;
  if (next === shown) return;
  shown = next;
  document.title = next;
  void win.setTitle(next);
}

/** The editor, mounted again in another language with the same PDF. */
function mount(pdf?: Pdf): void {
  const theme = editor?.viewer?.root.dataset.theme as 'light' | 'dark' | undefined;
  editor?.destroy();
  editor = mountEditor(host, {
    pdf,
    locale,
    theme,
    recognize: recognizeText,
    onChange: () => {
      dirty = true;
      showTitle();
    },
    onSave: (bytes) => saveTo(path, bytes),
  });
  showTitle();
}

/** Writes the bytes of the PDF to its file, or to one the person chooses. */
async function saveTo(target: string | undefined, bytes?: Uint8Array): Promise<void> {
  const to = target ?? (await save({ defaultPath: editor.pdf?.name ?? 'document.pdf', filters: [{ name: 'PDF', extensions: ['pdf'] }] })) ?? undefined;
  if (!to) return;
  try {
    const written = bytes ?? (await editor.save());
    await invoke('write_document', written, { headers: { path: encodeURIComponent(to) } });
    path = to;
    dirty = false;
    showTitle();
  } catch (error) {
    await failed(say('No se pudo guardar', 'Could not save'), error);
  }
}

/** Reads a PDF of the disk, asking for its password when it has one. */
async function read(file: string): Promise<Pdf | undefined> {
  const bytes = new Uint8Array(await invoke<ArrayBuffer>('read_document', { path: file }));
  let password: string | undefined;
  for (;;) {
    try {
      return await openPdf(bytes, { name: baseName(file), password });
    } catch (error) {
      if (error instanceof PdfError && error.code === 'encrypted') {
        const asked = window.prompt(say(`Contraseña de ${baseName(file)}`, `Password for ${baseName(file)}`));
        if (asked) {
          password = asked;
          continue;
        }
        return undefined;
      }
      await failed(say(`No se pudo abrir ${baseName(file)}`, `Could not open ${baseName(file)}`), error);
      return undefined;
    }
  }
}

const pristine = () => !editor.pdf && !dirty;

/** PDFs: the first here when this window has none, the others each in a window of its own. */
async function openPaths(paths: string[]): Promise<void> {
  for (const file of paths) {
    if (file === path) continue;
    if (pristine()) {
      const pdf = await read(file);
      if (!pdf) continue;
      path = file;
      dirty = false;
      editor.setPdf(pdf);
      showTitle();
    } else await invoke('new_window', { path: file });
  }
}

async function openDialog(): Promise<void> {
  const picked = await open({ multiple: true, filters: [{ name: 'PDF', extensions: ['pdf'] }] });
  if (picked) await openPaths(Array.isArray(picked) ? picked : [picked]);
}

// What is not saved asks before the window closes.
void win.onCloseRequested(async (event) => {
  if (!dirty) return;
  const close = await ask(say('Este PDF tiene cambios sin guardar. ¿Cerrar de todos modos?', 'This PDF has changes not saved. Close anyway?'), {
    title: 'ReboPDF',
    kind: 'warning',
    okLabel: say('Cerrar sin guardar', 'Close without saving'),
    cancelLabel: say('Cancelar', 'Cancel'),
  });
  if (!close) event.preventDefault();
});

const takeOpened = async () => {
  const paths = await invoke<string[]>('take_opened');
  if (paths.length) await openPaths(paths);
  return paths.length > 0;
};
void win.listen('documents-opened', () => void takeOpened());

// PDFs dropped on the window: opened when it has none, their pages put in when it has one.
void getCurrentWebview().onDragDropEvent(async (event) => {
  if (event.payload.type !== 'drop') return;
  const paths = event.payload.paths.filter((file) => /\.pdf$/i.test(file));
  if (!paths.length) return;
  if (pristine()) return openPaths(paths);
  const files: File[] = [];
  for (const file of paths) files.push(new File([new Uint8Array(await invoke<ArrayBuffer>('read_document', { path: file }))], baseName(file), { type: 'application/pdf' }));
  await editor.addFiles(files);
});

// --- Native menu --------------------------------------------------------------

function setLocale(next: string): void {
  locale = next;
  keep(LOCALE_KEY, next);
  mount(editor.pdf);
  shown = '';
  showTitle();
  void installMenu();
}

async function buildMenu(): Promise<Menu> {
  const item = (id: string, text: string, action: () => unknown, accelerator?: string) => MenuItem.new({ id, text, accelerator, action: () => void action() });
  const separator = () => PredefinedMenuItem.new({ item: 'Separator' });
  const app = IS_MAC
    ? [
        await Submenu.new({
          text: 'ReboPDF',
          items: [
            await PredefinedMenuItem.new({ item: { About: { name: 'ReboPDF', version: '0.2.2' } }, text: say('Acerca de ReboPDF', 'About ReboPDF') }),
            await separator(),
            await PredefinedMenuItem.new({ item: 'Hide', text: say('Ocultar ReboPDF', 'Hide ReboPDF') }),
            await PredefinedMenuItem.new({ item: 'HideOthers', text: say('Ocultar otros', 'Hide Others') }),
            await PredefinedMenuItem.new({ item: 'ShowAll', text: say('Mostrar todo', 'Show All') }),
            await separator(),
            await item('quit', say('Salir de ReboPDF', 'Quit ReboPDF'), () => invoke('quit'), 'CmdOrCtrl+Q'),
          ],
        }),
      ]
    : [];
  const file = await Submenu.new({
    text: say('Archivo', 'File'),
    items: [
      await item('window', say('Ventana nueva', 'New Window'), () => invoke('new_window', { path: null }), 'CmdOrCtrl+N'),
      await item('open', say('Abrir…', 'Open…'), openDialog, 'CmdOrCtrl+O'),
      await separator(),
      await item('save', say('Guardar', 'Save'), () => saveTo(path), 'CmdOrCtrl+S'),
      await item('saveAs', say('Guardar como…', 'Save As…'), () => saveTo(undefined), 'CmdOrCtrl+Shift+S'),
      await item('sign', say('Firmar digitalmente…', 'Sign Digitally…'), () => editor.signDigitally()),
      await separator(),
      await item('close', say('Cerrar ventana', 'Close Window'), () => win.close(), 'CmdOrCtrl+W'),
      ...(IS_MAC ? [] : [await item('quit', say('Salir', 'Quit'), () => invoke('quit'), 'CmdOrCtrl+Q')]),
    ],
  });
  const edit = await Submenu.new({
    text: say('Edición', 'Edit'),
    items: [
      await item('undo', say('Deshacer', 'Undo'), () => editor.undo(), 'CmdOrCtrl+Z'),
      await item('redo', say('Rehacer', 'Redo'), () => editor.redo(), 'CmdOrCtrl+Shift+Z'),
      await separator(),
      await PredefinedMenuItem.new({ item: 'Cut', text: say('Cortar', 'Cut') }),
      await PredefinedMenuItem.new({ item: 'Copy', text: say('Copiar', 'Copy') }),
      await PredefinedMenuItem.new({ item: 'Paste', text: say('Pegar', 'Paste') }),
      await PredefinedMenuItem.new({ item: 'SelectAll', text: say('Seleccionar todo', 'Select All') }),
      await separator(),
      await item('find', say('Buscar…', 'Find…'), () => editor.viewer?.openSearch(), 'CmdOrCtrl+F'),
    ],
  });
  const view = await Submenu.new({
    text: say('Ver', 'View'),
    items: [
      await item('thumbs', say('Páginas', 'Pages'), () => editor.viewer?.toggleThumbnails()),
      await item('fit', say('Ajustar al ancho', 'Fit Width'), () => editor.viewer?.setZoom('fit-width')),
      await item('whole', say('Página completa', 'Fit Page'), () => editor.viewer?.setZoom('fit-page')),
      await separator(),
      await item('light', say('Tema claro', 'Light Theme'), () => editor.viewer?.setTheme('light')),
      await item('dark', say('Tema oscuro', 'Dark Theme'), () => editor.viewer?.setTheme('dark')),
      await item('system', say('Como el sistema', 'As the System'), () => editor.viewer?.setTheme('system')),
      await separator(),
      await item('es', 'Español', () => setLocale('es')),
      await item('en', 'English', () => setLocale('en')),
      ...(IS_MAC ? [await separator(), await PredefinedMenuItem.new({ item: 'Fullscreen', text: say('Pantalla completa', 'Enter Full Screen') })] : []),
    ],
  });
  const window = IS_MAC
    ? [
        await Submenu.new({
          text: say('Ventana', 'Window'),
          items: [await PredefinedMenuItem.new({ item: 'Minimize', text: say('Minimizar', 'Minimize') }), await PredefinedMenuItem.new({ item: 'Maximize', text: 'Zoom' })],
        }),
      ]
    : [];
  return Menu.new({ items: [...app, file, edit, view, ...window] });
}

let menu: Menu | undefined;
async function installMenu(): Promise<void> {
  menu = await buildMenu();
  if (!IS_MAC) await menu.setAsWindowMenu(win);
  else if (await win.isFocused()) await menu.setAsAppMenu();
}
void win.onFocusChanged(({ payload: focused }) => {
  if (focused && IS_MAC) void menu?.setAsAppMenu();
});

// A window opens what the system asked for; with nothing, it asks for a PDF.
mount();
void installMenu();
void takeOpened();
