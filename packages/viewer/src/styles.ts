// The look of the viewer, put in the page once, in the manner of the suite:
// a warm canvas the pages lie on, warm greys, quiet buttons, and one red for
// what is chosen and focused. Every class is under rp-. Colours and the font
// are custom properties on .rp-root, for a page to change with its own CSS;
// the dark ones are used when the system asks for them, or with
// data-theme="dark". The pages themselves stay as the PDF draws them.

const LIGHT = `
  --rp-font: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --rp-canvas: #efede8;
  --rp-bg: #ffffff;
  --rp-chrome: #fbfaf8;
  --rp-raised: #ffffff;
  --rp-border: #e6e3dc;
  --rp-border-strong: #d4d0c7;
  --rp-text: #2f2e2b;
  --rp-muted: #6b6964;
  --rp-hover: #f3f1ec;
  --rp-down: #ebe8e1;
  --rp-pressed: #fdecea;
  --rp-pressed-text: #b42318;
  --rp-accent: #b42318;
  --rp-accent-hover: #912018;
  --rp-accent-text: #ffffff;
  --rp-focus: #b42318;
  --rp-hit: rgba(180, 35, 24, 0.22);
  --rp-hit-current: rgba(180, 35, 24, 0.45);
  --rp-field: rgba(37, 99, 235, 0.08);
  --rp-field-border: rgba(37, 99, 235, 0.45);
  --rp-overlay: rgba(28, 27, 25, 0.32);
  --rp-shadow: 0 1px 4px rgba(47, 46, 43, 0.1), 0 12px 28px rgba(47, 46, 43, 0.14);
  --rp-page-shadow: 0 1px 2px rgba(47, 46, 43, 0.08), 0 8px 24px -12px rgba(47, 46, 43, 0.3);
`;

const DARK = `
  --rp-canvas: #1c1b19;
  --rp-bg: #262523;
  --rp-chrome: #242321;
  --rp-raised: #2c2b28;
  --rp-border: #3d3b37;
  --rp-border-strong: #55524d;
  --rp-text: #ecebe7;
  --rp-muted: #b1ada5;
  --rp-hover: #33312e;
  --rp-down: #403e3a;
  --rp-pressed: #3d1d1a;
  --rp-pressed-text: #fda29b;
  --rp-accent: #f97066;
  --rp-accent-hover: #fda29b;
  --rp-accent-text: #1f0b09;
  --rp-focus: #f97066;
  --rp-hit: rgba(249, 112, 102, 0.3);
  --rp-hit-current: rgba(249, 112, 102, 0.55);
  --rp-field: rgba(96, 165, 250, 0.12);
  --rp-field-border: rgba(96, 165, 250, 0.6);
  --rp-overlay: rgba(0, 0, 0, 0.5);
  --rp-shadow: 0 1px 4px rgba(0, 0, 0, 0.4), 0 8px 24px rgba(0, 0, 0, 0.45);
  --rp-page-shadow: 0 1px 2px rgba(0, 0, 0, 0.4), 0 8px 24px -12px rgba(0, 0, 0, 0.7);
`;

