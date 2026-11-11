// Core data model and pure operations for Maproid maps.

export type CellKey = string; // "x,y"
export type EdgeKey = string; // "h:x:y" (top edge of cell x,y) or "v:x:y" (left edge of cell x,y)

export interface Room {
  id: string;
  name: string;
  color: string;
  notes: string;
  cells: CellKey[];
}

export interface Door {
  edge: EdgeKey;
  type: DoorTypeId;
}

export interface Label {
  id: string;
  x: number; // world position in cell units (center of text)
  y: number;
  text: string;
  size: number; // font size in cell-height units
  color: string;
}

export interface Marker {
  id: string;
  x: number;
  y: number;
  icon: string;
  color: string;
}

export interface Area {
  id: string;
  name: string;
  cols: number;
  rows: number;
  cellW: number;
  cellH: number;
  rooms: Room[];
  doors: Door[];
  labels: Label[];
  markers: Marker[];
}

export interface Project {
  app: 'maproid';
  version: 1;
  name: string;
  nextId: number;
  areas: Area[];
}

export type DoorTypeId = 'open' | 'door' | 'red' | 'green' | 'yellow' | 'secret';

export const DOOR_TYPES: { id: DoorTypeId; name: string; color: string }[] = [
  { id: 'open', name: 'Opening', color: 'transparent' },
  { id: 'door', name: 'Door', color: '#5fb4ff' },
  { id: 'red', name: 'Red lock', color: '#ff5a5f' },
  { id: 'green', name: 'Green lock', color: '#5ee07a' },
  { id: 'yellow', name: 'Yellow lock', color: '#ffd34d' },
  { id: 'secret', name: 'Secret', color: '#c58bff' },
];

export const ROOM_COLORS = [
  '#3d5fa8', '#2f8a73', '#a8434d', '#b8742a', '#7350ad', '#2a8797',
  '#9c8a2e', '#a84d84', '#566377', '#7a5236', '#4b8a3c', '#3a3f58',
];

// ---------- keys & geometry ----------

export const ck = (x: number, y: number): CellKey => `${x},${y}`;
export function parseCell(k: CellKey): [number, number] {
  const i = k.indexOf(',');
  return [+k.slice(0, i), +k.slice(i + 1)];
}

export type Side = 'n' | 's' | 'w' | 'e';
export function edgeOf(x: number, y: number, side: Side): EdgeKey {
  switch (side) {
    case 'n': return `h:${x}:${y}`;
    case 's': return `h:${x}:${y + 1}`;
    case 'w': return `v:${x}:${y}`;
    case 'e': return `v:${x + 1}:${y}`;
  }
}

export interface EdgeInfo { horizontal: boolean; x: number; y: number }
export function parseEdge(e: EdgeKey): EdgeInfo {
  const [t, x, y] = e.split(':');
  return { horizontal: t === 'h', x: +x, y: +y };
}

/** The two cells on either side of an edge: [before, after] (above/below or left/right). */
export function edgeCells(e: EdgeKey): [[number, number], [number, number]] {
  const { horizontal, x, y } = parseEdge(e);
  return horizontal ? [[x, y - 1], [x, y]] : [[x - 1, y], [x, y]];
}

export function shiftEdge(e: EdgeKey, dx: number, dy: number): EdgeKey {
  const { horizontal, x, y } = parseEdge(e);
  return `${horizontal ? 'h' : 'v'}:${x + dx}:${y + dy}`;
}

export const NEIGHBORS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// ---------- factories ----------

export function newId(p: Project, prefix: string): string {
  return `${prefix}${p.nextId++}`;
}

export function createArea(p: Project, name: string): Area {
  return {
    id: newId(p, 'A'), name, cols: 48, rows: 32, cellW: 32, cellH: 32,
    rooms: [], doors: [], labels: [], markers: [],
  };
}

export function createProject(): Project {
  const p: Project = { app: 'maproid', version: 1, name: 'Untitled map', nextId: 1, areas: [] };
  p.areas.push(createArea(p, 'Area 1'));
  return p;
}

// ---------- index ----------

/** Cell → room lookup for an area. */
export class AreaIndex {
  owner = new Map<CellKey, Room>();
  doors = new Map<EdgeKey, Door>();
  markers = new Map<CellKey, Marker>();
  constructor(public area: Area) {
    for (const r of area.rooms) for (const c of r.cells) this.owner.set(c, r);
    for (const d of area.doors) this.doors.set(d.edge, d);
    for (const m of area.markers) this.markers.set(ck(m.x, m.y), m);
  }
  ownerAt(x: number, y: number): Room | undefined {
    return this.owner.get(ck(x, y));
  }
  /** An edge is a wall if at least one side is a room and the sides differ. */
  isWall(e: EdgeKey): boolean {
    const [[ax, ay], [bx, by]] = edgeCells(e);
    const a = this.ownerAt(ax, ay), b = this.ownerAt(bx, by);
    return (!!a || !!b) && a !== b;
  }
  adjacentTo(room: Room, x: number, y: number): boolean {
    return NEIGHBORS.some(([dx, dy]) => this.owner.get(ck(x + dx, y + dy)) === room);
  }
}

