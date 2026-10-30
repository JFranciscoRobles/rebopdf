// The look of what the editor adds to the viewer: its tools, what is chosen
// on a page, the popovers, the signature dialog and the thumbnails that are
// moved. On the custom properties of the viewer, under rp-.

const CSS = `
.rp-root[data-tool="note"] .rp-page, .rp-root[data-tool="text"] .rp-page, .rp-root[data-tool="sign"] .rp-page { cursor: crosshair; }
.rp-root[data-tool="ink"] .rp-page, .rp-root[data-tool="redact"] .rp-page { cursor: crosshair; touch-action: none; }
.rp-root[data-tool="field"] .rp-page { cursor: crosshair; touch-action: none; }
.rp-design { z-index: 2; }
.rp-design-box { position: absolute; border: 1.5px dashed var(--rp-focus); border-radius: 3px; background: color-mix(in srgb, var(--rp-focus) 8%, transparent); cursor: move; }
.rp-design-box[data-kind="signature"] { background: color-mix(in srgb, var(--rp-focus) 14%, transparent); }
.rp-design-box[aria-pressed="true"] { border-style: solid; box-shadow: 0 0 0 2px color-mix(in srgb, var(--rp-focus) 35%, transparent); }
.rp-design-box > span { position: absolute; left: 0; bottom: 100%; max-width: 220px; padding: 1px 5px; border-radius: 4px 4px 0 0; background: var(--rp-focus); color: var(--rp-accent-text); font: 600 10.5px/1.5 var(--rp-font); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; pointer-events: none; }
.rp-boxing.rp-boxing-field { background: color-mix(in srgb, var(--rp-focus) 12%, transparent); outline-color: var(--rp-focus); }
.rp-boxing { position: absolute; z-index: 3; background: rgba(0, 0, 0, 0.75); outline: 2px dashed #e03131; pointer-events: none; }
.rp-pop-info { max-width: 280px; margin: 0; color: var(--rp-muted); font-size: 12.5px; line-height: 1.45; }
.rp-root:not([data-tool="select"]):not([data-tool="highlight"]) .textLayer { pointer-events: none; }
.rp-root:not([data-tool="select"]) .rp-fields { display: none; }
.rp-root:not([data-tool="select"]):not([data-tool="highlight"]) .rp-links { display: none; }
.rp-root[data-tool="select"] .rp-mark { pointer-events: auto; cursor: pointer; }
.rp-root[data-tool="select"] .rp-mark-ink { pointer-events: none; }
.rp-root[data-tool="select"] .rp-mark-ink path { pointer-events: stroke; cursor: pointer; }
.rp-root[data-tool="highlight"] .textLayer :is(span, br) { cursor: text; }
.rp-root .rp-mark.rp-chosen { outline: 2px solid var(--rp-focus); outline-offset: 2px; }
.rp-root .rp-mark-ink path.rp-chosen { filter: drop-shadow(0 0 2px var(--rp-focus)); }
.rp-handle { position: absolute; z-index: 3; width: 12px; height: 12px; margin: -6px 0 0 -6px; border: 2px solid var(--rp-focus); border-radius: 50%; background: #fff; cursor: nwse-resize; pointer-events: auto; touch-action: none; }
.rp-drawing { position: absolute; inset: 0; pointer-events: none; overflow: visible; }

.rp-swatch-button { position: relative; }
.rp-swatch { display: block; width: 16px; height: 16px; border-radius: 50%; border: 1.5px solid rgba(0, 0, 0, 0.18); }
.rp-swatches { display: flex; gap: 6px; padding: 2px; }
.rp-swatches .rp-button { min-width: 30px; width: 30px; height: 30px; padding: 0; }
.rp-swatches .rp-swatch { width: 20px; height: 20px; }
.rp-swatches .rp-button[aria-pressed="true"] { background: var(--rp-hover); box-shadow: inset 0 0 0 2px var(--rp-focus); }

.rp-pop { position: absolute; z-index: 20; display: flex; flex-direction: column; gap: 10px; width: max-content; max-width: min(320px, calc(100% - 24px)); padding: 12px; border: 1px solid var(--rp-border); border-radius: 12px; background: var(--rp-raised); color: var(--rp-text); box-shadow: var(--rp-shadow); }
.rp-pop[hidden] { display: none; }
.rp-pop textarea.rp-input { width: 280px; max-width: 100%; height: auto; min-height: 72px; padding: 8px; resize: vertical; line-height: 1.4; }
.rp-pop-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.rp-pop-row .rp-group { gap: 6px; }
.rp-pop label { display: flex; align-items: center; gap: 6px; color: var(--rp-muted); font-size: 12.5px; }
.rp-button.rp-quiet { color: var(--rp-muted); }
.rp-menu { padding: 6px; gap: 2px; min-width: 240px; }
.rp-menu .rp-button { justify-content: flex-start; width: 100%; height: auto; min-height: 36px; padding: 6px 10px; text-align: left; }
.rp-menu small { display: block; color: var(--rp-muted); font-size: 12px; white-space: normal; }
.rp-selbar { position: absolute; z-index: 15; display: flex; gap: 2px; padding: 4px; border: 1px solid var(--rp-border); border-radius: 10px; background: var(--rp-raised); box-shadow: var(--rp-shadow); }
.rp-selbar[hidden] { display: none; }

.rp-side .rp-side-head { gap: 4px; min-height: 40px; }
.rp-side .rp-side-head .rp-button { min-width: 28px; height: 28px; padding: 0 4px; }
.rp-thumb[aria-selected="true"] .rp-thumb-sheet { box-shadow: 0 0 0 3px var(--rp-focus), var(--rp-page-shadow); }
.rp-thumb.rp-dragging { opacity: 0.4; }
.rp-thumb.rp-drop-before::before { content: ""; position: absolute; top: -7px; left: 8px; right: 8px; height: 3px; border-radius: 2px; background: var(--rp-focus); }
.rp-thumb.rp-drop-after::after { content: ""; position: absolute; bottom: -7px; left: 8px; right: 8px; height: 3px; border-radius: 2px; background: var(--rp-focus); }
.rp-thumb-grip { cursor: grab; }

.rp-dropzone { position: absolute; inset: 8px; z-index: 30; display: grid; place-items: center; border: 2px dashed var(--rp-focus); border-radius: 16px; background: color-mix(in srgb, var(--rp-canvas) 85%, transparent); color: var(--rp-pressed-text); font-weight: 600; pointer-events: none; }
.rp-dropzone[hidden] { display: none; }
.rp-toast { position: absolute; left: 50%; bottom: 20px; z-index: 40; max-width: calc(100% - 32px); padding: 10px 14px; border-radius: 10px; background: var(--rp-text); color: var(--rp-bg); box-shadow: var(--rp-shadow); font-size: 13.5px; transform: translateX(-50%); }
.rp-toast[hidden] { display: none; }

.rp-dialog-back { position: absolute; inset: 0; z-index: 50; display: grid; place-items: center; padding: 16px; background: var(--rp-overlay); }
.rp-dialog { display: flex; flex-direction: column; gap: 14px; width: min(520px, 100%); padding: 18px; border-radius: 14px; background: var(--rp-raised); color: var(--rp-text); box-shadow: var(--rp-shadow); }
.rp-dialog h2 { margin: 0; font-size: 16px; }
.rp-tabs { display: flex; gap: 4px; padding: 3px; border-radius: 10px; background: var(--rp-hover); align-self: flex-start; }
.rp-tabs .rp-button { height: 30px; }
.rp-tabs .rp-button[aria-selected="true"] { background: var(--rp-raised); color: var(--rp-text); box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12); }
.rp-pad { position: relative; height: 180px; border: 1px solid var(--rp-border-strong); border-radius: 10px; background: #fff; touch-action: none; cursor: crosshair; }
.rp-pad canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
.rp-pad-line { position: absolute; left: 24px; right: 24px; bottom: 44px; border-top: 1px dashed #c9c5bc; pointer-events: none; }
.rp-pad-hint { position: absolute; left: 24px; bottom: 18px; color: #8a877f; font-size: 12.5px; pointer-events: none; }
.rp-typed { display: grid; place-items: center; height: 120px; border: 1px solid var(--rp-border-strong); border-radius: 10px; background: #fff; color: #0b1f4d; font: 44px/1.2 "Segoe Script", "Snell Roundhand", "Brush Script MT", "Apple Chancery", cursive; overflow: hidden; white-space: nowrap; }
.rp-dialog .rp-input { width: 100%; height: 36px; }
.rp-dialog-actions { display: flex; justify-content: flex-end; gap: 8px; }
.rp-upload-preview { display: grid; place-items: center; height: 140px; border: 1px dashed var(--rp-border-strong); border-radius: 10px; background: #fff; }
.rp-upload-preview img { max-width: 90%; max-height: 120px; }

.rp-empty { position: absolute; inset: 0; display: grid; place-items: center; padding: 24px; text-align: center; }
.rp-empty > div { display: flex; flex-direction: column; align-items: center; gap: 12px; max-width: 380px; }
.rp-empty h2 { margin: 0; font-size: 20px; }
.rp-empty p { margin: 0; color: var(--rp-muted); }
@media (max-width: 640px) { .rp-hide-narrow-editor { display: none; } }
`;

export function injectEditorStyles(doc: Document = document): void {
  if (doc.querySelector('style[data-rebopdf-editor]')) return;
  const style = doc.createElement('style');
  style.dataset.rebopdfEditor = '';
  style.textContent = CSS;
  doc.head.append(style);
}
