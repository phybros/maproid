import { store, View } from './store';
import {
  Area, Room, Side, ck, edgeOf, inBounds, lineCells, newId, canMoveRoom, moveRoom, parseCell, ROOM_COLORS,
} from './model';
import {
  THEME, drawArea, drawDoor, drawMarkers, edgeSegment, labelBounds, roomBoundary, roomPath, wallWidth, contentBounds,
} from './render';

type Drag =
  | { kind: 'pan'; sx: number; sy: number; vx: number; vy: number }
  | { kind: 'paint'; last: [number, number] | null; erase: boolean }
  | { kind: 'rect'; x0: number; y0: number; x1: number; y1: number; erase: boolean }
  | { kind: 'moveRoom'; room: Room; sx: number; sy: number; dx: number; dy: number }
  | { kind: 'moveLabel'; id: string; ox: number; oy: number; moved: boolean }
  | { kind: 'moveMarker'; id: string; dx: number; dy: number; sx: number; sy: number };

interface Hover { wx: number; wy: number; cx: number; cy: number; edge: string | null }

export class Editor {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  private drag: Drag | null = null;
  private hover: Hover | null = null;
  private spaceDown = false;
  private raf = 0;
  private dpr = 1;
  onStatus: (s: string) => void = () => {};
  onRequestLabelFocus: () => void = () => {};

