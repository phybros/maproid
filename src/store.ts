import { Area, AreaIndex, Project, createProject, normalizeArea, validateProject, ROOM_COLORS, DoorTypeId } from './model';

export type ToolId = 'select' | 'room' | 'erase' | 'door' | 'marker' | 'label';
export type Selection = { kind: 'room' | 'label' | 'marker'; id: string } | null;

export interface View { x: number; y: number; zoom: number }

const STORAGE_KEY = 'maproid:project';
const PREFS_KEY = 'maproid:prefs';
const HISTORY_LIMIT = 200;

type Listener = (why: ChangeKind) => void;
/** 'doc' = map content changed; 'ui' = selection/tool/view; 'inspector' = content changed by the inspector itself. */
export type ChangeKind = 'doc' | 'ui' | 'inspector' | 'view';

class Store {
  project: Project;
  areaId: string;
  tool: ToolId = 'room';
  selection: Selection = null;
  activeRoomId: string | null = null;
  pendingNewRoom = false;
  roomColor = ROOM_COLORS[0];
  cycleColors = true;
  doorType: DoorTypeId = 'door';
  markerIcon = 'save';
  markerColor = '#ffffff';
  labelColor = '#ffffff';
  labelSize = 0.6;
  showGrid = true;
  showNames = true;
  showIds = false;
  views = new Map<string, View>();
  dirtySinceSave = false;

  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private editBefore: string | null = null;
  private listeners: Listener[] = [];
  private index: AreaIndex | null = null;
  private saveTimer = 0;

  constructor() {
    this.project = this.loadLocal() ?? createProject();
    this.areaId = this.project.areas[0].id;
    this.loadPrefs();
  }

  // ----- accessors -----
  get area(): Area {
    return this.project.areas.find((a) => a.id === this.areaId) ?? this.project.areas[0];
  }
  get idx(): AreaIndex {
    if (!this.index || this.index.area !== this.area) this.index = new AreaIndex(this.area);
    return this.index;
  }
  invalidate() { this.index = null; }

  subscribe(fn: Listener) { this.listeners.push(fn); }
  emit(why: ChangeKind) {
    if (why !== 'view') this.invalidate();
    for (const l of this.listeners) l(why);
  }

  // ----- history -----
  private snapshot() { return JSON.stringify(this.project); }

  /** Start an edit that may span many events (a drag, or typing in a field). */
  beginEdit() {
    if (this.editBefore === null) this.editBefore = this.snapshot();
  }
  /** Finish an edit: normalise, and record an undo step if anything changed. */
  endEdit() {
    if (this.editBefore === null) return;
    const before = this.editBefore;
    this.editBefore = null;
    normalizeArea(this.project, this.area);
    this.validateRefs();
    if (this.snapshot() !== before) {
      this.undoStack.push(before);
      if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift();
      this.redoStack = [];
      this.contentChanged();
    }
    this.emit('doc');
  }
  /** Do a one-shot edit. */
  edit(fn: () => void) {
    this.beginEdit();
    fn();
    this.invalidate();
    this.endEdit();
  }
  get editing() { return this.editBefore !== null; }

  canUndo() { return this.undoStack.length > 0; }
  canRedo() { return this.redoStack.length > 0; }
  undo() { this.travel(this.undoStack, this.redoStack); }
  redo() { this.travel(this.redoStack, this.undoStack); }
  private travel(from: string[], to: string[]) {
    if (this.editBefore !== null) this.endEdit();
    const s = from.pop();
    if (!s) return;
    to.push(this.snapshot());
    this.project = JSON.parse(s);
    if (!this.project.areas.some((a) => a.id === this.areaId)) this.areaId = this.project.areas[0].id;
    this.validateRefs();
    this.contentChanged();
    this.emit('doc');
  }

  /** Drop selection / active room if they no longer exist. */
  validateRefs() {
    const a = this.area;
    const sel = this.selection;
    if (sel) {
      const list = sel.kind === 'room' ? a.rooms : sel.kind === 'label' ? a.labels : a.markers;
      if (!list.some((x) => x.id === sel.id)) this.selection = null;
    }
    if (this.activeRoomId && !a.rooms.some((r) => r.id === this.activeRoomId)) this.activeRoomId = null;
    this.invalidate();
  }

  // ----- project lifecycle -----
  replaceProject(p: Project, keepHistory = true) {
    if (keepHistory) {
      this.undoStack.push(this.snapshot());
      this.redoStack = [];
    } else {
      this.undoStack = [];
      this.redoStack = [];
    }
    this.project = p;
    this.areaId = p.areas[0].id;
    this.selection = null;
    this.activeRoomId = null;
    this.views.clear();
    this.contentChanged();
    this.emit('doc');
  }

  setArea(id: string) {
    if (id === this.areaId) return;
    if (this.editBefore !== null) this.endEdit();
    this.areaId = id;
    this.selection = null;
    this.activeRoomId = null;
    this.pendingNewRoom = false;
    this.invalidate();
    this.emit('ui');
  }

  select(sel: Selection) {
    this.selection = sel;
    this.emit('ui');
  }

  setTool(t: ToolId) {
    this.tool = t;
    if (t !== 'room') this.pendingNewRoom = false;
    this.emit('ui');
  }

  // ----- persistence -----
  private contentChanged() {
    this.dirtySinceSave = true;
    clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => this.saveLocal(), 400);
  }
  saveLocal() {
    try { localStorage.setItem(STORAGE_KEY, this.snapshot()); } catch { /* storage unavailable */ }
  }
  private loadLocal(): Project | null {
    try {
      const s = localStorage.getItem(STORAGE_KEY);
      return s ? validateProject(JSON.parse(s)) : null;
    } catch {
      return null;
    }
  }
  savePrefs() {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({
        showGrid: this.showGrid, showNames: this.showNames, showIds: this.showIds,
        roomColor: this.roomColor, cycleColors: this.cycleColors, doorType: this.doorType, markerIcon: this.markerIcon,
      }));
    } catch { /* ignore */ }
  }
  private loadPrefs() {
    try {
      const p = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}');
      for (const k of ['showGrid', 'showNames', 'showIds', 'roomColor', 'cycleColors', 'doorType', 'markerIcon'] as const) {
        if (k in p) (this as unknown as Record<string, unknown>)[k] = p[k];
      }
    } catch { /* ignore */ }
  }
}

export const store = new Store();
