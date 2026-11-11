import { store } from './store';
import { validateProject, Project } from './model';
import { THEME, drawArea, contentBounds } from './render';

function slug(s: string) {
  return s.trim().replace(/[^\w\- ]+/g, '').replace(/\s+/g, '-').toLowerCase() || 'map';
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function saveProjectFile() {
  const json = JSON.stringify(store.project, null, 1);
  download(new Blob([json], { type: 'application/json' }), `${slug(store.project.name)}.maproid.json`);
  store.dirtySinceSave = false;
}

export async function readProjectFile(file: File): Promise<Project> {
  const text = await file.text();
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new Error('That file is not valid JSON.'); }
  return validateProject(raw);
}

export function pickProjectFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
}

export interface PngOptions { scale: number; grid: boolean; crop: boolean; transparent: boolean }

export function renderPng(opts: PngOptions): HTMLCanvasElement {
  const a = store.area;
  const b = opts.crop ? contentBounds(a) : null;
  const pad = 1;
  const x0 = b ? Math.max(0, b.x0 - pad) : 0, y0 = b ? Math.max(0, b.y0 - pad) : 0;
  const x1 = b ? Math.min(a.cols, b.x1 + pad) : a.cols, y1 = b ? Math.min(a.rows, b.y1 + pad) : a.rows;
  const w = Math.max(1, Math.round((x1 - x0) * a.cellW * opts.scale));
  const h = Math.max(1, Math.round((y1 - y0) * a.cellH * opts.scale));
  const MAX = 16384;
  const k = Math.min(1, MAX / w, MAX / h);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * k);
  canvas.height = Math.round(h * k);
  const ctx = canvas.getContext('2d')!;
  const s = opts.scale * k;
  if (!opts.transparent) {
    ctx.fillStyle = THEME.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.setTransform(s, 0, 0, s, -x0 * a.cellW * s, -y0 * a.cellH * s);
  if (opts.transparent) {
    // Skip the area background: draw into a clipped region with it removed.
    const saved = THEME.areaBg;
    THEME.areaBg = 'rgba(0,0,0,0)';
    drawArea(ctx, a, store.idx, { scale: s, showGrid: opts.grid, showNames: store.showNames, showIds: store.showIds });
    THEME.areaBg = saved;
  } else {
    drawArea(ctx, a, store.idx, { scale: s, showGrid: opts.grid, showNames: store.showNames, showIds: store.showIds });
  }
  return canvas;
}

export function exportPng(opts: PngOptions) {
  const canvas = renderPng(opts);
  canvas.toBlob((blob) => {
    if (blob) download(blob, `${slug(store.project.name)}-${slug(store.area.name)}.png`);
  }, 'image/png');
}