export function inBounds(a: Area, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < a.cols && y < a.rows;
}

// ---------- normalisation ----------

/** Split a set of cells into 4-connected components, largest first. */
export function components(cells: Iterable<CellKey>): CellKey[][] {
  const remaining = new Set(cells);
  const out: CellKey[][] = [];
  for (const start of remaining) {
    const comp: CellKey[] = [];
    const stack = [start];
    remaining.delete(start);
    while (stack.length) {
      const k = stack.pop()!;
      comp.push(k);
      const [x, y] = parseCell(k);
      for (const [dx, dy] of NEIGHBORS) {
        const n = ck(x + dx, y + dy);
        if (remaining.has(n)) { remaining.delete(n); stack.push(n); }
      }
    }
    out.push(comp);
  }
  return out.sort((a, b) => b.length - a.length);
}

/**
 * Bring an area into a consistent state: cells inside bounds, no duplicate cell ownership,
 * every room connected (disconnected pieces become new rooms), no empty rooms,
 * doors only on walls, markers inside bounds and unique per cell.
 */
export function normalizeArea(p: Project, a: Area): void {
  const seen = new Set<CellKey>();
  const rooms: Room[] = [];
  for (const r of a.rooms) {
    const cells = r.cells.filter((k) => {
      const [x, y] = parseCell(k);
      if (!inBounds(a, x, y) || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    if (!cells.length) continue;
    const comps = components(cells);
    r.cells = comps[0];
    rooms.push(r);
    for (const extra of comps.slice(1)) {
      rooms.push({ id: newId(p, 'R'), name: '', color: r.color, notes: '', cells: extra });
    }
  }
  a.rooms = rooms;

  const idx = new AreaIndex(a);
  const doorSeen = new Set<EdgeKey>();
  a.doors = a.doors.filter((d) => {
    if (doorSeen.has(d.edge) || !idx.isWall(d.edge)) return false;
    const [[ax, ay], [bx, by]] = edgeCells(d.edge);
    if (!inBounds(a, ax, ay) && !inBounds(a, bx, by)) return false;
    doorSeen.add(d.edge);
    return true;
  });

  const mSeen = new Set<CellKey>();
  a.markers = a.markers.filter((m) => {
    const k = ck(m.x, m.y);
    if (!inBounds(a, m.x, m.y) || mSeen.has(k)) return false;
    mSeen.add(k);
    return true;
  });
}

// ---------- room edits ----------

/** Move a room by (dx,dy) cells, carrying its doors and markers along. Returns false if blocked. */
export function canMoveRoom(a: Area, idx: AreaIndex, room: Room, dx: number, dy: number): boolean {
  for (const k of room.cells) {
    const [x, y] = parseCell(k);
    const nx = x + dx, ny = y + dy;
    if (!inBounds(a, nx, ny)) return false;
    const o = idx.ownerAt(nx, ny);
    if (o && o !== room) return false;
  }
  return true;
}

export function moveRoom(a: Area, room: Room, dx: number, dy: number): void {
  const cellSet = new Set(room.cells);
  const borderEdges = new Set<EdgeKey>();
  for (const k of room.cells) {
    const [x, y] = parseCell(k);
    for (const s of ['n', 's', 'w', 'e'] as Side[]) borderEdges.add(edgeOf(x, y, s));
  }
  const movedDoors: Door[] = [];
  a.doors = a.doors.filter((d) => {
    if (borderEdges.has(d.edge)) { movedDoors.push(d); return false; }
    return true;
  });
  const movedMarkers = a.markers.filter((m) => cellSet.has(ck(m.x, m.y)));
  const movedSet = new Set(movedMarkers);
  // Markers at the destination that aren't moving get displaced (removed).
  room.cells = room.cells.map((k) => {
    const [x, y] = parseCell(k);
    return ck(x + dx, y + dy);
  });
  const dest = new Set(room.cells);
  a.markers = a.markers.filter((m) => movedSet.has(m) || !dest.has(ck(m.x, m.y)));
  for (const m of movedMarkers) { m.x += dx; m.y += dy; }
  const destEdges = new Set(movedDoors.map((d) => shiftEdge(d.edge, dx, dy)));
  a.doors = a.doors.filter((d) => !destEdges.has(d.edge));
  for (const d of movedDoors) { d.edge = shiftEdge(d.edge, dx, dy); a.doors.push(d); }
}

/** Shift everything in the area by (dx,dy) cells. Content pushed out of bounds is dropped on normalise. */
export function shiftArea(a: Area, dx: number, dy: number): void {
  for (const r of a.rooms) {
    r.cells = r.cells.map((k) => { const [x, y] = parseCell(k); return ck(x + dx, y + dy); });
  }
  for (const d of a.doors) d.edge = shiftEdge(d.edge, dx, dy);
  for (const m of a.markers) { m.x += dx; m.y += dy; }
  for (const l of a.labels) { l.x += dx; l.y += dy; }
}

/** Anchor point (cell units) for a room's name: its centroid if that lies in the room, else the nearest cell centre. */
export function roomAnchor(room: Room): [number, number] {
  let sx = 0, sy = 0;
  const pts = room.cells.map(parseCell);
  for (const [x, y] of pts) { sx += x + 0.5; sy += y + 0.5; }
  const cx = sx / pts.length, cy = sy / pts.length;
  const set = new Set(room.cells);
  const eps = 1e-6;
  if (set.has(ck(Math.floor(cx - eps), Math.floor(cy - eps))) && set.has(ck(Math.floor(cx), Math.floor(cy)))) return [cx, cy];
  let best = pts[0], bd = Infinity;
  for (const p of pts) {
    const d = (p[0] + 0.5 - cx) ** 2 + (p[1] + 0.5 - cy) ** 2;
    if (d < bd) { bd = d; best = p; }
  }
  return [best[0] + 0.5, best[1] + 0.5];
}

/** Cells along a 4-connected line from a to b (inclusive of b, exclusive of a). */
export function lineCells(ax: number, ay: number, bx: number, by: number): [number, number][] {
  const out: [number, number][] = [];
  let x = ax, y = ay;
  const nx = Math.abs(bx - ax), ny = Math.abs(by - ay);
  const sx = Math.sign(bx - ax), sy = Math.sign(by - ay);
  // Step along one axis at a time so consecutive cells always share an edge.
  for (let ix = 0, iy = 0; ix < nx || iy < ny;) {
    if ((0.5 + ix) / nx < (0.5 + iy) / ny) { x += sx; ix++; } else { y += sy; iy++; }
    out.push([x, y]);
  }
  return out;
}

// ---------- validation for loaded files ----------

export function validateProject(raw: unknown): Project {
  const p = raw as Project;
  if (!p || typeof p !== 'object' || p.app !== 'maproid' || !Array.isArray(p.areas)) {
    throw new Error('Not a Maproid project file.');
  }
  if (!p.areas.length) throw new Error('Project has no areas.');
  p.name = String(p.name ?? 'Untitled map');
  p.nextId = Number(p.nextId) || 1;
  // Make sure nextId is beyond every id in the file.
  let maxId = 0;
  const bump = (id: string) => { const n = parseInt(id.slice(1), 10); if (n > maxId) maxId = n; };
  for (const a of p.areas) {
    a.name = String(a.name ?? 'Area');
    a.cols = clampInt(a.cols, 1, 1000, 48);
    a.rows = clampInt(a.rows, 1, 1000, 32);
    a.cellW = clampInt(a.cellW, 4, 256, 32);
    a.cellH = clampInt(a.cellH, 4, 256, 32);
    a.rooms = (a.rooms ?? []).map((r) => ({
      id: String(r.id), name: String(r.name ?? ''), color: String(r.color ?? ROOM_COLORS[0]),
      notes: String(r.notes ?? ''), cells: (r.cells ?? []).map(String),
    }));
    a.doors = (a.doors ?? []).map((d) => ({ edge: String(d.edge), type: (DOOR_TYPES.some((t) => t.id === d.type) ? d.type : 'door') as DoorTypeId }));
    a.labels = (a.labels ?? []).map((l) => ({ id: String(l.id), x: +l.x || 0, y: +l.y || 0, text: String(l.text ?? ''), size: +l.size || 0.6, color: String(l.color ?? '#ffffff') }));
    a.markers = (a.markers ?? []).map((m) => ({ id: String(m.id), x: Math.round(+m.x || 0), y: Math.round(+m.y || 0), icon: String(m.icon), color: String(m.color ?? '#ffffff') }));
    bump(a.id);
    for (const r of a.rooms) bump(r.id);
    for (const l of a.labels) bump(l.id);
    for (const m of a.markers) bump(m.id);
  }
  p.nextId = Math.max(p.nextId, maxId + 1);
  for (const a of p.areas) normalizeArea(p, a);
  return p;
}

function clampInt(v: unknown, lo: number, hi: number, def: number): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def;
}
