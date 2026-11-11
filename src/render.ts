import { Area, AreaIndex, DOOR_TYPES, Label, Room, Side, edgeOf, parseCell, parseEdge, roomAnchor, ck } from './model';
import { iconPath } from './icons';

export const THEME = {
  bg: '#070a12',
  areaBg: '#0d1322',
  grid: 'rgba(110, 160, 230, 0.13)',
  wall: '#e9f2ff',
  textOutline: 'rgba(4, 7, 14, 0.9)',
  accent: '#3ee0ff',
};

export const SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
export const MONO = 'ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace';

export interface RenderOpts {
  /** Screen pixels per world pixel, used to keep hairlines crisp and to fade the grid when zoomed out. */
  scale: number;
  showGrid: boolean;
  showNames: boolean;
  showIds: boolean;
  /** Rooms to skip (e.g. while being dragged). */
  hiddenRoom?: string;
}

export const wallWidth = (a: Area) => Math.max(1.5, Math.min(a.cellW, a.cellH) * 0.09);

const SIDES: Side[] = ['n', 's', 'w', 'e'];

/** Segment endpoints (world px) for an edge. */
export function edgeSegment(a: Area, edge: string): [number, number, number, number] {
  const { horizontal, x, y } = parseEdge(edge);
  const x0 = x * a.cellW, y0 = y * a.cellH;
  return horizontal ? [x0, y0, x0 + a.cellW, y0] : [x0, y0, x0, y0 + a.cellH];
}

/** Edges on the boundary of a room. */
export function roomBoundary(room: Room): string[] {
  const set = new Set(room.cells);
  const out: string[] = [];
  for (const k of room.cells) {
    const [x, y] = parseCell(k);
    if (!set.has(ck(x, y - 1))) out.push(edgeOf(x, y, 'n'));
    if (!set.has(ck(x, y + 1))) out.push(edgeOf(x, y, 's'));
    if (!set.has(ck(x - 1, y))) out.push(edgeOf(x, y, 'w'));
    if (!set.has(ck(x + 1, y))) out.push(edgeOf(x, y, 'e'));
  }
  return out;
}

export function roomPath(a: Area, room: Room, dx = 0, dy = 0): Path2D {
  const p = new Path2D();
  for (const k of room.cells) {
    const [x, y] = parseCell(k);
    p.rect((x + dx) * a.cellW, (y + dy) * a.cellH, a.cellW, a.cellH);
  }
  return p;
}

