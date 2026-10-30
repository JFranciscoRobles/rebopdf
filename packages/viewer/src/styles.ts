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

/* The bar at the foot of the pages: chips that float over them, as Rebodocs has them. */
.rp-stage { position: relative; display: flex; flex: 1 1 auto; min-width: 0; }
.rp-statusbar { position: absolute; z-index: 4; left: 12px; right: 12px; bottom: 14px; display: flex; justify-content: center; align-items: center; gap: 6px; pointer-events: none; }
.rp-chip { display: flex; align-items: center; gap: 2px; min-height: 40px; padding: 3px 6px; border: 1px solid var(--rp-border); border-radius: 999px; background: var(--rp-raised); box-shadow: 0 10px 28px -10px rgba(47, 46, 43, 0.35), 0 1px 3px rgba(47, 46, 43, 0.08); pointer-events: auto; }
.rp-chip .rp-button { min-width: 32px; height: 32px; border-radius: 999px; }
.rp-chip .rp-input { height: 30px; border-radius: 999px; }
.rp-chip.rp-pagebox { padding: 3px 14px 3px 6px; }
.rp-chip .rp-zoom { max-width: none; border-color: transparent; background: none; }
.rp-side { display: flex; flex-direction: column; flex: none; width: 248px; background: var(--rp-chrome); border-right: 1px solid var(--rp-border); min-height: 0; }
.rp-side[hidden] { display: none; }
.rp-side-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; row-gap: 4px; padding: 10px 12px 4px; color: var(--rp-muted); font-size: 12px; font-weight: 600; }
.rp-side-tabs { display: flex; flex: 1 1 100%; gap: 2px; padding: 3px; border-radius: 9px; background: var(--rp-hover); }
.rp-side-tab { flex: 1 1 auto; min-width: 0; height: 28px; padding: 0 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; border: 0; border-radius: 7px; background: none; color: var(--rp-muted); font: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer; }
.rp-side-tab[aria-selected="true"] { background: var(--rp-raised); color: var(--rp-text); box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12); }
.rp-outline { flex: 1 1 auto; overflow-y: auto; padding: 6px 8px 16px; }
.rp-outline ul { list-style: none; margin: 0; padding: 0; }
.rp-outline-row { position: relative; display: flex; align-items: flex-start; gap: 2px; padding-left: calc(var(--depth) * 14px); }
.rp-outline-item { display: flex; align-items: baseline; gap: 8px; flex: 1; min-width: 0; padding: 6px 8px; border: 0; border-radius: 8px; background: none; color: var(--rp-text); font: inherit; font-size: 13px; line-height: 1.35; text-align: left; cursor: pointer; }
.rp-outline-row[data-depth="0"] > .rp-outline-item { font-weight: 600; }
.rp-outline-row:not([data-depth="0"]) > .rp-outline-item { color: var(--rp-muted); }
.rp-outline-title { flex: 1; min-width: 0; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-clamp: 2; overflow: hidden; overflow-wrap: anywhere; }
.rp-outline-page { flex: none; min-width: 2ch; color: var(--rp-muted); font-size: 12px; font-weight: 400; font-variant-numeric: tabular-nums; text-align: right; }
.rp-outline-item:hover { background: var(--rp-hover); color: var(--rp-text); }
.rp-outline-item:disabled { color: var(--rp-muted); cursor: default; background: none; }
.rp-outline-item[aria-current="location"] { background: var(--rp-pressed); color: var(--rp-pressed-text); }
.rp-outline-item[aria-current="location"] .rp-outline-page { color: inherit; }
.rp-outline-item:focus-visible { outline-offset: -2px; }
.rp-outline-toggle { display: grid; place-items: center; flex: none; width: 22px; height: 22px; margin-top: 4px; padding: 0; border: 0; border-radius: 6px; background: none; color: var(--rp-muted); cursor: pointer; }
.rp-outline-toggle:hover { background: var(--rp-hover); color: var(--rp-text); }
.rp-outline-toggle svg { transition: transform .12s; }
.rp-outline-toggle[aria-expanded="true"] svg { transform: rotate(90deg); }
@media (prefers-reduced-motion: reduce) { .rp-outline-toggle svg { transition: none; } }
.rp-outline-row:not(:has(.rp-outline-toggle)) { padding-left: calc(var(--depth) * 14px + 24px); }
.rp-panel-actions:empty { display: none; }
.rp-panel-actions { display: flex; flex-wrap: wrap; gap: 6px; padding: 2px 0 8px; }
.rp-panel-empty { margin: 8px; color: var(--rp-muted); font-size: 12.5px; }
.rp-files ul { list-style: none; margin: 0; padding: 0; }
.rp-file { display: flex; align-items: center; gap: 2px; }
.rp-file .rp-outline-item { display: flex; align-items: center; gap: 8px; text-decoration: none; }
.rp-file .rp-outline-item span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rp-file small { color: var(--rp-muted); font-size: 11.5px; }
.rp-links { pointer-events: none; }
.rp-recognized { line-height: 1; }
.rp-recognized span { position: absolute; color: transparent; white-space: pre; cursor: text; transform-origin: 0 0; font-family: sans-serif; }
.rp-recognized ::selection { background: rgba(0, 0, 255, 0.25); color: transparent; }
.rp-link { position: absolute; pointer-events: auto; border-radius: 2px; }
.rp-link:hover { background: rgba(37, 99, 235, 0.12); }
.rp-thumbs { flex: 1 1 auto; overflow-y: auto; padding: 8px 12px 16px; list-style: none; margin: 0; }
.rp-thumb { position: relative; display: flex; flex-direction: column; align-items: center; gap: 6px; margin: 0 0 12px; padding: 8px 6px 6px; border-radius: 10px; cursor: pointer; }
.rp-thumb:hover { background: var(--rp-hover); }
.rp-thumb[aria-current="page"] { background: var(--rp-pressed); }
.rp-thumb[aria-current="page"] .rp-thumb-number { color: var(--rp-pressed-text); font-weight: 600; }
.rp-thumb-sheet { position: relative; background: #fff; box-shadow: var(--rp-page-shadow); overflow: hidden; }
.rp-thumb-sheet canvas { display: block; width: 100%; height: 100%; }
.rp-thumb-marks { pointer-events: none; }
.rp-thumb-marks .rp-mark-note { pointer-events: none; }
.rp-thumb-number { color: var(--rp-muted); font-size: 12px; }

.rp-scroll { position: relative; flex: 1 1 auto; min-width: 0; overflow: auto; outline: none; touch-action: pan-x pan-y; }
.rp-pages { display: flex; flex-direction: column; align-items: center; gap: 16px; padding: 24px 16px 80px; min-width: min-content; }
.rp-page { position: relative; flex: none; background: #fff; box-shadow: var(--rp-page-shadow); --scale-round-x: 1px; --scale-round-y: 1px; }
.rp-canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.rp-page-state { position: absolute; inset: 0; display: grid; place-items: center; color: #8a877f; font-size: 13px; }
.rp-layer { position: absolute; inset: 0; }
.rp-hits, .rp-marks { pointer-events: none; }
.rp-hit { position: absolute; background: var(--rp-hit); border-radius: 2px; }
.rp-region { position: absolute; border-radius: 2px; mix-blend-mode: multiply; }
.rp-region-removed { background: rgba(224, 49, 49, 0.28); box-shadow: inset 0 -2px 0 #c92a2a; }
.rp-region-added { background: rgba(47, 158, 68, 0.28); box-shadow: inset 0 -2px 0 #2b8a3e; }
.rp-region-current { outline: 2.5px solid var(--rp-accent); outline-offset: 1px; mix-blend-mode: normal; }
.rp-hit-current { background: var(--rp-hit-current); outline: 2px solid var(--rp-accent); }

.rp-mark { position: absolute; }
.rp-mark-highlight { mix-blend-mode: multiply; }
/* Over the text it hides, which is not selected through it. */
.rp-mark-redaction { background: #000; outline: 1.5px solid #e03131; outline-offset: 0; pointer-events: auto; }
.rp-mark-note { display: grid; place-items: center; padding: 0; border: 0; background: none; pointer-events: auto; cursor: pointer; }
.rp-mark-note svg { width: 100%; height: 100%; filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.25)); }
.rp-mark-text { white-space: pre-wrap; overflow-wrap: break-word; font-family: Helvetica, Arial, sans-serif; line-height: 1.25; }
.rp-mark-text[data-family="serif"] { font-family: 'Times New Roman', Times, serif; }
.rp-mark-text[data-family="mono"] { font-family: 'Courier New', Courier, monospace; }
.rp-mark-replacing { white-space: pre; overflow: visible; }
.rp-mark-cover { position: absolute; background: #fff; pointer-events: none; }
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
.rp-sign-here { display: grid; place-items: center; padding: 0 6px; border: 1.5px dashed #b42318; border-radius: 4px; background: rgba(180, 35, 24, 0.06); color: #8a1c13; font: 600 12px var(--rp-font); cursor: pointer; overflow: hidden; white-space: nowrap; }
.rp-sign-here:hover { background: rgba(180, 35, 24, 0.12); border-color: #b42318; }
.rp-sign-here:disabled { cursor: default; opacity: 0.8; }
.rp-check { display: grid; place-items: center; padding: 0; border-color: rgba(27, 27, 27, 0.55); cursor: pointer; }
.rp-check svg { width: 85%; height: 85%; }
.rp-check[aria-checked="false"] svg { visibility: hidden; }
.rp-check.rp-radio { border-radius: 50%; }

.rp-find { position: absolute; top: 8px; right: 16px; z-index: 5; display: flex; align-items: center; gap: 4px; padding: 6px; border: 1px solid var(--rp-border); border-radius: 12px; background: var(--rp-raised); box-shadow: var(--rp-shadow); }
.rp-find[hidden] { display: none; }
.rp-find .rp-input { width: 220px; }
.rp-find-count { min-width: 72px; padding: 0 6px; color: var(--rp-muted); font-size: 12.5px; text-align: center; white-space: nowrap; }
.rp-status { position: absolute; inset: 0; display: grid; place-items: center; color: var(--rp-muted); }
.rp-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }

.rp-compare-body { display: flex; flex: 1 1 auto; min-height: 0; }
.rp-compare-list { flex: none; width: 260px; margin: 0; padding: 8px; overflow-y: auto; list-style: none; background: var(--rp-chrome); border-right: 1px solid var(--rp-border); }
.rp-compare-item { margin: 0 0 4px; border-left: 3px solid transparent; border-radius: 6px; font-size: 13px; }
.rp-compare-item button { width: 100%; padding: 6px 8px; border: 0; border-radius: 6px; background: none; color: var(--rp-text); font: inherit; text-align: left; cursor: pointer; overflow-wrap: anywhere; }
.rp-compare-item button:hover { background: var(--rp-hover); }
.rp-compare-item[aria-current] button { background: var(--rp-pressed); }
.rp-compare-removed { border-left-color: #c92a2a; }
.rp-compare-added { border-left-color: #2b8a3e; }
.rp-compare-changed { border-left-color: #e67700; }
.rp-compare-field { padding: 6px 8px; border-left-color: var(--rp-muted); color: var(--rp-muted); }
.rp-compare-panes { display: grid; grid-template-columns: 1fr 1fr; flex: 1 1 auto; min-width: 0; }
.rp-compare-pane { position: relative; min-width: 0; border-right: 1px solid var(--rp-border); }
.rp-compare-pane > .rp-root { height: 100%; min-height: 0; }
.rp-compare-count { color: var(--rp-muted); font-size: 13px; white-space: nowrap; }
@media (max-width: 760px) { .rp-compare-body { flex-direction: column; } .rp-compare-list { width: auto; max-height: 30%; border-right: 0; border-bottom: 1px solid var(--rp-border); } }
@media (max-width: 1400px) {
  .rp-hide-medium { display: none !important; }
  .rp-zoom { max-width: 104px; }
  .rp-bar .rp-sep { margin: 0 3px; }
}
@media (max-width: 640px) {
  /* The tools float at the foot of the pages, where a thumb reaches them. */
  .rp-tools:not(:empty) { position: absolute; z-index: 7; left: 50%; bottom: 16px; padding: 4px; border: 1px solid var(--rp-border); border-radius: 14px; background: var(--rp-raised); box-shadow: var(--rp-shadow); transform: translateX(-50%); }
  .rp-tools:not(:empty) .rp-button { min-width: 40px; height: 40px; }
  .rp-root:has(.rp-tools:not(:empty)) .rp-pages { padding-bottom: 96px; }
  .rp-side { position: absolute; z-index: 6; inset: 0 auto 0 0; box-shadow: var(--rp-shadow); }
  .rp-title, .rp-hide-narrow { display: none; }
  .rp-find { left: 8px; right: 8px; }
  .rp-find .rp-input { flex: 1; width: auto; min-width: 0; }
  .rp-pages { padding: 12px 8px 72px; }
  /* Where the tools float, the page in view goes over them. */
  .rp-root:has(.rp-tools:not(:empty)) .rp-statusbar { bottom: 72px; }
}

/* The menu: a screen of its own over the viewer, its parts down one side, as Rebodocs has it. */
.rp-ms { position: absolute; inset: 0; z-index: 30; display: flex; background: var(--rp-chrome); color: var(--rp-text); animation: rp-ms-in .16s ease-out; }
@keyframes rp-ms-in { from { opacity: 0; transform: scale(1.01); } }
@media (prefers-reduced-motion: reduce) { .rp-ms { animation: none; } }
.rp-ms-nav { flex: none; display: flex; flex-direction: column; gap: 2px; width: 260px; padding: 18px 14px; border-right: 1px solid var(--rp-border); overflow-y: auto; }
.rp-ms-list { display: contents; }
.rp-ms button { font: inherit; color: inherit; }
.rp-ms-back { display: flex; align-items: center; gap: 8px; height: 38px; margin-bottom: 14px; padding: 0 10px; border: 0; border-radius: 10px; background: var(--rp-hover); font-weight: 600; cursor: pointer; text-align: left; }
.rp-ms-back:hover { background: var(--rp-down); }
.rp-ms-tab { display: flex; align-items: center; gap: 10px; height: 40px; padding: 0 12px; border: 0; border-radius: 10px; background: none; text-align: left; cursor: pointer; }
.rp-ms-tab .rp-icon { color: var(--rp-muted); }
.rp-ms-tab:hover { background: var(--rp-hover); }
.rp-ms-tab[aria-selected="true"] { background: var(--rp-raised); color: var(--rp-accent); font-weight: 600; box-shadow: 0 0 0 1px var(--rp-border), 0 1px 3px rgba(47, 46, 43, 0.12); }
.rp-ms-tab[aria-selected="true"] .rp-icon { color: var(--rp-accent); }
.rp-ms-doc { display: flex; align-items: center; gap: 12px; min-width: 0; }
.rp-ms-doc > div { min-width: 0; }
.rp-ms-doc b { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 15px; }
.rp-ms-doc small { display: block; margin-top: 2px; color: var(--rp-muted); font-size: 12px; }
.rp-ms-nav .rp-ms-doc { margin-top: auto; padding: 12px; border: 1px solid var(--rp-border); border-radius: 12px; background: var(--rp-raised); }
.rp-ms-pane .rp-ms-doc { margin-bottom: 14px; }
.rp-ms-icon { display: grid; place-items: center; flex: none; width: 40px; height: 40px; border-radius: 10px; background: var(--rp-pressed); color: var(--rp-pressed-text); }
.rp-ms-main { position: relative; flex: 1; min-width: 0; overflow-y: auto; padding: 40px clamp(20px, 5vw, 64px); }
.rp-ms-pane { max-width: 760px; }
.rp-ms-pane h2 { margin: 0 0 6px; font-size: 28px; font-weight: 800; letter-spacing: -0.02em; }
.rp-ms-pane > p { margin: 0 0 24px; color: var(--rp-muted); font-size: 14px; }
.rp-ms-pane h2 + .rp-ms-doc, .rp-ms-pane h2 + .rp-ms-tiles, .rp-ms-pane h2 + .rp-ms-rows { margin-top: 18px; }
.rp-ms-x { position: absolute; right: 16px; top: 16px; display: grid; place-items: center; width: 36px; height: 36px; border: 0; border-radius: 10px; background: none; cursor: pointer; color: var(--rp-muted); }
.rp-ms-x:hover { background: var(--rp-hover); color: var(--rp-text); }
.rp-ms-tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; }
.rp-ms-tile { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; min-height: 104px; padding: 12px; border: 1px solid var(--rp-border); border-radius: 12px; background: var(--rp-raised); cursor: pointer; }
.rp-ms-tile .rp-icon { color: var(--rp-accent); }
.rp-ms-rows { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 8px; }
.rp-ms-row { display: flex; align-items: center; gap: 14px; padding: 16px; border: 1px solid var(--rp-border); border-radius: 12px; background: var(--rp-raised); text-align: left; cursor: pointer; }
.rp-ms-row b { display: block; font-size: 14px; }
.rp-ms-row small { display: block; margin-top: 3px; color: var(--rp-muted); font-size: 12px; line-height: 1.4; }
.rp-ms-choices { display: flex; flex-wrap: wrap; gap: 8px; }
.rp-ms-choice { display: flex; align-items: center; gap: 10px; min-width: 160px; height: 44px; padding: 0 14px; border: 1px solid var(--rp-border); border-radius: 12px; background: var(--rp-raised); cursor: pointer; }
.rp-ms-dot { width: 14px; height: 14px; border: 1.5px solid var(--rp-border-strong); border-radius: 50%; }
.rp-ms-choice[aria-checked="true"] { border-color: var(--rp-accent); }
.rp-ms-choice[aria-checked="true"] .rp-ms-dot { border: 4px solid var(--rp-accent); }
.rp-ms-tile:hover, .rp-ms-row:hover, .rp-ms-choice:hover { border-color: var(--rp-accent); }
@media (max-width: 640px) { .rp-ms-nav { width: 200px; } }
@media (max-width: 520px) {
  .rp-ms { flex-direction: column; }
  .rp-ms-nav { flex-direction: row; width: auto; padding: 10px; overflow-x: auto; border-right: 0; border-bottom: 1px solid var(--rp-border); }
  .rp-ms-back { margin: 0 6px 0 0; }
  .rp-ms-back, .rp-ms-tab { flex: none; }
  .rp-ms-nav .rp-ms-doc { display: none; }
  .rp-ms-main { padding: 24px 16px; }
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
