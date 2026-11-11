// 24×24 stroke icons. Marker icons are drawn on the canvas via Path2D and in the UI as inline SVG.

export const MARKER_ICONS: { id: string; name: string; d: string }[] = [
  { id: 'save', name: 'Save point', d: 'M5 4h11l3 3v13H5z M8 4v5h7V4 M8 20v-6h8v6' },
  { id: 'boss', name: 'Boss', d: 'M12 3a8 8 0 0 0-8 8c0 3 1.5 4.6 3 5.5V20h10v-3.5c1.5-.9 3-2.5 3-5.5a8 8 0 0 0-8-8z M9 11v.01 M15 11v.01 M10.5 20v-2 M13.5 20v-2' },
  { id: 'item', name: 'Item', d: 'M12 2.8l2.8 6 6.4.7-4.8 4.4 1.4 6.4L12 17l-5.8 3.3 1.4-6.4-4.8-4.4 6.4-.7z' },
  { id: 'health', name: 'Health upgrade', d: 'M12 20s-8-4.8-8-10.5A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 8 2.5C20 15.2 12 20 12 20z' },
  { id: 'key', name: 'Key', d: 'M4 15.5a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0-7 0 M10 13l10-10 M16.5 6.5l2.5 2.5 M14 9l2 2' },
  { id: 'chest', name: 'Chest', d: 'M3.5 10h17v10h-17z M3.5 10c0-3.5 3.5-5.5 8.5-5.5s8.5 2 8.5 5.5 M10.5 13h3v3h-3z' },
  { id: 'warp', name: 'Warp', d: 'M12 3a9 9 0 1 0 9 9 M12 7a5 5 0 1 0 5 5 M12 11.5a.5.5 0 1 0 .5.5' },
  { id: 'elevator', name: 'Elevator', d: 'M8 8l4-4.5 4 4.5 M8 16l4 4.5 4-4.5 M12 4v16' },
  { id: 'shop', name: 'Shop', d: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18 M14.6 9.2c-.5-.9-1.5-1.4-2.6-1.4-1.5 0-2.6.8-2.6 2s1.1 1.7 2.6 2 2.6.8 2.6 2-1.1 2-2.6 2c-1.1 0-2.1-.5-2.6-1.4 M12 6v12' },
  { id: 'map', name: 'Map station', d: 'M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z M9 3v15 M15 6v15' },
  { id: 'npc', name: 'Character', d: 'M8.5 7.5a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0-7 0 M5 21c0-4 3-7 7-7s7 3 7 7' },
  { id: 'start', name: 'Start', d: 'M5 21V3.5 M5 4h13l-3 4 3 4H5' },
  { id: 'danger', name: 'Danger', d: 'M12 3l10 18H2z M12 10v5 M12 18v.01' },
  { id: 'note', name: 'Unknown', d: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18 M9.2 9.3a2.9 2.9 0 1 1 3.9 2.8c-.7.3-1.1.8-1.1 1.5v.6 M12 16.8v.01' },
];

export const UI_ICONS = {
  select: 'M5 3l14 8-6 1.5L10 19z',
  room: 'M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M15 15l5 5 M15 20h5v-5',
  erase: 'M8 20h12 M5.5 14.5l8-8 5 5-6 6H9z M10 10l5 5',
  door: 'M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16 M3 21h18 M14.5 12v.01',
  marker: 'M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z M12 7a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5',
  label: 'M5 6V4h14v2 M12 4v16 M9 20h6',
  undo: 'M9 14L4 9l5-5 M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
  redo: 'M15 14l5-5-5-5 M20 9H9.5a5.5 5.5 0 0 0 0 11H13',
  newdoc: 'M14 3H6v18h12V7z M14 3v4h4 M12 11v6 M9 14h6',
  open: 'M3 7V5h7l2 2h9v12H3z M3 10h18',
  save: 'M12 3v12 M7 10l5 5 5-5 M4 20h16',
  image: 'M3 4h18v16H3z M3 16l5-5 4 4 3-3 6 6 M15.5 8.5v.01',
  plus: 'M12 5v14 M5 12h14',
  trash: 'M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13 M10 11v6 M14 11v6',
  newroom: 'M4 4h10v10H4z M17 14v6 M14 17h6',
  copy: 'M8 8h12v12H8z M16 8V4H4v12h4',
  fit: 'M4 9V4h5 M20 9V4h-5 M4 15v5h5 M20 15v5h-5',
  help: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18 M9.2 9.3a2.9 2.9 0 1 1 3.9 2.8c-.7.3-1.1.8-1.1 1.5v.6 M12 16.8v.01',
  close: 'M6 6l12 12 M18 6L6 18',
  arrowL: 'M15 5l-7 7 7 7', arrowR: 'M9 5l7 7-7 7', arrowU: 'M5 15l7-7 7 7', arrowD: 'M5 9l7 7 7-7',
  play: 'M7 4l12 8-12 8z',
};

const pathCache = new Map<string, Path2D>();
export function iconPath(id: string): Path2D {
  let p = pathCache.get(id);
  if (!p) {
    const def = MARKER_ICONS.find((i) => i.id === id) ?? MARKER_ICONS[MARKER_ICONS.length - 1];
    p = new Path2D(def.d);
    pathCache.set(id, p);
  }
  return p;
}

export function svgIcon(d: string, size = 18): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', d);
  svg.appendChild(path);
  return svg;
}

export function markerSvg(id: string, size = 18) {
  const def = MARKER_ICONS.find((i) => i.id === id) ?? MARKER_ICONS[0];
  return svgIcon(def.d, size);
}