export function drawArea(ctx: CanvasRenderingContext2D, a: Area, idx: AreaIndex, o: RenderOpts) {
  const W = a.cols * a.cellW, H = a.rows * a.cellH;
  const hair = 1 / o.scale;

  ctx.fillStyle = THEME.areaBg;
  ctx.fillRect(0, 0, W, H);

  // Grid — fades out as cells get small on screen.
  const cellOnScreen = Math.min(a.cellW, a.cellH) * o.scale;
  if (o.showGrid && cellOnScreen > 5) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, (cellOnScreen - 5) / 10);
    ctx.strokeStyle = THEME.grid;
    ctx.lineWidth = hair;
    ctx.beginPath();
    for (let x = 0; x <= a.cols; x++) { ctx.moveTo(x * a.cellW, 0); ctx.lineTo(x * a.cellW, H); }
    for (let y = 0; y <= a.rows; y++) { ctx.moveTo(0, y * a.cellH); ctx.lineTo(W, y * a.cellH); }
    ctx.stroke();
    ctx.restore();
  }
  // Area border
  ctx.strokeStyle = 'rgba(110, 160, 230, 0.35)';
  ctx.lineWidth = hair * 1.5;
  ctx.strokeRect(0, 0, W, H);

  const ww = wallWidth(a);
  const visibleRooms = a.rooms.filter((r) => r.id !== o.hiddenRoom);

  // Room fills
  for (const r of visibleRooms) {
    ctx.fillStyle = r.color;
    ctx.fill(roomPath(a, r));
  }

  // Interior cell seams
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.22)';
  ctx.lineWidth = Math.max(hair, ww * 0.35);
  ctx.beginPath();
  for (const r of visibleRooms) {
    const set = new Set(r.cells);
    for (const k of r.cells) {
      const [x, y] = parseCell(k);
      if (set.has(ck(x + 1, y))) { ctx.moveTo((x + 1) * a.cellW, y * a.cellH); ctx.lineTo((x + 1) * a.cellW, (y + 1) * a.cellH); }
      if (set.has(ck(x, y + 1))) { ctx.moveTo(x * a.cellW, (y + 1) * a.cellH); ctx.lineTo((x + 1) * a.cellW, (y + 1) * a.cellH); }
    }
  }
  ctx.stroke();

  drawWalls(ctx, a, idx, visibleRooms, ww);
  drawMarkers(ctx, a, a.markers);

  // Room names / ids
  if (o.showNames || o.showIds) {
    for (const r of visibleRooms) {
      const [cx, cy] = roomAnchor(r);
      const fs = Math.max(6, Math.min(a.cellW, a.cellH) * 0.34);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      const hasMarker = idx.markers.has(ck(Math.floor(cx - 1e-6), Math.floor(cy - 1e-6))) || idx.markers.has(ck(Math.floor(cx), Math.floor(cy)));
      let ty = cy * a.cellH + (hasMarker ? a.cellH * 0.42 : 0);
      if (o.showIds) {
        const ifs = fs * 0.75;
        ctx.font = `600 ${ifs}px ${MONO}`;
        const idY = o.showNames && r.name ? ty - fs * 0.85 : ty;
        outlinedText(ctx, r.id, cx * a.cellW, idY, ifs, 'rgba(220, 235, 255, 0.75)');
      }
      if (o.showNames && r.name) {
        ctx.font = `650 ${fs}px ${SANS}`;
        outlinedText(ctx, r.name, cx * a.cellW, ty, fs, '#ffffff');
      }
    }
  }

  for (const l of a.labels) drawLabel(ctx, a, l);
}

function outlinedText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, fs: number, fill: string) {
  ctx.lineWidth = fs * 0.28;
  ctx.strokeStyle = THEME.textOutline;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

function drawWalls(ctx: CanvasRenderingContext2D, a: Area, idx: AreaIndex, rooms: Room[], ww: number) {
  const seen = new Set<string>();
  const doorsToDraw: [string, string][] = [];
  ctx.strokeStyle = THEME.wall;
  ctx.lineWidth = ww;
  ctx.lineCap = 'square';
  ctx.beginPath();
  for (const r of rooms) {
    for (const k of r.cells) {
      const [x, y] = parseCell(k);
      for (const s of SIDES) {
        const e = edgeOf(x, y, s);
        if (seen.has(e)) continue;
        seen.add(e);
        if (!idx.isWall(e)) continue;
        const [x0, y0, x1, y1] = edgeSegment(a, e);
        const door = idx.doors.get(e);
        if (!door) { ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); continue; }
        doorsToDraw.push([e, door.type]);
        // Leave a gap in the middle of the wall.
        const len = Math.hypot(x1 - x0, y1 - y0);
        const gap = Math.min(len * 0.5, len - ww * 2.5);
        const t0 = (len - gap) / 2 / len - (ww / 2) / len;
        const t1 = 1 - t0;
        if (t0 > 0) {
          ctx.moveTo(x0, y0); ctx.lineTo(x0 + (x1 - x0) * t0, y0 + (y1 - y0) * t0);
          ctx.moveTo(x0 + (x1 - x0) * t1, y0 + (y1 - y0) * t1); ctx.lineTo(x1, y1);
        }
      }
    }
  }
  ctx.stroke();
  ctx.lineCap = 'butt';

  for (const [e, type] of doorsToDraw) drawDoor(ctx, a, e, type, ww);
}