const CSS = `
.rp-root {${LIGHT}
  position: relative; display: flex; flex-direction: column; height: 100%; min-height: 320px; overflow: hidden;
  background: var(--rp-canvas); color: var(--rp-text); font: 14px/1.4 var(--rp-font); color-scheme: light;
  -webkit-font-smoothing: antialiased;
}
.rp-root[data-theme="dark"] {${DARK} color-scheme: dark; }
@media (prefers-color-scheme: dark) { .rp-root:not([data-theme="light"]) {${DARK} color-scheme: dark; } }
.rp-root *, .rp-root *::before, .rp-root *::after { box-sizing: border-box; }
.rp-root [hidden] { display: none !important; }
.rp-root :focus-visible { outline: 2px solid var(--rp-focus); outline-offset: 2px; }
.rp-icon { flex: none; display: block; }

.rp-bar { display: flex; align-items: center; gap: 4px; flex: none; min-height: 48px; padding: 6px 10px; background: var(--rp-chrome); border-bottom: 1px solid var(--rp-border); overflow-x: auto; scrollbar-width: none; }
.rp-bar::-webkit-scrollbar { display: none; }
.rp-group { display: flex; align-items: center; gap: 2px; flex: none; }
.rp-sep { width: 1px; height: 22px; margin: 0 6px; background: var(--rp-border); flex: none; }
.rp-spacer { flex: 1 1 auto; min-width: 8px; }
.rp-title { min-width: 0; max-width: 32ch; padding: 0 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
.rp-button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; flex: none; min-width: 34px; height: 34px; padding: 0 8px; border: 0; border-radius: 8px; background: none; color: var(--rp-text); font: inherit; font-size: 13.5px; cursor: pointer; white-space: nowrap; }
.rp-button:hover { background: var(--rp-hover); }
.rp-button:active { background: var(--rp-down); }
.rp-button[aria-pressed="true"], .rp-button[aria-expanded="true"] { background: var(--rp-pressed); color: var(--rp-pressed-text); }
.rp-button:disabled { opacity: 0.4; cursor: default; background: none; }
.rp-button.rp-primary { background: var(--rp-accent); color: var(--rp-accent-text); padding: 0 12px; font-weight: 600; }
.rp-button.rp-primary:hover { background: var(--rp-accent-hover); }
.rp-input { height: 32px; padding: 0 8px; border: 1px solid var(--rp-border-strong); border-radius: 8px; background: var(--rp-bg); color: var(--rp-text); font: inherit; font-size: 13.5px; }
.rp-input:focus { outline: 2px solid var(--rp-focus); outline-offset: -1px; border-color: transparent; }
.rp-pagebox { display: flex; align-items: center; gap: 6px; color: var(--rp-muted); font-size: 13px; white-space: nowrap; }
.rp-pagebox .rp-input { width: 48px; text-align: center; color: var(--rp-text); }
.rp-zoom { width: auto; max-width: 140px; }

.rp-body { position: relative; display: flex; flex: 1 1 auto; min-height: 0; }
.rp-side { display: flex; flex-direction: column; flex: none; width: 184px; background: var(--rp-chrome); border-right: 1px solid var(--rp-border); min-height: 0; }
.rp-side[hidden] { display: none; }
.rp-side-head { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px 4px; color: var(--rp-muted); font-size: 12px; font-weight: 600; }
.rp-thumbs { flex: 1 1 auto; overflow-y: auto; padding: 8px 12px 16px; list-style: none; margin: 0; }
.rp-thumb { position: relative; display: flex; flex-direction: column; align-items: center; gap: 6px; margin: 0 0 12px; padding: 8px 6px 6px; border-radius: 10px; cursor: pointer; }
.rp-thumb:hover { background: var(--rp-hover); }
.rp-thumb[aria-current="page"] { background: var(--rp-pressed); }
.rp-thumb[aria-current="page"] .rp-thumb-number { color: var(--rp-pressed-text); font-weight: 600; }
.rp-thumb-sheet { position: relative; background: #fff; box-shadow: var(--rp-page-shadow); overflow: hidden; }
.rp-thumb-sheet canvas { display: block; width: 100%; height: 100%; }
.rp-thumb-number { color: var(--rp-muted); font-size: 12px; }

.rp-scroll { position: relative; flex: 1 1 auto; min-width: 0; overflow: auto; outline: none; }
.rp-pages { display: flex; flex-direction: column; align-items: center; gap: 16px; padding: 24px 16px 48px; min-width: min-content; }
.rp-page { position: relative; flex: none; background: #fff; box-shadow: var(--rp-page-shadow); --scale-round-x: 1px; --scale-round-y: 1px; }
.rp-canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.rp-page-state { position: absolute; inset: 0; display: grid; place-items: center; color: #8a877f; font-size: 13px; }
.rp-layer { position: absolute; inset: 0; }
.rp-hits, .rp-marks { pointer-events: none; }
.rp-hit { position: absolute; background: var(--rp-hit); border-radius: 2px; }
.rp-hit-current { background: var(--rp-hit-current); outline: 2px solid var(--rp-accent); }

.rp-mark { position: absolute; }
.rp-mark-highlight { mix-blend-mode: multiply; }
.rp-mark-note { display: grid; place-items: center; padding: 0; border: 0; background: none; pointer-events: auto; cursor: pointer; }
.rp-mark-note svg { width: 100%; height: 100%; filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.25)); }
.rp-mark-text { white-space: pre-wrap; overflow-wrap: break-word; font-family: Helvetica, Arial, sans-serif; line-height: 1.25; }
.rp-mark svg { overflow: visible; }
.rp-mark img { width: 100%; height: 100%; object-fit: contain; }
.rp-tip { position: absolute; z-index: 4; max-width: 260px; padding: 8px 10px; border-radius: 8px; background: var(--rp-raised); color: var(--rp-text); box-shadow: var(--rp-shadow); font-size: 13px; white-space: pre-wrap; pointer-events: none; }

.rp-fields { pointer-events: none; }
.rp-field { position: absolute; pointer-events: auto; margin: 0; padding: 0 4px; border: 1px solid transparent; border-radius: 2px; background: var(--rp-field); color: #1b1b1b; font-family: Helvetica, Arial, sans-serif; color-scheme: light; }
.rp-field:hover { border-color: var(--rp-field-border); }
.rp-field:focus { outline: 2px solid var(--rp-focus); outline-offset: 0; background: #fff; }
.rp-field:disabled, .rp-field[aria-disabled="true"] { background: transparent; cursor: default; }
textarea.rp-field { resize: none; padding-top: 2px; line-height: 1.2; }
select.rp-field { padding: 0 2px; }
.rp-check { display: grid; place-items: center; padding: 0; cursor: pointer; }
.rp-check svg { width: 85%; height: 85%; }
.rp-check[aria-checked="false"] svg { visibility: hidden; }
.rp-check.rp-radio { border-radius: 50%; }

.rp-find { position: absolute; top: 8px; right: 16px; z-index: 5; display: flex; align-items: center; gap: 4px; padding: 6px; border: 1px solid var(--rp-border); border-radius: 12px; background: var(--rp-raised); box-shadow: var(--rp-shadow); }
.rp-find[hidden] { display: none; }
.rp-find .rp-input { width: 220px; }
.rp-find-count { min-width: 72px; padding: 0 6px; color: var(--rp-muted); font-size: 12.5px; text-align: center; white-space: nowrap; }
.rp-status { position: absolute; inset: 0; display: grid; place-items: center; color: var(--rp-muted); }
.rp-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }

@media (max-width: 640px) {
  .rp-side { position: absolute; z-index: 6; inset: 0 auto 0 0; box-shadow: var(--rp-shadow); }
  .rp-title, .rp-hide-narrow { display: none; }
  .rp-find { left: 8px; right: 8px; }
  .rp-find .rp-input { flex: 1; width: auto; min-width: 0; }
  .rp-pages { padding: 12px 8px 32px; }
}

/* The text of a page, laid over it to be selected, as PDF.js lays it. */
.rp-root .textLayer { position: absolute; text-align: initial; inset: 0; overflow: clip; opacity: 1; line-height: 1; letter-spacing: normal; word-spacing: normal; text-size-adjust: none; -webkit-text-size-adjust: none; forced-color-adjust: none; transform-origin: 0 0; caret-color: CanvasText; z-index: 0; color-scheme: only light;
  --min-font-size: 1; --text-scale-factor: calc(var(--total-scale-factor) * var(--min-font-size)); --min-font-size-inv: calc(1 / var(--min-font-size)); }
.rp-root .textLayer :is(span, br) { color: transparent; position: absolute; white-space: pre; cursor: text; transform-origin: 0% 0%; user-select: text; -webkit-user-select: text; }
.rp-root .textLayer > :not(.markedContent), .rp-root .textLayer .markedContent span:not(.markedContent) { z-index: 1; --font-height: 0; font-size: calc(var(--text-scale-factor) * var(--font-height)); --scale-x: 1; --rotate: 0deg; transform: rotate(var(--rotate)) scaleX(var(--scale-x)) scale(var(--min-font-size-inv)); }
.rp-root .textLayer .markedContent { display: contents; }
.rp-root .textLayer span[role="img"] { user-select: none; -webkit-user-select: none; cursor: default; }
.rp-root .textLayer ::selection { background: rgba(0, 0, 255, 0.25); background: color-mix(in srgb, AccentColor, transparent 50%); color: transparent; }
.rp-root .textLayer br::selection { background: transparent; }
.rp-root .textLayer .endOfContent { display: block; position: absolute; inset: 100% 0 0; z-index: 0; cursor: default; user-select: none; -webkit-user-select: none; }
.rp-root .textLayer.selecting .endOfContent { top: 0; }
`;

/** Puts the styles in the document, once. */
export function injectViewerStyles(doc: Document = document): void {
  if (doc.querySelector('style[data-rebopdf-viewer]')) return;
  const style = doc.createElement('style');
  style.dataset.rebopdfViewer = '';
  style.textContent = CSS;
  doc.head.append(style);
}