  constructor(private host: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'map-canvas';
    host.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
    new ResizeObserver(() => this.resize()).observe(host);
    this.resize();

    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => this.onDown(e));
    c.addEventListener('pointermove', (e) => this.onMove(e));
    c.addEventListener('pointerup', (e) => this.onUp(e));
    c.addEventListener('pointercancel', (e) => this.onUp(e));
    c.addEventListener('pointerleave', () => { this.hover = null; this.request(); });
    c.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('dblclick', (e) => this.onDblClick(e));
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && !isTyping()) { this.spaceDown = true; this.updateCursor(); if (e.target === document.body) e.preventDefault(); }
    });
    window.addEventListener('keyup', (e) => { if (e.code === 'Space') { this.spaceDown = false; this.updateCursor(); } });
    window.addEventListener('blur', () => { this.spaceDown = false; });
  }

  // ---------- view ----------
  get view(): View {
    let v = store.views.get(store.areaId);
    if (!v) { v = this.fitView(); store.views.set(store.areaId, v); }
    return v;
  }

  fitView(): View {
    const a = store.area;
    const r = this.host.getBoundingClientRect();
    const b = contentBounds(a);
    const pad = 1.5;
    const x0 = b ? Math.max(0, b.x0 - pad) : 0, y0 = b ? Math.max(0, b.y0 - pad) : 0;
    const x1 = b ? Math.min(a.cols, b.x1 + pad) : a.cols, y1 = b ? Math.min(a.rows, b.y1 + pad) : a.rows;
    const ww = (x1 - x0) * a.cellW, wh = (y1 - y0) * a.cellH;
    const W = Math.max(100, r.width), H = Math.max(100, r.height);
    const zoom = clamp(Math.min((W - 48) / ww, (H - 48) / wh), 0.05, 2.5);
    return { zoom, x: (W - ww * zoom) / 2 - x0 * a.cellW * zoom, y: (H - wh * zoom) / 2 - y0 * a.cellH * zoom };
  }

  fit() { store.views.set(store.areaId, this.fitView()); store.emit('view'); this.request(); }

  zoomBy(f: number, sx?: number, sy?: number) {
    const v = this.view;
    const r = this.canvas.getBoundingClientRect();
    sx ??= r.width / 2; sy ??= r.height / 2;
    const nz = clamp(v.zoom * f, 0.05, 12);
    const k = nz / v.zoom;
    v.x = sx - (sx - v.x) * k;
    v.y = sy - (sy - v.y) * k;
    v.zoom = nz;
    store.emit('view');
    this.request();
  }

  private resize() {
    this.dpr = window.devicePixelRatio || 1;
    const r = this.host.getBoundingClientRect();
    this.canvas.width = Math.round(r.width * this.dpr);
    this.canvas.height = Math.round(r.height * this.dpr);
    this.canvas.style.width = r.width + 'px';
    this.canvas.style.height = r.height + 'px';
    this.draw();
  }

  private toWorld(e: { clientX: number; clientY: number }) {
    const r = this.canvas.getBoundingClientRect();
    const v = this.view;
    const sx = e.clientX - r.left, sy = e.clientY - r.top;
    return { sx, sy, wx: (sx - v.x) / v.zoom, wy: (sy - v.y) / v.zoom };
  }

  private hoverFrom(wx: number, wy: number): Hover {
    const a = store.area;
    const fx = wx / a.cellW, fy = wy / a.cellH;
    const cx = Math.floor(fx), cy = Math.floor(fy);
    // Nearest edge of the hovered cell
    const u = fx - cx, v = fy - cy;
    const d: [Side, number][] = [['n', v], ['s', 1 - v], ['w', u], ['e', 1 - u]];
    d.sort((p, q) => p[1] - q[1]);
    const edge = d[0][1] < 0.34 ? edgeOf(cx, cy, d[0][0]) : null;
    return { wx, wy, cx, cy, edge };
  }

  request() {
    if (!this.raf) this.raf = requestAnimationFrame(() => { this.raf = 0; this.draw(); });
  }

  // ---------- drawing ----------
  draw() {
    const { ctx, canvas } = this;
    const a = store.area;
    const v = this.view;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = THEME.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(v.zoom * this.dpr, 0, 0, v.zoom * this.dpr, v.x * this.dpr, v.y * this.dpr);

    const d = this.drag;
    const hiddenRoom = d?.kind === 'moveRoom' && (d.dx || d.dy) ? d.room.id : undefined;
    drawArea(ctx, a, store.idx, {
      scale: v.zoom * this.dpr, showGrid: store.showGrid, showNames: store.showNames, showIds: store.showIds, hiddenRoom,
    });
    this.drawOverlay(a, v.zoom);
  }

  private drawOverlay(a: Area, zoom: number) {
    const ctx = this.ctx;
    const hair = 1 / zoom;
    const ww = wallWidth(a);
    const d = this.drag;
    const h = this.hover;
    const tool = store.tool;

    // Active room in room tool
    if (tool === 'room' && store.activeRoomId && !store.pendingNewRoom) {
      const r = a.rooms.find((x) => x.id === store.activeRoomId);
      if (r) this.outlineRoom(a, r, 'rgba(62, 224, 255, 0.85)', 2.5 * hair, [6 * hair, 4 * hair]);
    }
    // Selection
    const sel = store.selection;
    if (sel?.kind === 'room' && !(tool === 'room' && sel.id === store.activeRoomId)) {
      const r = a.rooms.find((x) => x.id === sel.id);
      if (r && !(d?.kind === 'moveRoom' && (d.dx || d.dy))) this.outlineRoom(a, r, THEME.accent, 3 * hair);
    } else if (sel?.kind === 'label') {
      const l = a.labels.find((x) => x.id === sel.id);
      if (l) {
        const b = labelBounds(ctx, a, l);
        ctx.strokeStyle = THEME.accent; ctx.lineWidth = 1.5 * hair; ctx.setLineDash([4 * hair, 3 * hair]);
        ctx.strokeRect(b.x, b.y, b.w, b.h); ctx.setLineDash([]);
      }
    } else if (sel?.kind === 'marker') {
      const m = a.markers.find((x) => x.id === sel.id);
      if (m) {
        ctx.strokeStyle = THEME.accent; ctx.lineWidth = 2 * hair;
        ctx.beginPath(); ctx.arc((m.x + 0.5) * a.cellW, (m.y + 0.5) * a.cellH, Math.min(a.cellW, a.cellH) * 0.47, 0, Math.PI * 2); ctx.stroke();
      }
    }

    // Drag previews
    if (d?.kind === 'rect') {
      const x0 = Math.min(d.x0, d.x1), y0 = Math.min(d.y0, d.y1);
      const x1 = Math.max(d.x0, d.x1) + 1, y1 = Math.max(d.y0, d.y1) + 1;
      ctx.fillStyle = d.erase ? 'rgba(255, 90, 95, 0.25)' : hexAlpha(this.paintColor(), 0.55);
      ctx.fillRect(x0 * a.cellW, y0 * a.cellH, (x1 - x0) * a.cellW, (y1 - y0) * a.cellH);
      ctx.strokeStyle = d.erase ? '#ff5a5f' : THEME.accent; ctx.lineWidth = 2 * hair;
      ctx.strokeRect(x0 * a.cellW, y0 * a.cellH, (x1 - x0) * a.cellW, (y1 - y0) * a.cellH);
      this.onStatus(`${x1 - x0} × ${y1 - y0}`);
    }
    if (d?.kind === 'moveRoom' && (d.dx || d.dy)) {
      const ok = canMoveRoom(a, store.idx, d.room, d.dx, d.dy);
      ctx.save();
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = d.room.color;
      ctx.fill(roomPath(a, d.room));
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = ok ? d.room.color : '#ff5a5f';
      ctx.fill(roomPath(a, d.room, d.dx, d.dy));
      ctx.restore();
      this.outlineRoom(a, d.room, ok ? THEME.wall : '#ff5a5f', ww, undefined, d.dx, d.dy);
    }
    if (d?.kind === 'moveMarker' && (d.dx || d.dy)) {
      const m = a.markers.find((x) => x.id === d.id);
      if (m) drawMarkers(ctx, a, [{ ...m, x: m.x + d.dx, y: m.y + d.dy }], 0.7);
    }

    if (!h || d?.kind === 'pan' || this.spaceDown) return;
    // Hover previews
    if ((tool === 'room' || tool === 'erase' || tool === 'marker') && !d && inBounds(a, h.cx, h.cy)) {
      ctx.strokeStyle = tool === 'erase' ? '#ff5a5f' : THEME.accent;
      ctx.lineWidth = 2 * hair;
      ctx.strokeRect(h.cx * a.cellW, h.cy * a.cellH, a.cellW, a.cellH);
      if (tool === 'room' && !store.idx.ownerAt(h.cx, h.cy)) {
        ctx.fillStyle = hexAlpha(this.paintColor(), 0.45);
        ctx.fillRect(h.cx * a.cellW, h.cy * a.cellH, a.cellW, a.cellH);
      }
      if (tool === 'marker') {
        drawMarkers(ctx, a, [{ x: h.cx, y: h.cy, icon: store.markerIcon, color: store.markerColor }], 0.5);
      }
    }
    if (tool === 'door' && h.edge) {
      const valid = store.idx.isWall(h.edge);
      const [x0, y0, x1, y1] = edgeSegment(a, h.edge);
      ctx.strokeStyle = valid ? THEME.accent : 'rgba(255, 90, 95, 0.6)';
      ctx.lineWidth = ww * 2.6;
      ctx.lineCap = 'round';
      ctx.globalAlpha = 0.45;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.lineCap = 'butt';
      if (valid && !store.idx.doors.has(h.edge)) drawDoor(ctx, a, h.edge, store.doorType, ww, 0.8);
    }
  }

  private paintColor() {
    if (store.activeRoomId && !store.pendingNewRoom) {
      const r = store.area.rooms.find((x) => x.id === store.activeRoomId);
      if (r) return r.color;
    }
    return store.roomColor;
  }

  private outlineRoom(a: Area, r: Room, color: string, width: number, dash?: number[], dx = 0, dy = 0) {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'square';
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath();
    for (const e of roomBoundary(r)) {
      const [x0, y0, x1, y1] = edgeSegment(a, e);
      ctx.moveTo(x0 + dx * a.cellW, y0 + dy * a.cellH);
      ctx.lineTo(x1 + dx * a.cellW, y1 + dy * a.cellH);
    }
    ctx.stroke();
    ctx.restore();
  }

  // ---------- input ----------
  private updateCursor() {
    const t = store.tool;
    let cur = 'crosshair';
    if (this.drag?.kind === 'pan') cur = 'grabbing';
    else if (this.spaceDown) cur = 'grab';
    else if (t === 'select') cur = 'default';
    else if (t === 'label') cur = 'text';
    this.canvas.style.cursor = cur;
  }

  private onDown(e: PointerEvent) {
    if (this.drag) return;
    // Stop the browser moving focus to <body>, so we control focus (e.g. into a new label's text box).
    e.preventDefault();
    this.canvas.setPointerCapture(e.pointerId);
    (document.activeElement as HTMLElement | null)?.blur?.();
    const p = this.toWorld(e);
    const h = this.hoverFrom(p.wx, p.wy);
    this.hover = h;
    const a = store.area;

    if (e.button === 1 || this.spaceDown) {
      this.startPan(p.sx, p.sy);
      return;
    }
    const tool = store.tool;
    const right = e.button === 2;

    if (tool === 'room' || tool === 'erase') {
      const erase = tool === 'erase' || right;
      store.beginEdit();
      if (e.shiftKey) {
        this.drag = { kind: 'rect', x0: h.cx, y0: h.cy, x1: h.cx, y1: h.cy, erase };
      } else {
        this.drag = { kind: 'paint', last: null, erase };
        this.paintAt(h.cx, h.cy);
      }
    } else if (tool === 'door') {
      if (right) { if (h.edge) this.removeDoor(h.edge); }
      else if (h.edge) this.toggleDoor(h.edge);
    } else if (tool === 'marker') {
      this.markerClick(h.cx, h.cy, right);
    } else if (tool === 'label') {
      const l = this.labelAt(p.wx, p.wy);
      if (l) {
        store.select({ kind: 'label', id: l.id });
        store.beginEdit();
        this.drag = { kind: 'moveLabel', id: l.id, ox: p.wx / a.cellW - l.x, oy: p.wy / a.cellH - l.y, moved: false };
      } else if (!right) {
        store.edit(() => {
          const id = newId(store.project, 'L');
          a.labels.push({ id, x: round2(p.wx / a.cellW), y: round2(p.wy / a.cellH), text: 'Label', size: store.labelSize, color: store.labelColor });
          store.selection = { kind: 'label', id };
        });
        this.onRequestLabelFocus();
      }
    } else if (tool === 'select') {
      this.selectDown(p, h, right);
    }
    this.updateCursor();
    this.request();
  }

  private selectDown(p: { sx: number; sy: number; wx: number; wy: number }, h: Hover, right: boolean) {
    const a = store.area;
    const l = this.labelAt(p.wx, p.wy);
    if (l) {
      store.select({ kind: 'label', id: l.id });
      store.beginEdit();
      this.drag = { kind: 'moveLabel', id: l.id, ox: p.wx / a.cellW - l.x, oy: p.wy / a.cellH - l.y, moved: false };
      return;
    }
    const m = store.idx.markers.get(ck(h.cx, h.cy));
    if (m) {
      store.select({ kind: 'marker', id: m.id });
      this.drag = { kind: 'moveMarker', id: m.id, dx: 0, dy: 0, sx: h.cx, sy: h.cy };
      return;
    }
    const r = store.idx.ownerAt(h.cx, h.cy);
    if (r) {
      store.select({ kind: 'room', id: r.id });
      if (!right) this.drag = { kind: 'moveRoom', room: r, sx: h.cx, sy: h.cy, dx: 0, dy: 0 };
      return;
    }
    store.select(null);
    this.startPan(p.sx, p.sy);
  }

  private startPan(sx: number, sy: number) {
    const v = this.view;
    this.drag = { kind: 'pan', sx, sy, vx: v.x, vy: v.y };
    this.updateCursor();
  }

  private onMove(e: PointerEvent) {
    const p = this.toWorld(e);
    const h = this.hoverFrom(p.wx, p.wy);
    const prev = this.hover;
    this.hover = h;
    const a = store.area;
    const d = this.drag;
    if (inBounds(a, h.cx, h.cy)) {
      const owner = store.idx.ownerAt(h.cx, h.cy);
      if (!d || d.kind !== 'rect') this.onStatus(`x ${h.cx}  y ${h.cy}${owner ? `  ·  ${owner.id}${owner.name ? ' ' + owner.name : ''}` : ''}`);
    } else this.onStatus('');

    if (!d) {
      if (!prev || prev.cx !== h.cx || prev.cy !== h.cy || prev.edge !== h.edge) this.request();
      return;
    }
    switch (d.kind) {
      case 'pan': {
        const v = this.view;
        v.x = d.vx + (p.sx - d.sx);
        v.y = d.vy + (p.sy - d.sy);
        break;
      }
      case 'paint':
        if (d.last && (d.last[0] !== h.cx || d.last[1] !== h.cy)) {
          for (const [x, y] of lineCells(d.last[0], d.last[1], h.cx, h.cy)) this.paintAt(x, y);
        }
        break;
      case 'rect':
        d.x1 = h.cx; d.y1 = h.cy;
        break;
      case 'moveRoom':
        d.dx = h.cx - d.sx; d.dy = h.cy - d.sy;
        break;
      case 'moveMarker':
        d.dx = h.cx - d.sx; d.dy = h.cy - d.sy;
        break;
      case 'moveLabel': {
        const l = a.labels.find((x) => x.id === d.id);
        if (l) {
          let nx = p.wx / a.cellW - d.ox, ny = p.wy / a.cellH - d.oy;
          if (e.shiftKey) { nx = Math.round(nx * 2) / 2; ny = Math.round(ny * 2) / 2; }
          l.x = round2(nx); l.y = round2(ny);
          d.moved = true;
          store.emit('inspector');
        }
        break;
      }
    }
    this.request();
  }

  private onUp(e: PointerEvent) {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    if (this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);
    const a = store.area;
    switch (d.kind) {
      case 'paint':
        store.endEdit();
        break;
      case 'rect':
        this.fillRect(d);
        store.endEdit();
        break;
      case 'moveRoom':
        if ((d.dx || d.dy) && canMoveRoom(a, store.idx, d.room, d.dx, d.dy)) {
          store.edit(() => moveRoom(a, d.room, d.dx, d.dy));
        }
        break;
      case 'moveMarker':
        if (d.dx || d.dy) {
          const m = a.markers.find((x) => x.id === d.id);
          if (m && inBounds(a, m.x + d.dx, m.y + d.dy)) {
            store.edit(() => {
              const nx = m.x + d.dx, ny = m.y + d.dy;
              a.markers = a.markers.filter((o) => o === m || o.x !== nx || o.y !== ny);
              m.x = nx; m.y = ny;
            });
          }
        }
        break;
      case 'moveLabel':
        store.endEdit();
        break;
    }
    store.emit('view');
    this.updateCursor();
    this.request();
  }

  private onWheel(e: WheelEvent) {
    e.preventDefault();
    const p = this.toWorld(e);
    // Trackpad pinch arrives as ctrl+wheel; plain wheel zooms too. Shift+wheel pans horizontally.
    if (e.shiftKey && !e.ctrlKey) {
      const v = this.view;
      v.x -= e.deltaY || e.deltaX;
      store.emit('view');
      this.request();
      return;
    }
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    this.zoomBy(Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0015)), p.sx, p.sy);
  }

  private onDblClick(e: MouseEvent) {
    if (store.tool !== 'select' && store.tool !== 'label') return;
    const p = this.toWorld(e);
    if (this.labelAt(p.wx, p.wy)) { this.onRequestLabelFocus(); return; }
    const h = this.hoverFrom(p.wx, p.wy);
    const r = store.idx.ownerAt(h.cx, h.cy);
    if (r && store.tool === 'select') {
      store.select({ kind: 'room', id: r.id });
      document.querySelector<HTMLInputElement>('#room-name')?.focus();
    }
  }

  // ---------- operations ----------
  /** Paint (or erase) one cell during a stroke, following the adjacency rules for rooms. */
  private paintAt(x: number, y: number) {
    const d = this.drag;
    if (d?.kind !== 'paint') return;
    const first = d.last === null;
    d.last = [x, y];
    const a = store.area;
    if (!inBounds(a, x, y)) return;
    const idx = store.idx;
    const owner = idx.ownerAt(x, y);

    if (d.erase) {
      if (owner) owner.cells = owner.cells.filter((k) => k !== ck(x, y));
      const before = a.markers.length;
      a.markers = a.markers.filter((m) => m.x !== x || m.y !== y);
      if (owner || a.markers.length !== before) store.emit('inspector');
      return;
    }

    if (owner) {
      // Starting a stroke inside an existing room picks it up for extending.
      if (first) {
        store.activeRoomId = owner.id;
        store.pendingNewRoom = false;
        store.selection = { kind: 'room', id: owner.id };
        store.emit('ui');
      }
      return;
    }
    let active = store.activeRoomId ? a.rooms.find((r) => r.id === store.activeRoomId) : undefined;
    if (!active || store.pendingNewRoom || !idx.adjacentTo(active, x, y)) {
      active = { id: newId(store.project, 'R'), name: '', color: store.roomColor, notes: '', cells: [] };
      a.rooms.push(active);
      store.activeRoomId = active.id;
      store.pendingNewRoom = false;
      store.selection = { kind: 'room', id: active.id };
      store.roomColor = nextColor(store.roomColor);
      active.cells.push(ck(x, y));
      store.emit('ui');
      return;
    }
    active.cells.push(ck(x, y));
    store.emit('inspector');
  }

  private fillRect(d: Extract<Drag, { kind: 'rect' }>) {
    const a = store.area;
    const idx = store.idx;
    const x0 = Math.max(0, Math.min(d.x0, d.x1)), x1 = Math.min(a.cols - 1, Math.max(d.x0, d.x1));
    const y0 = Math.max(0, Math.min(d.y0, d.y1)), y1 = Math.min(a.rows - 1, Math.max(d.y0, d.y1));
    if (x0 > x1 || y0 > y1) return;
    const inRect = (x: number, y: number) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
    if (d.erase) {
      for (const r of a.rooms) r.cells = r.cells.filter((k) => { const [x, y] = parseCell(k); return !inRect(x, y); });
      a.markers = a.markers.filter((m) => !inRect(m.x, m.y));
      return;
    }
    const free: string[] = [];
    let touchesActive = false;
    let active = store.activeRoomId && !store.pendingNewRoom ? a.rooms.find((r) => r.id === store.activeRoomId) : undefined;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (idx.ownerAt(x, y)) continue;
      free.push(ck(x, y));
      if (active && idx.adjacentTo(active, x, y)) touchesActive = true;
    }
    if (!free.length) return;
    if (!active || !touchesActive) {
      active = { id: newId(store.project, 'R'), name: '', color: store.roomColor, notes: '', cells: [] };
      a.rooms.push(active);
      store.roomColor = nextColor(store.roomColor);
    }
    active.cells.push(...free);
    store.activeRoomId = active.id;
    store.pendingNewRoom = false;
    store.selection = { kind: 'room', id: active.id };
  }

  private toggleDoor(edge: string) {
    const idx = store.idx;
    if (!idx.isWall(edge)) return;
    const a = store.area;
    const existing = idx.doors.get(edge);
    store.edit(() => {
      if (existing && existing.type === store.doorType) a.doors = a.doors.filter((d) => d !== existing);
      else if (existing) existing.type = store.doorType;
      else a.doors.push({ edge, type: store.doorType });
    });
  }

  private removeDoor(edge: string) {
    const a = store.area;
    if (!store.idx.doors.has(edge)) return;
    store.edit(() => { a.doors = a.doors.filter((d) => d.edge !== edge); });
  }

  private markerClick(x: number, y: number, right: boolean) {
    const a = store.area;
    if (!inBounds(a, x, y)) return;
    const existing = store.idx.markers.get(ck(x, y));
    if (right || (existing && existing.icon === store.markerIcon)) {
      if (existing) store.edit(() => { a.markers = a.markers.filter((m) => m !== existing); });
      return;
    }
    store.edit(() => {
      if (existing) { existing.icon = store.markerIcon; existing.color = store.markerColor; store.selection = { kind: 'marker', id: existing.id }; }
      else {
        const id = newId(store.project, 'M');
        a.markers.push({ id, x, y, icon: store.markerIcon, color: store.markerColor });
        store.selection = { kind: 'marker', id };
      }
    });
  }

  private labelAt(wx: number, wy: number) {
    const a = store.area;
    for (let i = a.labels.length - 1; i >= 0; i--) {
      const l = a.labels[i];
      const b = labelBounds(this.ctx, a, l);
      if (wx >= b.x && wx <= b.x + b.w && wy >= b.y && wy <= b.y + b.h) return l;
    }
    return null;
  }
}

export function isTyping() {
  const el = document.activeElement as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round2 = (v: number) => Math.round(v * 100) / 100;

function nextColor(c: string) {
  if (!store.cycleColors) return c;
  const i = ROOM_COLORS.indexOf(c);
  return i < 0 ? c : ROOM_COLORS[(i + 1) % ROOM_COLORS.length];
}

export function hexAlpha(hex: string, a: number) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