export function drawDoor(ctx: CanvasRenderingContext2D, a: Area, e: string, type: string, ww: number, alpha = 1) {
  if (type === 'open') return;
  const [x0, y0, x1, y1] = edgeSegment(a, e);
  const horizontal = y0 === y1;
  const len = Math.hypot(x1 - x0, y1 - y0);
  const dl = len * 0.5;
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
  const def = DOOR_TYPES.find((t) => t.id === type) ?? DOOR_TYPES[1];
  ctx.save();
  ctx.globalAlpha = alpha;
  if (type === 'secret') {
    ctx.strokeStyle = def.color;
    ctx.lineWidth = ww * 0.8;
    ctx.setLineDash([ww * 1.1, ww * 0.9]);
    ctx.beginPath();
    if (horizontal) { ctx.moveTo(mx - dl / 2, my); ctx.lineTo(mx + dl / 2, my); }
    else { ctx.moveTo(mx, my - dl / 2); ctx.lineTo(mx, my + dl / 2); }
    ctx.stroke();
  } else {
    const th = ww * 2.4;
    const w = horizontal ? dl : th, h = horizontal ? th : dl;
    ctx.fillStyle = def.color;
    ctx.strokeStyle = THEME.textOutline;
    ctx.lineWidth = ww * 0.45;
    ctx.beginPath();
    ctx.rect(mx - w / 2, my - h / 2, w, h);
    ctx.stroke();
    ctx.fill();
  }
  ctx.restore();
}

export function drawMarkers(ctx: CanvasRenderingContext2D, a: Area, markers: { x: number; y: number; icon: string; color: string }[], alpha = 1) {
  const s = Math.min(a.cellW, a.cellH);
  for (const m of markers) {
    const cx = (m.x + 0.5) * a.cellW, cy = (m.y + 0.5) * a.cellH;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(4, 7, 14, 0.6)';
    ctx.beginPath();
    ctx.arc(cx, cy, s * 0.4, 0, Math.PI * 2);
    ctx.fill();
    const iconSize = s * 0.56;
    ctx.translate(cx - iconSize / 2, cy - iconSize / 2);
    ctx.scale(iconSize / 24, iconSize / 24);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = m.color;
    ctx.stroke(iconPath(m.icon));
    ctx.restore();
  }
}

export function labelFont(a: Area, l: Label) {
  return `700 ${l.size * a.cellH}px ${SANS}`;
}

export function drawLabel(ctx: CanvasRenderingContext2D, a: Area, l: Label) {
  const fs = l.size * a.cellH;
  const lines = (l.text || ' ').split('\n');
  ctx.font = labelFont(a, l);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  const lh = fs * 1.2;
  const top = l.y * a.cellH - ((lines.length - 1) * lh) / 2;
  lines.forEach((line, i) => outlinedText(ctx, line, l.x * a.cellW, top + i * lh, fs, l.color));
}

/** Label bounding box in world px. */
export function labelBounds(ctx: CanvasRenderingContext2D, a: Area, l: Label) {
  const fs = l.size * a.cellH;
  const lines = (l.text || ' ').split('\n');
  ctx.save();
  ctx.font = labelFont(a, l);
  const w = Math.max(fs * 0.5, ...lines.map((s) => ctx.measureText(s).width)) + fs * 0.3;
  ctx.restore();
  const h = lines.length * fs * 1.2;
  return { x: l.x * a.cellW - w / 2, y: l.y * a.cellH - h / 2, w, h };
}

/** Bounding box of all content in cell units, or null if empty. */
export function contentBounds(a: Area): { x0: number; y0: number; x1: number; y1: number } | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (x: number, y: number) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
  for (const r of a.rooms) for (const k of r.cells) { const [x, y] = parseCell(k); add(x, y); add(x + 1, y + 1); }
  for (const m of a.markers) { add(m.x, m.y); add(m.x + 1, m.y + 1); }
  for (const l of a.labels) { add(l.x - 1, l.y - 0.5); add(l.x + 1, l.y + 0.5); }
  return x0 === Infinity ? null : { x0, y0, x1, y1 };
}
