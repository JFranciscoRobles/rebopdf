// The icons of the viewer and the editor, drawn on a grid of 24 with lines,
// in the colour of the text they go with.

const PATHS = {
  sidebar: 'M4 5h16v14H4zM9.5 5v14',
  chevronLeft: 'M14.5 6l-6 6 6 6',
  chevronRight: 'M9.5 6l6 6-6 6',
  chevronUp: 'M6 14.5l6-6 6 6',
  chevronDown: 'M6 9.5l6 6 6-6',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  search: 'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM15.5 15.5L20 20',
  lock: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  editText: 'M4 6V4.5h10V6M9 4.5V17M7 17h4M13.5 19.5l6-6 1.8 1.8-6 6H13.5z',
  download: 'M12 4v11M7 10.5l5 5 5-5M5 19.5h14',
  print: 'M7 8.5V4h10v4.5M7 16.5H5.5A1.5 1.5 0 0 1 4 15v-5a1.5 1.5 0 0 1 1.5-1.5h13A1.5 1.5 0 0 1 20 10v5a1.5 1.5 0 0 1-1.5 1.5H17M7 13.5h10V20H7z',
  pagePlus: 'M6 3.5h12v17H6zM12 9v6M9 12h6',
  close: 'M6 6l12 12M18 6L6 18',
  pointer: 'M6 4l12 7.5-5.2 1.3L10.5 18z',
  highlight: 'M14.5 4.5l5 5L11 18H6v-5zM12 7l5 5M4 21h16',
  note: 'M5 4h14v11l-5 5H5zM14 20v-5h5M8.5 9h7M8.5 12.5h4',
  pen: 'M4 20c3-1 4.5-4 7-6.5s5-6 7.5-8.5M14.5 7.5l2 2M4 20l1-3.5',
  text: 'M5 6V4.5h14V6M12 4.5v15M9 19.5h6',
  signature: 'M3.5 17c2.5 0 3.5-9 6-9s-1 8 1.5 8 2.5-4 4-4 1 3 3 3 2-1 2.5-1.5M3.5 20.5h17',
  rotate: 'M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4',
  rotateBack: 'M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4.5v4h4',
  trash: 'M4.5 7h15M10 4h4M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5',
  undo: 'M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
  redo: 'M15 14l5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13',
  filePlus: 'M13.5 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9zM13.5 3.5V9H19M12 12v6M9 15h6',
  scissors: 'M6.5 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM6.5 20a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM8.5 7.5L19 18M8.5 16.5L19 6',
  upload: 'M12 16V5M7 9.5l5-5 5 5M5 19.5h14',
  open: 'M4 7.5V18a1.5 1.5 0 0 0 1.5 1.5h13A1.5 1.5 0 0 0 20 18V9.5A1.5 1.5 0 0 0 18.5 8H12l-2-2.5H5.5A1.5 1.5 0 0 0 4 7.5z',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  form: 'M4 5h16v5H4zM4 14h16v5H4zM7 7.5h5M7 16.5h3',
  flatten: 'M4 8l8-4 8 4-8 4zM4 12l8 4 8-4M4 16l8 4 8-4',
  copy: 'M8.5 8.5h11v11h-11zM5.5 15.5h-1v-11h11v1',
  layers: 'M5 9.5h10.5v10.5H5zM8.5 6.5H19V17M11.5 3.5H22',
  redact: 'M3.5 8.5h17v7h-17zM6.5 12h11',
  more: 'M5.5 12h.01M12 12h.01M18.5 12h.01',
  menu: 'M4.5 7h15M4.5 12h15M4.5 17h15',
  seal: 'M12 3.5l6.5 2.5v5.5c0 4-2.8 7.2-6.5 9-3.7-1.8-6.5-5-6.5-9V6zM9 12l2.2 2.2L15.5 10',
  language: 'M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17zM3.5 12h17M12 3.5c2.3 2.3 3.5 5.2 3.5 8.5s-1.2 6.2-3.5 8.5c-2.3-2.3-3.5-5.2-3.5-8.5s1.2-6.2 3.5-8.5z',
  file: 'M13.5 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9zM13.5 3.5V9H19M9 13h6M9 16.5h4',
  contrast: 'M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17zM12 3.5v17M12 7.5h3.5M12 11.5h7M12 15.5h5.5',
  fitWidth: 'M3.5 12h17M7 8.5L3.5 12 7 15.5M17 8.5l3.5 3.5-3.5 3.5M3.5 4.5v15M20.5 4.5v15',
  fitPage: 'M7 3.5h10v17H7zM10 7.5h4M10 11h4M10 14.5h2.5',
  fullscreen: 'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5',
  exitFullscreen: 'M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5',
  tools: 'M14.7 6.3a4 4 0 0 0 5.2 5.2L12 19.4a2.1 2.1 0 1 1-3-3L16.9 8.5a4 4 0 0 0-2.2-2.2zM4 20l3-3',
} as const;

export type IconName = keyof typeof PATHS;

export function icon(doc: Document, name: IconName, size = 18): SVGSVGElement {
  const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'rp-icon');
  const path = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', PATHS[name]);
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', name === 'more' ? '3' : '1.75');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  svg.append(path);
  return svg;
}
